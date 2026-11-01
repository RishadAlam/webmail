<?php

namespace App\Http\Controllers;

use App\Models\Address;
use App\Models\Draft;
use App\Models\Mailbox;
use App\Models\Message;
use App\Services\ImportService;
use App\Services\SafeMail;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Str;
use Inertia\Inertia;

class MailController extends Controller
{
    public function index(Request $request, ?Mailbox $mailbox = null, ?string $thread = null): mixed
    {
        $boxes = $request->user()->mailboxes()->get();
        $mailbox ??= $boxes->first();
        if (! $mailbox) {
            return Inertia::render('mail', ['mailbox' => null, 'mailboxes' => [], 'messages' => [], 'thread' => null, 'drafts' => [], 'identities' => [], 'counts' => [], 'filters' => [], 'pagination' => null, 'simulation' => config('postroom.provider') === 'mock']);
        }
        Gate::authorize('view', $mailbox);
        $request->validate(['folder' => 'sometimes|in:inbox,starred,sent,drafts,archive,spam,trash,all', 'q' => 'sometimes|nullable|string|max:200']);
        $folder = $request->string('folder', 'inbox')->toString();
        $q = trim((string) $request->query('q', ''));
        $unread = $request->boolean('unread');
        $query = Message::where('mailbox_id', $mailbox->id);
        if ($folder === 'starred') {
            $query->where('starred', true)->whereNotIn('folder', ['trash', 'spam']);
        } elseif ($folder === 'all') {
            $query->whereNotIn('folder', ['trash', 'spam']);
        } else {
            $query->where('folder', $folder);
        }
        if ($unread) {
            $query->where('is_read', false);
        }
        if ($q !== '') {
            $query->where(fn ($query) => $query->whereLike('subject', '%'.mb_substr($q, 0, 200).'%')->orWhereLike('from_email', '%'.mb_substr($q, 0, 200).'%')->orWhereLike('from_name', '%'.mb_substr($q, 0, 200).'%'));
        }
        $page = $query->orderByDesc('created_at')->orderByDesc('id')->paginate(30)->withQueryString();
        $conversation = null;
        if ($thread) {
            $items = Message::where('mailbox_id', $mailbox->id)->where('thread_id', $thread)->orderBy('created_at')->get();
            abort_if($items->isEmpty(), 404);
            Message::whereIn('id', $items->pluck('id'))->where('is_read', false)->update(['is_read' => true, 'version' => DB::raw('version + 1')]);
            $conversation = ['id' => $thread, 'subject' => $items->first()->subject, 'messages' => $items->map(fn ($m) => [...$m->toArray(), 'has_html' => (bool) $m->body_html])];
        }
        $counts = Message::where('mailbox_id', $mailbox->id)->selectRaw('folder, count(*) as total')->groupBy('folder')->pluck('total', 'folder');
        $counts['unread'] = Message::where('mailbox_id', $mailbox->id)->where('folder', 'inbox')->where('is_read', false)->count();
        $drafts = Draft::where('user_id', $request->user()->id)->where('mailbox_id', $mailbox->id)->whereNotIn('status', ['accepted', 'delivered'])->orderByDesc('updated_at')->get();
        $counts['drafts'] = $drafts->count();

        return Inertia::render('mail', ['mailbox' => $mailbox, 'mailboxes' => $boxes, 'messages' => $page->items(), 'thread' => $conversation,
            'drafts' => $drafts, 'identities' => Address::where('mailbox_id', $mailbox->id)->where('active', true)->pluck('email'), 'counts' => $counts,
            'filters' => ['folder' => $folder, 'q' => $q, 'unread' => $unread, 'page' => $page->currentPage()],
            'pagination' => ['from' => $page->firstItem(), 'to' => $page->lastItem(), 'total' => $page->total(), 'next' => $page->nextPageUrl(), 'prev' => $page->previousPageUrl()],
            'simulation' => config('postroom.provider') === 'mock']);
    }

