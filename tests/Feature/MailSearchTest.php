<?php

namespace Tests\Feature;

use App\Models\Mailbox;
use App\Models\Message;
use App\Models\User;
use App\Services\MailSearch;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class MailSearchTest extends TestCase
{
    use RefreshDatabase;

    private Mailbox $box;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutVite();
        $user = User::factory()->create();
        $this->box = Mailbox::create(['name' => 'Fictional studio', 'email' => 'studio@example.test']);
        $this->box->users()->attach($user);
        $this->actingAs($user);
    }

    private function message(array $changes = []): Message
    {
        return Message::create([
            'mailbox_id' => $this->box->id, 'thread_id' => 'fictional-thread',
            'from_email' => 'mira@example.test', 'from_name' => 'Mira Fictional', 'to' => ['studio@example.test'], 'cc' => ['team@example.test'],
            'subject' => 'Project autumn update', 'body_text' => 'Encrypted private body.', 'raw_mime' => 'Original.',
            ...$changes,
        ]);
    }

    public function test_search_combines_operators_phrases_dates_and_metadata_with_mailbox_scoping(): void
    {
        $match = $this->message(['folder' => 'archive', 'starred' => true, 'has_attachments' => true,
            'labels' => ['Studio plans'], 'created_at' => '2026-10-20 12:00:00']);
        $this->message(['from_email' => 'someone@example.test']);
        $other = Mailbox::create(['name' => 'Other', 'email' => 'other@example.test']);
        $this->message(['mailbox_id' => $other->id, 'folder' => 'archive', 'starred' => true, 'has_attachments' => true,
            'labels' => ['Studio plans'], 'created_at' => '2026-10-20 12:00:00']);
        $query = 'from:mira to:team subject:"autumn update" in:archive is:unread is:starred has:attachment after:2026-10-01 before:2026-11-01 label:"Studio plans"';
        $this->get('/mail/'.$this->box->id.'?q='.urlencode($query))->assertInertia(fn (Assert $page) => $page
            ->has('messages', 1)->where('messages.0.id', $match->id)->where('search_error', null));
    }

    public function test_explicit_spam_search_is_allowed_but_default_all_excludes_spam(): void
    {
        $message = $this->message(['folder' => 'spam']);
        $this->get('/mail/'.$this->box->id.'?q=mira')->assertInertia(fn (Assert $page) => $page->has('messages', 0));
        $this->get('/mail/'.$this->box->id.'?q='.urlencode('in:spam from:mira'))->assertInertia(fn (Assert $page) => $page
            ->has('messages', 1)->where('messages.0.id', $message->id));
    }

    public function test_wildcards_are_literal_and_quoted_terms_are_not_operator_syntax(): void
    {
        $match = $this->message(['subject' => 'Review 100%_complete from:mira']);
        $this->message(['subject' => 'Review 100XXcomplete']);
        $this->get('/mail/'.$this->box->id.'?q='.urlencode('"100%_complete" "from:mira"'))->assertInertia(fn (Assert $page) => $page
            ->has('messages', 1)->where('messages.0.id', $match->id));
    }

    public function test_unicode_values_are_not_split_by_locale_dependent_byte_whitespace(): void
    {
        $query = "from:张 subject:weekly\u{00a0}notes";
        $this->assertSame([
            ['operator' => 'from', 'value' => '张'],
            ['operator' => 'subject', 'value' => "weekly\u{00a0}notes"],
        ], app(MailSearch::class)->parse($query));

        $match = $this->message(['from_name' => '张 Fictional', 'subject' => "weekly\u{00a0}notes"]);
        $this->message(['from_name' => '张 Fictional', 'subject' => 'weekly notes']);
        $this->get('/mail/'.$this->box->id.'?q='.urlencode($query))->assertInertia(fn (Assert $page) => $page
            ->has('messages', 1)->where('messages.0.id', $match->id)->where('search_error', null));
    }

    public static function invalidQueries(): array
    {
        return [
            ['is:unknown'], ['has:calendar'], ['in:anywhere'], ['before:2026-02-31'], ['from:'],
            ['subject:"unclosed'], ['larger:10M'], ['one OR two'], ['in:inbox in:spam'], ['after:0000-01-01'],
        ];
    }

    #[DataProvider('invalidQueries')]
    public function test_invalid_or_unsupported_search_is_reported_without_silently_returning_mail(string $query): void
    {
        $this->message();
        $this->get('/mail/'.$this->box->id.'?q='.urlencode($query))->assertInertia(fn (Assert $page) => $page
            ->has('messages', 0)->where('search_error', fn ($error) => is_string($error) && $error !== ''));
    }
}
