<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\OwnerBootstrap;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class OwnerBootstrapTest extends TestCase
{
    use RefreshDatabase;

    private function bootstrapOwner(): void
    {
        $this->artisan('webmail:bootstrap-owner')
            ->expectsQuestion('Owner name', 'Fictional Owner')
            ->expectsQuestion('Owner email', 'owner@example.test')
            ->expectsQuestion('Password (16+ characters; mixed case, number and symbol)', 'Fixture-Owner-Password-42!')
            ->expectsQuestion('Confirm password', 'Fixture-Owner-Password-42!')
            ->assertSuccessful();
    }

    public function test_bootstrap_creates_one_owner_without_a_mailbox_or_mfa_bypass(): void
    {
        $this->withoutVite();
        $this->bootstrapOwner();
        $owner = User::sole();
        $this->assertSame('owner', $owner->role);
        $this->assertTrue(Hash::check('Fixture-Owner-Password-42!', $owner->password));
        $this->assertNull($owner->two_factor_confirmed_at);
        $this->assertDatabaseCount('mailboxes', 0);
        $this->assertDatabaseHas('installation_state', ['id' => 1, 'owner_user_id' => $owner->id]);
        $this->actingAs($owner)->get('/admin')->assertForbidden();
        $this->get('/settings/security')->assertRedirect('/user/confirm-password');
    }

    public function test_bootstrap_cannot_be_reused_after_owner_removal(): void
    {
        $this->bootstrapOwner();
        User::query()->delete();
        $this->artisan('webmail:bootstrap-owner')->expectsOutputToContain('already completed')->assertFailed();
        $this->assertDatabaseCount('users', 0);
    }

    public function test_existing_installations_cannot_be_claimed(): void
    {
        User::factory()->create();
        $this->artisan('webmail:bootstrap-owner')->expectsOutputToContain('existing users')->assertFailed();
        $this->assertDatabaseCount('users', 1);
    }

    public function test_noninteractive_bootstrap_refuses_to_take_a_password_from_arguments_or_environment(): void
    {
        $this->artisan('webmail:bootstrap-owner', ['--no-interaction' => true])
            ->expectsOutputToContain('interactive terminal')->assertFailed();
        $this->assertDatabaseCount('users', 0);
    }

    public function test_short_password_does_not_consume_the_single_use_latch(): void
    {
        $this->artisan('webmail:bootstrap-owner')
            ->expectsQuestion('Owner name', 'Fictional Owner')
            ->expectsQuestion('Owner email', 'owner@example.test')
            ->expectsQuestion('Password (16+ characters; mixed case, number and symbol)', 'short')
            ->expectsQuestion('Confirm password', 'short')
            ->assertFailed();
        $this->assertDatabaseCount('users', 0);
        $this->assertDatabaseHas('installation_state', ['id' => 1, 'owner_bootstrapped_at' => null]);
    }

    public function test_database_failure_does_not_print_exception_details(): void
    {
        $this->mock(OwnerBootstrap::class, function ($mock): void {
            $mock->shouldReceive('assertAvailable')->once()->andThrow(new \RuntimeException('private database detail'));
        });
        $this->artisan('webmail:bootstrap-owner')
            ->expectsOutputToContain('Check database availability and reviewed migrations')
            ->doesntExpectOutputToContain('private database detail')
            ->assertFailed();
    }
}
