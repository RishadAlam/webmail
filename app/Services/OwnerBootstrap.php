<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rules\Password;

class OwnerBootstrap
{
    public function assertAvailable(): void
    {
        $state = DB::table('installation_state')->where('id', 1)->first();
        if (! $state) {
            throw new \DomainException('Installation state is missing. Run the reviewed migrations first.');
        }
        if ($state->owner_bootstrapped_at !== null) {
            throw new \DomainException('Owner bootstrap already completed. It cannot be reused for account recovery.');
        }
        if (User::query()->exists()) {
            throw new \DomainException('Owner bootstrap refuses an installation with existing users. Use its existing owner and recovery process.');
        }
    }

    public function create(string $name, string $email, string $password, string $confirmation): User
    {
        $data = Validator::make([
            'name' => trim($name), 'email' => mb_strtolower(trim($email)),
            'password' => $password, 'password_confirmation' => $confirmation,
        ], [
            'name' => ['required', 'string', 'max:80'],
            'email' => ['required', 'email:rfc', 'max:254'],
            'password' => ['required', 'string', 'max:128', 'confirmed', Password::min(16)->letters()->mixedCase()->numbers()->symbols()],
        ])->validate();

        return DB::transaction(function () use ($data) {
            DB::table('installation_state')->where('id', 1)->lockForUpdate()->first();
            $this->assertAvailable();
            $owner = new User;
            $owner->forceFill([
                'name' => $data['name'], 'email' => $data['email'], 'password' => $data['password'],
                'role' => 'owner', 'active' => true, 'email_verified_at' => now(),
            ])->save();
            DB::table('installation_state')->where('id', 1)->update([
                'owner_user_id' => $owner->id, 'owner_bootstrapped_at' => now(),
            ]);

            return $owner;
        });
    }
}
