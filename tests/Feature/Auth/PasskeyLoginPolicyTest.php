<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Http\Request;
use Laravel\Passkeys\Passkey;
use Laravel\Passkeys\Passkeys;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class PasskeyLoginPolicyTest extends TestCase
{
    public static function identities(): array
    {
        return [
            'owner requires password and TOTP' => ['owner', true, false],
            'admin requires password and TOTP' => ['admin', true, false],
            'active member may use a passkey' => ['member', true, true],
            'suspended member is rejected' => ['member', false, false],
        ];
    }

    #[DataProvider('identities')]
    public function test_passkey_login_policy_preserves_the_admin_totp_boundary(string $role, bool $active, bool $expected): void
    {
        $user = new User;
        $user->forceFill(['role' => $role, 'active' => $active]);
        $passkey = new Passkey;
        $passkey->setRelation('user', $user);
        $this->assertSame($expected, Passkeys::allowsLogin(Request::create('/passkeys/login'), $passkey));
    }
}
