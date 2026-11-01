<?php

namespace Tests\Feature;

use App\Models\Address;
use App\Models\Draft;
use App\Models\ImportIncident;
use App\Models\Mailbox;
use App\Models\Message;
use App\Models\SendIntent;
use App\Models\User;
use App\Providers\Mail\FakeIngressGateway;
use App\Providers\Mail\IngressGateway;
use App\Services\ImportService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class ImportIncidentTest extends TestCase
{
    use RefreshDatabase;

    private Mailbox $box;

    private FakeIngressGateway $gateway;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutVite();
        config(['postroom.provider' => 'mock']);
        $this->box = Mailbox::create(['name' => 'Fictional studio', 'email' => 'studio@example.test']);
        Address::create(['mailbox_id' => $this->box->id, 'email' => $this->box->email]);
        $this->gateway = new FakeIngressGateway;
        $this->app->instance(IngressGateway::class, $this->gateway);
    }

    public function test_repeated_storage_holds_are_one_redacted_incident_without_acknowledgement(): void
    {
        $this->freezeTime();
        $firstSeen = now()->toIso8601String();
        $this->box->update(['quota_bytes' => 1]);
        $this->gateway->items = [$this->receipt()];
        $this->assertSame(['imported' => 0, 'held' => 1], app(ImportService::class)->sync());
        $this->travel(5)->minutes();
        $this->assertSame(['imported' => 0, 'held' => 1], app(ImportService::class)->sync());

        $this->owner();
        $response = $this->get('/admin')->assertOk()->assertInertia(fn (Assert $page) => $page
            ->where('importIncidents.unresolved', 1)->where('importIncidents.resolved', 0)
            ->has('importIncidents.recent', 1)
            ->where('importIncidents.recent.0.category', 'storage_held')
            ->where('importIncidents.recent.0.status', 'unresolved')
            ->where('importIncidents.recent.0.kind', 'mail')
            ->where('importIncidents.recent.0.attempts', 2)
            ->where('importIncidents.recent.0.first_seen_at', $firstSeen)
            ->where('importIncidents.recent.0.last_seen_at', now()->toIso8601String())
            ->missing('importIncidents.recent.0.receipt_id'));
        foreach (['Fictional confidential subject', 'Fictional private body', 'sender@example.net', 'receipt-one'] as $privateValue) {
            $response->assertDontSee($privateValue, false);
        }
        $stored = json_encode(DB::table('import_incidents')->get(), JSON_THROW_ON_ERROR);
        foreach (['Fictional confidential subject', 'Fictional private body', 'sender@example.net', 'studio@example.test'] as $privateValue) {
            $this->assertStringNotContainsString($privateValue, $stored);
        }
        $this->assertDatabaseCount('import_incidents', 1);
        $this->assertDatabaseCount('messages', 0);
        $this->assertSame([], $this->gateway->acknowledged);
    }

    public function test_retry_resolves_only_after_commit_and_acknowledgement_without_duplicate_mail(): void
    {
        $gateway = new class extends FakeIngressGateway
        {
            public bool $failAcknowledgement = true;

            public function acknowledge(string $id, string $checksum): void
            {
                if ($this->failAcknowledgement) {
                    throw new \RuntimeException('Fictional private token and provider response');
                }
                parent::acknowledge($id, $checksum);
            }
        };
        $gateway->items = [$this->receipt()];
        $this->app->instance(IngressGateway::class, $gateway);
        $this->box->update(['quota_bytes' => 1]);
        app(ImportService::class)->sync();
        $this->box->update(['quota_bytes' => 26214400]);
        $this->assertSame(['imported' => 0, 'held' => 1], app(ImportService::class)->sync());
        $this->owner();
        $this->get('/admin')->assertInertia(fn (Assert $page) => $page
            ->where('importIncidents.unresolved', 1)
            ->where('importIncidents.recent.0.category', 'acknowledgement_pending')
            ->where('importIncidents.recent.0.attempts', 2));
        $this->assertDatabaseCount('messages', 1);
        $this->assertDatabaseCount('ingress_receipts', 1);

        $gateway->failAcknowledgement = false;
        $this->postJson('/admin/import-incidents/retry')->assertOk()
            ->assertJsonPath('imported', 1)->assertJsonPath('held', 0)->assertJsonPath('simulated', true);
        $this->get('/admin')->assertInertia(fn (Assert $page) => $page
            ->where('importIncidents.unresolved', 0)->where('importIncidents.resolved', 1)
            ->where('importIncidents.recent.0.status', 'resolved')
            ->where('importIncidents.recent.0.resolved_at', fn ($value) => is_string($value)));
        $this->assertSame(['imported' => 1, 'held' => 0], app(ImportService::class)->sync());
        $this->assertDatabaseCount('messages', 1);
        $this->assertDatabaseCount('import_incidents', 1);
        $this->assertSame($this->raw(), Message::firstOrFail()->raw_mime);
    }

    public function test_known_holds_have_fixed_categories_and_unexpected_failures_never_copy_exception_text(): void
    {
        $this->gateway->items = [
            [...$this->receipt('missing-mailbox'), 'recipient' => 'missing@example.test'],
            [...$this->receipt('invalid-receipt'), 'checksum' => str_repeat('0', 64)],
            $this->receipt('invalid-mime', "From: broken <sender@example.net\r\nSubject: Fictional confidential subject\r\n\r\nFictional private body"),
        ];
        $this->assertSame(['imported' => 0, 'held' => 3], app(ImportService::class)->sync());
        $this->owner();
        $this->get('/admin')->assertInertia(fn (Assert $page) => $page->where('importIncidents.unresolved', 3));
        $this->assertDatabaseHas('import_incidents', ['receipt_id' => 'missing-mailbox', 'category' => 'mailbox_unavailable']);
        $this->assertDatabaseHas('import_incidents', ['receipt_id' => 'invalid-receipt', 'category' => 'receipt_invalid']);
        $this->assertDatabaseHas('import_incidents', ['receipt_id' => 'invalid-mime', 'category' => 'mime_invalid']);

        Message::creating(fn () => throw new \RuntimeException('Fictional private token and provider response'));
        $this->gateway->items = [$this->receipt('temporary-failure')];
        $this->assertSame(['imported' => 0, 'held' => 1], app(ImportService::class)->sync());
        $this->assertDatabaseHas('import_incidents', ['receipt_id' => 'temporary-failure', 'category' => 'temporary_import_failure']);
        $stored = json_encode(DB::table('import_incidents')->get(), JSON_THROW_ON_ERROR);
        $this->assertStringNotContainsString('Fictional private token', $stored);
        $this->assertSame([], $this->gateway->acknowledged);
    }

    public function test_a_changed_receipt_is_held_without_modifying_the_committed_original(): void
    {
        $this->gateway->items = [$this->receipt()];
        app(ImportService::class)->sync();
        $this->gateway->items = [$this->receipt('receipt-one', $this->raw().' changed')];
        $this->assertSame(['imported' => 0, 'held' => 1], app(ImportService::class)->sync());
        $this->owner();
        $this->get('/admin')->assertInertia(fn (Assert $page) => $page
            ->where('importIncidents.recent.0.category', 'receipt_conflict'));
        $this->assertDatabaseCount('messages', 1);
        $this->assertSame($this->raw(), Message::firstOrFail()->raw_mime);
        $this->assertSame(['receipt-one'], $this->gateway->acknowledged);
    }

    public function test_delivery_event_incidents_resolve_after_acceptance_is_reconciled(): void
    {
        $raw = json_encode(['type' => 'email.delivered', 'data' => ['email_id' => 'fictional-provider-id', 'to' => ['recipient@example.net']]], JSON_THROW_ON_ERROR);
        $this->gateway->items = [[...$this->receipt('msg_fictional_event', $raw), 'kind' => 'event']];
        $this->assertSame(['imported' => 0, 'held' => 1], app(ImportService::class)->sync());
        $this->owner();
        $this->get('/admin')->assertInertia(fn (Assert $page) => $page
            ->where('importIncidents.recent.0.kind', 'event')
            ->where('importIncidents.recent.0.category', 'temporary_import_failure')
            ->where('importIncidents.unresolved', 1));
        $this->assertDatabaseCount('provider_events', 0);
        $this->assertSame([], $this->gateway->acknowledged);

        $user = User::factory()->create();
        $draft = Draft::create(['user_id' => $user->id, 'mailbox_id' => $this->box->id, 'from_email' => $this->box->email,
            'to' => ['recipient@example.net'], 'cc' => [], 'bcc' => [], 'subject' => 'Fictional private outbound subject', 'body' => 'Fictional private body']);
        $intent = SendIntent::create(['draft_id' => $draft->id, 'user_id' => $user->id, 'mailbox_id' => $this->box->id,
            'payload' => ['to' => ['recipient@example.net']], 'recipients' => 1, 'status' => 'accepted', 'provider_id' => 'fictional-provider-id']);
        $this->assertSame(['imported' => 1, 'held' => 0], app(ImportService::class)->sync());
        $this->assertSame('delivered', $intent->fresh()->status);
        $this->assertDatabaseCount('provider_events', 1);
        $this->assertDatabaseHas('import_incidents', ['receipt_id' => 'msg_fictional_event', 'status' => 'resolved']);
    }

    public function test_invalid_delivery_event_payloads_are_integrity_holds(): void
    {
        $this->gateway->items = [
            [...$this->receipt('event-checksum'), 'kind' => 'event', 'checksum' => str_repeat('0', 64)],
            [...$this->receipt('event-json', 'This is not JSON'), 'kind' => 'event'],
        ];
        $this->assertSame(['imported' => 0, 'held' => 2], app(ImportService::class)->sync());
        $this->assertDatabaseHas('import_incidents', ['receipt_id' => 'event-checksum', 'category' => 'receipt_invalid']);
        $this->assertDatabaseHas('import_incidents', ['receipt_id' => 'event-json', 'category' => 'receipt_invalid']);
        $this->assertSame([], $this->gateway->acknowledged);
    }

    public function test_recent_incident_summary_is_bounded_and_prioritizes_unresolved_items(): void
    {
        $this->freezeTime();
        ImportIncident::create(['receipt_id' => 'older-held', 'kind' => 'mail', 'category' => 'storage_held',
            'status' => 'unresolved', 'first_seen_at' => now()->subDay(), 'last_seen_at' => now()->subDay()]);
        foreach (range(1, 35) as $number) {
            ImportIncident::create(['receipt_id' => 'recent-resolved-'.$number, 'kind' => 'mail', 'category' => 'storage_held',
                'status' => 'resolved', 'first_seen_at' => now(), 'last_seen_at' => now(), 'resolved_at' => now()]);
        }
        $this->owner();
        $this->get('/admin')->assertInertia(fn (Assert $page) => $page
            ->where('importIncidents.unresolved', 1)->where('importIncidents.resolved', 35)
            ->has('importIncidents.recent', 30)
            ->where('importIncidents.recent.0.status', 'unresolved')
            ->where('importIncidents.recent.0.last_seen_at', now()->subDay()->toIso8601String()));
    }

    public function test_untrusted_or_unbounded_identifiers_are_never_stored_or_acknowledged(): void
    {
        $this->gateway->items = [
            $this->receipt("sender@example.net\r\nFictional confidential subject"),
            $this->receipt(str_repeat('a', 129)),
        ];
        $this->assertSame(['imported' => 0, 'held' => 2], app(ImportService::class)->sync());
        $this->owner();
        $this->get('/admin')->assertInertia(fn (Assert $page) => $page
            ->where('importIncidents.unresolved', 0)->has('importIncidents.recent', 0));
        $this->assertDatabaseCount('import_incidents', 0);
        $this->assertDatabaseCount('messages', 0);
        $this->assertSame([], $this->gateway->acknowledged);
    }

    public function test_retry_requires_admin_mfa_is_bounded_and_does_not_grant_mailbox_access(): void
    {
        $member = User::factory()->withTwoFactor()->create();
        $admin = User::factory()->withTwoFactor()->create(['role' => 'admin']);
        foreach ([$member, $admin] as $actor) {
            $this->actingAs($actor)->get('/admin')->assertForbidden();
            $this->postJson('/admin/import-incidents/retry')->assertForbidden();
        }
        $this->withSession(['postroom.mfa_user' => $member->id])->actingAs($member)
            ->postJson('/admin/import-incidents/retry')->assertForbidden();

        $this->owner();
        $this->gateway->items = array_map(fn ($number) => $this->receipt('bounded-'.$number), range(1, 12));
        $this->postJson('/admin/import-incidents/retry')->assertOk()->assertJsonPath('imported', 10);
        $this->assertDatabaseCount('messages', 10);
        $this->get('/mail/'.$this->box->id)->assertForbidden();
        $this->get('/messages/'.Message::firstOrFail()->id.'/original')->assertForbidden();
        $this->postJson('/admin/import-incidents/retry')->assertOk();
        $this->postJson('/admin/import-incidents/retry')->assertTooManyRequests();
    }

    public function test_ingress_connection_errors_return_a_redacted_retry_error(): void
    {
        $this->app->instance(IngressGateway::class, new class extends FakeIngressGateway
        {
            public function claim(): array
            {
                throw new \RuntimeException('Fictional private token and provider response');
            }
        });
        $this->owner();
        $this->postJson('/admin/import-incidents/retry')->assertServiceUnavailable()
            ->assertJsonPath('message', 'Pending imports could not be checked. Review the ingress connection and try again.')
            ->assertDontSee('Fictional private token', false);
    }

    private function owner(): void
    {
        $owner = User::factory()->withTwoFactor()->create(['role' => 'owner']);
        $this->actingAs($owner)->withSession(['postroom.mfa_user' => $owner->id]);
    }

    /** @return array{id:string, recipient:string, raw:string, checksum:string} */
    private function receipt(string $id = 'receipt-one', ?string $raw = null): array
    {
        $raw ??= $this->raw();

        return ['id' => $id, 'recipient' => $this->box->email, 'raw' => base64_encode($raw), 'checksum' => hash('sha256', $raw)];
    }

    private function raw(): string
    {
        return "From: Fictional Sender <sender@example.net>\r\nTo: studio@example.test\r\nSubject: Fictional confidential subject\r\nContent-Type: text/plain\r\n\r\nFictional private body";
    }
}
