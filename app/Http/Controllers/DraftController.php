<?php

namespace App\Http\Controllers;

use App\Models\Address;
use App\Models\Draft;
use App\Models\Mailbox;
use App\Models\Message;
use App\Services\DeliveryService;
use App\Services\StorageBudget;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

class DraftController extends Controller
{
    public function show(Request $request, Draft $draft): mixed
    {
        $this->authorizeDraft($request, $draft);

        return response()->json($draft);
    }

    public function create(Request $request, Mailbox $mailbox): mixed
    {
        Gate::authorize('send', $mailbox);
        $request->validate(['reply_to' => 'nullable|integer', 'mode' => 'nullable|in:reply,reply-all,forward', 'copy_failed' => 'nullable|uuid']);
        $identities = array_values(Address::where('mailbox_id', $mailbox->id)->where('active', true)->orderBy('id')->get(['email'])
            ->map(fn (Address $identity): string => $identity->email)->all());
        abort_if($identities === [], 403, 'This mailbox has no authorized sender identity.');
        $from = $identities[0];
        $fields = ['user_id' => $request->user()->id, 'mailbox_id' => $mailbox->id, 'from_email' => $from, 'to' => [], 'cc' => [], 'bcc' => [], 'subject' => '', 'body' => ''];
        if ($request->reply_to) {
            $message = Message::where('mailbox_id', $mailbox->id)->whereKey($request->integer('reply_to'))->firstOrFail();
            $forward = $request->mode === 'forward';
            $fields['subject'] = ($forward ? 'Fwd: ' : (preg_match('/^Re:/i', $message->subject) ? '' : 'Re: ')).$message->subject;
            $self = $this->normalizeAddresses($identities);
            $replyTo = $this->normalizeAddresses($message->reply_to ?: [$message->from_email], $self);
            // Replying to one's own Sent message should target its original
            // audience, not another active alias of the same mailbox.
            if (! $replyTo) {
                $replyTo = $this->normalizeAddresses($message->to, $self);
            }
            $fields['to'] = $forward ? [] : $replyTo;
            if ($request->mode === 'reply-all') {
                $fields['cc'] = $this->normalizeAddresses([...$message->to, ...$message->cc], [...$self, ...$replyTo, strtolower($message->from_email)]);
            }
            $fields['body'] = '<p></p><blockquote><p>'.e($message->from_name ?: $message->from_email).' wrote:</p><p>'.nl2br(e($message->body_text)).'</p></blockquote>';
            if ($forward && $message->has_attachments) {
                $fields['body'] = '<p>Attachments are not included in this forwarded message. Attachment access is disabled in this pilot; the original message is retained.</p>'.$fields['body'];
            }
            if (! $forward) {
                $fields['thread_id'] = $message->thread_id;
                $fields['in_reply_to'] = $message->provider_message_id ?? $message->message_id;
            }
        }

        if ($request->filled('copy_failed')) {
            $failed = Draft::whereKey($request->string('copy_failed')->toString())->where('user_id', $request->user()->id)->where('mailbox_id', $mailbox->id)->where('status', 'failed')->firstOrFail();
            $fields = [...$fields, ...$failed->only(['to', 'cc', 'bcc', 'subject', 'body', 'in_reply_to', 'thread_id'])];
        }
        $this->validateDraftContent($fields);
        $draft = DB::transaction(function () use ($mailbox, $fields) {
            DB::table('quota_lock')->where('id', 1)->lockForUpdate()->first();
            $box = Mailbox::whereKey($mailbox->id)->lockForUpdate()->firstOrFail();
            abort_if(Draft::where('mailbox_id', $box->id)->whereIn('status', ['draft', 'held'])->count() >= 100, 422, 'This mailbox has 100 editable drafts. Remove unused drafts before creating another.');
            $bytes = 1024 + strlen(json_encode($fields, JSON_THROW_ON_ERROR));
            abort_if(! app(StorageBudget::class)->permits($bytes) || $box->used_bytes + $bytes > $box->quota_bytes || Mailbox::sum('used_bytes') + $bytes > config('postroom.organization_bytes'), 422, 'Mailbox storage is full. Remove unused drafts before creating another.');
            $box->increment('used_bytes', $bytes);

            return Draft::create([...$fields, 'logical_bytes' => $bytes]);
        }, 3);

        return response()->json($draft, 201);
    }

