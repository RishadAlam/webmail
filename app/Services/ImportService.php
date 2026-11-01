<?php

namespace App\Services;

use App\Enums\ImportIncidentCategory;
use App\Exceptions\ImportHeld;
use App\Models\Address;
use App\Models\Mailbox;
use App\Models\Message;
use App\Providers\Mail\IngressGateway;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use ZBateson\MailMimeParser\Header\AddressHeader;
use ZBateson\MailMimeParser\IMessage;
use ZBateson\MailMimeParser\MailMimeParser;

class ImportService
{
    public function __construct(private IngressGateway $gateway, private SafeMail $safe) {}

    /**  @return array<array-key, mixed> */
    public function sync(): array
    {
        app(DeliveryService::class)->markStaleDispatches();
        $incidents = app(ImportIncidents::class);
        $imported = 0;
        $held = 0;
        foreach (array_slice($this->gateway->claim(), 0, 10) as $item) {
            $committed = false;
            try {
                if (! $incidents->validReceiptId($item['id'] ?? null)
                    || ! is_string($item['checksum'] ?? null)
                    || preg_match('/\A[a-f0-9]{64}\z/D', $item['checksum']) !== 1) {
                    throw new ImportHeld(ImportIncidentCategory::ReceiptInvalid);
                }
                if (($item['kind'] ?? 'mail') === 'event') {
                    $this->receiptPayload($item);
                    try {
                        app(EventService::class)->import($item);
                    } catch (\JsonException) {
                        throw new ImportHeld(ImportIncidentCategory::ReceiptInvalid);
                    }
                    $committed = true;
                    $this->gateway->acknowledge($item['id'], $item['checksum']);
                    $incidents->resolve($item['id']);
                    $imported++;

                    continue;
                }
                DB::transaction(function () use ($item) {
                    DB::table('quota_lock')->where('id', 1)->lockForUpdate()->first();
                    $existing = DB::table('ingress_receipts')->where('id', $item['id'])->first();
                    if ($existing) {
                        if (! hash_equals($existing->checksum, $item['checksum'])) {
                            throw new ImportHeld(ImportIncidentCategory::ReceiptConflict);
                        }

                        return;
                    }
                    $raw = $this->receiptPayload($item);
                    $address = is_string($item['recipient'] ?? null) ? Address::where('email', strtolower($item['recipient']))->first() : null;
                    if (! $address) {
                        throw new ImportHeld(ImportIncidentCategory::MailboxUnavailable);
                    }
                    // Previously accepted mail stays importable even after an address is disabled.
                    $box = Mailbox::whereKey($address->mailbox_id)->lockForUpdate()->first();
                    if (! $box) {
                        throw new ImportHeld(ImportIncidentCategory::MailboxUnavailable);
                    }
                    app(MailOrganization::class)->resolveSnoozes($box);
                    if (substr_count(strtolower($raw), 'content-type:') > 40) {
                        throw new ImportHeld(ImportIncidentCategory::MimeInvalid);
                    }
                    $mime = (new MailMimeParser)->parse($raw, false);
                    $headers = $this->addressMetadata($mime);
                    $text = $mime->getTextContent() ?? strip_tags($mime->getHtmlContent() ?? '');
                    $html = $mime->getHtmlContent();
                    $bytes = strlen($raw) + strlen($text) + strlen($html ?? '') + strlen(json_encode($headers, JSON_THROW_ON_ERROR));
                    if (! app(StorageBudget::class)->permits($bytes) || $bytes > 3 * config('postroom.max_mime_bytes') || $box->used_bytes + $bytes > $box->quota_bytes || Mailbox::sum('used_bytes') + $bytes > config('postroom.organization_bytes')) {
                        throw new ImportHeld(ImportIncidentCategory::StorageHeld);
                    }
                    $reference = $mime->getHeaderValue('In-Reply-To');
                    $parent = $reference ? Message::where('mailbox_id', $box->id)->where(fn ($query) => $query->where('message_id', $reference)->orWhere('provider_message_id', $reference))->first() : null;
                    $message = Message::create(['mailbox_id' => $box->id, 'thread_id' => $parent->thread_id ?? (string) Str::uuid(),
                        'message_id' => $mime->getHeaderValue('Message-ID'), ...$headers,
                        'subject' => mb_substr($mime->getHeaderValue('Subject') ?? '', 0, 998), 'body_text' => $text,
                        'body_html' => $html ? $this->safe->html($html) : null, 'raw_mime' => $raw,
                        'has_attachments' => $mime->getAttachmentCount() > 0, 'logical_bytes' => $bytes]);
                    app(MailOrganization::class)->applyIncoming($message);
                    DB::table('ingress_receipts')->insert(['id' => $item['id'], 'message_id' => $message->id, 'checksum' => $item['checksum'], 'created_at' => now(), 'updated_at' => now()]);
                    $box->increment('used_bytes', $bytes);
                }, 3);
                $committed = true;
                // This line is deliberately outside the transaction: never ACK an uncommitted import.
                $this->gateway->acknowledge($item['id'], $item['checksum']);
                $incidents->resolve($item['id']);
                $imported++;
            } catch (\Throwable $error) {
                $category = $committed ? ImportIncidentCategory::AcknowledgementPending
                    : ($error instanceof ImportHeld ? $error->category : ImportIncidentCategory::TemporaryFailure);
                $incidents->hold($item['id'] ?? null, ($item['kind'] ?? 'mail') === 'event' ? 'event' : 'mail', $category);
                $held++;
            }
        }

        return compact('imported', 'held');
    }

