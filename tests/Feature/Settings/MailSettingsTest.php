<?php

namespace Tests\Feature\Settings;

use App\Models\Address;
use App\Models\Mailbox;
use App\Models\User;
use App\Services\StorageBudget;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class MailSettingsTest extends TestCase
{
    use RefreshDatabase;

    private User $member;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutVite();
        $this->member = User::factory()->create();
        $this->actingAs($this->member);
    }

    public function test_preference_updates_merge_current_database_values_and_accept_supported_mail_choices(): void
    {
        $this->member->forceFill(['preferences' => ['theme' => 'dark', 'swipe_left' => 'read']])->save();
        DB::table('users')->where('id', $this->member->id)->update([
            'preferences' => json_encode(['theme' => 'system', 'swipe_left' => 'read']),
        ]);

        $this->putJson('/preferences', [
            'density' => 'default', 'pane' => 'bottom', 'page_size' => 100,
            'inbox_order' => 'important', 'default_reply' => 'reply-all',
            'snippets' => false, 'hover_actions' => false, 'spellcheck' => false,
            'keyboard_shortcuts' => true, 'unread_badge' => true, 'auto_advance' => 'next',
            'role' => 'owner',
        ])->assertOk()->assertJsonPath('theme', 'system')
            ->assertJsonPath('swipe_left', 'read')
            ->assertJsonPath('pane', 'bottom')
            ->assertJsonPath('page_size', 100)
            ->assertJsonPath('snippets', false);

        $stored = $this->member->fresh();
        $this->assertSame('member', $stored->role);
        $this->assertArrayNotHasKey('role', $stored->preferences);
        $this->assertSame('reply-all', $stored->preferences['default_reply']);
    }

    public function test_invalid_preferences_do_not_change_saved_values(): void
    {
        $this->member->forceFill(['preferences' => ['theme' => 'dark']])->save();
        $this->putJson('/preferences', [
            'theme' => 'light', 'page_size' => 500, 'inbox_order' => 'sender',
            'auto_advance' => 'anywhere', 'snippets' => 'sometimes',
        ])->assertUnprocessable()->assertJsonValidationErrors(['page_size', 'inbox_order', 'auto_advance', 'snippets']);

        $this->assertSame(['theme' => 'dark'], $this->member->fresh()->preferences);
    }

    public function test_preference_revisions_advance_from_the_locked_row_and_cannot_be_set_by_a_client(): void
    {
        $this->member->forceFill(['preferences' => ['theme' => 'dark', '_revision' => 4]])->save();
        DB::table('users')->where('id', $this->member->id)->update([
            'preferences' => json_encode(['theme' => 'dark', '_revision' => 7]),
        ]);

        $this->putJson('/preferences', ['pane' => 'bottom', '_revision' => 9999])
            ->assertOk()->assertJsonPath('_revision', 8)->assertJsonPath('theme', 'dark');
        $this->putJson('/preferences', ['density' => 'compact'])
            ->assertOk()->assertJsonPath('_revision', 9)->assertJsonPath('pane', 'bottom');
    }

    public function test_mail_settings_renders_private_writing_data_and_is_not_cacheable(): void
    {
        $this->postJson('/settings/contacts', ['name' => 'Fictional editor', 'email' => 'editor@example.test'])->assertCreated();
        $this->postJson('/settings/templates', ['name' => 'Fictional reply', 'subject' => 'A reply', 'body' => 'Thank you.'])->assertCreated();
        $this->putJson('/settings/signature', ['body' => 'Fictional studio'])->assertOk();

        $response = $this->get('/settings/mail')->assertOk()->assertInertia(fn (Assert $page) => $page
            ->component('settings/mail')->has('contacts', 1)->has('templates', 1)
            ->where('signature.body', 'Fictional studio')
            ->missing('contacts.0.user_id')->missing('templates.0.user_id'));
        $this->assertStringContainsString('no-store', $response->headers->get('Cache-Control'));
    }

    public function test_contacts_can_be_created_edited_found_and_deleted_without_access_to_other_users(): void
    {
        $id = $this->postJson('/settings/contacts', ['name' => 'Fictional editor', 'email' => 'EDITOR@example.test'])
            ->assertCreated()->assertJsonPath('contact.email', 'editor@example.test')->json('contact.id');
        $this->putJson('/settings/contacts/'.$id, ['name' => 'Fictional reviewer', 'email' => 'reviewer@example.test'])
            ->assertOk()->assertJsonPath('contact.name', 'Fictional reviewer');
        $this->getJson('/settings/contacts?q=REVIEW')->assertOk()->assertJsonCount(1, 'contacts')->assertJsonPath('contacts.0.id', $id);
        $this->getJson('/settings/contacts?q=unmatched')->assertOk()->assertJsonCount(0, 'contacts');

        $other = User::factory()->create(['role' => 'owner']);
        $this->actingAs($other)->getJson('/settings/contacts')->assertOk()->assertJsonCount(0, 'contacts');
        $this->putJson('/settings/contacts/'.$id, ['name' => 'Unexpected', 'email' => 'unexpected@example.test'])->assertNotFound();
        $this->deleteJson('/settings/contacts/'.$id)->assertNotFound();

        $this->actingAs($this->member)->deleteJson('/settings/contacts/'.$id)->assertOk();
        $this->getJson('/settings/contacts')->assertJsonCount(0, 'contacts');
    }

    public function test_contacts_validate_addresses_deduplicate_within_an_account_and_bound_lookup_results(): void
    {
        $this->postJson('/settings/contacts', ['name' => 'Fictional editor', 'email' => 'not an address'])
            ->assertUnprocessable()->assertJsonValidationErrors('email');
        $this->postJson('/settings/contacts', ['name' => 'Fictional editor', 'email' => 'editor@example.test'])->assertCreated();
        $this->postJson('/settings/contacts', ['name' => 'Duplicate', 'email' => 'EDITOR@example.test'])
            ->assertUnprocessable()->assertJsonValidationErrors('email');
        $rows = [];
        for ($i = 0; $i < 35; $i++) {
            $rows[] = ['user_id' => $this->member->id, 'name' => 'Fictional contact '.$i, 'email' => 'contact'.$i.'@example.test', 'created_at' => now(), 'updated_at' => now()];
        }
        DB::table('contacts')->insert($rows);
        $this->getJson('/settings/contacts?q=contact')->assertOk()->assertJsonCount(30, 'contacts');
        $this->getJson('/settings/contacts?q='.str_repeat('a', 121))->assertUnprocessable();
    }

    public function test_contact_limit_prevents_additions_but_allows_edits_to_existing_contacts(): void
    {
        $id = $this->postJson('/settings/contacts', ['name' => 'Fictional editor', 'email' => 'editor@example.test'])->assertCreated()->json('contact.id');
        $rows = [];
        for ($i = 0; $i < 499; $i++) {
            $rows[] = ['user_id' => $this->member->id, 'name' => 'Fictional contact '.$i, 'email' => 'contact'.$i.'@example.test', 'created_at' => now(), 'updated_at' => now()];
        }
        DB::table('contacts')->insert($rows);
        $this->postJson('/settings/contacts', ['name' => 'One too many', 'email' => 'overflow@example.test'])->assertUnprocessable();
        $this->putJson('/settings/contacts/'.$id, ['name' => 'Updated fictional editor', 'email' => 'editor@example.test'])->assertOk();
        $this->assertDatabaseCount('contacts', 500);
    }

    public function test_templates_are_encrypted_private_and_editable_without_executing_their_text(): void
    {
        $id = $this->postJson('/settings/templates', [
            'name' => 'Fictional greeting', 'subject' => 'A private greeting',
            'body' => '<script>Plain template text</script>',
        ])->assertCreated()->assertJsonPath('template.body', '<script>Plain template text</script>')->json('template.id');
        $raw = DB::table('mail_templates')->where('id', $id)->first();
        $this->assertStringNotContainsString('Fictional greeting', $raw->name);
        $this->assertStringNotContainsString('A private greeting', $raw->subject);
        $this->assertStringNotContainsString('Plain template text', $raw->body);
        $this->putJson('/settings/templates/'.$id, ['name' => 'Revised greeting', 'subject' => '', 'body' => "Hello,\nThank you."])
            ->assertOk()->assertJsonPath('template.subject', '')->assertJsonPath('template.body', "Hello,\nThank you.");

        $other = User::factory()->create(['role' => 'owner']);
        $this->actingAs($other)->getJson('/settings/templates')->assertOk()->assertJsonCount(0, 'templates');
        $this->putJson('/settings/templates/'.$id, ['name' => 'Unexpected', 'body' => 'Unexpected'])->assertNotFound();
        $this->deleteJson('/settings/templates/'.$id)->assertNotFound();
        $this->actingAs($this->member)->deleteJson('/settings/templates/'.$id)->assertOk();
        $this->getJson('/settings/templates')->assertJsonCount(0, 'templates');
    }

    public function test_writing_size_limits_preserve_the_saved_template_and_signature_on_error(): void
    {
        $id = $this->postJson('/settings/templates', ['name' => 'Fictional template', 'subject' => 'Original subject', 'body' => 'Keep this text.'])
            ->assertCreated()->json('template.id');
        $this->putJson('/settings/templates/'.$id, ['name' => 'Too long', 'subject' => str_repeat('a', 256), 'body' => str_repeat('b', 20001)])
            ->assertUnprocessable()->assertJsonValidationErrors(['subject', 'body']);
        $this->getJson('/settings/templates')->assertJsonPath('templates.0.body', 'Keep this text.');
        $this->putJson('/settings/signature', ['body' => 'Keep this signature.'])->assertOk();
        $this->putJson('/settings/signature', ['body' => str_repeat('s', 4001)])->assertUnprocessable();
        $this->getJson('/settings/signature')->assertJsonPath('signature.body', 'Keep this signature.');
    }

    public function test_template_limit_does_not_delete_or_replace_existing_templates(): void
    {
        for ($i = 0; $i < 50; $i++) {
            $this->postJson('/settings/templates', ['name' => 'Fictional template '.$i, 'subject' => '', 'body' => 'Retained text.'])->assertCreated();
        }
        $this->postJson('/settings/templates', ['name' => 'One too many', 'subject' => '', 'body' => 'Rejected text.'])->assertUnprocessable();
        $this->getJson('/settings/templates')->assertOk()->assertJsonCount(50, 'templates');
    }

    public function test_signature_is_encrypted_user_owned_clearable_and_included_in_composer_data(): void
    {
        $this->putJson('/settings/signature', ['body' => "Fictional writer\nStudio"])->assertOk();
        $raw = DB::table('mail_signatures')->where('user_id', $this->member->id)->value('body');
        $this->assertStringNotContainsString('Fictional writer', $raw);
        $this->getJson('/mail-writing')->assertOk()->assertJsonPath('signature.body', "Fictional writer\nStudio")
            ->assertJsonCount(0, 'templates')->assertJsonCount(0, 'contacts');
        $other = User::factory()->create(['role' => 'owner']);
        $this->actingAs($other)->getJson('/mail-writing')->assertOk()->assertJsonPath('signature.body', '');
        $this->putJson('/settings/signature', ['body' => 'Other signature'])->assertOk();
        $this->actingAs($this->member)->getJson('/settings/signature')->assertJsonPath('signature.body', "Fictional writer\nStudio");
        $this->putJson('/settings/signature', ['body' => ''])->assertOk()->assertJsonPath('signature.body', '');
    }

    public function test_private_writing_routes_require_an_active_authenticated_account(): void
    {
        $this->member->forceFill(['active' => false])->save();
        $this->getJson('/mail-writing')->assertForbidden();
        $this->postJson('/settings/contacts', ['name' => 'Unexpected', 'email' => 'unexpected@example.test'])->assertForbidden();
        auth()->forgetGuards();
        $this->getJson('/mail-writing')->assertUnauthorized();
        $this->getJson('/settings/mail')->assertUnauthorized();
        $this->putJson('/settings/signature', ['body' => 'Unexpected'])->assertUnauthorized();
    }

    public function test_account_details_expose_only_memberships_and_enabled_authorized_senders(): void
    {
        $mine = Mailbox::create(['name' => 'Fictional studio', 'email' => 'studio@example.test']);
        $mine->users()->attach($this->member, ['can_send' => true]);
        Address::create(['mailbox_id' => $mine->id, 'email' => 'studio@example.test', 'active' => true, 'enabled' => true]);
        Address::create(['mailbox_id' => $mine->id, 'email' => 'disabled@example.test', 'active' => true, 'enabled' => false]);
        $readOnly = Mailbox::create(['name' => 'Read only', 'email' => 'readonly@example.test']);
        $readOnly->users()->attach($this->member, ['can_send' => false]);
        Address::create(['mailbox_id' => $readOnly->id, 'email' => 'readonly@example.test', 'active' => true, 'enabled' => true]);
        $other = Mailbox::create(['name' => 'Other private mailbox', 'email' => 'private@example.test']);
        Address::create(['mailbox_id' => $other->id, 'email' => 'private@example.test', 'active' => true, 'enabled' => true]);

        $this->get('/settings/mail')->assertOk()->assertInertia(fn (Assert $page) => $page
            ->has('mailAccounts', 2)->has('sendAsIdentities', 1)
            ->where('sendAsIdentities.0.email', 'studio@example.test'));
    }

    public function test_database_admission_failure_retains_saved_writing_and_still_allows_removal(): void
    {
        $id = $this->postJson('/settings/templates', ['name' => 'Fictional template', 'subject' => '', 'body' => 'Retain this body.'])
            ->assertCreated()->json('template.id');
        $this->putJson('/settings/signature', ['body' => 'Retain this signature.'])->assertOk();
        // Only the database-size observation is simulated; the admission
        // calculation, HTTP requests, encryption and writes remain real.
        $this->partialMock(StorageBudget::class)->shouldReceive('measuredBytes')->andReturn(1_000_000_000);

        $this->putJson('/settings/templates/'.$id, ['name' => 'Larger fictional template', 'subject' => '', 'body' => 'A much larger replacement body.'])
            ->assertUnprocessable();
        $this->postJson('/settings/contacts', ['name' => 'Fictional editor', 'email' => 'editor@example.test'])->assertUnprocessable();
        $this->getJson('/settings/templates')->assertJsonPath('templates.0.body', 'Retain this body.');
        $this->putJson('/settings/signature', ['body' => ''])->assertOk();
        $this->deleteJson('/settings/templates/'.$id)->assertOk();
        $this->assertDatabaseCount('contacts', 0);
        $this->assertDatabaseCount('mail_templates', 0);
    }
}
