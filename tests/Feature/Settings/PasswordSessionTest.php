<?php

namespace Tests\Feature\Settings;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

class PasswordSessionTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutVite();
        config(['session.driver' => 'database']);
    }

    public function test_password_change_revokes_other_sessions_but_preserves_the_current_and_other_users_sessions(): void
    {
        $user = User::factory()->create();
        $otherUser = User::factory()->create();
        $this->post('/login', ['email' => $user->email, 'password' => 'password'])->assertRedirect();
        $currentSession = session()->getId();
        $oldSession = $this->createSession($user);
        $otherUsersSession = $this->createSession($otherUser);

        $this->withCookie(config('session.cookie'), $currentSession)
            ->from(route('security.edit'))
            ->put(route('user-password.update'), [
                'current_password' => 'password',
                'password' => 'new-password',
                'password_confirmation' => 'new-password',
            ])->assertSessionHasNoErrors()->assertRedirect(route('security.edit'));

        $this->assertTrue(Hash::check('new-password', $user->fresh()->password));
        $this->assertDatabaseMissing('sessions', ['id' => $oldSession]);
        $this->assertDatabaseHas('sessions', ['id' => $currentSession, 'user_id' => $user->id]);
        $this->assertDatabaseHas('sessions', ['id' => $otherUsersSession, 'user_id' => $otherUser->id]);

        $this->newBrowserRequest();
        $this->withCookie(config('session.cookie'), $currentSession)->get(route('profile.edit'))->assertOk();
        $this->assertAuthenticatedAs($user);

        $this->newBrowserRequest();
        $this->withCookie(config('session.cookie'), $oldSession)->get(route('profile.edit'))->assertRedirect('/login');
        $this->assertGuest();
    }

    public function test_password_change_rotates_remember_token_and_old_cookie_cannot_restore_authentication(): void
    {
        $user = User::factory()->create();
        $recallerName = Auth::guard('web')->getRecallerName();
        $response = $this->post('/login', [
            'email' => $user->email, 'password' => 'password', 'remember' => true,
        ])->assertRedirect();
        $currentSession = session()->getId();
        $oldToken = $user->fresh()->remember_token;
        $oldCookie = $response->getCookie($recallerName)->getValue();

        $this->withCookie(config('session.cookie'), $currentSession)
            ->put(route('user-password.update'), [
                'current_password' => 'password',
                'password' => 'new-password',
                'password_confirmation' => 'new-password',
            ])->assertSessionHasNoErrors()->assertRedirect();

        $this->assertNotSame($oldToken, $user->fresh()->remember_token);
        $this->assertNotEmpty($user->fresh()->remember_token);
        $this->newBrowserRequest();
        $this->withCookie($recallerName, $oldCookie)->get(route('profile.edit'))->assertRedirect('/login');
        $this->assertGuest();
    }

    public function test_failed_password_change_does_not_revoke_sessions_or_remember_tokens(): void
    {
        $user = User::factory()->create();
        $oldPassword = $user->password;
        $oldToken = $user->remember_token;
        $oldSession = $this->createSession($user);

        $this->actingAs($user)->from(route('security.edit'))
            ->put(route('user-password.update'), [
                'current_password' => 'wrong-password',
                'password' => 'new-password',
                'password_confirmation' => 'new-password',
            ])->assertSessionHasErrors('current_password');

        $this->assertSame($oldPassword, $user->fresh()->password);
        $this->assertSame($oldToken, $user->fresh()->remember_token);
        $this->assertDatabaseHas('sessions', ['id' => $oldSession, 'user_id' => $user->id]);
    }

    private function createSession(User $user): string
    {
        $id = Str::random(40);
        DB::table('sessions')->insert([
            'id' => $id,
            'user_id' => $user->id,
            'payload' => base64_encode(serialize([Auth::guard('web')->getName() => $user->id])),
            'last_activity' => time(),
        ]);

        return $id;
    }

    private function newBrowserRequest(): void
    {
        // Clear the test process's cached identity and session attributes before replaying a cookie.
        Auth::forgetGuards();
        session()->flush();
        session()->getHandler()->setExists(false);
        $this->defaultCookies = [];
    }
}
