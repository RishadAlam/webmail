<?php

namespace App\Concerns;

use Illuminate\Http\Request;

trait AuthorizesAdministration
{
    protected function authorizeAdmin(Request $request): void
    {
        $user = $request->user();
        abort_unless($user && $user->active && in_array($user->role, ['owner', 'admin'], true)
            && $user->hasEnabledTwoFactorAuthentication()
            && $request->session()->get('postroom.mfa_user') === $user->id,
            403, 'Administrator access requires two-factor verification in this session. Sign out and sign in with your password and authenticator code.');
    }
}
