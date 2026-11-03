<?php

namespace App\Http\Controllers;

use App\Models\Address;
use App\Models\Draft;
use App\Models\Mailbox;
use App\Models\MailboxLabel;
use App\Models\Message;
use App\Models\User;
use App\Services\ImportService;
use App\Services\MailOrganization;
use App\Services\MailSearch;
use App\Services\SafeMail;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Str;
use Inertia\Inertia;

class MailController extends Controller
{
    public function __construct(private MailOrganization $organization, private MailSearch $search) {}

    public function index(Request $request, ?Mailbox $mailbox = null, ?string $thread = null): mixed
    {
        $boxes = $request->user()->mailboxes()->get();
        $mailbox ??= $boxes->first();
        if (! $mailbox) {
            return Inertia::render('mail', ['mailbox' => null, 'mailboxes' => [], 'messages' => [], 'thread' => null, 'drafts' => [], 'identities' => [], 'labels' => [], 'counts' => [], 'filters' => ['label' => null, 'category' => null], 'search_error' => null, 'pagination' => null, 'simulation' => config('webmail.provider') === 'mock']);
        }
        Gate::authorize('view', $mailbox);
        $request->validate(['folder' => 'sometimes|in:'.implode(',', MailSearch::FOLDERS), 'q' => 'sometimes|nullable|string|max:200',
            'label' => 'sometimes|nullable|integer|min:1', 'category' => 'sometimes|nullable|in:'.implode(',', MailOrganization::CATEGORIES)]);
        $this->organization->resolveSnoozes($mailbox);
        $this->organization->retainLegacyLabels($mailbox);
        $labels = $this->organization->labels($mailbox);
        $label = $request->filled('label') ? $labels->firstWhere('id', $request->integer('label')) : null;
        abort_if($request->filled('label') && ! $label, 404);
        $category = $request->filled('category') ? $request->string('category')->toString() : null;
        $q = trim((string) $request->query('q', ''));
        $folder = $request->string('folder', $q !== '' || $label ? 'all' : 'inbox')->toString();
        $unread = $request->boolean('unread');
        $query = Message::where('mailbox_id', $mailbox->id);
        $searchError = null;
        try {
            $tokens = $this->search->parse($q);
            $searchFolder = collect($tokens)->firstWhere('operator', 'in')['value'] ?? null;
            if ($searchFolder !== null) {
                if ($request->has('folder') && $folder !== 'all' && $folder !== $searchFolder) {
                    throw new \InvalidArgumentException('The in: folder conflicts with the selected folder. Choose All mail or remove in:.');
                }
                $folder = $searchFolder;
            }
            $this->search->apply($query, $tokens);
        } catch (\InvalidArgumentException $error) {
            $searchError = $error->getMessage();
            $query->whereRaw('1 = 0');
        }
        $this->search->folder($query, $folder);
        if ($unread) {
            $query->where('is_read', false);
        }
        if ($label) {
            $query->whereJsonContains('labels', $label->name);
        }
        if ($category !== null) {
            $query->where('category', $category);
        }
        $preferences = $request->user()->preferences ?? [];
        $pageSize = in_array($preferences['page_size'] ?? 30, [10, 30, 50, 100], true) ? ($preferences['page_size'] ?? 30) : 30;
        if ($folder === 'inbox') {
            match ($preferences['inbox_order'] ?? 'newest') {
                'unread' => $query->orderBy('is_read'),
                'starred' => $query->orderByDesc('starred'),
                'important' => $query->orderByDesc('important'),
                default => null,
            };
        }
        $page = $query->orderByDesc('created_at')->orderByDesc('id')->paginate($pageSize)->withQueryString();
        $conversation = null;
        if ($thread) {
            $threadPage = Message::where('mailbox_id', $mailbox->id)->where('thread_id', $thread)->orderByDesc('created_at')->orderByDesc('id')->paginate(30, ['*'], 'thread_page')->withQueryString();
            $items = $threadPage->getCollection()->reverse()->values();
            abort_if($items->isEmpty(), 404);
            Message::whereIn('id', $items->pluck('id'))->where('is_read', false)->update(['is_read' => true, 'version' => DB::raw('version + 1')]);
            $conversation = ['id' => $thread, 'subject' => $items->first()->subject,
                'messages' => $items->map(fn ($m) => [...$m->toArray(), 'is_read' => true, 'has_html' => (bool) $m->body_html]),
                'pagination' => ['total' => $threadPage->total(), 'older' => $threadPage->nextPageUrl(), 'newer' => $threadPage->previousPageUrl()]];
        }
        $counts = Message::where('mailbox_id', $mailbox->id)->selectRaw('folder, count(*) as total')->groupBy('folder')->pluck('total', 'folder');
        $counts['unread'] = Message::where('mailbox_id', $mailbox->id)->where('folder', 'inbox')->where('is_read', false)->count();
        foreach (['all', 'starred', 'important', 'snoozed'] as $view) {
            $countQuery = Message::where('mailbox_id', $mailbox->id);
            $this->search->folder($countQuery, $view);
            $counts[$view] = $countQuery->count();
        }
        $drafts = Draft::where('user_id', $request->user()->id)->where('mailbox_id', $mailbox->id)->whereNotIn('status', ['accepted', 'delivered'])->orderByDesc('updated_at')->get();
        $counts['drafts'] = $drafts->count();

        return Inertia::render('mail', ['mailbox' => $mailbox, 'mailboxes' => $boxes, 'messages' => $page->getCollection()->map(fn ($message) => [...$message->toArray(), 'body_text' => mb_substr($message->body_text ?? '', 0, 240)]), 'thread' => $conversation,
            'drafts' => $drafts, 'identities' => Address::where('mailbox_id', $mailbox->id)->where('active', true)->pluck('email'), 'counts' => $counts,
            'labels' => $labels->map->only(['id', 'name', 'color'])->values(), 'search_error' => $searchError,
            'filters' => ['folder' => $folder, 'q' => $q, 'unread' => $unread, 'page' => $page->currentPage(), 'label' => $label?->id, 'category' => $category],
            'pagination' => ['from' => $page->firstItem(), 'to' => $page->lastItem(), 'total' => $page->total(), 'next' => $page->nextPageUrl(), 'prev' => $page->previousPageUrl()],
            'simulation' => config('webmail.provider') === 'mock']);
    }

