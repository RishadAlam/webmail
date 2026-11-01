<?php

namespace Tests\Feature;

use App\Models\Address;
use App\Models\Mailbox;
use App\Providers\Mail\FakeIngressGateway;
use App\Providers\Mail\IngressGateway;
use App\Providers\Mail\WorkerIngressGateway;
use App\Services\RecipientDirectory;
use GuzzleHttp\Promise\PromiseInterface;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class RecipientDirectoryTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config([
            'postroom.provider' => 'resend',
            'postroom.domain' => 'postroom.test',
            'postroom.worker_url' => 'https://worker.example',
            'postroom.worker_secret' => 'fictional-ingress-secret-at-least-32-characters',
        ]);
        Http::preventStrayRequests();
    }

    public function test_status_is_pending_until_a_matching_worker_acknowledges_the_signed_snapshot(): void
    {
        $sam = $this->address('sam@postroom.test', false);
        $mira = $this->address('mira@postroom.test');
        $directory = app(RecipientDirectory::class);
        $this->assertSame('pending', $directory->status()['status']);
        $this->assertNull($directory->status()['last_synced_at']);
        $this->assertSame(2, $directory->status()['count']);
        Http::fake(fn (Request $request) => $this->acknowledge($request));

        $status = $directory->sync();

        $this->assertSame('synced', $status['status']);
        $this->assertSame(1, $status['revision']);
        $this->assertSame(2, $status['count']);
        $this->assertNotNull($status['last_synced_at']);
        $this->assertNull($status['last_error']);
        $this->assertFalse($status['simulation']);
        $this->assertSame('synced', $sam->fresh()->directory_status);
        $this->assertSame('synced', $mira->fresh()->directory_status);
        Http::assertSent(function (Request $request) {
            $this->assertSame('https://worker.example/v1/directory', $request->url());
            $this->assertSame([
                ['address' => 'mira@postroom.test', 'active' => true],
                ['address' => 'sam@postroom.test', 'active' => false],
            ], $request['recipients']);
            $this->assertSame(hash('sha256', '[{"address":"mira@postroom.test","active":true},{"address":"sam@postroom.test","active":false}]'), $request['checksum']);
            $timestamp = $request->header('X-Postroom-Time')[0];
            $nonce = $request->header('X-Postroom-Nonce')[0];
            $this->assertSame(hash_hmac('sha256', "$timestamp\n$nonce\nPOST\n/v1/directory\n".$request->body(), config('postroom.worker_secret')), $request->header('X-Postroom-Signature')[0]);

            return true;
        });
        $this->assertSame('synced', app(RecipientDirectory::class)->sync()['status']);
        Http::assertSentCount(1);
    }

    public function test_unconfirmed_sync_keeps_an_immutable_revision_for_retry_before_sending_local_changes(): void
    {
        $address = $this->address('mira@postroom.test');
        $payloads = [];
        Http::fake(function (Request $request) use (&$payloads) {
            $payloads[] = $request->data();

            return count($payloads) === 1
                ? Http::response(['error' => 'upstream-secret-that-must-not-leak'], 503)
                : $this->acknowledge($request);
        });

        $failed = app(RecipientDirectory::class)->sync();
        $this->assertSame('failed', $failed['status']);
        $this->assertStringNotContainsString('upstream-secret', $failed['last_error']);
        $this->assertNull($failed['last_synced_at']);
        $this->assertSame('pending', $address->fresh()->directory_status);
        $address->update(['active' => false, 'directory_status' => 'pending']);
        $new = $this->address('new@postroom.test');

        $retry = app(RecipientDirectory::class)->sync();
        $this->assertSame($payloads[0], $payloads[1]);
        $this->assertSame(1, $retry['revision']);
        $this->assertSame('pending', $retry['status']);
        $this->assertSame('pending', $address->fresh()->directory_status);
        $this->assertSame('pending', $new->fresh()->directory_status);

        $updated = app(RecipientDirectory::class)->sync();
        $this->assertSame(2, $updated['revision']);
        $this->assertSame('synced', $updated['status']);
        $this->assertSame([
            ['address' => 'mira@postroom.test', 'active' => false],
            ['address' => 'new@postroom.test', 'active' => true],
        ], $payloads[2]['recipients']);
    }

    public function test_a_successful_http_response_with_a_mismatched_acknowledgement_does_not_mark_addresses_synced(): void
    {
        $address = $this->address('mira@postroom.test');
        Http::fake(fn (Request $request) => Http::response(['revision' => $request['revision'], 'checksum' => str_repeat('0', 64), 'count' => 1]));

        $status = app(RecipientDirectory::class)->sync();

        $this->assertSame('failed', $status['status']);
        $this->assertNull($status['last_synced_at']);
        $this->assertSame('pending', $address->fresh()->directory_status);
    }

    public function test_edits_during_a_request_remain_pending_after_the_older_snapshot_is_acknowledged(): void
    {
        $address = $this->address('mira@postroom.test');
        Http::fake(function (Request $request) use ($address) {
            $address->update(['active' => false, 'directory_status' => 'pending']);

            return $this->acknowledge($request);
        });

        $status = app(RecipientDirectory::class)->sync();

        $this->assertSame('pending', $status['status']);
        $this->assertSame('pending', $address->fresh()->directory_status);
        $this->assertFalse($address->fresh()->active);
    }

    public function test_a_late_acknowledgement_cannot_replace_a_newer_confirmed_local_revision(): void
    {
        $address = $this->address('mira@postroom.test');
        $requests = 0;
        Http::fake(function (Request $request) use ($address, &$requests) {
            if (++$requests === 1) {
                // Another request acknowledges the shared pending revision, then synchronizes an edit.
                $this->assertSame('synced', app(RecipientDirectory::class)->sync()['status']);
                $address->update(['active' => false, 'directory_status' => 'pending']);
                $this->assertSame(2, app(RecipientDirectory::class)->sync()['revision']);
            }

            return $this->acknowledge($request);
        });

        $status = app(RecipientDirectory::class)->sync();

        $this->assertSame('synced', $status['status']);
        $this->assertSame(2, $status['revision']);
        $this->assertFalse($address->fresh()->active);
        $this->assertSame('synced', $address->fresh()->directory_status);
        Http::assertSentCount(3);
    }

    public function test_a_recreated_address_requires_its_own_confirmed_snapshot_even_when_routing_content_matches(): void
    {
        $address = $this->address('mira@postroom.test');
        Http::fake(fn (Request $request) => $this->acknowledge($request));
        $this->assertSame('synced', app(RecipientDirectory::class)->sync()['status']);
        $address->delete();
        $replacement = Address::create([
            'mailbox_id' => $address->mailbox_id, 'email' => $address->email,
            'active' => true, 'directory_status' => 'pending',
        ]);

        $this->assertSame('pending', app(RecipientDirectory::class)->status()['status']);
        $this->assertSame(2, app(RecipientDirectory::class)->sync()['revision']);
        $this->assertSame('synced', $replacement->fresh()->directory_status);
        Http::assertSentCount(2);
    }

    public function test_invalid_or_oversized_local_directories_do_not_reach_the_worker(): void
    {
        $foreign = $this->address('mira@foreign.test');
        Http::fake();
        $this->assertSame('failed', app(RecipientDirectory::class)->sync()['status']);
        $this->assertSame('pending', $foreign->fresh()->directory_status);
        $foreign->delete();
        for ($i = 0; $i < 101; $i++) {
            $this->address("person$i@postroom.test");
        }
        $this->assertSame('failed', app(RecipientDirectory::class)->sync()['status']);
        Http::assertNothingSent();
    }

    public function test_mock_sync_is_explicitly_simulated_and_must_be_confirmed_again_when_using_the_real_gateway(): void
    {
        $address = $this->address('mira@postroom.test');
        $fake = new FakeIngressGateway;
        $this->app->instance(IngressGateway::class, $fake);
        Http::fake(fn (Request $request) => $this->acknowledge($request));

        $simulated = app(RecipientDirectory::class)->sync();
        $this->assertSame('simulated', $simulated['status']);
        $this->assertTrue($simulated['simulation']);
        $this->assertNull($simulated['last_synced_at']);
        $this->assertNotSame('synced', $address->fresh()->directory_status);
        Http::assertNothingSent();

        $this->app->instance(IngressGateway::class, new WorkerIngressGateway);
        $this->assertSame('pending', app(RecipientDirectory::class)->status()['status']);
        $live = app(RecipientDirectory::class)->sync();
        $this->assertSame('synced', $live['status']);
        $this->assertFalse($live['simulation']);
        $this->assertNotNull($live['last_synced_at']);
        Http::assertSentCount(1);
    }

    public function test_changing_the_effective_gateway_destination_requires_confirmation_again(): void
    {
        $this->address('mira@postroom.test');
        $gateway = new class extends FakeIngressGateway
        {
            public string $destination = 'first-worker';

            public function directoryTarget(): string
            {
                return hash('sha256', $this->destination);
            }
        };
        $this->app->instance(IngressGateway::class, $gateway);
        $this->assertSame('simulated', app(RecipientDirectory::class)->sync()['status']);
        $gateway->destination = 'replacement-worker';

        $this->assertSame('pending', app(RecipientDirectory::class)->status()['status']);
        $this->assertSame(2, app(RecipientDirectory::class)->sync()['revision']);
    }

    private function address(string $email, bool $active = true): Address
    {
        $box = Mailbox::create(['name' => 'Fictional mailbox', 'email' => $email]);

        return Address::create(['mailbox_id' => $box->id, 'email' => $email, 'active' => $active, 'directory_status' => 'pending']);
    }

    private function acknowledge(Request $request): PromiseInterface
    {
        return Http::response(['revision' => $request['revision'], 'checksum' => $request['checksum'], 'count' => count($request['recipients'])]);
    }
}