    /** @param array<string, mixed> $item */
    private function receiptPayload(array $item): string
    {
        $raw = is_string($item['raw'] ?? null) ? base64_decode($item['raw'], true) : false;
        if ($raw === false || strlen($raw) > config('postroom.max_mime_bytes') || ! hash_equals(hash('sha256', $raw), $item['checksum'])) {
            throw new ImportHeld(ImportIncidentCategory::ReceiptInvalid);
        }

        return $raw;
    }

    /** @return array{from_email: string, from_name: string, to: list<string>, cc: list<string>, reply_to: list<string>} */
    private function addressMetadata(IMessage $mime): array
    {
        $rawHeaders = [];
        $bytes = 0;
        // Bound metadata before asking the MIME parser to tokenize it. Bcc is
        // intentionally absent; only the envelope selects the destination box.
        foreach ($mime->getRawHeaderIterator() as [$name, $value]) {
            $name = strtolower($name);
            if (! in_array($name, ['from', 'to', 'cc', 'reply-to'], true)) {
                continue;
            }
            $bytes += strlen($value);
            if (isset($rawHeaders[$name]) || $bytes > 8192) {
                throw new ImportHeld(ImportIncidentCategory::MimeInvalid);
            }
            $this->checkAddressSyntax($value);
            $rawHeaders[$name] = $value;
        }

        $addresses = ['from' => [], 'to' => [], 'cc' => [], 'reply-to' => []];
        $recipientCount = 0;
        $fromName = '';
        foreach ($rawHeaders as $name => $value) {
            $header = $mime->getHeader($name);
            if (! $header instanceof AddressHeader || $header->hasAnyErrors(false)) {
                throw new ImportHeld(ImportIncidentCategory::MimeInvalid);
            }
            foreach ($header->getGroups() as $group) {
                if ($group->hasErrors(true)) {
                    throw new ImportHeld(ImportIncidentCategory::MimeInvalid);
                }
            }
            // Recursive validation in parser 3.0.9 also visits a synthetic
            // unnamed group inside valid named groups. Validate the actual
            // addresses, not that internal wrapper.
            foreach ($header->getAddresses() as $part) {
                $email = strtolower($part->getEmail());
                if ($part->hasAnyErrors(true) || validator(['email' => $email], ['email' => 'required|email:rfc|max:254'])->fails()) {
                    throw new ImportHeld(ImportIncidentCategory::MimeInvalid);
                }
                $addresses[$name][] = $email;
            }
            if ($name === 'from') {
                if (count($addresses[$name]) !== 1 || $header->getGroups()) {
                    throw new ImportHeld(ImportIncidentCategory::MimeInvalid);
                }
                $fromName = mb_substr($header->getPersonName() ?? '', 0, 255);
            } else {
                $recipientCount += count($addresses[$name]);
                if ($recipientCount > 20 || ($name === 'reply-to' && ! $addresses[$name])) {
                    throw new ImportHeld(ImportIncidentCategory::MimeInvalid);
                }
            }
            $addresses[$name] = array_values(array_unique($addresses[$name]));
        }
        if (! $addresses['from']) {
            throw new ImportHeld(ImportIncidentCategory::MimeInvalid);
        }

        return ['from_email' => $addresses['from'][0], 'from_name' => $fromName, 'to' => $addresses['to'], 'cc' => $addresses['cc'], 'reply_to' => $addresses['reply-to']];
    }

