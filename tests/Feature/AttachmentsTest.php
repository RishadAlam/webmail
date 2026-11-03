<?php

namespace Tests\Feature;

use App\Models\Address;
use App\Models\Draft;
use App\Models\Mailbox;
use App\Models\MailSignature;
use App\Models\Message;
use App\Models\SendIntent;
use App\Models\User;
use App\Providers\Mail\OutboundMailProvider;
use App\Providers\Mail\ResendProvider;
use App\Services\StorageBudget;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class AttachmentsTest extends TestCase
{
    use RefreshDatabase;

    private User $member;

    private Mailbox $box;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutVite();
        $this->member = User::factory()->create();
        $this->box = Mailbox::create(['name' => 'Fictional studio', 'email' => $this->member->email]);
        $this->box->users()->attach($this->member, ['can_send' => true]);
        Address::create(['mailbox_id' => $this->box->id, 'email' => $this->member->email, 'active' => true]);
        $this->actingAs($this->member);
    }

    public function test_saved_attachments_are_encrypted_versioned_and_return_only_metadata(): void
    {
        $draft = $this->draft();
        $before = $this->box->fresh()->used_bytes;
        $response = $this->upload($draft, 'Fictional attachment bytes.')->assertCreated()
            ->assertJsonPath('version', 3)->assertJsonPath('attachments.0.name', 'note.txt')
            ->assertJsonPath('attachments.0.type', 'text/plain')->assertJsonPath('attachments.0.size', 27);
        $this->assertStringNotContainsString('Fictional attachment bytes.', $response->getContent());
        $this->assertStringNotContainsString('Fictional attachment bytes.', DB::table('draft_attachments')->sole()->content);
        $this->assertGreaterThan($before, $this->box->fresh()->used_bytes);
        $this->assertSame($draft->fresh()->logical_bytes, $this->box->fresh()->used_bytes);
        $this->getJson('/drafts/'.$draft->id)->assertOk()->assertJsonPath('attachments.0.id', $response->json('attachments.0.id'));
        $download = $this->get($response->json('attachments.0.url'))->assertOk()
            ->assertHeader('X-Content-Type-Options', 'nosniff')->assertHeader('Content-Type', 'application/octet-stream');
        $this->assertSame('Fictional attachment bytes.', $download->getContent());
        $this->assertStringContainsString('attachment;', $download->headers->get('Content-Disposition'));
        $this->assertStringContainsString('no-store', $download->headers->get('Cache-Control'));
    }

    public function test_stale_attachment_mutations_cannot_overwrite_autosaved_work(): void
    {
        $draft = $this->draft();
        $response = $this->upload($draft, 'Fictional text')->assertCreated();
        $id = $response->json('attachments.0.id');
        $charged = $this->box->fresh()->used_bytes;
        $this->upload($draft, 'Other text')->assertConflict();
        $this->deleteJson('/drafts/'.$draft->id.'/attachments/'.$id, ['version' => 2])->assertConflict();
        $this->putJson('/drafts/'.$draft->id, [...$draft->only(['version', 'from_email', 'to', 'cc', 'bcc', 'subject', 'body']), 'body' => 'Stale body'])->assertConflict();
        $this->assertSame('<p>Fictional saved body.</p>', $draft->fresh()->body);
        $this->assertSame($charged, $this->box->fresh()->used_bytes);
        $this->assertDatabaseCount('draft_attachments', 1);
        $this->deleteJson('/drafts/'.$draft->id.'/attachments/'.$id, ['version' => 3])->assertOk()->assertJsonPath('version', 4)->assertJsonPath('attachments', []);
        $this->assertDatabaseCount('draft_attachments', 0);
        $this->assertSame($draft->logical_bytes, $this->box->fresh()->used_bytes);
    }

    public static function allowedBinaryFiles(): array
    {
        return [
            'PDF' => ['fictional.pdf', 'application/pdf', "%PDF-1.4\n% Fictional empty document\n%%EOF"],
            'PNG' => ['fictional.png', 'image/png', base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC/8AAAAASUVORK5CYII=')],
            'GIF' => ['fictional.gif', 'image/gif', base64_decode('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7')],
            'JPEG' => ['fictional.jpg', 'image/jpeg', "\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xd9"],
        ];
    }

    #[DataProvider('allowedBinaryFiles')]
    public function test_allowlisted_binary_files_round_trip_without_utf8_conversion(string $name, string $type, string $content): void
    {
        $draft = $this->draft();
        $response = $this->upload($draft, $content, $name)->assertCreated()->assertJsonPath('attachments.0.type', $type);
        $this->assertSame($content, $this->get($response->json('attachments.0.url'))->getContent());
        $this->postJson('/drafts/'.$draft->id.'/send', ['version' => 3])->assertOk();
        $sent = Message::sole();
        $metadata = $this->getJson('/messages/'.$sent->id.'/attachments')->assertOk()->json('attachments.0');
        $this->assertSame($name, $metadata['name']);
        $this->assertSame($content, $this->get($metadata['url'])->getContent());
    }

    public function test_attachment_actions_require_the_draft_owner_and_current_send_membership(): void
    {
        $draft = $this->draft();
        $response = $this->upload($draft, 'Private fictional file')->assertCreated();
        $id = $response->json('attachments.0.id');
        $other = User::factory()->create(['role' => 'owner']);
        $this->box->users()->attach($other, ['can_send' => true]);
        $this->actingAs($other);
        $this->upload($draft->fresh(), 'Other text')->assertForbidden();
        $this->get($response->json('attachments.0.url'))->assertForbidden();
        $this->deleteJson('/drafts/'.$draft->id.'/attachments/'.$id, ['version' => 3])->assertForbidden();
        $this->actingAs($this->member);
        $this->box->users()->updateExistingPivot($this->member->id, ['can_send' => false]);
        $this->upload($draft->fresh(), 'Other text')->assertForbidden();
        $this->get($response->json('attachments.0.url'))->assertForbidden();
        $this->assertDatabaseCount('draft_attachments', 1);
    }

    public function test_attachment_id_from_a_different_draft_cannot_be_deleted_or_downloaded(): void
    {
        $draft = $this->draft();
        $attached = $this->upload($draft, 'First draft file')->assertCreated();
        $other = $this->draft();
        $id = $attached->json('attachments.0.id');
        $this->deleteJson('/drafts/'.$other->id.'/attachments/'.$id, ['version' => $other->version])->assertNotFound();
        $this->get('/drafts/'.$other->id.'/attachments/'.$id)->assertNotFound();
        $this->assertDatabaseCount('draft_attachments', 1);
    }

    public function test_blocked_types_oversized_files_and_missing_versions_leave_the_draft_unchanged(): void
    {
        $draft = $this->draft();
        $this->upload($draft, '<!doctype html><script>alert(1)</script>', 'active.html')->assertUnprocessable();
        $this->upload($draft, '<!doctype html><script>alert(1)</script>', 'disguised.txt')->assertUnprocessable();
        $this->upload($draft, 'plain text with an executable extension', 'active.exe')->assertUnprocessable();
        $this->upload($draft, str_repeat('a', 131073))->assertUnprocessable();
        $this->postJson('/drafts/'.$draft->id.'/attachments', ['file' => UploadedFile::fake()->createWithContent('note.txt', 'text')])->assertUnprocessable();
        $this->assertDatabaseCount('draft_attachments', 0);
        $this->assertSame(2, $draft->fresh()->version);
        $this->assertSame($draft->logical_bytes, $this->box->fresh()->used_bytes);
    }

    public function test_attachment_count_total_bytes_and_complete_encoded_message_are_bounded(): void
    {
        $draft = $this->draft();
        for ($i = 0; $i < 10; $i++) {
            $this->upload($draft->fresh(), 'Small fictional text', 'note'.$i.'.txt')->assertCreated();
        }
        $this->upload($draft->fresh(), 'Eleventh file')->assertUnprocessable();
        $this->assertDatabaseCount('draft_attachments', 10);
        $large = $this->draft();
        $this->upload($large, str_repeat('a', 70000))->assertCreated();
        $this->upload($large->fresh(), str_repeat('b', 70000))->assertUnprocessable();
        $encoded = $this->draft();
        $this->putJson('/drafts/'.$encoded->id, [...$encoded->only(['version', 'from_email', 'to', 'cc', 'bcc', 'subject', 'body']), 'body' => str_repeat('a', 100000)])->assertOk();
        $this->upload($encoded->fresh(), str_repeat('b', 60000))->assertUnprocessable();
        $this->assertSame(3, $encoded->fresh()->version);
    }

    public function test_attachment_admission_obeys_mailbox_organization_and_physical_storage_limits(): void
    {
        $draft = $this->draft();
        $bytes = $this->box->fresh()->used_bytes;
        $this->box->update(['quota_bytes' => $bytes + 5]);
        $this->upload($draft, 'Does not fit')->assertUnprocessable();
        $this->box->update(['quota_bytes' => 26214400]);
        config(['webmail.organization_bytes' => $bytes + 5]);
        $this->upload($draft, 'Does not fit')->assertUnprocessable();
        config(['webmail.organization_bytes' => 367001600]);
        $budget = \Mockery::mock(StorageBudget::class);
        $budget->shouldReceive('permits')->andReturnFalse();
        $this->app->instance(StorageBudget::class, $budget);
        $this->upload($draft, 'Does not fit')->assertUnprocessable();
        $this->assertDatabaseCount('draft_attachments', 0);
        $this->assertSame($bytes, $this->box->fresh()->used_bytes);
        $this->assertSame(2, $draft->fresh()->version);
    }

    public function test_autosave_keeps_attachment_storage_charged_and_discard_cascades_bytes(): void
    {
        $draft = $this->draft();
        $this->upload($draft, 'Durable fictional bytes')->assertCreated();
        $current = $draft->fresh();
        $response = $this->putJson('/drafts/'.$draft->id, [...$current->only(['version', 'from_email', 'to', 'cc', 'bcc', 'subject', 'body']), 'subject' => 'Edited'])->assertOk()->assertJsonCount(1, 'attachments');
        $this->assertGreaterThan($draft->logical_bytes, $response->json('logical_bytes'));
        $this->assertSame($draft->fresh()->logical_bytes, $this->box->fresh()->used_bytes);
        $this->deleteJson('/drafts/'.$draft->id)->assertOk();
        $this->assertDatabaseCount('draft_attachments', 0);
        $this->assertSame(0, $this->box->fresh()->used_bytes);
    }

    public function test_file_can_be_attached_before_recipients_and_encoded_oversize_autosave_preserves_saved_work(): void
    {
        $id = $this->postJson('/mail/'.$this->box->id.'/drafts')->assertCreated()->json('id');
        $draft = Draft::findOrFail($id);
        $this->upload($draft, str_repeat('Fictional attachment ', 4000))->assertCreated();
        $current = $draft->fresh();
        $charged = $this->box->fresh()->used_bytes;
        $this->putJson('/drafts/'.$id, [...$current->only(['version', 'from_email', 'to', 'cc', 'bcc', 'subject', 'body']), 'body' => str_repeat('x', 100000)])->assertUnprocessable();
        $this->assertSame('', $draft->fresh()->body);
        $this->assertSame($charged, $this->box->fresh()->used_bytes);
        $this->assertSame(2, $draft->fresh()->version);
        $this->assertDatabaseCount('draft_attachments', 1);
    }

    public function test_copying_a_confirmed_failed_draft_copies_its_attachments_without_losing_the_original_evidence(): void
    {
        config(['webmail.mock_outcome' => 'failed']);
        $draft = $this->draft();
        $this->upload($draft, 'Retained failed file')->assertCreated();
        $this->postJson('/drafts/'.$draft->id.'/send', ['version' => 3])->assertOk()->assertJsonPath('status', 'failed');
        $bytes = $this->box->fresh()->used_bytes;
        $copy = $this->postJson('/mail/'.$this->box->id.'/drafts', ['copy_failed' => $draft->id])->assertCreated()->assertJsonCount(1, 'attachments');
        $this->assertSame('Retained failed file', $this->get($copy->json('attachments.0.url'))->getContent());
        $this->assertSame($draft->body, $copy->json('body'));
        $this->assertSame($bytes + $copy->json('logical_bytes'), $this->box->fresh()->used_bytes);
        $this->assertDatabaseCount('draft_attachments', 2);
        $this->assertSame('failed', $draft->fresh()->status);
        $this->deleteJson('/drafts/'.$copy->json('id'))->assertOk();
        $this->assertSame($bytes, $this->box->fresh()->used_bytes);
        $this->assertDatabaseCount('draft_attachments', 1);
    }

    public function test_provider_payload_and_sent_original_include_bytes_and_trash_keeps_retained_evidence_charged(): void
    {
        config(['webmail.resend_key' => 'fictional-test-key', 'webmail.sending_enabled' => true]);
        $this->app->bind(OutboundMailProvider::class, ResendProvider::class);
        Http::fake(['api.resend.com/emails' => Http::response(['id' => 'fictional-provider-attachment'], 200)]);
        $draft = $this->draft();
        $this->upload($draft, 'Fictional attachment bytes.')->assertCreated();
        $before = $draft->fresh()->logical_bytes;
        $this->postJson('/drafts/'.$draft->id.'/send', ['version' => 3])->assertOk()->assertJsonPath('status', 'accepted');
        Http::assertSent(fn ($request) => $request->url() === 'https://api.resend.com/emails'
            && $request['attachments'] === [['filename' => 'note.txt', 'content' => base64_encode('Fictional attachment bytes.')]]);
        $sent = Message::sole();
        $this->assertTrue($sent->has_attachments);
        $this->assertStringContainsString(base64_encode('Fictional attachment bytes.'), $sent->raw_mime);
        $this->assertLessThanOrEqual(262144, strlen($sent->raw_mime));
        $this->assertGreaterThan($before, $draft->fresh()->logical_bytes);
        $this->assertSame($draft->fresh()->logical_bytes + $sent->logical_bytes, $this->box->fresh()->used_bytes);
        $charged = $this->box->fresh()->used_bytes;
        $this->postJson('/drafts/'.$draft->id.'/send', ['version' => 3])->assertOk();
        $this->assertSame($charged, $this->box->fresh()->used_bytes);
        Http::assertSentCount(1);
        $metadata = $this->getJson('/messages/'.$sent->id.'/attachments')->assertOk()->json('attachments.0');
        $this->assertSame('Fictional attachment bytes.', $this->get($metadata['url'])->getContent());
        $this->upload($draft->fresh(), 'No mutation after send')->assertConflict();
        $sent->update(['folder' => 'trash']);
        $this->deleteJson('/mail/'.$this->box->id.'/trash', ['ids' => [$sent->id], 'confirmation' => 'DELETE'])->assertOk();
        $this->assertSame($draft->fresh()->logical_bytes, $this->box->fresh()->used_bytes);
        $this->assertSame(base64_encode('Fictional attachment bytes.'), SendIntent::sole()->payload['attachments'][0]['content']);
        $this->assertDatabaseCount('draft_attachments', 1);
        $this->deleteJson('/drafts/'.$draft->id)->assertConflict();
    }

    public function test_incoming_attachments_are_authorized_exact_downloads_with_safe_names_and_no_inline_execution(): void
    {
        $raw = "From: sender@example.net\r\nTo: reader@example.test\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=fictional\r\n\r\n--fictional\r\nContent-Type: text/plain\r\n\r\nMessage body\r\n--fictional\r\nContent-Type: text/html\r\nContent-Disposition: attachment; filename=\"../../active.html\"\r\nContent-Transfer-Encoding: base64\r\n\r\nPHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==\r\n--fictional--\r\n";
        $message = $this->message($raw);
        $response = $this->getJson('/messages/'.$message->id.'/attachments')->assertOk()->assertJsonCount(1, 'attachments')
            ->assertJsonPath('attachments.0.name', 'active.html')->assertJsonPath('attachments.0.size', 25);
        $this->assertStringNotContainsString('<script>', $response->getContent());
        $url = $response->json('attachments.0.url');
        $download = $this->get($url)->assertOk()->assertHeader('Content-Type', 'application/octet-stream')
            ->assertHeader('X-Content-Type-Options', 'nosniff');
        $this->assertSame('<script>alert(1)</script>', $download->getContent());
        $this->assertStringContainsString('attachment;', $download->headers->get('Content-Disposition'));
        $this->assertStringContainsString('sandbox', $download->headers->get('Content-Security-Policy'));
        $this->assertSame($raw, $message->fresh()->raw_mime);
        $this->get('/messages/'.$message->id.'/attachments/99')->assertNotFound();
        $this->actingAs(User::factory()->create(['role' => 'owner']))->getJson('/messages/'.$message->id.'/attachments')->assertForbidden();
        $this->get($url)->assertForbidden();
    }

    public function test_mime_part_count_and_depth_limits_do_not_destroy_the_original(): void
    {
        $many = "Content-Type: multipart/mixed; boundary=many\r\n\r\n";
        for ($i = 0; $i < 41; $i++) {
            $many .= "--many\r\nContent-Type: text/plain\r\n\r\npart\r\n";
        }
        $many .= "--many--\r\n";
        $nested = "Content-Type: text/plain\r\n\r\nNested fictional text.";
        for ($i = 0; $i < 10; $i++) {
            $nested = "Content-Type: multipart/mixed; boundary=level$i\r\n\r\n--level$i\r\n$nested\r\n--level$i--\r\n";
        }
        foreach ([$many, $nested, str_repeat('a', 262145)] as $raw) {
            $message = $this->message($raw);
            $this->getJson('/messages/'.$message->id.'/attachments')->assertUnprocessable();
            $this->assertSame($raw, $message->fresh()->raw_mime);
        }
    }

    public function test_loading_a_full_conversations_attachment_metadata_leaves_downloads_available(): void
    {
        $raw = "MIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=fictional\r\n\r\n--fictional\r\nContent-Type: text/plain\r\n\r\nBody\r\n--fictional\r\nContent-Type: text/plain\r\nContent-Disposition: attachment; filename=\"note.txt\"\r\nContent-Transfer-Encoding: base64\r\n\r\nRmljdGlvbmFsIGZpbGUu\r\n--fictional--\r\n";
        $message = $this->message($raw);
        $path = '/messages/'.$message->id.'/attachments';
        $download = $this->getJson($path)->assertOk()->json('attachments.0.url');
        for ($i = 1; $i < 30; $i++) {
            $this->getJson($path)->assertOk();
        }
        $this->getJson($path)->assertTooManyRequests();
        $response = $this->get($download)->assertOk()->assertHeader('Content-Type', 'application/octet-stream');
        $this->assertSame('Fictional file.', $response->getContent());
    }

    public function test_incoming_binary_text_attachment_keeps_its_original_charset_and_filename_is_header_safe(): void
    {
        $raw = "MIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=fictional\r\n\r\n--fictional\r\nContent-Type: text/plain\r\n\r\nBody\r\n--fictional\r\nContent-Type: text/plain; charset=iso-8859-1\r\nContent-Disposition: attachment; filename=\"fictional%0d%0a.txt\"\r\nContent-Transfer-Encoding: base64\r\n\r\nY2Fm6Q==\r\n--fictional--\r\n";
        $message = $this->message($raw);
        $metadata = $this->getJson('/messages/'.$message->id.'/attachments')->assertOk()->json('attachments.0');
        $this->assertSame('fictional_0d_0a.txt', $metadata['name']);
        $this->assertSame("caf\xe9", $this->get($metadata['url'])->getContent());
        $this->assertSame($raw, $message->fresh()->raw_mime);
    }

    public function test_signature_is_inserted_once_as_escaped_text_and_failed_copy_does_not_duplicate_it(): void
    {
        MailSignature::create(['user_id' => $this->member->id, 'body' => "Fictional signature <script>\nSecond line"]);
        $id = $this->postJson('/mail/'.$this->box->id.'/drafts')->assertCreated()->json('id');
        $draft = Draft::findOrFail($id);
        $this->assertStringContainsString('Fictional signature &lt;script&gt;', $draft->body);
        $this->assertStringNotContainsString('<script>', $draft->body);
        $this->putJson('/drafts/'.$draft->id, $draft->only(['version', 'from_email', 'to', 'cc', 'bcc', 'subject', 'body']))->assertOk();
        $this->assertSame(1, substr_count($draft->fresh()->body, 'Fictional signature'));
        $draft->update(['status' => 'failed']);
        $copy = $this->postJson('/mail/'.$this->box->id.'/drafts', ['copy_failed' => $draft->id])->assertCreated();
        $this->assertSame($draft->body, $copy->json('body'));
    }

    private function draft(): Draft
    {
        $id = $this->postJson('/mail/'.$this->box->id.'/drafts')->assertCreated()->json('id');
        $this->putJson('/drafts/'.$id, ['version' => 1, 'from_email' => $this->member->email, 'to' => ['recipient@example.net'], 'cc' => [], 'bcc' => [], 'subject' => 'Fictional attachment', 'body' => '<p>Fictional saved body.</p>'])->assertOk();

        return Draft::findOrFail($id);
    }

    private function upload(Draft $draft, string $content, string $name = 'note.txt'): TestResponse
    {
        return $this->postJson('/drafts/'.$draft->id.'/attachments', ['version' => $draft->version, 'file' => UploadedFile::fake()->createWithContent($name, $content)]);
    }

    private function message(string $raw): Message
    {
        return Message::create(['mailbox_id' => $this->box->id, 'thread_id' => fake()->uuid(), 'from_email' => 'sender@example.net',
            'to' => [$this->box->email], 'cc' => [], 'body_text' => 'Fictional body', 'raw_mime' => $raw, 'has_attachments' => true]);
    }
}
