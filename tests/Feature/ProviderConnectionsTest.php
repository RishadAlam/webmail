<?php

namespace Tests\Feature;

use App\Models\ProviderConnection;
use App\Models\User;
use App\Providers\Mail\ResendProvider;
use App\Providers\Mail\WorkerIngressGateway;
use App\Services\ConnectionConfiguration;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class ProviderConnectionsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutVite();
        Http::preventStrayRequests();
        config(['webmail.resend_key' => null, 'webmail.resend_management_key' => null, 'webmail.cloudflare_token' => null,
            'webmail.worker_url' => null, 'webmail.worker_secret' => null, 'webmail.sending_enabled' => false]);
    }

    private function owner(): User
    {
        $owner = User::factory()->withTwoFactor()->create(['role' => 'owner']);
        $this->actingAs($owner)->withSession(['webmail.mfa_user' => $owner->id, 'auth.password_confirmed_at' => time()]);

        return $owner;
    }

    private function usage(): array
    {
        return ['emails' => ['daily' => ['used' => 2, 'limit' => 100, 'resets_at' => '2026-11-02T00:00:00Z'],
            'monthly' => ['used' => 20, 'limit' => 3000, 'resets_at' => '2026-12-01T00:00:00Z']]];
    }

    public static function deniedRoles(): array
    {
        return [['member'], ['admin']];
    }

    #[DataProvider('deniedRoles')]
    public function test_members_and_administrators_cannot_read_change_clear_or_test_connections(string $role): void
    {
        $user = User::factory()->withTwoFactor()->create(['role' => $role]);
        $this->actingAs($user)->withSession(['webmail.mfa_user' => $user->id, 'auth.password_confirmed_at' => time()]);
        $this->getJson('/admin/connections')->assertForbidden();
        $this->putJson('/admin/connections', ['resend_key' => 're_fictional_secret'])->assertForbidden();
        $this->deleteJson('/admin/connections/resend_key')->assertForbidden();
        $this->postJson('/admin/connections/resend_management/test')->assertForbidden();
        Http::assertNothingSent();
    }

    public function test_owner_requires_session_mfa_and_recent_password_for_changes(): void
    {
        $owner = User::factory()->withTwoFactor()->create(['role' => 'owner']);
        $this->actingAs($owner)->getJson('/admin/connections')->assertForbidden();
        $this->withSession(['webmail.mfa_user' => $owner->id])->getJson('/admin/connections')->assertOk();
        $this->putJson('/admin/connections', ['resend_key' => 're_fictional_secret'])->assertStatus(423);
    }

    public function test_saving_encrypts_credentials_and_only_returns_masked_status_without_enabling_send(): void
    {
        $this->owner();
        $secret = 're_fictional_sending_secret_only';
        $this->putJson('/admin/connections', ['resend_key' => $secret])->assertOk()
            ->assertJsonPath('fields.resend_key.configured', true)->assertJsonPath('fields.resend_key.source', 'database')
            ->assertJsonPath('sending_enabled', false)->assertDontSee($secret);
        $this->assertSame($secret, app(ConnectionConfiguration::class)->value('resend_key'));
        $this->assertStringNotContainsString($secret, DB::table('provider_connections')->value('settings'));
        $this->assertStringNotContainsString($secret, DB::table('audit_events')->get()->toJson());
        $this->getJson('/admin/connections')->assertOk()->assertDontSee($secret);
        Http::assertNothingSent();
        $this->assertSame('failed', app(ResendProvider::class)->send(['to' => ['fictional@example.net']], 'fictional/key')['status']);
        Http::assertNothingSent();
    }

    public function test_blank_preserves_secret_and_explicit_clear_disables_environment_fallback(): void
    {
        $this->owner();
        config(['webmail.resend_key' => 're_fictional_environment_key']);
        $this->putJson('/admin/connections', ['resend_key' => 're_fictional_saved_key'])->assertOk();
        $this->putJson('/admin/connections', ['resend_key' => ''])->assertOk();
        $this->assertSame('re_fictional_saved_key', app(ConnectionConfiguration::class)->value('resend_key'));
        $this->deleteJson('/admin/connections/resend_key')->assertOk()->assertJsonPath('fields.resend_key.configured', false);
        $this->assertNull(app(ConnectionConfiguration::class)->value('resend_key'));
    }

    public function test_mock_check_never_contacts_provider_or_claims_live_verification(): void
    {
        $this->owner();
        config(['webmail.provider' => 'mock']);
        $this->putJson('/admin/connections', ['resend_management_key' => 're_fictional_management_key'])->assertOk();
        $this->postJson('/admin/connections/resend_management/test')->assertOk()->assertJsonPath('checks.resend_management.status', 'mock');
        Http::assertNothingSent();
    }

    public function test_resend_management_check_uses_saved_management_key_and_does_not_send_mail(): void
    {
        $this->owner();
        config(['webmail.provider' => 'resend']);
        $key = 're_fictional_management_key';
        $this->putJson('/admin/connections', ['resend_management_key' => $key])->assertOk()->assertJsonPath('checks.resend_management.status', 'unchecked');
        Http::fake(['https://api.resend.com/usage' => Http::response($this->usage())]);
        $this->postJson('/admin/connections/resend_management/test')->assertOk()->assertJsonPath('checks.resend_management.status', 'checked')
            ->assertJsonPath('sending_enabled', false)->assertDontSee($key);
        Http::assertSentCount(1);
        Http::assertSent(fn ($r) => $r->method() === 'GET' && $r->url() === 'https://api.resend.com/usage' && $r->hasHeader('Authorization', 'Bearer '.$key));
        $this->putJson('/admin/connections', ['resend_management_key' => 're_fictional_rotated_key'])->assertOk()->assertJsonPath('checks.resend_management.status', 'unchecked');
    }

    public function test_environment_credential_rotation_invalidates_a_previous_check(): void
    {
        $this->owner();
        config(['webmail.provider' => 'resend', 'webmail.resend_management_key' => 're_fictional_environment_key']);
        Http::fake(['https://api.resend.com/usage' => Http::response($this->usage())]);
        $this->postJson('/admin/connections/resend_management/test')->assertOk()->assertJsonPath('checks.resend_management.status', 'checked');
        config(['webmail.resend_management_key' => 're_replacement_environment_key']);
        $this->getJson('/admin/connections')->assertOk()->assertJsonPath('checks.resend_management.status', 'unchecked');
    }

    public function test_runtime_sender_uses_saved_secret_and_explicit_clear_disables_it(): void
    {
        $this->owner();
        config(['webmail.provider' => 'resend', 'webmail.sending_enabled' => true, 'webmail.resend_key' => 're_old_environment_key']);
        $secret = 're_fictional_saved_sending_key';
        $this->putJson('/admin/connections', ['resend_key' => $secret])->assertOk();
        Http::fake(['https://api.resend.com/emails' => Http::response(['id' => 'fictional-provider-id'])]);
        $provider = app(ResendProvider::class);
        $this->assertSame('accepted', $provider->send(['to' => ['fictional@example.net']], 'fictional/key')['status']);
        Http::assertSent(fn ($r) => $r->hasHeader('Authorization', 'Bearer '.$secret));
        $this->assertStringNotContainsString($secret, ProviderConnection::findOrFail(1)->toJson());
        $this->deleteJson('/admin/connections/resend_key')->assertOk();
        $this->assertSame('failed', $provider->send(['to' => ['fictional@example.net']], 'fictional/key-2')['status']);
        Http::assertSentCount(1);
    }

    public function test_non_json_submission_does_not_flash_credentials_to_the_session(): void
    {
        $this->owner();
        $secret = 're_fictional_non_json_key';
        $this->put('/admin/connections', ['resend_key' => $secret])->assertStatus(406);
        $this->assertStringNotContainsString($secret, json_encode(session()->all()));
        $this->assertNull(app(ConnectionConfiguration::class)->value('resend_key'));
    }

    public function test_sending_key_cannot_be_verified_as_management_key(): void
    {
        $this->owner();
        config(['webmail.provider' => 'resend']);
        $this->putJson('/admin/connections', ['resend_key' => 're_fictional_sending_only'])->assertOk();
        $this->postJson('/admin/connections/resend_management/test')->assertUnprocessable()->assertJsonPath('checks.resend_management.status', 'not_configured');
        $this->postJson('/admin/connections/resend_key/test')->assertUnprocessable();
        Http::assertNothingSent();
    }

    public function test_provider_failure_is_sanitized_and_does_not_echo_key_or_upstream_body(): void
    {
        $this->owner();
        config(['webmail.provider' => 'resend']);
        $secret = 're_fictional_management_key';
        $this->putJson('/admin/connections', ['resend_management_key' => $secret])->assertOk();
        Http::fake(['https://api.resend.com/usage' => Http::response(['message' => 'sensitive-provider-detail '.$secret], 403)]);
        $this->postJson('/admin/connections/resend_management/test')->assertUnprocessable()->assertJsonPath('checks.resend_management.status', 'failed')
            ->assertDontSee($secret)->assertDontSee('sensitive-provider-detail');
        $this->assertStringNotContainsString($secret, DB::table('provider_connections')->get()->toJson());
        $this->assertStringNotContainsString('sensitive-provider-detail', DB::table('provider_connections')->get()->toJson());
    }

    public function test_cloudflare_check_reads_only_configured_domain_zone_and_dns(): void
    {
        $this->owner();
        config(['webmail.provider' => 'resend', 'webmail.domain' => 'fictional.example']);
        $token = 'fictional_cloudflare_read_token';
        $zone = str_repeat('a', 32);
        $this->putJson('/admin/connections', ['cloudflare_token' => $token])->assertOk();
        Http::fake(['https://api.cloudflare.com/client/v4/zones?*' => Http::response(['success' => true, 'result' => [['id' => $zone, 'name' => 'fictional.example']], 'result_info' => ['total_pages' => 1]]),
            'https://api.cloudflare.com/client/v4/zones/'.$zone.'/dns_records?*' => Http::response(['success' => true, 'result' => [['type' => 'TXT', 'content' => 'private-provider-fixture']], 'result_info' => ['total_pages' => 1]])]);
        $this->postJson('/admin/connections/cloudflare/test')->assertOk()->assertJsonPath('checks.cloudflare.status', 'checked')->assertDontSee('private-provider-fixture');
        Http::assertSentCount(2);
        Http::assertSent(fn ($r) => $r->method() === 'GET' && $r->hasHeader('Authorization', 'Bearer '.$token) && str_contains($r->url(), '/zones/'.$zone.'/dns_records'));
    }

    public static function unsafeWorkerUrls(): array
    {
        return [['http://example.workers.dev'], ['https://127.0.0.1'], ['https://localhost'], ['https://example.com'],
            ['https://worker.workers.dev@127.0.0.1'], ['https://worker.workers.dev.evil.example'], ['https://worker.workers.dev/path'], ['https://worker.workers.dev?token=secret']];
    }

    #[DataProvider('unsafeWorkerUrls')]
    public function test_worker_urls_cannot_target_arbitrary_hosts_or_url_components(string $url): void
    {
        $this->owner();
        $this->putJson('/admin/connections', ['worker_url' => $url])->assertUnprocessable();
        Http::assertNothingSent();
    }

    public function test_worker_uses_saved_https_origin_and_secret_without_following_redirects(): void
    {
        $this->owner();
        $secret = str_repeat('f', 40);
        $this->putJson('/admin/connections', ['worker_url' => 'https://fictional.account.workers.dev', 'worker_secret' => $secret])->assertOk();
        $redirects = null;
        Http::fake(function ($request, $options) use (&$redirects) {
            $redirects = $options['allow_redirects'];

            return Http::response(['items' => []]);
        });
        $this->assertSame([], (new WorkerIngressGateway)->claim());
        Http::assertSent(fn ($r) => $r->url() === 'https://fictional.account.workers.dev/v1/claim' && $r->hasHeader('X-Webmail-Signature') && ! str_contains($r->body(), $secret));
        $this->assertFalse($redirects);
    }

    public function test_directory_target_changes_with_the_effective_saved_worker_origin(): void
    {
        $this->owner();
        config(['webmail.worker_url' => 'https://original.account.workers.dev']);
        $gateway = new WorkerIngressGateway;
        $this->assertSame(hash('sha256', 'https://original.account.workers.dev'), $gateway->directoryTarget());
        $this->putJson('/admin/connections', ['worker_url' => 'https://replacement.account.workers.dev'])->assertOk();
        $this->assertSame(hash('sha256', 'https://replacement.account.workers.dev'), $gateway->directoryTarget());
        Http::assertNothingSent();
    }

    public function test_explicit_bootstrap_worker_origin_is_allowed_but_domain_is_not_editable(): void
    {
        $this->owner();
        config(['webmail.worker_url' => 'https://ingress.fictional.example']);
        $this->putJson('/admin/connections', ['worker_url' => 'https://ingress.fictional.example'])->assertOk();
        $this->putJson('/admin/connections', ['domain' => 'attacker.example'])->assertUnprocessable();
        $this->putJson('/admin/connections', ['sending_enabled' => true])->assertUnprocessable();
        $this->assertFalse(config('webmail.sending_enabled'));
    }

    public function test_invalid_bootstrap_worker_url_is_hidden_and_cannot_make_a_request(): void
    {
        $this->owner();
        config(['webmail.worker_url' => 'https://fictional-user:fictional-secret@127.0.0.1', 'webmail.worker_secret' => str_repeat('f', 40)]);
        $this->getJson('/admin/connections')->assertOk()->assertJsonPath('fields.worker_url.configured', false)
            ->assertJsonPath('fields.worker_url.value', null)->assertDontSee('fictional-secret');
        $this->assertSame(hash('sha256', 'https://fictional-user:fictional-secret@127.0.0.1'), (new WorkerIngressGateway)->directoryTarget());
        try {
            (new WorkerIngressGateway)->claim();
            $this->fail('An invalid ingress origin must be rejected before HTTP.');
        } catch (\RuntimeException $error) {
            $this->assertSame('Ingress endpoint must be an approved HTTPS origin.', $error->getMessage());
        }
        Http::assertNothingSent();
    }

    public function test_credentials_service_can_read_environment_before_its_migration(): void
    {
        Schema::drop('provider_connections');
        config(['webmail.resend_key' => 're_fictional_bootstrap_key']);
        $this->assertSame('re_fictional_bootstrap_key', app(ConnectionConfiguration::class)->value('resend_key'));
    }
}