    public function html(Message $message, SafeMail $safe): mixed
    {
        Gate::authorize('view', Mailbox::findOrFail($message->mailbox_id));
        $body = $safe->html($message->body_html ?? '<p>'.e($message->body_text).'</p>');

        return response('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width"><style>body{font:16px/1.65 system-ui,sans-serif;color:#202124;margin:16px;overflow-wrap:anywhere}table{border-collapse:collapse;max-width:none}td,th{min-width:8rem;padding:.4rem;vertical-align:top}pre{white-space:pre-wrap}a{color:#0b57d0}</style><body>'.$body.'</body></html>')
            ->header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox allow-popups allow-popups-to-escape-sandbox; base-uri 'none'; form-action 'none'");
    }

    public function original(Request $request, Message $message): mixed
    {
        Gate::authorize('view', Mailbox::findOrFail($message->mailbox_id));
        DB::table('audit_events')->insert(['user_id' => $request->user()->id, 'action' => 'message.exported', 'target' => (string) $message->id, 'created_at' => now(), 'updated_at' => now()]);

        return response($message->raw_mime)->header('Content-Type', 'message/rfc822')
            ->header('Content-Disposition', 'attachment; filename="message-'.$message->id.'.eml"')
            ->header('X-Content-Type-Options', 'nosniff')->header('Cache-Control', 'private, no-store');
    }

