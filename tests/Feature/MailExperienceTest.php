<?php

namespace Tests\Feature;

use App\Models\Mailbox;
use App\Models\Message;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class MailExperienceTest extends TestCase
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
        $this->box->users()->attach($this->member, ['can_send' => true]);
        $this->actingAs($this->member);
    }

    private function message(array $attributes = []): Message
    {
        return Message::create([...[
            'mailbox_id' => $this->box->id, 'thread_id' => 'fictional-thread',
            'subject' => 'Fictional note', 'from_name' => 'Fictional sender',
            'from_email' => 'sender@example.test', 'to' => ['reader@example.test'], 'cc' => [],
            'body_text' => 'A fictional note.', 'raw_mime' => "Subject: Fictional note\r\n\r\nOriginal bytes.\r\n",
        ], ...$attributes]);
    }

    public function test_search_finds_recipients_across_mail_but_excludes_other_mailboxes_spam_and_trash(): void
    {
        $match = $this->message(['folder' => 'archive', 'cc' => ['needle@example.test']]);
        $this->message(['folder' => 'spam', 'subject' => 'needle']);
        $this->message(['folder' => 'trash', 'subject' => 'needle']);
        $other = Mailbox::create(['name' => 'Other', 'email' => 'other@example.test']);
        $this->message(['mailbox_id' => $other->id, 'subject' => 'needle']);
        $this->get('/mail/'.$this->box->id.'?q=needle')->assertInertia(fn (Assert $page) => $page
            ->has('messages', 1)->where('messages.0.id', $match->id)->where('filters.folder', 'all'));
        $this->get('/mail/'.$this->box->id.'?folder=inbox&q=needle')->assertInertia(fn (Assert $page) => $page->has('messages', 0));
    }

    public function test_lists_use_short_snippets_and_readers_keep_the_full_body(): void
    {
        $body = str_repeat('Fictional long body. ', 1000);
        $this->message(['body_text' => $body]);
        $this->get('/mail/'.$this->box->id)->assertInertia(fn (Assert $page) => $page
            ->where('messages.0.body_text', mb_substr($body, 0, 240))->missing('messages.0.raw_mime'));
        $this->get('/mail/'.$this->box->id.'/thread/fictional-thread')->assertInertia(fn (Assert $page) => $page
            ->where('thread.messages.0.body_text', $body)->missing('thread.messages.0.raw_mime'));
    }

    public function test_long_conversations_have_bounded_pages_without_losing_earlier_messages(): void
    {
        for ($i = 0; $i < 31; $i++) {
            $this->message(['subject' => 'Fictional note '.$i, 'created_at' => now()->subMinutes(31 - $i)]);
        }
        $this->get('/mail/'.$this->box->id.'/thread/fictional-thread?folder=archive')->assertInertia(fn (Assert $page) => $page
            ->has('thread.messages', 30)->where('thread.pagination.total', 31)
            ->where('thread.messages.0.subject', 'Fictional note 1'));
        $this->get('/mail/'.$this->box->id.'/thread/fictional-thread?thread_page=2')->assertInertia(fn (Assert $page) => $page
            ->has('thread.messages', 1)->where('thread.messages.0.subject', 'Fictional note 0'));
    }

    public function test_original_download_requires_membership_and_preserves_exact_bytes(): void
    {
        $message = $this->message();
        $response = $this->get('/messages/'.$message->id.'/original')->assertOk()
            ->assertHeader('Content-Type', 'message/rfc822')
            ->assertHeader('Content-Disposition', 'attachment; filename="message-'.$message->id.'.eml"');
        $this->assertSame($message->raw_mime, $response->getContent());
        $this->assertStringContainsString('no-store', $response->headers->get('Cache-Control'));
        $owner = User::factory()->create(['role' => 'owner']);
        $this->actingAs($owner)->get('/messages/'.$message->id.'/original')->assertForbidden();
        $this->assertSame($message->raw_mime, $message->fresh()->raw_mime);
    }
}
