<?php

namespace App\Services;

use App\Models\Address;
use App\Models\Mailbox;
use App\Models\Message;
use App\Providers\Mail\IngressGateway;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use ZBateson\MailMimeParser\Header\AddressHeader;
use ZBateson\MailMimeParser\MailMimeParser;

class ImportService
{
    public function __construct(private IngressGateway $gateway, private SafeMail $safe) {}

    /**  @return array<array-key, mixed> */
    public function sync(): array
    {
        app(DeliveryService::class)->markStaleDispatches();
        $imported = 0;
        $held = 0;
        foreach (array_slice($this->gateway->claim(), 0, 10) as $item) {
            try {
                if (($item['kind'] ?? 'mail') === 'event') {
                    app(EventService::class)->import($item);
                    $this->gateway->acknowledge($item['id'], $item['checksum']);
                    $imported++;

                    continue;
                }
                DB::transaction(function () use ($item) {
                    DB::table('quota_lock')->where('id', 1)->lockForUpdate()->first();
                    $existing = DB::table('ingress_receipts')->where('id', $item['id'])->first();
                    if ($existing) {
                        if (! hash_equals($existing->checksum, $item['checksum'])) {
                            throw new \RuntimeException('Receipt checksum changed.');
                        }

                        return;
                    }
                    $raw = base64_decode($item['raw'], true);
                    if ($raw === false || strlen($raw) > config('postroom.max_mime_bytes') || ! hash_equals(hash('sha256', $raw), $item['checksum'])) {
                        throw new \RuntimeException('Invalid receipt.');
                    }
                    $address = Address::where('email', strtolower($item['recipient']))->firstOrFail();
                    // Previously accepted mail stays importable even after an address is disabled.
                    $box = Mailbox::whereKey($address->mailbox_id)->lockForUpdate()->firstOrFail();
                    if (substr_count(strtolower($raw), 'content-type:') > 40) {
                        throw new \RuntimeException('MIME complexity requires review.');
                    }
                    $mime = (new MailMimeParser)->parse($raw, false);
                    $text = $mime->getTextContent() ?? strip_tags($mime->getHtmlContent() ?? '');
                    $html = $mime->getHtmlContent();
                    $bytes = strlen($raw) + strlen($text) + strlen($html ?? '');
                    if (! app(StorageBudget::class)->permits($bytes) || $bytes > 3 * config('postroom.max_mime_bytes') || $box->used_bytes + $bytes > $box->quota_bytes || Mailbox::sum('used_bytes') + $bytes > config('postroom.organization_bytes')) {
                        throw new \RuntimeException('Storage admission held.');
                    }
                    $reference = $mime->getHeaderValue('In-Reply-To');
                    $parent = $reference ? Message::where('mailbox_id', $box->id)->where(fn ($query) => $query->where('message_id', $reference)->orWhere('provider_message_id', $reference))->first() : null;
                    $from = $mime->getHeader('From');
                    $from = $from instanceof AddressHeader ? $from : null;
                    $message = Message::create(['mailbox_id' => $box->id, 'thread_id' => $parent->thread_id ?? (string) Str::uuid(),
                        'message_id' => $mime->getHeaderValue('Message-ID'), 'from_email' => $from?->getEmail() ?? 'unknown@example.invalid',
                        'from_name' => $from?->getPersonName() ?? '', 'to' => [$item['recipient']], 'cc' => [],
                        'subject' => mb_substr($mime->getHeaderValue('Subject') ?? '', 0, 998), 'body_text' => $text,
                        'body_html' => $html ? $this->safe->html($html) : null, 'raw_mime' => $raw,
                        'has_attachments' => $mime->getAttachmentCount() > 0, 'logical_bytes' => $bytes]);
                    DB::table('ingress_receipts')->insert(['id' => $item['id'], 'message_id' => $message->id, 'checksum' => $item['checksum'], 'created_at' => now(), 'updated_at' => now()]);
                    $box->increment('used_bytes', $bytes);
                }, 3);
                // This line is deliberately outside the transaction: never ACK an uncommitted import.
                $this->gateway->acknowledge($item['id'], $item['checksum']);
                $imported++;
            } catch (\Throwable) {
                $held++;
            }
        }

        return compact('imported', 'held');
    }
}
