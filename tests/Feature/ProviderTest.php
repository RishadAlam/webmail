<?php

namespace Tests\Feature;

use App\Models\Mailbox;
use App\Models\SendIntent;
use App\Models\User;
use App\Providers\Mail\CloudflareClient;
use App\Providers\Mail\FakeIngressGateway;
use App\Providers\Mail\IngressGateway;
use App\Providers\Mail\MockCloudflareControlPlane;
use App\Providers\Mail\ResendProvider;
use App\Services\ImportService;
use App\Services\UsageService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class ProviderTest extends TestCase
{
    use RefreshDatabase;

    public function test_cloudflare_inspection_reads_every_page_without_mutating_dns(): void
    {
        $fake = new MockCloudflareControlPlane;
        Http::fakeSequence()->push(['success' => true, 'result' => $fake->dns($fake::ZONE), 'result_info' => ['total_pages' => 2]])
            ->push(['success' => true, 'result' => [['id' => 'second-record']], 'result_info' => ['total_pages' => 2]]);
        $result = (new CloudflareClient('fictional-test-token'))->dns($fake::ZONE);
        $this->assertCount(2, $result);
        Http::assertSentCount(2);
        Http::assertSent(fn ($request) => $request->method() === 'GET' && str_starts_with($request->url(), 'https://api.cloudflare.com/client/v4/zones/'.$fake::ZONE.'/dns_records?') && $request['page'] === 2);
        $this->assertSame('pending', $fake->zones()[0]['status']);
    }

    public function test_cloudflare_inspection_fails_on_provider_error_without_leaking_response(): void
    {
        Http::fake(['*' => Http::response(['success' => false, 'errors' => [['message' => 'sensitive upstream detail']]], 403)]);
        $this->expectExceptionMessage('Cloudflare inspection failed. Check scopes and account access.');
        (new CloudflareClient('fictional-test-token'))->zones();
    }

    public function test_resend_uses_documented_endpoint_and_stable_key_and_keeps_acceptance_separate(): void
    {
        config(['postroom.resend_key' => 'test-only', 'postroom.sending_enabled' => true]);
        Http::fake(['api.resend.com/emails' => Http::response(['id' => 'provider-1'], 200)]);
        $result = app(ResendProvider::class)->send(['from' => 'mira@postroom.test', 'to' => ['a@example.net'], 'text' => 'Hello', 'subject' => 'Fiction'], 'postroom/one');
        $this->assertSame('accepted', $result['status']);
        $this->assertSame('provider-1', $result['id']);
        Http::assertSent(fn ($r) => $r->url() === 'https://api.resend.com/emails' && $r->hasHeader('Idempotency-Key', 'postroom/one'));
    }

    public function test_failed_usage_refresh_keeps_previous_measurement_stale_and_blocks_admission(): void
    {
        config(['postroom.provider' => 'resend', 'postroom.resend_management_key' => 'test-only']);
        DB::table('usage_snapshots')->insert(['provider' => 'resend', 'data' => json_encode(['daily' => ['used' => 78, 'limit' => 100], 'monthly' => ['used' => 400, 'limit' => 3000]]), 'observed_at' => now()->subHour()]);
        Http::fake(['api.resend.com/usage' => Http::response([], 503)]);
        $usage = app(UsageService::class);
        $meters = $usage->meters();
        $this->assertSame(78, $meters[0]['used']);
        $this->assertSame('stale', $meters[0]['status']);
        $this->assertFalse($usage->allowance(1, $usage->snapshot()));
        Http::assertSentCount(1);
    }

    public function test_event_replay_and_out_of_order_delivery_do_not_erase_a_bounce(): void
    {
        $user = User::factory()->create();
        $box = Mailbox::create(['name' => 'Test', 'email' => $user->email]);
        $intent = SendIntent::create(['user_id' => $user->id, 'mailbox_id' => $box->id, 'draft_id' => fake()->uuid(), 'payload' => ['to' => ['a@example.net']], 'recipients' => 1, 'provider_id' => 'provider-1', 'status' => 'accepted']);
        $gateway = new FakeIngressGateway;
        $this->app->instance(IngressGateway::class, $gateway);
        foreach ([['e-1', 'email.bounced'], ['e-2', 'email.delivered'], ['e-1', 'email.bounced']] as [$id,$type]) {
            $raw = json_encode(['type' => $type, 'data' => ['email_id' => 'provider-1', 'to' => ['a@example.net'], 'bounce' => ['type' => 'Permanent']]]);
            $gateway->items = [['id' => $id, 'kind' => 'event', 'raw' => base64_encode($raw), 'checksum' => hash('sha256', $raw)]];
            app(ImportService::class)->sync();
        }
        $this->assertSame('bounced', $intent->fresh()->status);
        $this->assertDatabaseCount('provider_events', 2);
        $this->assertDatabaseHas('suppressions', ['email' => 'a@example.net']);
    }

    public function test_admin_creates_member_without_provider_account_and_suspends_sessions(): void
    {
        $this->withoutVite();
        $admin = User::factory()->withTwoFactor()->create();
        $admin->forceFill(['role' => 'owner'])->save();
        $this->actingAs($admin)->withSession(['postroom.mfa_user' => $admin->id])->postJson('/admin/people', ['name' => 'Fictional Sam', 'address' => 'sam', 'password' => 'a-local-only-password'])->assertCreated();
        $member = User::where('email', 'sam@postroom.test')->firstOrFail();
        $this->assertDatabaseHas('addresses', ['email' => $member->email, 'directory_status' => 'pending']);
        $this->patchJson('/admin/people/'.$member->id, ['active' => false])->assertOk();
        $this->assertFalse($member->fresh()->active);
        $this->assertDatabaseHas('audit_events', ['action' => 'user.suspended', 'target' => (string) $member->id]);
    }
}
