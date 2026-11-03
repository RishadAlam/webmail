<?php

namespace Tests\Feature\Settings;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Tests\TestCase;

class AccountSuspensionTest extends TestCase
{
    use RefreshDatabase;

    public function test_suspension_revokes_remembered_access_even_after_the_member_is_reinstated(): void
    {
        $this->withoutVite();
        $member = User::factory()->create();
        $owner = User::factory()->withTwoFactor()->create(['role' => 'owner']);
        $recallerName = Auth::guard('web')->getRecallerName();
        $login = $this->post('/login', ['email' => $member->email, 'password' => 'password', 'remember' => true])->assertRedirect();
        $cookie = $login->getCookie($recallerName)->getValue();
        $oldToken = $member->fresh()->remember_token;

        $this->actingAs($owner)->withSession(['webmail.mfa_user' => $owner->id])
            ->patchJson('/admin/people/'.$member->id, ['active' => false])->assertOk();
        $this->patchJson('/admin/people/'.$member->id, ['active' => true])->assertOk();

        Auth::forgetGuards();
        session()->flush();
        $this->withCookie($recallerName, $cookie)->get(route('profile.edit'))->assertRedirect('/login');
        $this->assertGuest();
        $this->assertNotSame($oldToken, $member->fresh()->remember_token);
    }
}