    public function mutate(Request $request, Mailbox $mailbox): mixed
    {
        Gate::authorize('view', $mailbox);
        $data = $request->validate(['ids' => 'required|array|min:1|max:100', 'ids.*' => 'integer|distinct',
            'action' => 'required|in:archive,inbox,trash,spam,read,unread,star,unstar,label,remove-label,important,unimportant,snooze,unsnooze,category',
            'label' => ['nullable', 'string', 'max:32', 'regex:/\A[^\p{C}]+\z/u'], 'label_id' => 'nullable|integer|min:1',
            'category' => 'required_if:action,category|in:'.implode(',', MailOrganization::CATEGORIES),
            'snoozed_until' => 'required_if:action,snooze|date|after:now|before_or_equal:'.now()->addYear()->toIso8601String()]);
        $id = (string) Str::uuid();
        DB::transaction(function () use ($request, $mailbox, $data, $id) {
            $lockedMailbox = Mailbox::whereKey($mailbox->id)->lockForUpdate()->firstOrFail();
            Gate::forUser(User::whereKey($request->user()->id)->firstOrFail())->authorize('view', $lockedMailbox);
            if ($data['action'] !== 'unsnooze') {
                $this->organization->resolveSnoozes($mailbox);
            }
            $this->organization->retainLegacyLabels($mailbox);
            $label = in_array($data['action'], ['label', 'remove-label'], true) ? $this->organization->actionLabel($mailbox, $data) : null;
            $catalog = $this->organization->labels($mailbox)->keyBy('name');
            $messages = Message::where('mailbox_id', $mailbox->id)->whereIn('id', $data['ids'])->orderBy('id')->lockForUpdate()->get();
            abort_unless($messages->count() === count($data['ids']), 403);
            $before = [];
            foreach ($messages as $message) {
                abort_if($data['action'] === 'snooze' && ! in_array($message->folder, ['inbox', 'archive', 'snoozed'], true), 422, 'Snooze only messages in Inbox, Archive, or Snoozed. Move received mail out of Spam or Trash first.');
                abort_if($data['action'] === 'unsnooze' && $message->folder !== 'snoozed', 422, 'Choose only snoozed messages to return to the Inbox.');
                $before[] = [...$message->only(['id', 'mailbox_id', 'folder', 'is_read', 'starred', 'important', 'snoozed_until', 'category', 'labels', 'version']),
                    '_labels' => array_map(fn ($name) => ['id' => $catalog[$name]->id, 'name' => $name], $message->labels ?? [])];
                $changes = match ($data['action']) {
                    'read', 'unread' => ['is_read' => $data['action'] === 'read'],
                    'star', 'unstar' => ['starred' => $data['action'] === 'star'],
                    'important', 'unimportant' => ['important' => $data['action'] === 'important'],
                    'label' => ['labels' => array_values(array_unique([...($message->labels ?? []), $label->name]))],
                    'remove-label' => ['labels' => array_values(array_filter($message->labels ?? [], fn ($name) => $name !== $label->name))],
                    'category' => ['category' => $data['category']],
                    'snooze' => ['folder' => 'snoozed', 'snoozed_until' => Carbon::parse($data['snoozed_until'])->utc()],
                    'unsnooze' => ['folder' => 'inbox', 'snoozed_until' => null],
                    default => ['folder' => $data['action'], 'snoozed_until' => null],
                };
                $message->update([...$changes, 'version' => $message->version + 1]);
            }
            $this->organization->resolveSnoozes($mailbox);
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
            $states = json_decode($op->before, true, 512, JSON_THROW_ON_ERROR);
            if (! is_array($states)) {
                throw new \RuntimeException('Invalid operation snapshot.');
            }
            $mailboxes = [];
            foreach (collect($states)->pluck('mailbox_id')->unique()->sort() as $mailboxId) {
                $mailbox = Mailbox::whereKey($mailboxId)->lockForUpdate()->firstOrFail();
                Gate::forUser(User::whereKey($request->user()->id)->firstOrFail())->authorize('view', $mailbox);
                $this->organization->resolveSnoozes($mailbox);
                $mailboxes[] = $mailbox;
            }
            foreach ($states as $state) {
                $message = Message::whereKey($state['id'])->where('mailbox_id', $state['mailbox_id'])->lockForUpdate()->first();
                abort_unless($message !== null, 409, 'This message no longer exists. Undo is no longer safe.');
                abort_unless($message->version === $state['version'] + 1, 409, 'This message changed again. Undo is no longer safe.');
                foreach ($state['_labels'] ?? [] as $label) {
                    abort_unless(MailboxLabel::where('mailbox_id', $state['mailbox_id'])->whereKey($label['id'])->where('name', $label['name'])->exists(), 409, 'A label changed. Undo is no longer safe.');
                }
                foreach ($state['labels'] ?? [] as $name) {
                    abort_unless(MailboxLabel::where('mailbox_id', $state['mailbox_id'])->where('name', $name)->exists(), 409, 'A label no longer exists. Undo is no longer safe.');
                }
                unset($state['_labels']);
                $message->update([...$state, 'version' => $message->version + 1]);
            }
            foreach ($mailboxes as $mailbox) {
                $this->organization->resolveSnoozes($mailbox);
            }
            DB::table('mail_operations')->where('id', $operation)->update(['undone' => true]);
        });

        return response()->json(['ok' => true]);
    }

    public function preferences(Request $request): mixed
    {
        $data = $request->validate(['theme' => 'sometimes|in:light,dark,system', 'density' => 'sometimes|in:comfortable,compact', 'pane' => 'sometimes|in:none,right', 'collapsed' => 'sometimes|boolean', 'swipe_left' => 'sometimes|in:archive,read,none', 'swipe_right' => 'sometimes|in:archive,read,none']);
        $preferences = DB::transaction(function () use ($request, $data) {
            $user = User::whereKey($request->user()->id)->lockForUpdate()->firstOrFail();
            $user->forceFill(['preferences' => [...($user->preferences ?? []), ...$data]])->save();

            return $user->preferences;
        });

        return response()->json($preferences);
    }

    public function sync(ImportService $importer): mixed
    {
        return response()->json([...$importer->sync(), 'checked_at' => now()->toIso8601String(), 'simulated' => config('webmail.provider') === 'mock']);
    }
}