    public function update(Request $request, Draft $draft): mixed
    {
        $this->authorizeDraft($request, $draft);
        $data = $request->validate(['version' => 'required|integer|min:1', 'from_email' => 'required|email:rfc', 'to' => 'present|array|max:20', 'cc' => 'present|array|max:20', 'bcc' => 'present|array|max:20', 'to.*' => 'email:rfc|max:254', 'cc.*' => 'email:rfc|max:254', 'bcc.*' => 'email:rfc|max:254', 'subject' => ['present', 'nullable', 'string', 'max:998', 'not_regex:/[\r\n]/'], 'body' => 'present|nullable|string|max:262144']);
        $data['subject'] ??= '';
        $data['body'] ??= '';
        $this->validateDraftContent($data);
        abort_unless(Address::where('mailbox_id', $draft->mailbox_id)->where('email', $data['from_email'])->where('active', true)->exists(), 403, 'Sender not authorized.');
        $saved = DB::transaction(function () use ($draft, $data) {
            DB::table('quota_lock')->where('id', 1)->lockForUpdate()->first();
            $current = Draft::whereKey($draft->id)->lockForUpdate()->firstOrFail();
            abort_unless(in_array($current->status, ['draft', 'held']), 409, 'A send intent already exists. This draft is retained for reference and cannot be resent.');
            abort_unless($current->version === $data['version'], 409, 'Another tab saved this draft. Your unsaved changes are still open; copy them before reloading.');
            $bytes = 1024 + strlen($data['body']) + strlen(json_encode($data, JSON_THROW_ON_ERROR));
            $box = Mailbox::whereKey($draft->mailbox_id)->lockForUpdate()->firstOrFail();
            abort_if(! app(StorageBudget::class)->permits($bytes) || $box->used_bytes + $bytes - $current->logical_bytes > $box->quota_bytes || Mailbox::sum('used_bytes') + $bytes - $current->logical_bytes > config('postroom.organization_bytes'), 422, 'Mailbox storage is full. Keep this editor open and ask an administrator for help.');
            $box->increment('used_bytes', $bytes - $current->logical_bytes);
            $current->update([...$data, 'version' => $current->version + 1, 'logical_bytes' => $bytes, 'status' => 'draft']);

            return $current;
        }, 3);

        return response()->json($saved);
    }

    public function delete(Request $request, Draft $draft): mixed
    {
        $this->authorizeDraft($request, $draft);
        abort_unless(in_array($draft->status, ['draft', 'held']), 409, 'Delivery records cannot be discarded.');
        DB::transaction(function () use ($draft) {
            DB::table('quota_lock')->where('id', 1)->lockForUpdate()->first();
            $current = Draft::whereKey($draft->id)->lockForUpdate()->firstOrFail();
            abort_unless(in_array($current->status, ['draft', 'held']), 409, 'Delivery records cannot be discarded.');
            Mailbox::whereKey($current->mailbox_id)->decrement('used_bytes', $current->logical_bytes);
            $current->delete();
        });

        return response()->json(['ok' => true]);
    }

    public function send(Request $request, Draft $draft, DeliveryService $delivery): mixed
    {
        $this->authorizeDraft($request, $draft);
        $data = $request->validate(['version' => 'required|integer|min:1']);
        $result = $delivery->send($request->user(), $draft, $data['version']);

        return response()->json($result, $result['status'] === 'held' ? 422 : 200);
    }

    private function authorizeDraft(Request $request, Draft $draft): void
    {
        abort_unless($draft->user_id === $request->user()->id, 403);
        Gate::authorize('send', Mailbox::findOrFail($draft->mailbox_id));
    }

    /**
     * @param  list<string>  $addresses
     * @param  list<string>  $exclude
     * @return list<string>
     */
    private function normalizeAddresses(array $addresses, array $exclude = []): array
    {
        return array_values(array_diff(array_unique(array_map(fn ($email) => strtolower(trim($email)), $addresses)), $exclude));
    }

    /** @param array<string, mixed> $fields */
    private function validateDraftContent(array $fields): void
    {
        validator([...$fields, 'recipients' => [...$fields['to'], ...$fields['cc'], ...$fields['bcc']]], [
            'recipients' => 'array|max:20', 'recipients.*' => 'required|email:rfc|max:254',
            'subject' => ['present', 'string', 'max:998', 'not_regex:/[\r\n]/'],
            'body' => 'present|string|max:262144',
        ], ['recipients.max' => 'This pilot supports at most 20 recipients across To, Cc and Bcc. No recipients were removed; choose a smaller audience.',
            'body.max' => 'The quoted message is too large for an editable draft. Start a new message with a shorter excerpt; the original is retained.'])->validate();
        abort_if(strlen($fields['body']) > config('postroom.max_mime_bytes'), 422, 'The draft text exceeds the 256 KiB editing limit. Shorten it; the original message and any saved draft are retained.');
    }
}
