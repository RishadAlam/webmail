<?php

namespace Tests\Feature;

use App\Models\Address;
use App\Models\Draft;
use App\Models\Mailbox;
use App\Models\Message;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class AdminMailboxTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutVite();
        config(['webmail.provider' => 'mock', 'webmail.domain' => 'webmail.test']);
    }

    public function test_member_and_administrator_without_session_mfa_cannot_perform_account_or_mailbox_changes(): void
    {
        [$member, $box] = $this->account();
        $owner = User::factory()->withTwoFactor()->create(['role' => 'owner']);
        foreach ([$member, $owner] as $actor) {
            $this->actingAs($actor);
            $this->postJson('/admin/directory/sync')->assertForbidden();
            $this->postJson('/admin/mailboxes', ['name' => 'Unauthorized', 'address' => 'unauthorized', 'user_id' => $member->id, 'can_send' => true, 'quota_bytes' => 1048576])->assertForbidden();
            $this->patchJson('/admin/mailboxes/'.$box->id.'/quota', ['quota_bytes' => 1048576])->assertForbidden();
            $this->postJson('/admin/mailboxes/'.$box->id.'/aliases', ['address' => 'new'])->assertForbidden();
            $this->patchJson('/admin/mailboxes/'.$box->id.'/aliases/'.Address::firstOrFail()->id, ['active' => false])->assertForbidden();
            $this->putJson('/admin/mailboxes/'.$box->id.'/members/'.$member->id, ['present' => true, 'can_send' => true])->assertForbidden();
            $this->postJson('/admin/people/'.$member->id.'/revoke-sessions')->assertForbidden();
            $this->putJson('/admin/people/'.$member->id.'/password', ['current_password' => 'password', 'password' => 'a-new-member-password', 'password_confirmation' => 'a-new-member-password'])->assertForbidden();
        }
        $this->assertDatabaseCount('addresses', 1);
        $this->assertTrue(Hash::check('password', $member->fresh()->password));
    }

    public function test_admin_metadata_has_explicit_memberships_and_directory_state_without_mail_content(): void
    {
        [$member, $box] = $this->account();
        $this->owner();
        $this->get('/admin')->assertOk()->assertInertia(fn (Assert $page) => $page
            ->has('directory')->where('directory.status', 'pending')
            ->where('limits.max_addresses', 100)
            ->where('limits.max_mailbox_bytes', 26214400)
            ->has('mailboxes.0.members', 1)
            ->where('mailboxes.0.members.0.id', $member->id)
            ->where('mailboxes.0.members.0.can_send', true));
        $this->get('/mail/'.$box->id)->assertForbidden();
        $this->postJson('/admin/directory/sync')->assertOk()->assertJsonPath('status', 'simulated');
    }

    public function test_quotas_reject_unsafe_limits_and_preserve_existing_mail_and_drafts(): void
    {
        [$member, $box] = $this->account();
        [$draft, $message] = $this->retainedMail($member, $box);
        $box->update(['used_bytes' => 1500000]);
        $this->owner();
        $this->patchJson('/admin/mailboxes/'.$box->id.'/quota', ['quota_bytes' => 1048576])->assertUnprocessable();
        $this->patchJson('/admin/mailboxes/'.$box->id.'/quota', ['quota_bytes' => 26214401])->assertUnprocessable();
        $this->patchJson('/admin/mailboxes/'.$box->id.'/quota', ['quota_bytes' => 2097152])->assertOk();
        $this->assertSame(2097152, (int) $box->fresh()->quota_bytes);
        $this->assertSame('<p>Unsent private work.</p>', $draft->fresh()->body);
        $this->assertSame('Fictional original MIME', $message->fresh()->raw_mime);
        $this->assertDatabaseHas('audit_events', ['action' => 'mailbox.quota_changed', 'target' => (string) $box->id]);
    }

    public function test_aliases_are_explicit_same_domain_bounded_and_cannot_be_changed_through_another_mailbox(): void
    {
        [, $box] = $this->account();
        [, $other] = $this->account();
        $this->owner();
        $this->postJson('/admin/mailboxes/'.$box->id.'/aliases', ['address' => 'team@foreign.test'])->assertUnprocessable();
        $this->postJson('/admin/mailboxes/'.$box->id.'/aliases', ['address' => '*'])->assertUnprocessable();
        $this->postJson('/admin/mailboxes/'.$box->id.'/aliases', ['address' => 'team'])->assertCreated();
        $alias = Address::where('email', 'team@webmail.test')->firstOrFail();
        $this->assertSame('pending', $alias->directory_status);
        $this->postJson('/admin/mailboxes/'.$other->id.'/aliases', ['address' => 'team'])->assertUnprocessable();
        $this->patchJson('/admin/mailboxes/'.$other->id.'/aliases/'.$alias->id, ['active' => false])->assertNotFound();
        $this->assertTrue($alias->fresh()->active);
        for ($i = 3; $i < 100; $i++) {
            Address::create(['mailbox_id' => $box->id, 'email' => "limit$i@webmail.test"]);
        }
        $this->postJson('/admin/mailboxes/'.$box->id.'/aliases', ['address' => 'overflow'])->assertUnprocessable();
        $this->assertDatabaseCount('addresses', 100);
    }

    public function test_memberships_grant_only_the_selected_member_and_never_grant_the_acting_admin_or_owner_access(): void
    {
        [$member, $box] = $this->account();
        $reader = User::factory()->create();
        $owner = $this->owner();
        $this->putJson('/admin/mailboxes/'.$box->id.'/members/'.$owner->id, ['present' => true, 'can_send' => true])->assertUnprocessable();
        $this->putJson('/admin/mailboxes/'.$box->id.'/members/'.$reader->id, ['present' => true, 'can_send' => false])->assertOk();
        $this->assertTrue($reader->can('view', $box));
        $this->assertFalse($reader->can('send', $box));
        $this->assertFalse($owner->can('view', $box));
        $this->assertTrue($member->can('send', $box));
        $this->putJson('/admin/mailboxes/'.$box->id.'/members/'.$reader->id, ['present' => true, 'can_send' => true])->assertOk();
        $this->assertTrue($reader->can('send', $box));
        $this->putJson('/admin/mailboxes/'.$box->id.'/members/'.$reader->id, ['present' => false, 'can_send' => false])->assertOk();
        $this->assertFalse($reader->can('view', $box));
        $this->assertDatabaseHas('audit_events', ['action' => 'mailbox.membership_changed', 'target' => $box->id.':'.$reader->id]);
    }

    public function test_another_owner_is_protected_from_membership_and_account_access_changes(): void
    {
        [, $box] = $this->account();
        $protected = User::factory()->withTwoFactor()->create(['role' => 'owner']);
        $this->owner();
        $this->putJson('/admin/mailboxes/'.$box->id.'/members/'.$protected->id, ['present' => true, 'can_send' => true])->assertUnprocessable();
        $this->postJson('/admin/people/'.$protected->id.'/revoke-sessions')->assertUnprocessable();
        $this->patchJson('/admin/people/'.$protected->id, ['active' => false])->assertUnprocessable();
        $this->putJson('/admin/people/'.$protected->id.'/password', ['current_password' => 'password', 'password' => 'a-new-member-password', 'password_confirmation' => 'a-new-member-password'])->assertUnprocessable();
        $this->assertTrue($protected->fresh()->active);
        $this->assertTrue(Hash::check('password', $protected->fresh()->password));
        $this->assertFalse($protected->can('view', $box));
    }

    public function test_aggregate_mailbox_allocations_cannot_exceed_the_organization_budget(): void
    {
        [, $box] = $this->account();
        [, $other] = $this->account();
        $box->update(['quota_bytes' => 1048576]);
        $other->update(['quota_bytes' => 1048576]);
        config(['webmail.organization_bytes' => 2097152]);
        $this->owner();

        $this->patchJson('/admin/mailboxes/'.$box->id.'/quota', ['quota_bytes' => 2097152])->assertUnprocessable();

        $this->assertSame(1048576, (int) $box->fresh()->quota_bytes);
        $this->assertDatabaseMissing('audit_events', ['action' => 'mailbox.quota_changed']);
    }

    public function test_manual_alias_disable_survives_suspension_reinstatement_and_membership_changes(): void
    {
        [$member, $box] = $this->account();
        $this->owner();
        $this->postJson('/admin/mailboxes/'.$box->id.'/aliases', ['address' => 'disabled'])->assertCreated();
        $alias = Address::where('email', 'disabled@webmail.test')->firstOrFail();
        $this->patchJson('/admin/mailboxes/'.$box->id.'/aliases/'.$alias->id, ['active' => false])->assertOk();
        $this->patchJson('/admin/people/'.$member->id, ['active' => false])->assertOk();
        $this->patchJson('/admin/people/'.$member->id, ['active' => true])->assertOk();
        $this->assertFalse($alias->fresh()->active);
        $this->assertFalse($alias->fresh()->enabled);
        $this->assertTrue(Address::where('email', $member->email)->firstOrFail()->active);
        $this->putJson('/admin/mailboxes/'.$box->id.'/members/'.$member->id, ['present' => false, 'can_send' => false])->assertOk();
        $this->assertFalse(Address::where('email', $member->email)->firstOrFail()->active);
        $this->putJson('/admin/mailboxes/'.$box->id.'/members/'.$member->id, ['present' => true, 'can_send' => true])->assertOk();
        $this->assertFalse($alias->fresh()->active);
        $this->assertTrue(Address::where('email', $member->email)->firstOrFail()->active);
    }

    public function test_shared_mailbox_creation_is_bounded_and_assigns_an_explicit_member_without_admin_membership(): void
    {
        $member = User::factory()->create();
        $owner = $this->owner();
        $payload = ['name' => 'Fictional support', 'address' => 'support', 'user_id' => $member->id, 'can_send' => false, 'quota_bytes' => 1048576];
        $this->postJson('/admin/mailboxes', [...$payload, 'user_id' => $owner->id])->assertUnprocessable();
        $this->postJson('/admin/mailboxes', $payload)->assertCreated();
        $box = Mailbox::where('email', 'support@webmail.test')->firstOrFail();
        $this->assertTrue($member->can('view', $box));
        $this->assertFalse($member->can('send', $box));
        $this->assertFalse($owner->can('view', $box));
        for ($i = 1; $i < 10; $i++) {
            Mailbox::create(['name' => 'Bounded', 'email' => "box$i@webmail.test", 'quota_bytes' => 1048576]);
        }
        $this->postJson('/admin/mailboxes', [...$payload, 'address' => 'overflow'])->assertUnprocessable();
        $this->assertDatabaseCount('mailboxes', 10);
    }

    public function test_session_revocation_and_password_reset_preserve_mail_and_require_the_admin_current_password(): void
    {
        [$member, $box] = $this->account();
        [$draft, $message] = $this->retainedMail($member, $box);
        $member->forceFill(['two_factor_secret' => encrypt('fictional-retained-secret'), 'two_factor_confirmed_at' => now()])->save();
        $oldTwoFactorSecret = $member->two_factor_secret;
        $oldToken = $member->remember_token;
        DB::table('sessions')->insert(['id' => 'fictional-member-session', 'user_id' => $member->id, 'payload' => '', 'last_activity' => time()]);
        $owner = $this->owner();
        $this->postJson('/admin/people/'.$owner->id.'/revoke-sessions')->assertUnprocessable();
        $this->postJson('/admin/people/'.$member->id.'/revoke-sessions')->assertOk();
        $this->assertDatabaseMissing('sessions', ['user_id' => $member->id]);
        $this->assertNotSame($oldToken, $member->fresh()->remember_token);
        $data = ['current_password' => 'wrong-password', 'password' => 'A-new-member-password!72', 'password_confirmation' => 'A-new-member-password!72'];
        $this->putJson('/admin/people/'.$member->id.'/password', $data)->assertUnprocessable()->assertJsonValidationErrors('current_password');
        $this->assertTrue(Hash::check('password', $member->fresh()->password));
        $this->putJson('/admin/people/'.$owner->id.'/password', [...$data, 'current_password' => 'password'])->assertUnprocessable();
        $this->putJson('/admin/people/'.$member->id.'/password', [...$data, 'current_password' => 'password'])->assertOk();
        $this->assertTrue(Hash::check('A-new-member-password!72', $member->fresh()->password));
        $this->assertSame($oldTwoFactorSecret, $member->fresh()->two_factor_secret);
        $this->assertNotNull($member->fresh()->two_factor_confirmed_at);
        $this->assertSame('<p>Unsent private work.</p>', $draft->fresh()->body);
        $this->assertSame('Fictional original MIME', $message->fresh()->raw_mime);
        $this->assertDatabaseHas('audit_events', ['action' => 'user.password_reset', 'target' => (string) $member->id]);
        $this->assertStringNotContainsString('A-new-member-password', DB::table('audit_events')->get()->toJson());
    }

    private function owner(): User
    {
        $owner = User::factory()->withTwoFactor()->create(['role' => 'owner']);
        $this->actingAs($owner)->withSession(['webmail.mfa_user' => $owner->id]);

        return $owner;
    }

    private function account(): array
    {
        $member = User::factory()->create(['email' => 'member'.User::count().'@webmail.test']);
        $box = Mailbox::create(['name' => 'Fictional mailbox', 'email' => $member->email]);
        $box->users()->attach($member, ['can_send' => true]);
        Address::create(['mailbox_id' => $box->id, 'email' => $member->email, 'active' => true]);

        return [$member, $box];
    }

    private function retainedMail(User $member, Mailbox $box): array
    {
        $draft = Draft::create(['user_id' => $member->id, 'mailbox_id' => $box->id, 'from_email' => $member->email, 'to' => [], 'cc' => [], 'bcc' => [], 'body' => '<p>Unsent private work.</p>']);
        $message = Message::create(['mailbox_id' => $box->id, 'thread_id' => 'retained', 'from_email' => 'sender@example.net', 'to' => [], 'cc' => [], 'body_text' => 'Retain', 'raw_mime' => 'Fictional original MIME']);

        return [$draft, $message];
    }
}