    public function html(Message $message, SafeMail $safe): mixed
    {
        Gate::authorize('view', Mailbox::findOrFail($message->mailbox_id));
        $body = $safe->html($message->body_html ?? '<p>'.e($message->body_text).'</p>');

        return response('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width"><style>body{font:16px/1.65 system-ui,sans-serif;color:#202124;margin:16px;overflow-wrap:anywhere}table{max-width:100%}pre{white-space:pre-wrap}a{color:#0b57d0}</style><body>'.$body.'</body></html>')
            ->header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox allow-popups allow-popups-to-escape-sandbox; base-uri 'none'; form-action 'none'");
    }

    public function mutate(Request $request, Mailbox $mailbox): mixed
    {
        Gate::authorize('view', $mailbox);
        $data = $request->validate(['ids' => 'required|array|min:1|max:30', 'ids.*' => 'integer|distinct', 'action' => 'required|in:archive,inbox,trash,spam,read,unread,star,unstar,label', 'label' => 'nullable|string|max:32']);
        $id = (string) Str::uuid();
        DB::transaction(function () use ($request, $mailbox, $data, $id) {
            $messages = Message::where('mailbox_id', $mailbox->id)->whereIn('id', $data['ids'])->orderBy('id')->lockForUpdate()->get();
            abort_unless($messages->count() === count($data['ids']), 403);
            $before = [];
            foreach ($messages as $message) {
                $before[] = $message->only(['id', 'mailbox_id', 'folder', 'is_read', 'starred', 'labels', 'version']);
                $changes = match ($data['action']) {
                    'read', 'unread' => ['is_read' => $data['action'] === 'read'],
                    'star', 'unstar' => ['starred' => $data['action'] === 'star'],
                    'label' => ['labels' => ! empty($data['label']) ? [$data['label']] : []],
                    default => ['folder' => $data['action']],
                };
                $message->update([...$changes, 'version' => $message->version + 1]);
            }
            DB::table('mail_operations')->insert(['id' => $id, 'user_id' => $request->user()->id, 'before' => json_encode($before), 'created_at' => now(), 'updated_at' => now()]);
        });

        return response()->json(['operation' => $id]);
    }

    public function undo(Request $request, string $operation): mixed
    {
        DB::transaction(function () use ($request, $operation) {
            $op = DB::table('mail_operations')->where('id', $operation)->where('user_id', $request->user()->id)->lockForUpdate()->first();
            abort_unless($op !== null, 404);
            if ($op->undone) {
                return;
            }
            foreach (json_decode($op->before, true) as $state) {
                Gate::authorize('view', Mailbox::findOrFail($state['mailbox_id']));
                $message = Message::whereKey($state['id'])->lockForUpdate()->firstOrFail();
                abort_unless($message->version === $state['version'] + 1, 409, 'This message changed again. Undo is no longer safe.');
                $message->update([...$state, 'version' => $message->version + 1]);
            }
            DB::table('mail_operations')->where('id', $operation)->update(['undone' => true]);
        });

        return response()->json(['ok' => true]);
    }

    public function preferences(Request $request): mixed
    {
        $data = $request->validate(['theme' => 'sometimes|in:light,dark,system', 'density' => 'sometimes|in:comfortable,compact', 'pane' => 'sometimes|in:none,right', 'collapsed' => 'sometimes|boolean', 'swipe_left' => 'sometimes|in:archive,read,none', 'swipe_right' => 'sometimes|in:archive,read,none']);
        $request->user()->forceFill(['preferences' => [...($request->user()->preferences ?? []), ...$data]])->save();

        return response()->json($request->user()->preferences);
    }

    public function sync(ImportService $importer): mixed
    {
        return response()->json([...$importer->sync(), 'checked_at' => now()->toIso8601String(), 'simulated' => config('postroom.provider') === 'mock']);
    }
}
