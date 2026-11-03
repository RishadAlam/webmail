<?php

namespace App\Services;

use App\Models\Address;
use App\Models\Draft;
use App\Models\Mailbox;
use App\Models\Message;
use App\Models\SendIntent;
use App\Models\User;
use App\Providers\Mail\OutboundMailProvider;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Str;

class DeliveryService
{
    public function __construct(private OutboundMailProvider $provider, private UsageService $usage) {}

    public function markStaleDispatches(): int
    {
        return DB::transaction(function () {
            $stale = SendIntent::where('status', 'dispatching')->where('attempted_at', '<', now()->subMinutes(5))->limit(10)->lockForUpdate()->get();
            foreach ($stale as $intent) {
                $intent->update(['status' => 'uncertain', 'last_error' => 'The sending process stopped before recording an outcome. Await a signed provider event or reconcile with the provider; do not resend.']);
                Draft::whereKey($intent->draft_id)->update(['status' => 'uncertain']);
                Message::where('send_intent_id', $intent->id)->update(['delivery_status' => 'uncertain']);
            }

            return $stale->count();
        });
    }

    /**  @return array<array-key, mixed> */
    public function send(User $user, Draft $draft, int $version): array
    {
        abort_unless($draft->user_id === $user->id, 403);
        Gate::forUser($user)->authorize('send', Mailbox::findOrFail($draft->mailbox_id));
        $snapshot = $this->usage->snapshot();
        $result = DB::transaction(function () use ($user, $draft, $version, $snapshot) {
            DB::table('quota_lock')->where('id', 1)->lockForUpdate()->first();
            $user = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            $draft = Draft::whereKey($draft->id)->lockForUpdate()->firstOrFail();
            $membership = DB::table('mailbox_user')->where('mailbox_id', $draft->mailbox_id)->where('user_id', $user->id)->lockForUpdate()->first();
            abort_unless($user->active && $draft->user_id === $user->id && $membership?->can_send, 403, 'Your current account no longer has permission to send from this mailbox. Draft retained.');
            $intent = SendIntent::where('draft_id', $draft->id)->first();
            if ($intent) {
                return $intent;
            }
            abort_unless($draft->version === $version, 409, 'The draft changed. Reload its saved version before sending.');
            abort_unless(Address::where('mailbox_id', $draft->mailbox_id)->where('email', $draft->from_email)->where('active', true)->exists(), 403, 'This sender identity is not authorized.');
            $recipients = [...$draft->to, ...$draft->cc, ...$draft->bcc];
            validator(['to' => $draft->to, 'recipients' => $recipients, 'subject' => $draft->subject], ['to' => 'required|array|min:1|max:20', 'recipients' => 'array|max:20', 'recipients.*' => 'required|email:rfc|max:254', 'subject' => ['max:998', 'not_regex:/[\r\n]/']])->validate();
            abort_if(DB::table('suppressions')->whereIn('email', array_map('strtolower', $recipients))->exists(), 422, 'A recipient is suppressed after a bounce or complaint. Draft retained.');
            $intentId = (string) Str::uuid();
            ['html' => $html, 'text' => $text, 'raw' => $raw, 'attachments' => $attachments] = app(DraftMime::class)->render($draft, $intentId);
            $box = Mailbox::whereKey($draft->mailbox_id)->lockForUpdate()->firstOrFail();
            $bytes = strlen($raw) + strlen($text) + strlen($html);
            // The immutable send intent retains its own Base64 attachment copy.
            // Charge it to the retained draft so purging Sent cannot free its charge.
            $evidenceBytes = $attachments !== [] ? strlen(json_encode($attachments, JSON_THROW_ON_ERROR)) : 0;
            $growth = $bytes + $evidenceBytes;
            if (! app(StorageBudget::class)->permits($growth) || ! $this->usage->allowance(count($recipients), $snapshot) || $box->used_bytes + $growth > $box->quota_bytes || Mailbox::sum('used_bytes') + $growth > config('webmail.organization_bytes')) {
                $draft->update(['status' => 'held']);

                return ['status' => 'held', 'error' => 'Sending paused: the shared allowance or storage headroom is unavailable. Your draft is saved. Ask an administrator to review Usage.'];
            }
            $payload = ['from' => $draft->from_email, 'to' => $draft->to, 'subject' => $draft->subject, 'html' => $html, 'text' => $text, 'tags' => [['name' => 'webmail_intent', 'value' => $intentId]]];
            if ($attachments !== []) {
                $payload['attachments'] = $attachments;
            }
            if ($draft->cc) {
                $payload['cc'] = $draft->cc;
            }
            if ($draft->bcc) {
                $payload['bcc'] = $draft->bcc;
            }
            if ($draft->in_reply_to) {
                $payload['headers'] = ['In-Reply-To' => $draft->in_reply_to, 'References' => $draft->in_reply_to];
            }
            $intent = SendIntent::create(['id' => $intentId, 'draft_id' => $draft->id, 'user_id' => $user->id, 'mailbox_id' => $box->id, 'payload' => $payload, 'recipients' => count($recipients), 'status' => 'queued']);
            DB::table('quota_ledger')->insert(['intent_id' => $intent->id, 'recipients' => count($recipients), 'created_at' => now()]);
            $box->increment('used_bytes', $growth);
            Message::create(['send_intent_id' => $intent->id, 'mailbox_id' => $box->id, 'thread_id' => $draft->thread_id ?? (string) Str::uuid(), 'message_id' => '<'.$intent->id.'@'.config('webmail.domain').'>',
                'from_name' => $user->name, 'from_email' => $draft->from_email, 'to' => $draft->to, 'cc' => $draft->cc, 'subject' => $draft->subject,
                'body_text' => $text, 'body_html' => $html, 'raw_mime' => $raw, 'folder' => 'sent', 'is_read' => true, 'has_attachments' => $attachments !== [], 'delivery_status' => 'queued', 'logical_bytes' => $bytes]);
            $draft->update(['status' => 'queued', 'logical_bytes' => $draft->logical_bytes + $evidenceBytes]);

            return $intent;
        }, 3);
        if (is_array($result)) {
            return $result;
        }

        return $this->dispatch($user, $draft, $result, $snapshot);
    }

