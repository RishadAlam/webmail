<?php

namespace App\Services;

use App\Models\Draft;
use App\Models\Message;
use App\Models\SendIntent;
use Illuminate\Support\Facades\DB;

class EventService
{
    /**  @param array<string, mixed> $item */
    public function import(array $item): void
    {
        $raw = base64_decode($item['raw'], true);
        if ($raw === false || ! hash_equals(hash('sha256', $raw), $item['checksum'])) {
            throw new \RuntimeException('Invalid event checksum.');
        }
        $event = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
        DB::transaction(function () use ($item, $event) {
            DB::table('quota_lock')->where('id', 1)->lockForUpdate()->first();
            if (DB::table('provider_events')->where('id', $item['id'])->exists()) {
                return;
            }
            $intent = SendIntent::where('provider_id', $event['data']['email_id'])->lockForUpdate()->first();
            if (! $intent && is_string($event['data']['tags']['webmail_intent'] ?? null)) {
                $intent = SendIntent::whereKey($event['data']['tags']['webmail_intent'])->whereNull('provider_id')->whereIn('status', ['dispatching', 'uncertain'])->lockForUpdate()->first();
                if ($intent) {
                    $intent->update(['provider_id' => $event['data']['email_id']]);
                }
            }
            if (! $intent) {
                throw new \RuntimeException('Event awaits provider acceptance reconciliation.');
            }
            $providerMessageId = $event['data']['message_id'] ?? null;
            if (is_string($providerMessageId) && preg_match('/^<[^<>\s]{1,990}>$/', $providerMessageId)) {
                Message::where('send_intent_id', $intent->id)->update(['provider_message_id' => $providerMessageId]);
            }
            $status = match ($event['type']) {
                'email.sent' => 'accepted', 'email.delivered' => 'delivered',
                'email.bounced' => ($event['data']['bounce']['type'] ?? '') === 'Permanent' ? 'bounced' : 'deferred',
                'email.complained' => 'complained', 'email.failed' => 'failed', default => null,
            };
            $payload = $intent->payload;
            $recipients = array_unique(array_map('strtolower', [...($payload['to'] ?? []), ...($payload['cc'] ?? []), ...($payload['bcc'] ?? [])]));
            $states = $intent->recipient_states ?? array_fill_keys($recipients, 'pending');
            // Events are per recipient. A successful delivery must never imply all recipients received it.
            $rank = ['pending' => 0, 'accepted' => 1, 'deferred' => 2, 'failed' => 3, 'delivered' => 4, 'bounced' => 5, 'complained' => 6];
            foreach (($event['data']['to'] ?? []) as $recipient) {
                $recipient = strtolower($recipient);
                if (! array_key_exists($recipient, $states) || ! $status) {
                    continue;
                }
                if ($rank[$status] > ($rank[$states[$recipient]] ?? 0)) {
                    $states[$recipient] = $status;
                }
                if (in_array($status, ['bounced', 'complained'], true)) {
                    DB::table('suppressions')->updateOrInsert(['email' => $recipient], ['reason' => $status, 'created_at' => now(), 'updated_at' => now()]);
                }
            }
            $values = array_values($states);
            $aggregate = match (true) {
                in_array('complained', $values, true) => 'complained',
                in_array('bounced', $values, true) => 'bounced',
                count($values) > 0 && count(array_filter($values, fn ($s) => $s === 'delivered')) === count($values) => 'delivered',
                in_array('delivered', $values, true) => 'partially_delivered',
                in_array('failed', $values, true) => 'delivery_failed',
                in_array('deferred', $values, true) => 'deferred',
                default => 'accepted',
            };
            if ($status) {
                $intent->update(['status' => $aggregate, 'recipient_states' => $states]);
                Draft::whereKey($intent->draft_id)->update(['status' => $aggregate]);
                Message::where('send_intent_id', $intent->id)->update(['delivery_status' => $aggregate]);
            }
            DB::table('provider_events')->insert(['id' => $item['id'], 'provider_id' => $event['data']['email_id'], 'type' => $event['type'], 'data' => json_encode(['status' => $status]), 'created_at' => now(), 'updated_at' => now()]);
        }, 3);
    }
}
