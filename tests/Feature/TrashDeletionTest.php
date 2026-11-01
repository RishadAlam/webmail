<?php

namespace Tests\Feature;

use App\Models\Address;
use App\Models\Draft;
use App\Models\Mailbox;
use App\Models\Message;
use App\Models\SendIntent;
use App\Models\User;
use App\Providers\Mail\FakeIngressGateway;
use App\Providers\Mail\IngressGateway;
use App\Services\EventService;
use App\Services\ImportService;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class TrashDeletionTest extends TestCase
{
    use RefreshDatabase;

    public function test_explicit_selected_trash_deletion_releases_only_its_logical_bytes_and_removes_original_content(): void
    {
        [$user, $box] = $this->account();
        $trash = $this->message($box, 'trash', 100);
        $retained = $this->message($box, 'inbox', 200);
        $box->update(['used_bytes' => 300, 'quota_bytes' => 300]);

        $this->actingAs($user)->deleteJson('/mail/'.$box->id.'/trash', ['ids' => [$trash->id], 'confirmation' => 'DELETE'])
            ->assertOk()->assertJsonPath('deleted', 1)->assertJsonPath('released_bytes', 100)->assertJsonPath('remaining_bytes', 200);

        $this->assertModelMissing($trash);
        $this->assertSame('Fictional original MIME', $retained->fresh()->raw_mime);
        $this->assertSame(200, (int) $box->fresh()->used_bytes);
        $this->get('/messages/'.$trash->id.'/original')->assertNotFound();
        $audit = DB::table('audit_events')->where('action', 'messages.permanently_deleted')->first();
        $this->assertNotNull($audit);
        $this->assertSame('mailbox:'.$box->id.';count:1', $audit->target);
        $this->assertStringNotContainsString('Fictional original MIME', json_encode($audit));
    }

    public function test_confirmation_bounds_and_every_selected_folder_are_validated_before_any_deletion(): void
    {
        [$user, $box] = $this->account();
        $trash = $this->message($box, 'trash', 100);
        $inbox = $this->message($box, 'inbox', 100);
        $box->update(['used_bytes' => 200]);
        $this->actingAs($user);
        $this->deleteJson('/mail/'.$box->id.'/trash', ['ids' => [$trash->id]])->assertUnprocessable();
        $this->deleteJson('/mail/'.$box->id.'/trash', ['ids' => [$trash->id], 'confirmation' => 'delete'])->assertUnprocessable();
        $this->deleteJson('/mail/'.$box->id.'/trash', ['ids' => array_fill(0, 31, $trash->id), 'confirmation' => 'DELETE'])->assertUnprocessable();
        $this->deleteJson('/mail/'.$box->id.'/trash', ['ids' => [$trash->id, $trash->id], 'confirmation' => 'DELETE'])->assertUnprocessable();
        $this->deleteJson('/mail/'.$box->id.'/trash', ['ids' => [$trash->id, $inbox->id], 'confirmation' => 'DELETE'])->assertConflict();
        $this->assertModelExists($trash);
        $this->assertModelExists($inbox);
        $this->assertSame(200, (int) $box->fresh()->used_bytes);
    }

    public function test_guessed_mailboxes_or_mixed_cross_mailbox_ids_cannot_delete_mail_even_for_an_admin(): void
    {
        [$user, $box] = $this->account();
        [, $foreign] = $this->account();
        $ownMail = $this->message($box, 'trash', 100);
        $foreignMail = $this->message($foreign, 'trash', 100);
        $this->actingAs($user)->deleteJson('/mail/'.$foreign->id.'/trash', ['ids' => [$foreignMail->id], 'confirmation' => 'DELETE'])->assertForbidden();
        $this->deleteJson('/mail/'.$box->id.'/trash', ['ids' => [$ownMail->id, $foreignMail->id], 'confirmation' => 'DELETE'])->assertForbidden();
        $admin = User::factory()->withTwoFactor()->create(['role' => 'owner']);
        $this->actingAs($admin)->withSession(['postroom.mfa_user' => $admin->id])
            ->deleteJson('/mail/'.$box->id.'/trash', ['ids' => [$ownMail->id], 'confirmation' => 'DELETE'])->assertForbidden();
        $this->assertModelExists($ownMail);
        $this->assertModelExists($foreignMail);
    }

    public function test_receipt_tombstones_prevent_reimport_after_explicit_deletion(): void
    {
        [$user, $box] = $this->account();
        $gateway = new FakeIngressGateway;
        $raw = "From: sender@example.net\r\nTo: {$user->email}\r\nSubject: Accepted before deletion\r\n\r\nFictional retained receipt.";
        $checksum = hash('sha256', $raw);
        $gateway->items = [['id' => 'accepted-to-delete', 'recipient' => $user->email, 'raw' => base64_encode($raw), 'checksum' => $checksum]];
        $this->app->instance(IngressGateway::class, $gateway);
        $this->assertSame(1, app(ImportService::class)->sync()['imported']);
        $message = Message::firstOrFail();
        $message->update(['folder' => 'trash']);

        $this->actingAs($user)->deleteJson('/mail/'.$box->id.'/trash', ['ids' => [$message->id], 'confirmation' => 'DELETE'])->assertOk();

        $this->assertDatabaseHas('ingress_receipts', ['id' => 'accepted-to-delete', 'checksum' => $checksum, 'message_id' => null]);
        $this->assertSame(1, app(ImportService::class)->sync()['imported']);
        $this->assertDatabaseCount('messages', 0);
        $this->assertSame(0, (int) $box->fresh()->used_bytes);
        $this->assertSame(['accepted-to-delete', 'accepted-to-delete'], $gateway->acknowledged);
    }

    public function test_deleting_sent_trash_keeps_delivery_quota_evidence_and_later_callbacks_do_not_recreate_content(): void
    {
        [$user, $box] = $this->account();
        $intent = SendIntent::create(['draft_id' => fake()->uuid(), 'user_id' => $user->id, 'mailbox_id' => $box->id,
            'payload' => ['to' => ['recipient@example.net']], 'recipients' => 1, 'status' => 'accepted', 'provider_id' => 'retained-provider-id']);
        DB::table('quota_ledger')->insert(['intent_id' => $intent->id, 'recipients' => 1, 'created_at' => now()]);
        $message = $this->message($box, 'trash', 100);
        $message->update(['send_intent_id' => $intent->id]);
        $box->update(['used_bytes' => 100]);

        $this->actingAs($user)->deleteJson('/mail/'.$box->id.'/trash', ['ids' => [$message->id], 'confirmation' => 'DELETE'])->assertOk();

        $event = json_encode(['type' => 'email.delivered', 'data' => ['email_id' => $intent->provider_id, 'to' => ['recipient@example.net']]]);
        app(EventService::class)->import(['id' => 'after-message-removal', 'raw' => base64_encode($event), 'checksum' => hash('sha256', $event)]);
        $this->assertSame('delivered', $intent->fresh()->status);
        $this->assertDatabaseHas('quota_ledger', ['intent_id' => $intent->id, 'recipients' => 1]);
        $this->assertDatabaseCount('messages', 0);
    }

    public function test_database_failure_rolls_back_the_entire_selected_batch_and_counter(): void
    {
        [$user, $box] = $this->account();
        $first = $this->message($box, 'trash', 100);
        $protected = $this->message($box, 'trash', 200);
        $box->update(['used_bytes' => 300]);
        Schema::create('test_retention_guard', function (Blueprint $table) {
            $table->foreignId('message_id')->constrained('messages');
        });
        DB::table('test_retention_guard')->insert(['message_id' => $protected->id]);

        $this->actingAs($user)->deleteJson('/mail/'.$box->id.'/trash', ['ids' => [$first->id, $protected->id], 'confirmation' => 'DELETE'])->assertStatus(503);

        $this->assertModelExists($first);
        $this->assertModelExists($protected);
        $this->assertSame(300, (int) $box->fresh()->used_bytes);
        $this->assertDatabaseMissing('audit_events', ['action' => 'messages.permanently_deleted']);
        Schema::dropIfExists('test_retention_guard');
    }

    public function test_storage_counter_is_reconciled_to_retained_messages_without_underflow(): void
    {
        [$user, $box] = $this->account();
        $trash = $this->message($box, 'trash', 100);
        $this->message($box, 'inbox', 200);
        $box->update(['used_bytes' => 1]);

        $this->actingAs($user)->deleteJson('/mail/'.$box->id.'/trash', ['ids' => [$trash->id], 'confirmation' => 'DELETE'])->assertOk();

        $this->assertSame(200, (int) $box->fresh()->used_bytes);
    }

    public function test_purging_trash_preserves_saved_draft_storage_until_the_draft_is_discarded(): void
    {
        [$user, $box] = $this->account();
        $trash = $this->message($box, 'trash', 100);
        $box->update(['used_bytes' => 100]);
        $draft = $this->savedDraft($user, $box);
        $draftBytes = (int) $draft->logical_bytes;
        $this->assertGreaterThan(0, $draftBytes);
        $this->assertSame(100 + $draftBytes, (int) $box->fresh()->used_bytes);

        $this->deleteJson('/mail/'.$box->id.'/trash', ['ids' => [$trash->id], 'confirmation' => 'DELETE'])
            ->assertOk()->assertJsonPath('released_bytes', 100)->assertJsonPath('remaining_bytes', $draftBytes);

        $this->assertSame($draftBytes, (int) $box->fresh()->used_bytes);
        $this->assertSame($draft->body, $draft->fresh()->body);
        $this->deleteJson('/drafts/'.$draft->id)->assertOk();
        $this->assertModelMissing($draft);
        $this->assertSame(0, (int) $box->fresh()->used_bytes);
    }

    public static function retainedDeliveryOutcomes(): array
    {
        return [['accepted'], ['failed'], ['uncertain']];
    }

    #[DataProvider('retainedDeliveryOutcomes')]
    public function test_purging_sent_trash_keeps_storage_charged_for_the_retained_delivery_draft(string $outcome): void
    {
        config(['postroom.provider' => 'mock', 'postroom.mock_outcome' => $outcome === 'uncertain' ? 'timeout' : $outcome]);
        [$user, $box] = $this->account();
        $draft = $this->savedDraft($user, $box);
        $draftBytes = (int) $draft->logical_bytes;
        $this->postJson('/drafts/'.$draft->id.'/send', ['version' => $draft->version])
            ->assertOk()->assertJsonPath('status', $outcome);
        $intent = SendIntent::where('draft_id', $draft->id)->firstOrFail();
        $sent = Message::where('send_intent_id', $intent->id)->firstOrFail();
        $this->assertSame($draftBytes + $sent->logical_bytes, (int) $box->fresh()->used_bytes);
        $this->postJson('/mail/'.$box->id.'/actions', ['ids' => [$sent->id], 'action' => 'trash'])->assertOk();

        $this->deleteJson('/mail/'.$box->id.'/trash', ['ids' => [$sent->id], 'confirmation' => 'DELETE'])
            ->assertOk()->assertJsonPath('remaining_bytes', $draftBytes);

        $this->assertSame($draftBytes, (int) $box->fresh()->used_bytes);
        $this->assertSame($outcome, $draft->fresh()->status);
        $this->assertSame($draft->body, $draft->fresh()->body);
        $this->assertModelExists($intent);
        $this->assertDatabaseHas('quota_ledger', ['intent_id' => $intent->id]);
        $this->deleteJson('/drafts/'.$draft->id)->assertConflict();
        $this->assertSame($draftBytes, (int) $box->fresh()->used_bytes);
    }

    private function savedDraft(User $user, Mailbox $box): Draft
    {
        $id = $this->actingAs($user)->postJson('/mail/'.$box->id.'/drafts')->assertCreated()->json('id');
        $this->putJson('/drafts/'.$id, [
            'version' => 1, 'from_email' => $user->email, 'to' => ['recipient@example.net'], 'cc' => [], 'bcc' => [],
            'subject' => 'Saved before Trash deletion', 'body' => '<p>Retain this fictional saved draft.</p>',
        ])->assertOk();

        return Draft::findOrFail($id);
    }

    private function account(): array
    {
        $user = User::factory()->create();
        $box = Mailbox::create(['name' => 'Fictional mailbox', 'email' => $user->email]);
        $box->users()->attach($user, ['can_send' => true]);
        Address::create(['mailbox_id' => $box->id, 'email' => $user->email, 'active' => true]);

        return [$user, $box];
    }

    private function message(Mailbox $box, string $folder, int $bytes): Message
    {
        return Message::create(['mailbox_id' => $box->id, 'thread_id' => fake()->uuid(), 'from_email' => 'sender@example.net',
            'to' => [$box->email], 'cc' => [], 'body_text' => 'Fictional content', 'raw_mime' => 'Fictional original MIME', 'folder' => $folder, 'logical_bytes' => $bytes]);
    }
}
