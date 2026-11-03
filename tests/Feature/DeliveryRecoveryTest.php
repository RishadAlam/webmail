<?php

namespace Tests\Feature;

use App\Models\Address;
use App\Models\Draft;
use App\Models\Mailbox;
use App\Models\Message;
use App\Models\SendIntent;
use App\Models\User;
use App\Providers\Mail\OutboundMailProvider;
use App\Services\DeliveryService;
use App\Services\UsageService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class DeliveryRecoveryTest extends TestCase
{
    use RefreshDatabase;

    /** @return array{User, Draft, SendIntent} */
    private function queued(): array
    {
        $user = User::factory()->create();
        $box = Mailbox::create(['name' => 'Fictional studio', 'email' => $user->email, 'used_bytes' => 1000]);
        $box->users()->attach($user, ['can_send' => true]);
        Address::create(['mailbox_id' => $box->id, 'email' => $user->email, 'active' => true]);
        $draft = Draft::create(['user_id' => $user->id, 'mailbox_id' => $box->id, 'from_email' => $user->email, 'to' => ['reader@example.net'], 'cc' => [], 'bcc' => [], 'subject' => 'Saved intent', 'body' => '<p>Original body.</p>', 'status' => 'queued']);
        $id = (string) Str::uuid();
        $intent = SendIntent::create(['id' => $id, 'draft_id' => $draft->id, 'user_id' => $user->id, 'mailbox_id' => $box->id, 'recipients' => 1, 'status' => 'queued', 'payload' => ['from' => $user->email, 'to' => ['reader@example.net'], 'subject' => 'Saved intent', 'html' => '<p>Original body.</p>', 'text' => 'Original body.', 'tags' => [['name' => 'webmail_intent', 'value' => $id]]]]);
        DB::table('quota_ledger')->insert(['intent_id' => $id, 'recipients' => 1, 'created_at' => now()]);
        Message::create(['send_intent_id' => $id, 'mailbox_id' => $box->id, 'thread_id' => (string) Str::uuid(), 'from_email' => $user->email, 'to' => ['reader@example.net'], 'cc' => [], 'subject' => 'Saved intent', 'body_text' => 'Original body.', 'body_html' => '<p>Original body.</p>', 'raw_mime' => 'Fictional immutable MIME', 'folder' => 'sent', 'delivery_status' => 'queued', 'logical_bytes' => 1000]);

        return [$user, $draft, $intent];
    }

    public function test_repeated_send_rechecks_the_immutable_sender_after_an_unattempted_commit(): void
    {
        [$user, $draft, $intent] = $this->queued();
        Address::query()->update(['active' => false]);
        $this->expectException(HttpException::class);
        try {
            app(DeliveryService::class)->send($user, $draft, 1);
        } finally {
            $this->assertNull($intent->fresh()->attempted_at);
            $this->assertSame('queued', $intent->fresh()->status);
        }
    }

    public function test_queued_state_with_evidence_of_an_attempt_is_never_claimed_again(): void
    {
        [$user, $draft, $intent] = $this->queued();
        $intent->update(['attempted_at' => now()->subDays(2)]);
        $outcome = app(DeliveryService::class)->send($user, $draft, 1);
        $this->assertSame('uncertain', $outcome['status']);
        $this->assertNull($intent->fresh()->provider_id);
        $this->assertSame('uncertain', $draft->fresh()->status);
    }

    public function test_resume_uses_saved_payload_once_and_keeps_the_existing_sent_copy_and_reservation(): void
    {
        [$user, $draft, $intent] = $this->queued();
        $payload = $intent->payload;
        $draft->update(['body' => '<p>Later draft data must not replace the intent.</p>']);
        $provider = \Mockery::mock(OutboundMailProvider::class);
        $provider->shouldReceive('send')->once()->with($payload, 'webmail/'.$intent->id)->andReturn(['status' => 'accepted', 'id' => 'fictional-recovered-send', 'error' => null]);
        $this->app->instance(OutboundMailProvider::class, $provider);
        $delivery = app(DeliveryService::class);

        $this->assertSame('accepted', $delivery->resume($user, $draft)['status']);
        $this->assertSame('accepted', $delivery->resume($user, $draft)['status']);
        $this->assertSame($payload, $intent->fresh()->payload);
        $this->assertNotNull($intent->fresh()->attempted_at);
        $this->assertSame('accepted', Message::firstOrFail()->delivery_status);
        $this->assertDatabaseCount('send_intents', 1);
        $this->assertDatabaseCount('messages', 1);
        $this->assertDatabaseCount('quota_ledger', 1);
        $this->assertSame(1000, Mailbox::findOrFail($draft->mailbox_id)->used_bytes);
    }

    public function test_resume_reanchors_an_expired_reservation_and_holds_when_current_allowance_is_full(): void
    {
        [$user, $draft, $intent] = $this->queued();
        DB::table('quota_ledger')->where('intent_id', $intent->id)->update(['created_at' => now()->subDays(40)]);
        DB::table('quota_ledger')->insert(['intent_id' => (string) Str::uuid(), 'recipients' => 95, 'created_at' => now()]);
        $outcome = app(DeliveryService::class)->resume($user, $draft);
        $this->assertSame('queued', $outcome['status']);
        $this->assertTrue($outcome['resumable']);
        $this->assertNotEmpty($outcome['error']);
        $this->assertNull($intent->fresh()->attempted_at);
        $this->assertDatabaseCount('messages', 1);
        $this->assertDatabaseCount('quota_ledger', 2);
        $this->assertSame(96, (int) DB::table('quota_ledger')->where('created_at', '>=', now()->subDay())->sum('recipients'));
    }

    public function test_resume_does_not_count_its_existing_reservation_twice_at_the_local_limit(): void
    {
        [$user, $draft] = $this->queued();
        DB::table('quota_ledger')->insert(['intent_id' => (string) Str::uuid(), 'recipients' => 94, 'created_at' => now()]);
        $this->assertSame('accepted', app(DeliveryService::class)->resume($user, $draft)['status']);
        $this->assertSame(95, (int) DB::table('quota_ledger')->sum('recipients'));
    }

    public function test_resume_refuses_a_missing_reservation_without_attempting_delivery(): void
    {
        [$user, $draft, $intent] = $this->queued();
        DB::table('quota_ledger')->where('intent_id', $intent->id)->delete();
        $outcome = app(DeliveryService::class)->resume($user, $draft);
        $this->assertSame('queued', $outcome['status']);
        $this->assertFalse($outcome['resumable']);
        $this->assertNotEmpty($outcome['error']);
        $this->assertNull($intent->fresh()->attempted_at);
    }

    public function test_resume_never_retries_dispatching_uncertain_or_final_outcomes(): void
    {
        [$user, $draft, $intent] = $this->queued();
        foreach (['dispatching', 'uncertain', 'accepted', 'delivered', 'failed'] as $status) {
            $intent->update(['status' => $status, 'attempted_at' => now()->subDays(2)]);
            $outcome = app(DeliveryService::class)->resume($user, $draft);
            $this->assertSame($status, $outcome['status']);
            $this->assertFalse($outcome['resumable']);
            $this->assertNull($intent->fresh()->provider_id);
        }
    }

    public function test_resume_endpoint_is_private_even_for_an_administrator_with_shared_mailbox_access(): void
    {
        [$user, $draft, $intent] = $this->queued();
        $owner = User::factory()->create(['role' => 'owner']);
        Mailbox::findOrFail($draft->mailbox_id)->users()->attach($owner, ['can_send' => true]);
        $this->actingAs($owner)->postJson('/drafts/'.$draft->id.'/resume-send')->assertForbidden();
        $this->assertNull($intent->fresh()->attempted_at);
        $this->actingAs($user)->postJson('/drafts/'.$draft->id.'/resume-send')->assertOk()->assertJsonPath('status', 'accepted')->assertJsonPath('resumable', false);
    }

    public function test_resume_endpoint_keeps_quota_held_intent_queued_and_returns_an_actionable_response(): void
    {
        [$user, $draft, $intent] = $this->queued();
        config(['webmail.daily_limit' => 1]);
        $this->actingAs($user)->postJson('/drafts/'.$draft->id.'/resume-send')->assertUnprocessable()->assertJsonPath('status', 'queued')->assertJsonPath('resumable', true);
        $this->assertNull($intent->fresh()->attempted_at);
        $this->assertSame('queued', $draft->fresh()->status);
    }

    public function test_resume_rechecks_membership_after_the_usage_request(): void
    {
        [$user, $draft, $intent] = $this->queued();
        $usage = \Mockery::mock(UsageService::class);
        $usage->shouldReceive('snapshot')->once()->andReturnUsing(function () use ($draft, $user) {
            DB::table('mailbox_user')->where('mailbox_id', $draft->mailbox_id)->where('user_id', $user->id)->update(['can_send' => false]);

            return null;
        });
        $this->app->instance(UsageService::class, $usage);
        $this->actingAs($user)->postJson('/drafts/'.$draft->id.'/resume-send')->assertForbidden();
        $this->assertNull($intent->fresh()->attempted_at);
    }

    public function test_resume_rechecks_account_status_after_the_usage_request(): void
    {
        [$user, $draft, $intent] = $this->queued();
        $usage = \Mockery::mock(UsageService::class);
        $usage->shouldReceive('snapshot')->once()->andReturnUsing(function () use ($user) {
            User::whereKey($user->id)->update(['active' => false]);

            return null;
        });
        $this->app->instance(UsageService::class, $usage);
        $this->actingAs($user)->postJson('/drafts/'.$draft->id.'/resume-send')->assertForbidden();
        $this->assertNull($intent->fresh()->attempted_at);
    }

    public function test_resume_checks_original_sender_not_a_different_current_draft_identity(): void
    {
        [$user, $draft, $intent] = $this->queued();
        Address::query()->update(['active' => false]);
        Address::create(['mailbox_id' => $draft->mailbox_id, 'email' => 'new-sender@example.test', 'active' => true]);
        $draft->update(['from_email' => 'new-sender@example.test']);
        $this->actingAs($user)->postJson('/drafts/'.$draft->id.'/resume-send')->assertForbidden();
        $this->assertNull($intent->fresh()->attempted_at);
        $this->assertSame($user->email, $intent->fresh()->payload['from']);
    }

    public function test_resume_checks_new_recipient_suppression(): void
    {
        [$user, $draft, $intent] = $this->queued();
        DB::table('suppressions')->insert(['email' => 'reader@example.net', 'reason' => 'permanent bounce', 'created_at' => now(), 'updated_at' => now()]);
        $this->actingAs($user)->postJson('/drafts/'.$draft->id.'/resume-send')->assertUnprocessable();
        $this->assertNull($intent->fresh()->attempted_at);
    }

    public function test_resume_does_not_send_when_provider_usage_is_unavailable(): void
    {
        [$user, $draft, $intent] = $this->queued();
        config(['webmail.provider' => 'resend']);
        $usage = \Mockery::mock(UsageService::class)->makePartial();
        $usage->shouldReceive('snapshot')->once()->andReturn(null);
        $this->app->instance(UsageService::class, $usage);
        $this->actingAs($user)->postJson('/drafts/'.$draft->id.'/resume-send')->assertUnprocessable()->assertJsonPath('status', 'queued');
        $this->assertNull($intent->fresh()->attempted_at);
    }
}
