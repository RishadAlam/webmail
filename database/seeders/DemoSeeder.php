<?php

namespace Database\Seeders;

use App\Models\Address;
use App\Models\Mailbox;
use App\Models\Message;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DemoSeeder extends Seeder
{
    public function run(): void
    {
        if (! app()->environment('local', 'testing') || config('webmail.provider') !== 'mock') {
            throw new \RuntimeException('Fictional seed is local/mock only.');
        }
        $mira = User::firstOrCreate(['email' => 'mira@webmail.test'], ['name' => 'Mira Chen', 'password' => Hash::make('webmail-local-only')]);
        $mira->forceFill(['email_verified_at' => now()])->save();
        $owner = User::firstOrCreate(['email' => 'owner@webmail.test'], ['name' => 'Alex Morgan', 'password' => Hash::make('webmail-local-only')]);
        $owner->forceFill(['role' => 'owner', 'email_verified_at' => now(), 'two_factor_secret' => encrypt('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'), 'two_factor_recovery_codes' => encrypt(json_encode(['fictional-recovery-code'])), 'two_factor_confirmed_at' => now()])->save();
        $box = Mailbox::firstOrCreate(['email' => $mira->email], ['name' => 'Mira Chen']);
        $box->users()->syncWithoutDetaching([$mira->id => ['can_send' => true]]);
        $ownerBox = Mailbox::firstOrCreate(['email' => $owner->email], ['name' => 'Alex Morgan']);
        $ownerBox->users()->syncWithoutDetaching([$owner->id => ['can_send' => true]]);
        foreach ([$box, $ownerBox] as $b) {
            Address::firstOrCreate(['email' => $b->email], ['mailbox_id' => $b->id, 'active' => true, 'directory_status' => 'local_only']);
        }
        if (Message::where('mailbox_id', $box->id)->exists()) {
            return;
        }
        $fixtures = [
            ['Leah Brooks', 'leah@studio.example', 'A few thoughts on the new collection', 'The quieter direction is working beautifully. I left a few notes for our review on Tuesday.', 'Studio', true],
            ['Owen Park', 'owen@northstar.example', 'Next week at the studio', 'Morning Mira,\n\nHere’s a little breathing room for next week. Let’s keep Monday for focused work and come together on Tuesday at 10.\n\nI’ll bring the material samples. Could you bring the updated sketches?\n\nThanks,\nOwen', 'Team', true],
            ['Sofia Rivera', 'sofia@fieldwork.example', 'Re: Autumn print samples', 'The warm gray is my favorite of the three. The paper has a lovely texture in daylight.', 'Projects', true],
            ['Noah Williams', 'noah@studio.example', 'Friday notes & a small thank you', 'A good week of making things. Thank you for the thoughtful feedback on the first round.', 'Team', false],
            ['Amara Okafor', 'amara@atelier.example', 'The workshop space is ready', 'We have the long table by the window, plenty of pencils, and a very good coffee situation.', 'Projects', false],
            ['Elliot James', 'elliot@paper.example', 'Your paper order · an update', 'The sample pack is on its way. I’ve included the uncoated options we talked about.', '', false],
            ['Yuki Tanaka', 'yuki@forms.example', 'Three references for the identity', 'I came across these references and thought of our conversation about simple shapes.', 'Studio', false],
            ['Priya Shah', 'priya@studio.example', 'Re: Website copy, round two', 'This is feeling much clearer. A few small edits to the introduction and we’re ready.', 'Projects', false],
            ['Mateo García', 'mateo@press.example', 'A little inspiration for your Sunday', 'A short note from the print room: the first proofs are looking great.', '', false],
            ['Freya Wilson', 'freya@studio.example', 'Studio lunch on Wednesday?', 'There’s a new spot around the corner. Shall we walk over together after the review?', 'Team', false],
            ['Avery Campbell', 'avery@archive.example', 'November reading list', 'A small collection of essays on design, craft, and paying attention to everyday things.', '', false],
            ['Jules Laurent', 'jules@edition.example', 'Final dimensions for the display', 'Confirming the dimensions we discussed. Everything fits nicely in the smaller space.', 'Projects', false],
            ['Sana Rahman', 'sana@studio.example', 'A fresh start for the shared library', 'I reorganized the reference shelf. You’ll find the typography books together now.', 'Team', false],
            ['Emil Andersson', 'emil@materials.example', 'Material notes', 'The lighter board is surprisingly sturdy. Happy to bring a few pieces by next week.', '', false],
            ['Rae Ellis', 'rae@studio.example', 'See you on Monday', 'Enjoy the weekend, Mira. Looking forward to seeing where the next sketches take us.', 'Team', false],
            ['Long international sender · Александра Петрова', 'alexandra@example.net', 'A deliberately long subject about a project with several moving parts and thoughtful questions for our next conversation', 'Long-content layout fixture. Nothing here is real customer correspondence.', '', false],
            ['Unlisted sender', 'hello@example.net', '', 'A message without a subject still needs to be readable and easy to open.', '', false],
        ];
        foreach ($fixtures as $i => [$name,$email,$subject,$body,$label,$unread]) {
            $body = str_replace('\\n', "\n", $body);
            $raw = "From: $name <$email>\r\nTo: {$mira->email}\r\nSubject: $subject\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n$body";
            Message::create(['mailbox_id' => $box->id, 'thread_id' => 'fixture-'.($i + 1), 'message_id' => '<fixture-'.($i + 1).'@example.net>', 'from_name' => $name, 'from_email' => $email, 'to' => [$mira->email], 'cc' => [], 'subject' => $subject, 'body_text' => $body, 'raw_mime' => $raw, 'is_read' => ! $unread, 'starred' => in_array($i, [0, 2, 7]), 'labels' => $label ? [$label] : [], 'logical_bytes' => strlen($raw) + strlen($body), 'created_at' => now()->subMinutes($i < 3 ? ($i + 1) * 23 : ($i + 1) * 190)]);
        }
        $box->update(['used_bytes' => Message::where('mailbox_id', $box->id)->sum('logical_bytes')]);
    }
}
