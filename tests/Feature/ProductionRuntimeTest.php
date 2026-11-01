<?php

namespace Tests\Feature;

use App\Providers\AppServiceProvider;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class ProductionRuntimeTest extends TestCase
{
    private function safeConfiguration(): void
    {
        config([
            'app.debug' => false, 'app.url' => 'https://mail.example.test',
            'app.key' => 'base64:'.base64_encode(str_repeat('k', 32)),
            'app.cipher' => 'AES-256-CBC', 'database.default' => 'pgsql',
            'database.connections.pgsql.driver' => 'pgsql', 'database.connections.pgsql.url' => null,
            'database.connections.pgsql.sslmode' => 'verify-full', 'postroom.domain' => 'fictional-mail.org',
            'database.connections.pgsql_unverified' => ['driver' => 'pgsql', 'sslmode' => 'require'],
            'session.driver' => 'database', 'session.connection' => null,
            'session.encrypt' => true, 'session.secure' => true,
            'session.http_only' => true, 'session.same_site' => 'lax', 'session.domain' => null,
            'deployment.trusted_proxies' => [],
        ]);
    }

    public static function unsafeSettings(): array
    {
        return [
            'debug' => ['app.debug', true],
            'sqlite' => ['database.default', 'sqlite'],
            'sqlite URL override' => ['database.connections.pgsql.url', 'sqlite:///tmp/mail.sqlite'],
            'URL query driver override' => ['database.connections.pgsql.url', 'postgresql://localhost/mail?driver=sqlite'],
            'plaintext database' => ['database.connections.pgsql.sslmode', 'disable'],
            'unverified database certificate' => ['database.connections.pgsql.sslmode', 'require'],
            'URL TLS downgrade' => ['database.connections.pgsql.url', 'postgresql://localhost/mail?sslmode=disable'],
            'missing receiving domain' => ['postroom.domain', ''],
            'local fallback domain' => ['postroom.domain', 'postroom.test'],
            'local domain' => ['postroom.domain', 'mail.local'],
            'local hostname' => ['postroom.domain', 'localhost'],
            'example domain' => ['postroom.domain', 'mail.example.com'],
            'invalid domain' => ['postroom.domain', 'mail.invalid'],
            'special use domain' => ['postroom.domain', 'mail.onion'],
            'internal domain' => ['postroom.domain', 'mail.internal'],
            'IP receiving domain' => ['postroom.domain', '192.0.2.1'],
            'file sessions' => ['session.driver', 'file'],
            'sqlite session connection' => ['session.connection', 'sqlite'],
            'unverified session connection' => ['session.connection', 'pgsql_unverified'],
            'unencrypted sessions' => ['session.encrypt', false],
            'insecure cookies' => ['session.secure', false],
            'script readable cookies' => ['session.http_only', false],
            'cross site cookies' => ['session.same_site', 'none'],
            'shared cookie domain' => ['session.domain', '.example.test'],
            'http URL' => ['app.url', 'http://mail.example.test'],
            'URL credentials' => ['app.url', 'https://private-token@mail.example.test'],
            'URL path' => ['app.url', 'https://mail.example.test/mail'],
            'missing key' => ['app.key', ''],
            'invalid key' => ['app.key', 'base64:short'],
            'wildcard proxies' => ['deployment.trusted_proxies', ['*']],
            'unbounded proxy network' => ['deployment.trusted_proxies', ['0.0.0.0/0']],
        ];
    }

    #[DataProvider('unsafeSettings')]
    public function test_unsafe_production_configuration_cannot_boot(string $key, mixed $value): void
    {
        $this->safeConfiguration();
        config([$key => $value]);
        $this->app->detectEnvironment(fn () => 'production');
        $this->expectException(\RuntimeException::class);
        (new AppServiceProvider($this->app))->boot();
    }

    public function test_safe_production_boot_needs_no_provider_credentials_or_database_connection(): void
    {
        $this->safeConfiguration();
        config(['database.connections.pgsql.host' => 'unreachable.invalid', 'postroom.resend_sending_key' => null]);
        $this->app->detectEnvironment(fn () => 'production');
        (new AppServiceProvider($this->app))->boot();
        $this->assertSame('https://mail.example.test/login', url('/login'));
    }

    public function test_production_configuration_command_reports_only_configuration_failures(): void
    {
        $this->safeConfiguration();
        config(['app.debug' => true]);
        $this->artisan('webmail:check-production')
            ->expectsOutputToContain('APP_DEBUG')
            ->assertFailed();
    }

    public function test_untrusted_proxy_headers_do_not_change_origin(): void
    {
        Route::get('/runtime-origin-test', fn (Request $request) => $request->getSchemeAndHttpHost());
        config(['deployment.trusted_proxies' => []]);
        $this->withServerVariables([
            'REMOTE_ADDR' => '203.0.113.10', 'HTTP_HOST' => 'localhost',
            'HTTP_X_FORWARDED_PROTO' => 'https', 'HTTP_X_FORWARDED_HOST' => 'attacker.example',
        ])->get('/runtime-origin-test')->assertOk()->assertSeeText('http://localhost');
    }

    public function test_explicit_proxy_may_supply_https_but_cannot_override_the_host(): void
    {
        Route::get('/runtime-origin-test', fn (Request $request) => $request->getSchemeAndHttpHost());
        config(['deployment.trusted_proxies' => ['203.0.113.10']]);
        $this->withServerVariables([
            'REMOTE_ADDR' => '203.0.113.10', 'HTTP_HOST' => 'localhost',
            'HTTP_X_FORWARDED_PROTO' => 'https', 'HTTP_X_FORWARDED_HOST' => 'attacker.example',
        ])->get('/runtime-origin-test')->assertOk()->assertSeeText('https://localhost');
    }
}
