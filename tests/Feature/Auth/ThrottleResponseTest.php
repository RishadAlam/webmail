<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\RateLimiter;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class ThrottleResponseTest extends TestCase
{
    use RefreshDatabase;

    public static function authForms(): array
    {
        return [
            'password login' => ['/login', 'email'],
            'authenticator challenge' => ['/two-factor-challenge', 'code'],
            'recovery challenge' => ['/two-factor-challenge', 'recovery_code'],
        ];
    }

    private function limitedRequest(string $path, string $field): array
    {
        $user = User::factory()->withTwoFactor()->create();
        if ($path === '/login') {
            $key = md5('login'.$user->email.'|127.0.0.1');
            $payload = ['email' => $user->email, 'password' => 'fictional-unflashed-password'];
        } else {
            $this->withSession(['login.id' => $user->id]);
            $key = md5('two-factor'.$user->id);
            $payload = [$field => 'fictional-unflashed-code'];
        }
        RateLimiter::increment($key, amount: 5);

        return [$key, $payload];
    }

    #[DataProvider('authForms')]
    public function test_inertia_throttle_returns_to_the_exact_auth_screen_without_flashing_secrets(string $path, string $field): void
    {
        [$key, $payload] = $this->limitedRequest($path, $field);
        $this->withHeaders(['X-Inertia' => 'true', 'Accept' => 'text/html', 'Referer' => 'https://attacker.example/redirect']);
        $response = $this->post($path, $payload)->assertStatus(303)->assertRedirect($path);
        $retry = $response->headers->get('Retry-After');
        $this->assertGreaterThan(0, (int) $retry);
        $response->assertSessionHasErrors([$field => "Too many attempts. Try again in $retry seconds."]);
        $this->assertStringNotContainsString('fictional-unflashed', json_encode(session()->all()));
        $this->assertStringNotContainsString('attacker.example', (string) $response->headers->get('Location'));
        $this->assertTrue(RateLimiter::tooManyAttempts($key, 5));
        $this->post($path, $payload)->assertStatus(303)->assertRedirect($path);
        $this->assertGuest();
    }

    #[DataProvider('authForms')]
    public function test_json_auth_clients_remain_rate_limited_with_429_even_with_an_inertia_header(string $path, string $field): void
    {
        [$key, $payload] = $this->limitedRequest($path, $field);
        $this->withHeader('X-Inertia', 'true')->postJson($path, $payload)->assertTooManyRequests()->assertHeader('Retry-After');
        $this->assertTrue(RateLimiter::tooManyAttempts($key, 5));
        $this->assertGuest();
    }
}
