<?php

namespace Tests\Feature;

use App\Models\Address;
use App\Models\Draft;
use App\Models\Mailbox;
use App\Models\Message;
use App\Models\User;
use App\Providers\Mail\FakeIngressGateway;
use App\Providers\Mail\IngressGateway;
use App\Services\ImportService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class MailSemanticsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutVite();
    }

    private function account(): array
    {
        $user = User::factory()->create(['email' => 'mira@example.test']);
        $box = Mailbox::create(['name' => 'Fictional studio', 'email' => $user->email]);
        $box->users()->attach($user, ['can_send' => true]);
        Address::create(['mailbox_id' => $box->id, 'email' => $user->email, 'active' => true]);
        Address::create(['mailbox_id' => $box->id, 'email' => 'studio@example.test', 'active' => true]);

        return [$user, $box];
    }

    private function gateway(string $raw): FakeIngressGateway
    {
        $gateway = new FakeIngressGateway;
        $gateway->items = [['id' => 'fictional-receipt', 'recipient' => 'studio@example.test', 'raw' => base64_encode($raw), 'checksum' => hash('sha256', $raw)]];
        $this->app->instance(IngressGateway::class, $gateway);

        return $gateway;
    }

    private function source(Mailbox $box, array $changes = []): Message
    {
        return Message::create([...['mailbox_id' => $box->id, 'thread_id' => 'fictional-thread', 'message_id' => '<fictional@example.net>',
            'from_name' => 'Fictional sender', 'from_email' => 'sender@example.net', 'to' => ['mira@example.test'], 'cc' => [],
            'subject' => 'A fictional conversation', 'body_text' => 'Original message.', 'raw_mime' => 'Retained original MIME.'], ...$changes]);
    }

    public function test_import_preserves_group_to_and_cc_while_envelope_controls_delivery(): void
    {
        [, $box] = $this->account();
        $raw = "From: Sender <sender@example.net>\r\nTo: Team: Mira <MIRA@example.test>, Peer <peer@example.net>;\r\nCc: Review: Other <other@example.net>;\r\nSubject: Group message\r\n\r\nFictional content.";
        $gateway = $this->gateway($raw);

        $this->assertSame(['imported' => 1, 'held' => 0], app(ImportService::class)->sync());
        $message = Message::sole();
        $this->assertSame($box->id, $message->mailbox_id);
        $this->assertSame(['mira@example.test', 'peer@example.net'], $message->to);
        $this->assertSame(['other@example.net'], $message->cc);
        $this->assertSame($raw, $message->raw_mime);
        $this->assertSame(['fictional-receipt'], $gateway->acknowledged);
    }

    public function test_import_never_promotes_bcc_or_envelope_recipient_to_visible_headers(): void
    {
        $this->account();
        $raw = "From: sender@example.net\r\nTo: undisclosed-recipients:;\r\nBcc: studio@example.test, secret@example.net\r\nSubject: Private audience\r\n\r\nFictional content.";
        $this->gateway($raw);

        $this->assertSame(['imported' => 1, 'held' => 0], app(ImportService::class)->sync());
        $message = Message::sole();
        $this->assertSame([], $message->to);
        $this->assertSame([], $message->cc);
        $this->assertSame($raw, $message->raw_mime);
        $this->assertArrayNotHasKey('bcc', $message->toArray());
        $this->assertStringNotContainsString('secret@example.net', $message->toJson());
        $this->assertStringNotContainsString('studio@example.test', $message->toJson());
    }

    public static function invalidHeaders(): array
    {
        return [
            'invalid To' => ['To: not-an-address'],
            'invalid Cc' => ['Cc: invalid'],
            'invalid Reply-To' => ['Reply-To: invalid'],
            'unclosed mailbox' => ['To: Peer <peer@example.net'],
            'unclosed group' => ['To: Team: peer@example.net'],
            'unnamed group' => ['To: :peer@example.net;'],
            'duplicate To' => ["To: first@example.net\r\nTo: second@example.net"],
            'ignored address after mailbox' => ['To: Peer <peer@example.net> ignored@example.net'],
            'repaired bare address suffix' => ['To: peer@example.net trailing'],
            'oversized display metadata' => ['To: '.str_repeat('a', 9000).' <peer@example.net>'],
        ];
    }

    #[DataProvider('invalidHeaders')]
    public function test_invalid_recipient_headers_are_held_without_acknowledgement(string $header): void
    {
        [, $box] = $this->account();
        $raw = "From: sender@example.net\r\n{$header}\r\nSubject: Retain me\r\n\r\nFictional content.";
        $gateway = $this->gateway($raw);

        $this->assertSame(['imported' => 0, 'held' => 1], app(ImportService::class)->sync());
        $this->assertSame([], $gateway->acknowledged);
        $this->assertSame(base64_encode($raw), $gateway->items[0]['raw']);
        $this->assertDatabaseCount('messages', 0);
        $this->assertDatabaseCount('ingress_receipts', 0);
        $this->assertSame(0, $box->fresh()->used_bytes);
    }

    public function test_import_holds_more_than_twenty_visible_recipient_addresses_without_truncating(): void
    {
        $this->account();
        $addresses = array_map(fn ($i) => "reader{$i}@example.net", range(1, 21));
        $raw = "From: sender@example.net\r\nTo: ".implode(', ', $addresses)."\r\n\r\nFictional content.";
        $gateway = $this->gateway($raw);

        $this->assertSame(['imported' => 0, 'held' => 1], app(ImportService::class)->sync());
        $this->assertSame([], $gateway->acknowledged);
        $this->assertDatabaseCount('messages', 0);
        $this->assertSame(base64_encode($raw), $gateway->items[0]['raw']);
    }

    public function test_reply_all_excludes_every_active_alias_and_deduplicates_case_insensitively(): void
    {
        [$user, $box] = $this->account();
        $message = $this->source($box, ['from_email' => 'Sender@Example.NET',
            'to' => ['MIRA@example.test', 'STUDIO@example.test', 'Friend@Example.net', 'friend@example.NET'],
            'cc' => ['sender@example.net', 'Other@example.NET', 'studio@example.test']]);

        $response = $this->actingAs($user)->postJson('/mail/'.$box->id.'/drafts', ['reply_to' => $message->id, 'mode' => 'reply-all'])->assertCreated();
        $response->assertJsonPath('to', ['sender@example.net'])->assertJsonPath('cc', ['friend@example.net', 'other@example.net'])->assertJsonPath('bcc', []);
    }

    public function test_reply_honors_a_valid_imported_reply_to_without_copying_bcc(): void
    {
        [$user, $box] = $this->account();
        $raw = "From: sender@example.net\r\nReply-To: Replies <REPLIES@example.net>\r\nTo: mira@example.test\r\nBcc: hidden@example.net\r\nSubject: Reply destination\r\n\r\nFictional content.";
        $this->gateway($raw);
        app(ImportService::class)->sync();

        $message = Message::sole();
        $this->actingAs($user)->postJson('/mail/'.$box->id.'/drafts', ['reply_to' => $message->id, 'mode' => 'reply'])->assertCreated()
            ->assertJsonPath('to', ['replies@example.net'])->assertJsonPath('cc', [])->assertJsonPath('bcc', []);
        $this->assertStringNotContainsString('hidden@example.net', Draft::sole()->toJson());
    }

    public function test_reply_to_own_sent_message_uses_external_recipients(): void
    {
        [$user, $box] = $this->account();
        $message = $this->source($box, ['from_email' => 'STUDIO@example.test', 'to' => ['Peer@example.net', 'MIRA@example.test']]);

        $this->actingAs($user)->postJson('/mail/'.$box->id.'/drafts', ['reply_to' => $message->id, 'mode' => 'reply'])->assertCreated()
            ->assertJsonPath('to', ['peer@example.net'])->assertJsonPath('cc', [])->assertJsonPath('bcc', []);
    }

    public function test_forward_explains_that_retained_attachments_are_not_included(): void
    {
        [$user, $box] = $this->account();
        $message = $this->source($box, ['has_attachments' => true, 'raw_mime' => 'Bcc: hidden@example.net; retained attachment']);

        $response = $this->actingAs($user)->postJson('/mail/'.$box->id.'/drafts', ['reply_to' => $message->id, 'mode' => 'forward'])->assertCreated();
        $this->assertStringContainsString('Attachments are not included', strip_tags($response->json('body')));
        $this->assertStringNotContainsString('hidden@example.net', $response->json('body'));
        $this->assertSame('Bcc: hidden@example.net; retained attachment', $message->fresh()->raw_mime);
        $response->assertJsonPath('to', [])->assertJsonPath('cc', [])->assertJsonPath('bcc', []);
    }

    public static function replyModes(): array
    {
        return [['reply'], ['forward']];
    }

    #[DataProvider('replyModes')]
    public function test_escaped_quoted_body_over_editor_limit_is_rejected_before_draft_admission(string $mode): void
    {
        [$user, $box] = $this->account();
        $message = $this->source($box, ['body_text' => str_repeat('&', 60000)]);

        $this->actingAs($user)->postJson('/mail/'.$box->id.'/drafts', ['reply_to' => $message->id, 'mode' => $mode])->assertUnprocessable();
        $this->assertDatabaseCount('drafts', 0);
        $this->assertSame(0, $box->fresh()->used_bytes);
        $this->assertSame(str_repeat('&', 60000), $message->fresh()->body_text);
    }

    public function test_reply_all_over_outgoing_recipient_cap_rejects_without_omitting_anyone(): void
    {
        [$user, $box] = $this->account();
        $message = $this->source($box, ['to' => array_map(fn ($i) => "peer{$i}@example.net", range(1, 20))]);

        $this->actingAs($user)->postJson('/mail/'.$box->id.'/drafts', ['reply_to' => $message->id, 'mode' => 'reply-all'])->assertUnprocessable();
        $this->assertDatabaseCount('drafts', 0);
        $this->assertCount(20, $message->fresh()->to);
        $this->assertSame(0, $box->fresh()->used_bytes);
    }

    public function test_draft_update_enforces_combined_recipient_cap_and_retains_saved_work(): void
    {
        [$user, $box] = $this->account();
        $draft = Draft::create(['user_id' => $user->id, 'mailbox_id' => $box->id, 'from_email' => $user->email,
            'to' => ['peer@example.net'], 'cc' => [], 'bcc' => [], 'subject' => 'Saved subject', 'body' => '<p>Saved work.</p>']);
        $data = $draft->only(['from_email', 'to', 'cc', 'bcc', 'subject', 'body', 'version']);
        $data['to'] = array_map(fn ($i) => "peer{$i}@example.net", range(1, 11));
        $data['bcc'] = array_map(fn ($i) => "private{$i}@example.net", range(1, 10));
        $data['body'] = '<p>Replacement.</p>';

        $this->actingAs($user)->putJson('/drafts/'.$draft->id, $data)->assertUnprocessable();
        $this->assertSame('<p>Saved work.</p>', $draft->fresh()->body);
        $this->assertSame(['peer@example.net'], $draft->fresh()->to);
        $this->assertSame(1, $draft->fresh()->version);
    }

    public function test_reply_all_quota_hold_retains_recipients_body_and_source(): void
    {
        config(['webmail.daily_limit' => 1]);
        [$user, $box] = $this->account();
        $message = $this->source($box, ['to' => ['mira@example.test', 'peer@example.net']]);
        $draftId = $this->actingAs($user)->postJson('/mail/'.$box->id.'/drafts', ['reply_to' => $message->id, 'mode' => 'reply-all'])->assertCreated()->json('id');

        $this->postJson('/drafts/'.$draftId.'/send', ['version' => 1])->assertUnprocessable()->assertJsonPath('status', 'held');
        $draft = Draft::findOrFail($draftId);
        $this->assertSame(['sender@example.net'], $draft->to);
        $this->assertSame(['peer@example.net'], $draft->cc);
        $this->assertStringContainsString('Original message.', $draft->body);
        $this->assertSame('Retained original MIME.', $message->fresh()->raw_mime);
        $this->assertDatabaseCount('send_intents', 0);
        $this->assertDatabaseCount('quota_ledger', 0);
    }
}
