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
use Symfony\Component\Mime\Email;

class DeliveryService
{
    public function __construct(private OutboundMailProvider $provider, private UsageService $usage, private SafeMail $safe) {}

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
            $html = $this->safe->html($draft->body);
            $text = html_entity_decode(strip_tags(str_replace(['</p>', '<br>', '<br/>'], "\n", $html)));
            $intentId = (string) Str::uuid();
            $localMessageId = $intentId.'@'.config('postroom.domain');
            $mime = (new Email)->from($draft->from_email)->to(...$draft->to)->subject($draft->subject)->text($text)->html($html);
            $mime->getHeaders()->addIdHeader('Message-ID', $localMessageId);
            if ($draft->cc) {
                $mime->cc(...$draft->cc);
            }
            if ($draft->bcc) {
                $mime->bcc(...$draft->bcc);
            }
            if ($draft->in_reply_to) {
                $mime->getHeaders()->addIdHeader('In-Reply-To', trim($draft->in_reply_to, '<>'));
            }
            $raw = $mime->toString();
            abort_if(strlen($raw) > config('postroom.max_mime_bytes'), 422, 'The complete encoded message exceeds 256 KiB. Shorten it; your draft is retained.');
            $box = Mailbox::whereKey($draft->mailbox_id)->lockForUpdate()->firstOrFail();
            $bytes = strlen($raw) + strlen($text) + strlen($html);
            if (! app(StorageBudget::class)->permits($bytes) || ! $this->usage->allowance(count($recipients), $snapshot) || $box->used_bytes + $bytes > $box->quota_bytes || Mailbox::sum('used_bytes') + $bytes > config('postroom.organization_bytes')) {
                $draft->update(['status' => 'held']);

                return ['status' => 'held', 'error' => 'Sending paused: the shared allowance or storage headroom is unavailable. Your draft is saved. Ask an administrator to review Usage.'];
            }
            $payload = ['from' => $draft->from_email, 'to' => $draft->to, 'subject' => $draft->subject, 'html' => $html, 'text' => $text, 'tags' => [['name' => 'postroom_intent', 'value' => $intentId]]];
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
            $box->increment('used_bytes', $bytes);
            Message::create(['send_intent_id' => $intent->id, 'mailbox_id' => $box->id, 'thread_id' => $draft->thread_id ?? (string) Str::uuid(), 'message_id' => '<'.$intent->id.'@'.config('postroom.domain').'>',
                'from_name' => $user->name, 'from_email' => $draft->from_email, 'to' => $draft->to, 'cc' => $draft->cc, 'subject' => $draft->subject,
                'body_text' => $text, 'body_html' => $html, 'raw_mime' => $raw, 'folder' => 'sent', 'is_read' => true, 'delivery_status' => 'queued', 'logical_bytes' => $bytes]);
            $draft->update(['status' => 'queued']);

            return $intent;
        }, 3);
        if (is_array($result)) {
            return $result;
        }
        // Atomic claim makes repeated requests harmless even during a slow provider call.
        if (SendIntent::whereKey($result->id)->where('status', 'queued')->update(['status' => 'dispatching', 'attempted_at' => now()]) === 1) {
            try {
                $outcome = $this->provider->send($result->payload, 'postroom/'.$result->id);
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

        return ['id' => $result->id, 'status' => $result->status, 'error' => $result->last_error, 'simulated' => config('postroom.provider') === 'mock'];
    }
}
