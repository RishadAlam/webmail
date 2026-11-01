<?php

namespace Database\Seeders;

use App\Models\Address;
use App\Models\Mailbox;
use App\Models\Message;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class BrowserAcceptanceSeeder extends Seeder
{
    public function run(): void
    {
        $database = base_path('storage/e2e.sqlite');
        if (! app()->environment('testing') || config('postroom.provider') !== 'mock'
            || config('database.default') !== 'sqlite'
            || config('database.connections.sqlite.database') !== $database
            || realpath($database) !== $database
            || DB::connection()->getDatabaseName() !== $database) {
            throw new \RuntimeException('Browser acceptance fixtures require testing/mock and the exact repository storage/e2e.sqlite database.');
        }

        DB::transaction(function () {
            $mira = User::where('email', 'mira@postroom.test')->firstOrFail();
            $mailbox = Mailbox::firstOrCreate(['email' => 'acceptance-lab@postroom.test'], ['name' => 'Acceptance Lab']);
            $mailbox->users()->syncWithoutDetaching([$mira->id => ['can_send' => true]]);
            Address::firstOrCreate(['email' => $mailbox->email], ['mailbox_id' => $mailbox->id, 'enabled' => true, 'active' => true, 'directory_status' => 'local_only']);
            $start = CarbonImmutable::parse('2026-11-01 12:00:00', 'UTC');

            // Independent subjects support a stable 45-result query without
            // changing DemoSeeder's original 17-message inbox or its counts.
            for ($number = 1; $number <= 45; $number++) {
                $suffix = str_pad((string) $number, 2, '0', STR_PAD_LEFT);
                $this->message($mailbox, 'independent-'.$suffix, 'Acceptance scroll fixture '.$suffix,
                    "Fictional acceptance message $suffix. This independent conversation tests list position, filtering and pagination.",
                    ['thread_id' => 'acceptance-independent-'.$suffix, 'is_read' => $number % 3 !== 0, 'created_at' => $start->subMinutes($number)]);
            }

            for ($number = 1; $number <= 31; $number++) {
                $this->message($mailbox, 'conversation-'.$number, 'Acceptance long conversation',
                    "Fictional conversation message $number of 31. Actions on this page must describe their bounded scope.",
                    ['thread_id' => 'acceptance-long-conversation', 'created_at' => $start->subDays(2)->addMinutes($number)]);
            }

            $cells = '';
            for ($column = 1; $column <= 12; $column++) {
                $cells .= '<td>Fictional-column-'.$column.'-'.str_repeat('W', 72).'</td>';
            }
            $html = '<h1>Fictional wide newsletter</h1><p>The table may scroll inside the protected email view.</p>'
                .'<table width="1800"><tbody><tr>'.$cells.'</tr></tbody></table>'
                .'<img src="https://blocked.acceptance.example/tracker.gif" alt="Remote fixture image">'
                .'<script>window.acceptanceUnsafe = true;</script>';
            $this->message($mailbox, 'newsletter', 'Acceptance newsletter containment',
                'Fictional wide newsletter. Open safe HTML to review the contained table; remote images and active content must be blocked.',
                ['thread_id' => 'acceptance-newsletter', 'body_html' => $html, 'created_at' => $start->subDays(5)]);

            $to = [$mailbox->email];
            $cc = [];
            for ($number = 1; $number <= 9; $number++) {
                $to[] = 'fictional.department.collaboration.recipient.'.$number.'@long-recipient-domain.example';
            }
            for ($number = 1; $number <= 10; $number++) {
                $cc[] = 'fictional.review.copy.recipient.'.$number.'@long-recipient-domain.example';
            }
            $this->message($mailbox, 'details', 'Acceptance details with a deliberately long subject for a fictional international collaboration and release review',
                'Fictional long-address details fixture. Reference: '.str_repeat('unbroken-reference-', 35),
                ['thread_id' => 'acceptance-details', 'from_name' => 'Fictional international collaboration · Александра Петрова · 田中 由紀',
                    'from_email' => 'fictional.international.collaboration@long-sender-domain.example', 'to' => $to, 'cc' => $cc, 'created_at' => $start->subDays(6)]);
            $mailbox->update(['used_bytes' => Message::where('mailbox_id', $mailbox->id)->sum('logical_bytes')]);
        });
    }

    /** @param array<string, mixed> $overrides */
    private function message(Mailbox $mailbox, string $id, string $subject, string $body, array $overrides = []): void
    {
        $fields = [...['thread_id' => 'acceptance-'.$id, 'from_name' => 'Fictional Acceptance Sender', 'from_email' => 'fictional.sender@example.net',
            'to' => [$mailbox->email], 'cc' => [], 'subject' => $subject, 'body_text' => $body, 'body_html' => null,
            'folder' => 'inbox', 'is_read' => true, 'starred' => false, 'labels' => [], 'has_attachments' => false], ...$overrides];
        $raw = 'From: '.$fields['from_name'].' <'.$fields['from_email'].">\r\nTo: ".implode(', ', $fields['to'])
            ."\r\nCc: ".implode(', ', $fields['cc'])."\r\nSubject: $subject\r\nMessage-ID: <acceptance-$id@postroom.test>\r\nContent-Type: "
            .($fields['body_html'] ? 'text/html' : 'text/plain')."; charset=UTF-8\r\n\r\n".($fields['body_html'] ?? $body);
        $fields['raw_mime'] = $raw;
        $fields['logical_bytes'] = strlen($raw) + strlen($body) + strlen($fields['body_html'] ?? '') + strlen(json_encode([$fields['to'], $fields['cc']], JSON_THROW_ON_ERROR));
        Message::updateOrCreate(['mailbox_id' => $mailbox->id, 'message_id' => '<acceptance-'.$id.'@postroom.test>'], $fields);
    }
}
