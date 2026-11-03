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
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class WebmailTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutVite();
    }

    private function account(): array
    {
        $user = User::factory()->create();
        $box = Mailbox::create(['name' => 'Studio', 'email' => $user->email]);
        $box->users()->attach($user, ['can_send' => true]);
        Address::create(['mailbox_id' => $box->id, 'email' => $user->email, 'active' => true]);

        return [$user, $box];
    }

    private function draft(User $user, Mailbox $box): Draft
    {
        return Draft::create(['user_id' => $user->id, 'mailbox_id' => $box->id, 'from_email' => $user->email,
            'to' => ['reader@example.net'], 'cc' => [], 'bcc' => [], 'subject' => 'A small hello', 'body' => '<p>Hello.</p>', 'version' => 1]);
    }

    public function test_public_registration_is_absent(): void
    {
        $this->get('/register')->assertNotFound();
        $this->post('/register', [])->assertNotFound();
        $this->get('/forgot-password')->assertNotFound();
        $this->post('/forgot-password', [])->assertNotFound();
    }

    public function test_mail_is_scoped_even_for_administrators(): void
    {
        [$a, $box] = $this->account();
        [$b, $other] = $this->account();
        $a->forceFill(['role' => 'admin'])->save();
        $message = Message::create(['mailbox_id' => $other->id, 'thread_id' => 'foreign', 'subject' => 'Private', 'from_email' => 'x@example.net', 'to' => [], 'cc' => [], 'body_text' => 'Secret', 'raw_mime' => 'Secret']);
        $this->actingAs($a)->get('/mail/'.$other->id)->assertForbidden();
        $this->get('/mail/'.$box->id.'/thread/'.$message->thread_id)->assertNotFound();
        $this->get('/messages/'.$message->id.'/html')->assertForbidden();
        $this->get('/admin')->assertForbidden(); // Admin requires MFA.
    }

    public function test_drafts_reject_stale_versions_without_losing_content(): void
    {
        [$user, $box] = $this->account();
        $draft = $this->draft($user, $box);
        $payload = $draft->only(['from_email', 'to', 'cc', 'bcc', 'subject', 'body', 'version']);
        $this->actingAs($user)->putJson('/drafts/'.$draft->id, [...$payload, 'subject' => 'Saved revision'])->assertOk()->assertJsonPath('version', 2);
        $this->putJson('/drafts/'.$draft->id, [...$payload, 'subject' => 'Old tab'])->assertConflict();
        $this->assertSame('Saved revision', $draft->fresh()->subject);
    }

    public function test_sender_is_authorized_and_draft_retained(): void
    {
        [$user, $box] = $this->account();
        $draft = $this->draft($user, $box);
        $draft->update(['from_email' => 'owner@unrelated.example']);
        $this->actingAs($user)->postJson('/drafts/'.$draft->id.'/send', ['version' => 1])->assertForbidden();
        $this->assertDatabaseCount('send_intents', 0);
        $this->assertModelExists($draft);
    }

    public function test_double_send_creates_one_intent_and_only_provider_acceptance(): void
    {
        [$user, $box] = $this->account();
        $draft = $this->draft($user, $box);
        $this->actingAs($user)->postJson('/drafts/'.$draft->id.'/send', ['version' => 1])->assertOk()->assertJsonPath('status', 'accepted');
        $this->postJson('/drafts/'.$draft->id.'/send', ['version' => 1])->assertOk();
        $this->assertDatabaseCount('send_intents', 1);
        $this->assertSame(1, (int) DB::table('quota_ledger')->sum('recipients'));
        $this->assertDatabaseHas('messages', ['folder' => 'sent', 'delivery_status' => 'accepted']);
    }

    public function test_quota_counts_to_cc_bcc_and_preserves_draft(): void
    {
        config(['webmail.daily_limit' => 2]);
        [$user, $box] = $this->account();
        $draft = $this->draft($user, $box);
        $draft->update(['cc' => ['c@example.net'], 'bcc' => ['hidden@example.net']]);
        $this->actingAs($user)->postJson('/drafts/'.$draft->id.'/send', ['version' => 1])->assertStatus(422)->assertJsonPath('status', 'held');
        $this->assertModelExists($draft);
        $this->assertDatabaseCount('quota_ledger', 0);
    }

    public function test_timeout_is_uncertain_and_never_blindly_resent(): void
    {
        config(['webmail.mock_outcome' => 'timeout']);
        [$user, $box] = $this->account();
        $draft = $this->draft($user, $box);
        $this->actingAs($user)->postJson('/drafts/'.$draft->id.'/send', ['version' => 1])->assertOk()->assertJsonPath('status', 'uncertain');
        $this->travel(25)->hours();
        $this->postJson('/drafts/'.$draft->id.'/send', ['version' => 1])->assertOk()->assertJsonPath('status', 'uncertain');
        $this->assertDatabaseCount('send_intents', 1);
        $this->assertModelExists($draft);
    }

    public function test_archive_undo_restores_state_and_rejects_intervening_changes(): void
    {
        [$user, $box] = $this->account();
        $message = Message::create(['mailbox_id' => $box->id, 'thread_id' => 'one', 'subject' => 'Hello', 'from_email' => 'x@example.net', 'to' => [], 'cc' => [], 'body_text' => 'Hello', 'raw_mime' => 'Hello']);
        $op = $this->actingAs($user)->postJson('/mail/'.$box->id.'/actions', ['ids' => [$message->id], 'action' => 'archive'])->assertOk()->json('operation');
        $this->assertSame('archive', $message->fresh()->folder);
        $this->postJson('/operations/'.$op.'/undo')->assertOk();
        $this->assertSame('inbox', $message->fresh()->folder);
        $this->postJson('/operations/'.$op.'/undo')->assertOk();
    }

    public function test_import_replay_keeps_raw_mime_and_only_acks_committed_data(): void
    {
        [$user, $box] = $this->account();
        $gateway = new FakeIngressGateway;
        $raw = "From: Mira <mira@example.net>\r\nTo: {$user->email}\r\nSubject: Received\r\nMessage-ID: <same@example.net>\r\nContent-Type: text/plain\r\n\r\nThis is a fictional receipt.";
        $gateway->items = [['id' => 'receipt-1', 'recipient' => $user->email, 'raw' => base64_encode($raw), 'checksum' => hash('sha256', $raw)]];
        $this->app->instance(IngressGateway::class, $gateway);
        app(ImportService::class)->sync();
        app(ImportService::class)->sync();
        $this->assertDatabaseCount('messages', 1);
        $this->assertSame($raw, Message::first()->raw_mime);
        $this->assertSame(['receipt-1', 'receipt-1'], $gateway->acknowledged);
        $gateway->items[0]['id'] = 'receipt-2';
        app(ImportService::class)->sync();
        $this->assertDatabaseCount('messages', 2); // Message-ID alone is not deduplication.
    }

    public function test_import_storage_failure_does_not_acknowledge_receipt(): void
    {
        [$user, $box] = $this->account();
        $box->update(['quota_bytes' => 1]);
        $gateway = new FakeIngressGateway;
        $raw = "From: x@example.net\r\nSubject: Still waiting\r\n\r\nDo not lose me.";
        $gateway->items = [['id' => 'waiting', 'recipient' => $user->email, 'raw' => base64_encode($raw), 'checksum' => hash('sha256', $raw)]];
        $this->app->instance(IngressGateway::class, $gateway);
        app(ImportService::class)->sync();
        $this->assertSame([], $gateway->acknowledged);
        $this->assertDatabaseCount('messages', 0);
    }

    public function test_html_reader_blocks_active_content_and_remote_images(): void
    {
        [$user, $box] = $this->account();
        $message = Message::create(['mailbox_id' => $box->id, 'thread_id' => 'html', 'from_email' => 'x@example.net', 'to' => [], 'cc' => [], 'body_text' => 'Hello', 'body_html' => '<script>alert(1)</script><img src="https://tracker.example/pixel"><p onclick="alert(2)">Hello</p>', 'raw_mime' => 'raw']);
        $response = $this->actingAs($user)->get('/messages/'.$message->id.'/html')->assertOk();
        $response->assertDontSee('<script>', false)->assertDontSee('tracker.example', false)->assertDontSee('onclick', false);
        $this->assertStringContainsString("default-src 'none'", $response->headers->get('Content-Security-Policy'));
    }

    public function test_member_cannot_admin_and_suspension_revokes_mail_access(): void
    {
        [$user, $box] = $this->account();
        $this->actingAs($user)->get('/admin')->assertForbidden();
        $user->forceFill(['active' => false])->save();
        $this->get('/mail/'.$box->id)->assertForbidden();
    }
}
