<?php

namespace Tests\Feature;

use App\Models\Address;
use App\Models\Mailbox;
use App\Models\Message;
use App\Models\User;
use App\Providers\Mail\FakeIngressGateway;
use App\Providers\Mail\IngressGateway;
use App\Services\ImportService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Str;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class MailOrganizationTest extends TestCase
{
    use RefreshDatabase;

    private User $member;

    private Mailbox $box;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutVite();
        $this->member = User::factory()->create();
        $this->box = Mailbox::create(['name' => 'Fictional studio', 'email' => 'studio@example.test']);
        $this->box->users()->attach($this->member, ['can_send' => false]);
        Address::create(['mailbox_id' => $this->box->id, 'email' => 'studio@example.test']);
        $this->actingAs($this->member);
    }

    private function message(array $changes = []): Message
    {
        return Message::create([
            'mailbox_id' => $this->box->id, 'thread_id' => 'fictional-thread',
            'from_email' => 'sender@example.test', 'to' => ['studio@example.test'], 'cc' => [],
            'subject' => 'Fictional note', 'body_text' => 'A fictional note.', 'raw_mime' => 'Retained original.',
            ...$changes,
        ]);
    }

    private function action(Message $message, string $action, array $extra = []): string
    {
        return $this->postJson('/mail/'.$this->box->id.'/actions', [
            'ids' => [$message->id], 'action' => $action, ...$extra,
        ])->assertOk()->json('operation');
    }

    private function label(string $name = 'Projects'): int
    {
        $response = $this->postJson('/mail/'.$this->box->id.'/labels', ['name' => $name, 'color' => '#2563eb'])->assertCreated();

        return collect($response->json('labels'))->firstWhere('name', $name)['id'];
    }

    public function test_importance_and_snooze_are_shared_durable_and_undoable(): void
    {
        $message = $this->message();
        $operation = $this->action($message, 'important');
        $this->get('/mail/'.$this->box->id.'?folder=important')->assertInertia(fn (Assert $page) => $page
            ->has('messages', 1)->where('messages.0.important', true)->where('counts.important', 1));
        $this->postJson('/operations/'.$operation.'/undo')->assertOk();
        $this->assertFalse($message->fresh()->important);

        $until = now()->addHours(2)->startOfSecond();
        $operation = $this->action($message, 'snooze', ['snoozed_until' => $until->toIso8601String()]);
        $this->get('/mail/'.$this->box->id)->assertInertia(fn (Assert $page) => $page->has('messages', 0));
        $this->get('/mail/'.$this->box->id.'?folder=snoozed')->assertInertia(fn (Assert $page) => $page
            ->has('messages', 1)->where('counts.snoozed', 1));
        $this->assertTrue($message->fresh()->snoozed_until->equalTo($until));
        $this->travel(3)->hours();
        $this->get('/mail/'.$this->box->id)->assertInertia(fn (Assert $page) => $page
            ->has('messages', 1)->where('messages.0.snoozed_until', null));
        $this->postJson('/operations/'.$operation.'/undo')->assertConflict();
        $this->assertSame('inbox', $message->fresh()->folder);
    }

    public function test_labels_are_additive_and_catalog_edits_cannot_be_reverted_by_stale_undo(): void
    {
        $message = $this->message(['labels' => ['Legacy']]);
        $this->getJson('/mail/'.$this->box->id.'/organization')->assertOk()->assertJsonPath('labels.0.name', 'Legacy');
        $projects = $this->label();
        $this->action($message, 'label', ['label_id' => $projects]);
        $this->assertSame(['Legacy', 'Projects'], $message->fresh()->labels);
        $operation = $this->action($message, 'remove-label', ['label_id' => $projects]);
        $this->patchJson('/mail/'.$this->box->id.'/labels/'.$projects, ['name' => 'Design', 'color' => '#059669'])->assertOk();
        $this->postJson('/operations/'.$operation.'/undo')->assertConflict();
        $this->assertSame(['Legacy'], $message->fresh()->labels);

        $this->action($message, 'label', ['label_id' => $projects]);
        $this->get('/mail/'.$this->box->id.'?label='.$projects)->assertInertia(fn (Assert $page) => $page
            ->has('messages', 1)->where('filters.label', $projects)->where('labels.0.name', 'Design'));
        $operation = $this->action($message, 'remove-label', ['label_id' => $projects]);
        $this->deleteJson('/mail/'.$this->box->id.'/labels/'.$projects)->assertOk();
        $this->label('Design');
        $this->postJson('/operations/'.$operation.'/undo')->assertConflict();
        $this->assertSame(['Legacy'], $message->fresh()->labels);
        $this->assertSame('Retained original.', $message->fresh()->raw_mime);
    }

    public function test_rename_and_delete_update_assigned_labels_without_removing_mail(): void
    {
        $projects = $this->label();
        $message = $this->message(['labels' => ['Projects']]);
        $operation = $this->action($message, 'archive');
        $this->patchJson('/mail/'.$this->box->id.'/labels/'.$projects, ['name' => 'Work'])->assertOk();
        $this->assertSame(['Work'], $message->fresh()->labels);
        $this->postJson('/operations/'.$operation.'/undo')->assertConflict();
        $this->deleteJson('/mail/'.$this->box->id.'/labels/'.$projects)->assertOk();
        $this->assertSame([], $message->fresh()->labels);
        $this->assertSame('archive', $message->fresh()->folder);
        $this->assertDatabaseCount('messages', 1);
    }

    public function test_organization_is_mailbox_scoped_even_for_an_administrator(): void
    {
        $other = Mailbox::create(['name' => 'Other', 'email' => 'other@example.test']);
        $this->member->forceFill(['role' => 'admin'])->save();
        $projects = $this->label();
        $message = $this->message(['mailbox_id' => $other->id]);
        $this->getJson('/mail/'.$other->id.'/organization')->assertForbidden();
        $this->postJson('/mail/'.$other->id.'/labels', ['name' => 'Secret'])->assertForbidden();
        $this->get('/settings/organization/'.$other->id)->assertForbidden();
        $this->postJson('/mail/'.$this->box->id.'/actions', ['ids' => [$message->id], 'action' => 'label', 'label_id' => $projects])->assertForbidden();
        $this->assertNull($message->fresh()->labels);
    }

    public function test_rules_apply_to_import_before_ack_and_blocked_mail_is_retained_in_spam(): void
    {
        $label = $this->label();
        $payload = ['name' => 'Studio updates', 'enabled' => true,
            'predicates' => ['sender' => 'sender@example.test', 'recipient' => 'studio@example.test', 'subject' => 'Update'],
            'actions' => ['archive' => true, 'read' => true, 'star' => true, 'important' => true, 'category' => 'updates', 'label_id' => $label]];
        $this->postJson('/mail/'.$this->box->id.'/rules', $payload)->assertCreated();
        $raw = "From: Sender <sender@example.test>\r\nTo: studio@example.test\r\nSubject: An UPDATE\r\n\r\nFictional content.";
        $gateway = new FakeIngressGateway;
        $gateway->items = [['id' => 'rule-receipt', 'recipient' => 'studio@example.test', 'raw' => base64_encode($raw), 'checksum' => hash('sha256', $raw)]];
        $this->app->instance(IngressGateway::class, $gateway);
        $this->assertSame(['imported' => 1, 'held' => 0], app(ImportService::class)->sync());
        $message = Message::sole();
        $this->assertSame('archive', $message->folder);
        $this->assertTrue($message->is_read);
        $this->assertTrue($message->starred);
        $this->assertTrue($message->important);
        $this->assertSame('updates', $message->category);
        $this->assertSame(['Projects'], $message->labels);
        $this->assertSame($raw, $message->raw_mime);
        $this->assertSame(['rule-receipt'], $gateway->acknowledged);

        $block = $this->postJson('/mail/'.$this->box->id.'/blocked-senders', ['email' => 'SENDER@example.test'])->assertCreated()->json('blocked_senders.0.id');
        $gateway->items[0]['id'] = 'blocked-receipt';
        $this->assertSame(['imported' => 1, 'held' => 0], app(ImportService::class)->sync());
        $blocked = Message::latest('id')->first();
        $this->assertSame('spam', $blocked->folder);
        $this->assertSame($raw, $blocked->raw_mime);
        $this->assertDatabaseCount('ingress_receipts', 2);
        $this->deleteJson('/mail/'.$this->box->id.'/blocked-senders/'.$block)->assertOk();
        $this->assertSame('spam', $blocked->fresh()->folder);
    }

    public function test_rules_reject_empty_predicates_and_foreign_labels_and_support_updates(): void
    {
        $this->postJson('/mail/'.$this->box->id.'/rules', ['name' => 'Too broad', 'predicates' => [], 'actions' => ['read' => true]])
            ->assertUnprocessable()->assertJsonValidationErrors('predicates');
        $other = Mailbox::create(['name' => 'Other', 'email' => 'other@example.test']);
        $this->box->users()->attach(User::factory()->create());
        $other->users()->attach($this->member);
        $foreign = $this->postJson('/mail/'.$other->id.'/labels', ['name' => 'Other label'])->assertCreated()->json('labels.0.id');
        $payload = ['name' => 'Fictional rule', 'predicates' => ['sender' => 'sender@example.test'], 'actions' => ['label_id' => $foreign]];
        $this->postJson('/mail/'.$this->box->id.'/rules', $payload)->assertUnprocessable()->assertJsonValidationErrors('actions.label_id');
        $payload['actions'] = ['category' => 'forums'];
        $rule = $this->postJson('/mail/'.$this->box->id.'/rules', $payload)->assertCreated()->json('rules.0.id');
        $this->patchJson('/mail/'.$this->box->id.'/rules/'.$rule, [...$payload, 'enabled' => false])->assertOk()->assertJsonPath('rules.0.enabled', false);
        $this->deleteJson('/mail/'.$this->box->id.'/rules/'.$rule)->assertOk()->assertJsonCount(0, 'rules');
    }

    public function test_bulk_actions_allow_one_hundred_but_reject_one_hundred_and_one_and_keep_undo_atomic(): void
    {
        $messages = collect(range(1, 101))->map(fn () => $this->message());
        $this->postJson('/mail/'.$this->box->id.'/actions', ['ids' => $messages->pluck('id'), 'action' => 'important'])->assertUnprocessable();
        $operation = $this->postJson('/mail/'.$this->box->id.'/actions', ['ids' => $messages->take(100)->pluck('id'), 'action' => 'important'])->assertOk()->json('operation');
        $this->action($messages[99], 'star');
        $this->postJson('/operations/'.$operation.'/undo')->assertConflict();
        $this->assertSame(100, Message::where('important', true)->count());
    }

    public function test_categories_and_preferences_control_scoped_list_results(): void
    {
        $this->member->forceFill(['preferences' => ['page_size' => 10, 'inbox_order' => 'important']])->save();
        for ($i = 0; $i < 12; $i++) {
            $this->message(['subject' => 'Fictional '.$i]);
        }
        $priority = $this->message(['created_at' => now()->subDay()]);
        $this->action($priority, 'important');
        $this->action($priority, 'category', ['category' => 'social']);
        $this->get('/mail/'.$this->box->id)->assertInertia(fn (Assert $page) => $page
            ->has('messages', 10)->where('messages.0.id', $priority->id)->where('pagination.total', 13));
        $this->get('/mail/'.$this->box->id.'?category=social')->assertInertia(fn (Assert $page) => $page
            ->has('messages', 1)->where('filters.category', 'social'));
        $this->get('/mail/'.$this->box->id.'?folder=all')->assertInertia(fn (Assert $page) => $page->where('counts.all', 13));
    }

    public function test_migration_preserves_legacy_labels_and_prevents_old_undo_from_reviving_deleted_catalog_entries(): void
    {
        $migration = require database_path('migrations/2026_11_01_000010_add_mail_organization.php');
        $migration->down();
        $message = $this->message(['labels' => ['Legacy', 'Review']]);
        $before = $message->fresh()->only(['id', 'mailbox_id', 'folder', 'is_read', 'starred', 'labels', 'version']);
        $operation = (string) Str::uuid();
        DB::table('mail_operations')->insert(['id' => $operation, 'user_id' => $this->member->id, 'before' => json_encode([$before]), 'created_at' => now(), 'updated_at' => now()]);
        $message->update(['labels' => ['Legacy'], 'version' => 2]);
        // Another current assignment ensures both legacy names exist at migration time.
        $other = $this->message(['labels' => ['Review']]);
        $migration->up();
        $this->assertSame(['Legacy'], $message->fresh()->labels);
        $this->assertSame(['Review'], $other->fresh()->labels);
        $review = $this->getJson('/mail/'.$this->box->id.'/organization')->assertOk()->json('labels.1.id');
        $this->deleteJson('/mail/'.$this->box->id.'/labels/'.$review)->assertOk();
        $this->label('Review');
        $this->postJson('/operations/'.$operation.'/undo')->assertConflict();
        $this->assertSame(['Legacy'], $message->fresh()->labels);
    }

    public function test_snooze_undo_restores_the_original_folder_and_moving_mail_cancels_snooze(): void
    {
        $message = $this->message(['folder' => 'archive']);
        $operation = $this->action($message, 'snooze', ['snoozed_until' => now()->addHour()->toIso8601String()]);
        $this->postJson('/operations/'.$operation.'/undo')->assertOk();
        $this->assertSame('archive', $message->fresh()->folder);
        $this->assertNull($message->fresh()->snoozed_until);
        $this->action($message, 'snooze', ['snoozed_until' => now()->addHour()->toIso8601String()]);
        $this->action($message, 'trash');
        $this->travel(2)->hours();
        $this->get('/mail/'.$this->box->id)->assertOk();
        $this->assertSame('trash', $message->fresh()->folder);
        $this->assertNull($message->fresh()->snoozed_until);
    }

    public function test_snooze_requires_a_bounded_future_time_and_never_changes_sent_mail(): void
    {
        $message = $this->message(['folder' => 'sent']);
        foreach ([now()->subMinute(), now()->addYears(2)] as $time) {
            $this->postJson('/mail/'.$this->box->id.'/actions', ['ids' => [$message->id], 'action' => 'snooze', 'snoozed_until' => $time->toIso8601String()])
                ->assertUnprocessable()->assertJsonValidationErrors('snoozed_until');
        }
        $this->postJson('/mail/'.$this->box->id.'/actions', ['ids' => [$message->id], 'action' => 'snooze', 'snoozed_until' => now()->addHour()->toIso8601String()])->assertUnprocessable();
        $this->assertSame('sent', $message->fresh()->folder);
        $this->assertDatabaseCount('mail_operations', 0);
    }

    public function test_a_nonmatching_or_disabled_rule_leaves_import_in_primary_inbox_and_due_snoozes_wake(): void
    {
        $snoozed = $this->message(['folder' => 'snoozed', 'snoozed_until' => now()->subMinute()]);
        $this->postJson('/mail/'.$this->box->id.'/rules', ['name' => 'Unrelated subject', 'predicates' => ['sender' => 'sender@example.test', 'subject' => 'Unrelated'], 'actions' => ['archive' => true]])->assertCreated();
        $this->postJson('/mail/'.$this->box->id.'/rules', ['name' => 'Disabled', 'enabled' => false, 'predicates' => ['sender' => 'sender@example.test'], 'actions' => ['category' => 'promotions']])->assertCreated();
        $raw = "From: sender@example.test\r\nTo: studio@example.test\r\nSubject: Fictional note\r\n\r\nFictional content.";
        $gateway = new FakeIngressGateway;
        $gateway->items = [['id' => 'unmatched-receipt', 'recipient' => 'studio@example.test', 'raw' => base64_encode($raw), 'checksum' => hash('sha256', $raw)]];
        $this->app->instance(IngressGateway::class, $gateway);
        $this->assertSame(['imported' => 1, 'held' => 0], app(ImportService::class)->sync());
        $message = Message::latest('id')->first();
        $this->assertSame('inbox', $message->folder);
        $this->assertSame('primary', $message->category);
        $this->assertSame('inbox', $snoozed->fresh()->folder);
        $this->assertNull($snoozed->fresh()->snoozed_until);
    }

    public function test_catalog_management_rejects_foreign_ids_and_invalid_actions(): void
    {
        $other = Mailbox::create(['name' => 'Other', 'email' => 'other@example.test']);
        $other->users()->attach($this->member);
        $label = $this->postJson('/mail/'.$other->id.'/labels', ['name' => 'Other label'])->assertCreated()->json('labels.0.id');
        $rule = $this->postJson('/mail/'.$other->id.'/rules', ['name' => 'Other rule', 'predicates' => ['sender' => 'sender'], 'actions' => ['read' => true]])->assertCreated()->json('rules.0.id');
        $blocked = $this->postJson('/mail/'.$other->id.'/blocked-senders', ['email' => 'sender@example.test'])->assertCreated()->json('blocked_senders.0.id');
        $this->patchJson('/mail/'.$this->box->id.'/labels/'.$label, ['name' => 'Changed'])->assertNotFound();
        $this->deleteJson('/mail/'.$this->box->id.'/labels/'.$label)->assertNotFound();
        $this->patchJson('/mail/'.$this->box->id.'/rules/'.$rule, ['enabled' => false])->assertNotFound();
        $this->deleteJson('/mail/'.$this->box->id.'/rules/'.$rule)->assertNotFound();
        $this->deleteJson('/mail/'.$this->box->id.'/blocked-senders/'.$blocked)->assertNotFound();
        $message = $this->message();
        $this->postJson('/mail/'.$this->box->id.'/actions', ['ids' => [$message->id], 'action' => 'label', 'label_id' => $label])->assertUnprocessable();
        $this->get('/mail/'.$this->box->id.'?label='.$label)->assertNotFound();
        $this->postJson('/mail/'.$this->box->id.'/rules', ['name' => 'External action', 'predicates' => ['sender' => 'sender'], 'actions' => ['forward' => 'https://example.test']])->assertUnprocessable();
        $this->postJson('/mail/'.$this->box->id.'/rules', ['name' => 'Empty action', 'predicates' => ['sender' => 'sender'], 'actions' => ['read' => false]])->assertUnprocessable();
    }

    public function test_deleting_a_label_removes_its_rule_action_but_preserves_other_actions(): void
    {
        $label = $this->label();
        $this->postJson('/mail/'.$this->box->id.'/rules', ['name' => 'Label only', 'predicates' => ['subject' => 'Note'], 'actions' => ['label_id' => $label]])->assertCreated();
        $this->postJson('/mail/'.$this->box->id.'/rules', ['name' => 'Read and label', 'predicates' => ['subject' => 'Note'], 'actions' => ['read' => true, 'label_id' => $label]])->assertCreated();
        $this->deleteJson('/mail/'.$this->box->id.'/labels/'.$label)->assertOk()->assertJsonCount(1, 'rules')
            ->assertJsonPath('rules.0.name', 'Read and label')->assertJsonPath('rules.0.actions', ['read' => true]);
    }

    public function test_rule_flags_are_returned_as_booleans_for_form_encoded_clients(): void
    {
        $this->postJson('/mail/'.$this->box->id.'/rules', [
            'name' => 'Normalized flags', 'enabled' => '1', 'predicates' => ['subject' => 'Fictional'],
            'actions' => ['read' => '1', 'star' => '0'],
        ])->assertCreated()->assertJsonPath('rules.0.enabled', true)->assertJsonPath('rules.0.actions', ['read' => true]);
    }

    public function test_unsnooze_only_accepts_currently_snoozed_messages_without_partially_moving_a_selection(): void
    {
        $snoozed = $this->message(['folder' => 'snoozed', 'snoozed_until' => now()->addHour()]);
        $sent = $this->message(['folder' => 'sent']);
        $this->postJson('/mail/'.$this->box->id.'/actions', ['ids' => [$snoozed->id, $sent->id], 'action' => 'unsnooze'])->assertUnprocessable();
        $this->assertSame('sent', $sent->fresh()->folder);
        $this->assertSame('snoozed', $snoozed->fresh()->folder);
        $operation = $this->action($snoozed, 'unsnooze');
        $this->assertSame('inbox', $snoozed->fresh()->folder);
        $this->postJson('/operations/'.$operation.'/undo')->assertOk();
        $this->assertSame('snoozed', $snoozed->fresh()->folder);
    }

    public function test_message_mutation_rechecks_membership_after_its_initial_authorization(): void
    {
        $message = $this->message();
        $revoked = false;
        Gate::after(function (User $user, string $ability) use (&$revoked) {
            if ($ability === 'view' && ! $revoked) {
                $revoked = true;
                $this->box->users()->detach($user->id);
            }
        });
        $this->postJson('/mail/'.$this->box->id.'/actions', ['ids' => [$message->id], 'action' => 'important'])->assertForbidden();
        $this->assertFalse($message->fresh()->important);
        $this->assertDatabaseCount('mail_operations', 0);
    }

    public function test_catalog_mutation_rechecks_membership_after_its_initial_authorization(): void
    {
        $revoked = false;
        Gate::after(function (User $user, string $ability) use (&$revoked) {
            if ($ability === 'view' && ! $revoked) {
                $revoked = true;
                $this->box->users()->detach($user->id);
            }
        });
        $this->postJson('/mail/'.$this->box->id.'/labels', ['name' => 'Stale tab'])->assertForbidden();
        $this->assertDatabaseCount('mailbox_labels', 0);
    }

    public function test_catalog_mutation_reloads_account_status_after_its_initial_authorization(): void
    {
        $suspended = false;
        Gate::after(function (User $user, string $ability) use (&$suspended) {
            if ($ability === 'view' && ! $suspended) {
                $suspended = true;
                User::whereKey($user->id)->update(['active' => false]);
            }
        });
        $this->postJson('/mail/'.$this->box->id.'/blocked-senders', ['email' => 'sender@example.test'])->assertForbidden();
        $this->assertDatabaseCount('blocked_senders', 0);
    }

    public function test_one_hundred_row_pagination_retains_label_category_and_query_scope(): void
    {
        $this->member->forceFill(['preferences' => ['page_size' => 100]])->save();
        $label = $this->label();
        foreach (range(1, 101) as $index) {
            $this->message(['subject' => 'Fictional '.$index, 'labels' => ['Projects'], 'category' => 'updates']);
        }
        $this->message(['labels' => ['Projects'], 'category' => 'primary']);
        $query = http_build_query(['folder' => 'all', 'label' => $label, 'category' => 'updates', 'q' => 'from:sender']);
        $response = $this->get('/mail/'.$this->box->id.'?'.$query)->assertInertia(fn (Assert $page) => $page
            ->has('messages', 100)->where('pagination.total', 101));
        $next = $response->viewData('page')['props']['pagination']['next'];
        $this->get($next)->assertInertia(fn (Assert $page) => $page->has('messages', 1)
            ->where('filters.label', $label)->where('filters.category', 'updates')->where('filters.q', 'from:sender'));
    }

    public function test_undo_does_not_restore_an_expired_snooze(): void
    {
        $message = $this->message(['folder' => 'snoozed', 'snoozed_until' => now()->addHour()]);
        $operation = $this->action($message, 'archive');
        $this->travel(2)->hours();
        $this->postJson('/operations/'.$operation.'/undo')->assertOk();
        $this->assertSame('inbox', $message->fresh()->folder);
        $this->assertNull($message->fresh()->snoozed_until);
    }

    public function test_unsnooze_succeeds_when_the_selected_snooze_expired_while_the_screen_was_open(): void
    {
        $message = $this->message(['folder' => 'snoozed', 'snoozed_until' => now()->subMinute()]);
        $this->action($message, 'unsnooze');
        $this->assertSame('inbox', $message->fresh()->folder);
        $this->assertNull($message->fresh()->snoozed_until);
    }

    public function test_snooze_rejects_mixed_selections_with_any_nonreceived_folder_atomically(): void
    {
        foreach (['sent', 'trash', 'spam', 'drafts'] as $folder) {
            $inbox = $this->message();
            $unsupported = $this->message(['folder' => $folder]);
            $this->postJson('/mail/'.$this->box->id.'/actions', [
                'ids' => [$inbox->id, $unsupported->id], 'action' => 'snooze',
                'snoozed_until' => now()->addHour()->toIso8601String(),
            ])->assertUnprocessable();
            $this->assertSame('inbox', $inbox->fresh()->folder);
            $this->assertSame($folder, $unsupported->fresh()->folder);
        }
        $this->assertDatabaseCount('mail_operations', 0);
    }
}