    private function checkAddressSyntax(string $value): void
    {
        $value = preg_replace('/\r?\n[ \t]+/', ' ', $value) ?? '';
        if (preg_match('/[\x00-\x08\x0a-\x1f\x7f]/', $value)) {
            throw new ImportHeld(ImportIncidentCategory::MimeInvalid);
        }
        $quoted = $escaped = $angle = $group = $literal = false;
        $hasAngle = $closedAngle = $afterGroup = false;
        $comments = 0;
        $start = 0;
        $parts = [];
        // The tolerant MIME parser accepts unclosed delimiters. Reject those
        // instead of silently repairing a recipient or dropping part of it.
        foreach (str_split($value) as $offset => $char) {
            if ($escaped) {
                $escaped = false;

                continue;
            }
            if ($char === '\\' && ($quoted || $comments || $literal)) {
                $escaped = true;

                continue;
            }
            if ($quoted) {
                if ($char === '"') {
                    $quoted = false;
                }

                continue;
            }
            if ($comments) {
                $comments += $char === '(' ? 1 : ($char === ')' ? -1 : 0);
                if ($comments > 16) {
                    throw new ImportHeld(ImportIncidentCategory::MimeInvalid);
                }

                continue;
            }
            if ($literal) {
                if ($char === ']') {
                    $literal = false;
                }

                continue;
            }
            if (($closedAngle && ! ctype_space($char) && ! in_array($char, ['(', ',', ';'], true))
                || ($afterGroup && ! ctype_space($char) && ! in_array($char, ['(', ','], true))) {
                throw new ImportHeld(ImportIncidentCategory::MimeInvalid);
            }
            if ($char === ',' && ! $angle) {
                if (! $afterGroup) {
                    $parts[] = ['value' => substr($value, $start, $offset - $start), 'angle' => $hasAngle];
                }
                $start = $offset + 1;
                $hasAngle = $closedAngle = $afterGroup = false;

                continue;
            }
            if ($char === '"') {
                $quoted = true;
            } elseif ($char === '(') {
                $comments = 1;
            } elseif ($char === '[') {
                $literal = true;
            } elseif ($char === '<' && ! $angle) {
                $angle = true;
                $hasAngle = true;
            } elseif ($char === '>' && $angle) {
                $angle = false;
                $closedAngle = true;
            } elseif ($char === ':' && ! $angle && ! $group) {
                $group = true;
                $start = $offset + 1;
            } elseif ($char === ';' && ! $angle && $group) {
                $part = substr($value, $start, $offset - $start);
                if (trim($part) !== '') {
                    $parts[] = ['value' => $part, 'angle' => $hasAngle];
                }
                $group = false;
                $afterGroup = true;
                $hasAngle = $closedAngle = false;
                $start = $offset + 1;
            } elseif (in_array($char, ['<', '>', ')', ']', ':', ';'], true)) {
                throw new ImportHeld(ImportIncidentCategory::MimeInvalid);
            }
        }
        if ($quoted || $escaped || $angle || $group || $literal || $comments) {
            throw new ImportHeld(ImportIncidentCategory::MimeInvalid);
        }
        if (! $afterGroup) {
            $parts[] = ['value' => substr($value, $start), 'angle' => $hasAngle];
        }
        foreach ($parts as $part) {
            if (! $part['angle'] && validator(['email' => trim($part['value'])], ['email' => 'required|email:rfc'])->fails()) {
                throw new ImportHeld(ImportIncidentCategory::MimeInvalid);
            }
        }
    }
}
