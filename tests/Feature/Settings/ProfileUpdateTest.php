<?php

namespace Tests\Feature\Settings;

use App\Models\Address;
use App\Models\Draft;
use App\Models\Mailbox;
use App\Models\Message;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class ProfileUpdateTest extends TestCase
{
    use RefreshDatabase;

    public function test_profile_page_is_displayed()
    {
        $user = User::factory()->create();

        $response = $this
            ->actingAs($user)
            ->get(route('profile.edit'));

        $response->assertOk();
    }

    public function test_name_can_be_updated_without_submitting_a_login_address(): void
    {
        $user = User::factory()->create();

        $response = $this
            ->actingAs($user)
            ->patch(route('profile.update'), [
                'name' => 'Test User',
            ]);

        $response
            ->assertSessionHasNoErrors()
            ->assertRedirect(route('profile.edit'));

        $this->assertSame('Test User', $user->fresh()->name);
        $this->assertSame($user->email, $user->fresh()->email);
        $this->assertNotNull($user->fresh()->email_verified_at);
    }

    public function test_email_verification_status_is_unchanged_when_the_email_address_is_unchanged()
    {
        $user = User::factory()->create();

        $response = $this
            ->actingAs($user)
            ->patch(route('profile.update'), [
                'name' => 'Test User',
                'email' => $user->email,
            ]);

        $response
            ->assertSessionHasNoErrors()
            ->assertRedirect(route('profile.edit'));

        $this->assertNotNull($user->refresh()->email_verified_at);
    }

    #[DataProvider('accountRoles')]
    public function test_login_address_cannot_be_changed_in_profile_settings(string $role): void
    {
        $user = User::factory()->create(['role' => $role]);
        $originalEmail = $user->email;
        $originalName = $user->name;
        $box = Mailbox::create(['name' => 'Account', 'email' => $user->email]);
        $box->users()->attach($user, ['can_send' => true]);
        $address = Address::create(['mailbox_id' => $box->id, 'email' => $user->email, 'active' => true]);

        $this->actingAs($user)->patchJson(route('profile.update'), [
            'name' => 'Unexpected rename',
            'email' => 'unprovisioned@example.net',
        ])->assertUnprocessable()->assertJsonValidationErrors('email');

        $this->assertSame($originalEmail, $user->fresh()->email);
        $this->assertSame($originalName, $user->fresh()->name);
        $this->assertNotNull($user->fresh()->email_verified_at);
        $this->assertSame($user->email, $box->fresh()->email);
        $this->assertSame($user->email, $address->fresh()->email);
    }

    #[DataProvider('accountRoles')]
    public function test_accounts_cannot_delete_themselves_even_without_mail(string $role): void
    {
        $user = User::factory()->create(['role' => $role]);

        $this->actingAs($user)->deleteJson(route('profile.destroy'), [
            'password' => 'password',
        ])->assertForbidden();

        $this->assertAuthenticatedAs($user);
        $this->assertModelExists($user);
    }

    #[DataProvider('accountRoles')]
    public function test_self_deletion_is_denied_without_losing_drafts_accepted_mail_or_membership(string $role): void
    {
        $user = User::factory()->create(['role' => $role]);
        $box = Mailbox::create(['name' => 'Account', 'email' => $user->email]);
        $box->users()->attach($user, ['can_send' => true]);
        $address = Address::create(['mailbox_id' => $box->id, 'email' => $user->email, 'active' => true]);
        $draft = Draft::create([
            'user_id' => $user->id, 'mailbox_id' => $box->id, 'from_email' => $user->email,
            'to' => ['recipient@example.net'], 'cc' => [], 'bcc' => [],
            'subject' => 'Unsent fictional work', 'body' => '<p>Keep this draft.</p>',
        ]);
        $raw = "From: sender@example.net\r\nSubject: Accepted fictional mail\r\n\r\nKeep this message.";
        $message = Message::create([
            'mailbox_id' => $box->id, 'thread_id' => 'accepted', 'from_email' => 'sender@example.net',
            'to' => [$user->email], 'cc' => [], 'subject' => 'Accepted fictional mail',
            'body_text' => 'Keep this message.', 'raw_mime' => $raw,
        ]);
        DB::table('ingress_receipts')->insert([
            'id' => 'accepted-receipt', 'message_id' => $message->id, 'checksum' => hash('sha256', $raw),
            'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->actingAs($user)->deleteJson(route('profile.destroy'), [
            'password' => 'password',
        ])->assertForbidden();

        $this->assertAuthenticatedAs($user);
        $this->assertModelExists($user);
        $this->assertModelExists($address);
        $this->assertDatabaseHas('mailbox_user', ['user_id' => $user->id, 'mailbox_id' => $box->id, 'can_send' => true]);
        $this->assertDatabaseHas('ingress_receipts', ['id' => 'accepted-receipt', 'message_id' => $message->id]);
        $this->assertSame('<p>Keep this draft.</p>', $draft->fresh()->body);
        $this->assertSame($raw, $message->fresh()->raw_mime);
    }

    public static function accountRoles(): array
    {
        return [['member'], ['owner']];
    }
}
