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
use App\Services\EventService;
use App\Services\StorageBudget;
use App\Services\UsageService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class DeliverySafetyTest extends TestCase
{
    use RefreshDatabase;

    private function draft(): Draft
    {
        $user = User::factory()->create();
        $box = Mailbox::create(['name' => 'Fictional studio', 'email' => $user->email]);
        $box->users()->attach($user, ['can_send' => true]);
        Address::create(['mailbox_id' => $box->id, 'email' => $user->email, 'active' => true]);
        $this->actingAs($user);

        return Draft::create(['user_id' => $user->id, 'mailbox_id' => $box->id, 'from_email' => $user->email, 'to' => ['a@example.net', 'b@example.net'], 'cc' => [], 'bcc' => [], 'subject' => 'Fiction', 'body' => '<p>A test.</p>']);
    }

    private function event(SendIntent $intent, string $type, array $recipients, string $bounce = 'Permanent'): void
    {
        $raw = json_encode(['type' => $type, 'data' => ['email_id' => $intent->provider_id ?? 'provider-during-request', 'to' => $recipients, 'message_id' => '<real-wire-id@example.net>', 'tags' => ['postroom_intent' => $intent->id], 'bounce' => ['type' => $bounce]]], JSON_THROW_ON_ERROR);
        app(EventService::class)->import(['id' => fake()->uuid(), 'raw' => base64_encode($raw), 'checksum' => hash('sha256', $raw)]);
    }

    public function test_provider_snapshot_keeps_older_unresolved_and_newly_accepted_reservations(): void
    {
        $draft = $this->draft();
        $intent = SendIntent::create(['draft_id' => $draft->id, 'user_id' => $draft->user_id, 'mailbox_id' => $draft->mailbox_id, 'payload' => [], 'recipients' => 10, 'status' => 'uncertain', 'created_at' => now()->subHour(), 'updated_at' => now()->subHour()]);
        DB::table('quota_ledger')->insert(['intent_id' => $intent->id, 'recipients' => 10, 'created_at' => now()->subHour()]);
        config(['postroom.provider' => 'resend']);
        $snapshot = (object) ['observed_at' => now()->subSeconds(20), 'last_error' => null, 'data' => json_encode(['daily' => ['used' => 90, 'limit' => 100], 'monthly' => ['used' => 90, 'limit' => 3000]])];
        $this->assertFalse(app(UsageService::class)->allowance(1, $snapshot));
        $intent->update(['status' => 'accepted']);
        $this->assertFalse(app(UsageService::class)->allowance(1, $snapshot));
    }

    public function test_delivery_is_per_recipient_and_transient_bounce_can_recover(): void
    {
        $draft = $this->draft();
        $this->postJson('/drafts/'.$draft->id.'/send', ['version' => 1])->assertOk();
        $intent = SendIntent::firstOrFail();
        $this->event($intent, 'email.delivered', ['a@example.net']);
        $this->assertSame('partially_delivered', $intent->fresh()->status);
        $this->event($intent, 'email.bounced', ['b@example.net'], 'Transient');
        $this->assertDatabaseCount('suppressions', 0);
        $this->event($intent, 'email.delivered', ['b@example.net']);
        $this->assertSame('delivered', $intent->fresh()->status);
        $this->assertSame('<real-wire-id@example.net>', Message::firstOrFail()->provider_message_id);
    }

    public function test_early_webhook_wins_over_late_http_acceptance(): void
    {
        $draft = $this->draft();
        $provider = \Mockery::mock(OutboundMailProvider::class);
        $provider->shouldReceive('send')->once()->andReturnUsing(function () {
            $intent = SendIntent::firstOrFail();
            $this->event($intent, 'email.delivered', ['a@example.net', 'b@example.net']);

            return ['status' => 'accepted', 'id' => 'provider-during-request', 'error' => null];
        });
        $this->app->instance(OutboundMailProvider::class, $provider);
        $this->postJson('/drafts/'.$draft->id.'/send', ['version' => 1])->assertOk()->assertJsonPath('status', 'delivered');
        $this->assertSame('provider-during-request', SendIntent::firstOrFail()->provider_id);
    }

    public function test_definite_failure_can_be_copied_but_uncertainty_cannot(): void
    {
        $draft = $this->draft();
        config(['postroom.mock_outcome' => 'failed']);
        $this->postJson('/drafts/'.$draft->id.'/send', ['version' => 1])->assertOk()->assertJsonPath('status', 'failed');
        $copy = $this->postJson('/mail/'.$draft->mailbox_id.'/drafts', ['copy_failed' => $draft->id])->assertCreated()->json('id');
        $this->assertNotSame($draft->id, $copy);
        $this->assertSame($draft->body, Draft::findOrFail($copy)->body);
        $draft->update(['status' => 'uncertain']);
        $this->postJson('/mail/'.$draft->mailbox_id.'/drafts', ['copy_failed' => $draft->id])->assertNotFound();
        $this->assertDatabaseCount('send_intents', 1);
    }

    public function test_draft_creation_is_bounded_by_storage_and_count(): void
    {
        $draft = $this->draft();
        Mailbox::whereKey($draft->mailbox_id)->update(['quota_bytes' => 1]);
        $this->postJson('/mail/'.$draft->mailbox_id.'/drafts')->assertUnprocessable();
        $this->assertDatabaseCount('drafts', 1);
    }

    public function test_stale_dispatch_is_uncertain_and_retains_reservation(): void
    {
        $draft = $this->draft();
        $this->postJson('/drafts/'.$draft->id.'/send', ['version' => 1])->assertOk();
        SendIntent::query()->update(['status' => 'dispatching', 'attempted_at' => now()->subMinutes(10)]);
        $this->assertSame(1, app(DeliveryService::class)->markStaleDispatches());
        $this->assertSame('uncertain', $draft->fresh()->status);
        $this->assertDatabaseCount('quota_ledger', 1);
    }

    public function test_new_admin_created_user_can_reach_password_confirmation_and_drafts_are_private(): void
    {
        $draft = $this->draft();
        $user = User::findOrFail($draft->user_id);
        $user->forceFill(['email_verified_at' => null])->save();
        $this->get('/settings/security')->assertRedirect('/user/confirm-password');
        $this->getJson('/drafts/'.$draft->id)->assertOk();
        $this->actingAs(User::factory()->create())->getJson('/drafts/'.$draft->id)->assertForbidden();
    }

    public function test_admin_requires_an_mfa_verified_session_not_only_an_enrolled_secret(): void
    {
        $owner = User::factory()->withTwoFactor()->create();
        $owner->forceFill(['role' => 'owner'])->save();
        $this->actingAs($owner)->get('/admin')->assertForbidden();
        $this->withSession(['postroom.mfa_user' => $owner->id + 1])->get('/admin')->assertForbidden();
    }

    public function test_physical_storage_guard_preserves_draft_and_does_not_dispatch(): void
    {
        $draft = $this->draft();
        $budget = \Mockery::mock(StorageBudget::class);
        $budget->shouldReceive('permits')->andReturnFalse();
        $this->app->instance(StorageBudget::class, $budget);
        $this->postJson('/drafts/'.$draft->id.'/send', ['version' => 1])->assertUnprocessable();
        $this->assertSame('held', $draft->fresh()->status);
        $this->assertSame($draft->body, $draft->fresh()->body);
        $this->assertDatabaseCount('send_intents', 0);
    }

    public function test_suspension_during_usage_fetch_cannot_send_from_a_shared_mailbox(): void
    {
        $draft = $this->draft();
        Mailbox::findOrFail($draft->mailbox_id)->users()->attach(User::factory()->create(), ['can_send' => true]);
        $usage = \Mockery::mock(UsageService::class);
        $usage->shouldReceive('snapshot')->once()->andReturnUsing(function () use ($draft) {
            User::whereKey($draft->user_id)->update(['active' => false]);

            return null;
        });
        $this->app->instance(UsageService::class, $usage);
        $this->postJson('/drafts/'.$draft->id.'/send', ['version' => 1])->assertForbidden();
        $this->assertSame($draft->body, $draft->fresh()->body);
        $this->assertDatabaseCount('send_intents', 0);
    }

    public function test_account_switch_login_does_not_redirect_to_another_users_mailbox(): void
    {
        $draft = $this->draft();
        auth()->logout();
        $other = User::factory()->create();
        $this->withSession(['url.intended' => '/mail/'.$draft->mailbox_id.'/thread/fictional'])
            ->post('/login', ['email' => $other->email, 'password' => 'password'])->assertRedirect('/dashboard');
    }
}