    /** Resume one durably queued intent only when no provider attempt has begun.
     *
     * @return array<array-key, mixed>
     */
    public function resume(User $user, Draft $draft): array
    {
        abort_unless($draft->user_id === $user->id, 403);
        Gate::forUser($user)->authorize('send', Mailbox::findOrFail($draft->mailbox_id));
        $intent = SendIntent::where('draft_id', $draft->id)->first();
        abort_unless($intent !== null, 409, 'There is no saved send intent to resume.');
        $snapshot = $intent->status === 'queued' && $intent->attempted_at === null && $intent->provider_id === null ? $this->usage->snapshot() : null;

        return $this->dispatch($user, $draft, $intent, $snapshot);
    }

    /** @return array<array-key, mixed> */
    private function dispatch(User $user, Draft $draft, SendIntent $intent, ?\stdClass $snapshot): array
    {
        // The durable attempt marker is committed before any network I/O. All callers,
        // including a repeated original request, use this same recovery eligibility check.
        $claim = DB::transaction(function () use ($user, $draft, $intent, $snapshot) {
            DB::table('quota_lock')->where('id', 1)->lockForUpdate()->first();
            $user = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            $draft = Draft::whereKey($draft->id)->lockForUpdate()->firstOrFail();
            $membership = DB::table('mailbox_user')->where('mailbox_id', $draft->mailbox_id)->where('user_id', $user->id)->lockForUpdate()->first();
            abort_unless($user->active && $draft->user_id === $user->id && $membership?->can_send, 403, 'Your current account no longer has permission to send from this mailbox. Draft retained.');
            $intent = SendIntent::whereKey($intent->id)->lockForUpdate()->firstOrFail();
            abort_unless($intent->draft_id === $draft->id && $intent->user_id === $user->id && $intent->mailbox_id === $draft->mailbox_id, 409, 'The saved send intent does not match this draft. Ask an administrator to investigate.');
            if ($intent->status !== 'queued') {
                return ['intent' => $intent, 'claimed' => false, 'resumable' => false];
            }
            if ($intent->attempted_at !== null || $intent->provider_id !== null) {
                $intent->update(['status' => 'uncertain', 'last_error' => 'This queued record contains evidence of an earlier provider attempt. Reconcile with the provider before any new send.']);
                Draft::whereKey($draft->id)->update(['status' => 'uncertain']);
                Message::where('send_intent_id', $intent->id)->update(['delivery_status' => 'uncertain']);

                return ['intent' => $intent, 'claimed' => false, 'resumable' => false];
            }
            $payload = $intent->payload;
            // The immutable intent's sender is authoritative, even if draft fields differ.
            $identity = Address::where('mailbox_id', $intent->mailbox_id)->where('email', $payload['from'] ?? '')->where('active', true)->lockForUpdate()->first();
            abort_unless($identity !== null, 403, 'The saved sender identity is no longer authorized. No delivery was attempted.');
            $recipients = [...($payload['to'] ?? []), ...($payload['cc'] ?? []), ...($payload['bcc'] ?? [])];
            abort_if(DB::table('suppressions')->whereIn('email', array_map('strtolower', $recipients))->exists(), 422, 'A recipient is suppressed after a bounce or complaint. No delivery was attempted.');
            $reservation = DB::table('quota_ledger')->where('intent_id', $intent->id)->lockForUpdate()->first();
            if (! $reservation || $reservation->recipients !== $intent->recipients || count($recipients) !== $intent->recipients || ! $recipients) {
                $intent->update(['last_error' => 'The saved send reservation is incomplete. No delivery was attempted. Ask an administrator to investigate.']);

                return ['intent' => $intent, 'claimed' => false, 'resumable' => false];
            }
            // A crash may leave a reservation outside today's/month's window. Move that
            // same reservation into the current windows before testing shared allowance.
            // It remains reserved when held; no second reservation or Sent copy is made.
            DB::table('quota_ledger')->where('intent_id', $intent->id)->update(['created_at' => now()]);
            if (! $this->usage->allowance(0, $snapshot)) {
                $intent->update(['last_error' => 'This message has not been sent. The current shared allowance is unavailable. Resume after an administrator reviews Usage.']);

                return ['intent' => $intent, 'claimed' => false, 'resumable' => true];
            }
            $intent->update(['status' => 'dispatching', 'attempted_at' => now(), 'last_error' => null]);
            Draft::whereKey($draft->id)->update(['status' => 'dispatching']);
            Message::where('send_intent_id', $intent->id)->update(['delivery_status' => 'dispatching']);

            return ['intent' => $intent, 'claimed' => true, 'resumable' => false];
        }, 3);
        $result = $claim['intent'];
        if ($claim['claimed']) {
            try {
                $outcome = $this->provider->send($result->payload, 'webmail/'.$result->id);
            } catch (\Throwable) {
                $outcome = ['status' => 'uncertain', 'id' => null, 'error' => 'Provider result could not be recorded. Reconcile before resending.'];
            }
            DB::transaction(function () use ($result, $outcome) {
                $current = SendIntent::whereKey($result->id)->lockForUpdate()->firstOrFail();
                // A signed callback can arrive before the HTTP response. Never regress its outcome.
                if (in_array($current->status, ['queued', 'dispatching', 'uncertain'])) {
                    $current->update(['status' => $outcome['status'], 'provider_id' => $outcome['id'] ?? $current->provider_id, 'last_error' => $outcome['error']]);
                    Draft::whereKey($current->draft_id)->update(['status' => $outcome['status']]);
                    Message::where('send_intent_id', $current->id)->update(['delivery_status' => $outcome['status']]);
                }

            });
        }
        $result->refresh();

        return ['id' => $result->id, 'status' => $result->status, 'error' => $result->last_error, 'resumable' => $claim['resumable'], 'simulated' => config('webmail.provider') === 'mock'];
    }
}
