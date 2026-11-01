<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Laravel\Fortify\Features;
use PragmaRX\Google2FA\Google2FA;
use Tests\TestCase;

class TwoFactorChallengeTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->skipUnlessFortifyHas(Features::twoFactorAuthentication());
    }

    public function test_two_factor_challenge_redirects_to_login_when_not_authenticated(): void
    {
        $response = $this->get(route('two-factor.login'));

        $response->assertRedirect(route('login'));
    }

    public function test_two_factor_challenge_can_be_rendered(): void
    {
        Features::twoFactorAuthentication([
            'confirm' => true,
            'confirmPassword' => true,
        ]);

        $user = User::factory()->withTwoFactor()->create();

        $this->post(route('login'), [
            'email' => $user->email,
            'password' => 'password',
        ]);

        $this->get(route('two-factor.login'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('auth/two-factor-challenge'),
            );
    }

    public function test_owner_authenticator_login_grants_admin_only_after_the_challenge(): void
    {
        $this->withoutVite();
        $owner = User::factory()->withTwoFactor()->create();
        $owner->forceFill(['role' => 'owner', 'two_factor_secret' => encrypt('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP')])->save();
        $this->post('/login', ['email' => $owner->email, 'password' => 'password'])->assertRedirect('/two-factor-challenge');
        $this->assertGuest();
        $code = (new Google2FA)->getCurrentOtp('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP');
        $this->post('/two-factor-challenge', ['code' => $code])->assertRedirect('/dashboard');
        $this->app['auth']->forgetGuards();
        $this->get('/admin')->assertOk();
    }

    public function test_owner_recovery_code_grants_admin_once_and_cannot_be_reused(): void
    {
        $this->withoutVite();
        $owner = User::factory()->withTwoFactor()->create(['role' => 'owner']);

        $this->post('/login', ['email' => $owner->email, 'password' => 'password'])
            ->assertRedirect('/two-factor-challenge');
        $this->assertGuest();
        $this->post('/two-factor-challenge', ['recovery_code' => 'recovery-code-1'])
            ->assertRedirect('/dashboard');
        $this->app['auth']->forgetGuards();
        $this->get('/admin')->assertOk();
        $this->assertNotContains('recovery-code-1', $owner->fresh()->recoveryCodes());

        $this->post('/logout');
        $this->app['auth']->forgetGuards();
        $this->get('/admin')->assertRedirect('/login');
        $this->post('/login', ['email' => $owner->email, 'password' => 'password'])
            ->assertRedirect('/two-factor-challenge');
        $this->post('/two-factor-challenge', ['recovery_code' => 'recovery-code-1'])
            ->assertSessionHasErrors('recovery_code');
        $this->assertGuest();
        $this->get('/admin')->assertRedirect('/login');
    }
}
