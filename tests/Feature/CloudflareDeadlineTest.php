<?php

namespace Tests\Feature;

use App\Providers\Mail\CloudflareClient;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class CloudflareDeadlineTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
    }

    public function test_zone_and_dns_pagination_share_one_deadline_without_returning_partial_dns(): void
    {
        $seconds = 0.0;
        $client = new CloudflareClient('fictional-token', function () use (&$seconds): float {
            return $seconds;
        });
        Http::fake(function ($request) use (&$seconds) {
            $dns = str_contains($request->url(), '/dns_records');
            $seconds += $dns ? 2.0 : 3.0;

            return Http::response(['success' => true, 'result' => [['id' => ($dns ? 'dns-' : 'zone-').$request['page']]],
                'result_info' => ['page' => $request['page'], 'total_pages' => $dns ? 2 : 3]]);
        });
        $this->assertCount(3, $client->zones());
        $failure = null;
        try {
            $client->dns(str_repeat('a', 32));
        } catch (\Throwable $error) {
            $failure = $error;
        }
        $this->assertInstanceOf(\RuntimeException::class, $failure, 'A late DNS view must not be returned as complete.');
        $this->assertStringContainsString('timed out', $failure->getMessage());
        Http::assertSentCount(5);
    }

    public function test_requests_use_only_the_remaining_budget_and_bounded_connect_and_body_timeouts(): void
    {
        $seconds = 0.0;
        $client = new CloudflareClient('fictional-token', function () use (&$seconds): float {
            return $seconds;
        });
        $optionsSeen = [];
        Http::fake(function ($request, $options) use (&$seconds, &$optionsSeen) {
            $optionsSeen[] = $options;
            $seconds += 0.5;

            return Http::response(['success' => true, 'result' => [['id' => 'complete']], 'result_info' => ['total_pages' => 1]]);
        });
        $this->assertSame([['id' => 'complete']], $client->zones());
        // Account for other work between zone selection and DNS inspection.
        $seconds = 11.0;
        $this->assertSame([['id' => 'complete']], $client->dns(str_repeat('a', 32)));
        $this->assertLessThanOrEqual(5, $optionsSeen[0]['timeout']);
        $this->assertLessThanOrEqual(2, $optionsSeen[0]['connect_timeout']);
        $this->assertLessThanOrEqual(5, $optionsSeen[0]['read_timeout']);
        $this->assertSame(1.0, $optionsSeen[1]['timeout']);
        $this->assertSame(1.0, $optionsSeen[1]['connect_timeout']);
        $this->assertSame(1.0, $optionsSeen[1]['read_timeout']);
        $this->assertFalse($optionsSeen[1]['allow_redirects']);
        Http::assertSentCount(2);
    }

    public function test_no_dns_request_starts_after_the_zone_inspection_budget_expires(): void
    {
        $seconds = 0.0;
        $client = new CloudflareClient('fictional-token', function () use (&$seconds): float {
            return $seconds;
        });
        Http::fake(['*' => Http::response(['success' => true, 'result' => [], 'result_info' => ['total_pages' => 1]])]);
        $this->assertSame([], $client->zones());
        $seconds = 12.0;
        $failure = null;
        try {
            $client->dns(str_repeat('a', 32));
        } catch (\Throwable $error) {
            $failure = $error;
        }
        $this->assertInstanceOf(\RuntimeException::class, $failure, 'An exhausted inspection must not issue another request.');
        $this->assertStringContainsString('timed out', $failure->getMessage());
        Http::assertSentCount(1);
    }

    public function test_fast_responses_still_fail_closed_at_the_page_limit(): void
    {
        $client = new CloudflareClient('fictional-token', static fn (): float => 0.0);
        Http::fake(['*' => Http::response(['success' => true, 'result' => [['id' => 'partial-record']], 'result_info' => ['total_pages' => 21]])]);
        $failure = null;
        try {
            $client->dns(str_repeat('a', 32));
        } catch (\Throwable $error) {
            $failure = $error;
        }
        $this->assertInstanceOf(\RuntimeException::class, $failure, 'A truncated DNS inspection must not be returned as complete.');
        $this->assertStringContainsString('bounded page limit', $failure->getMessage());
        Http::assertSentCount(20);
    }

    public function test_connection_timeout_does_not_expose_transport_details(): void
    {
        Http::fake(function () {
            throw new ConnectionException('private-transport-detail fictional-token');
        });
        $failure = null;
        try {
            (new CloudflareClient('fictional-token'))->zones();
        } catch (\Throwable $error) {
            $failure = $error;
        }
        $this->assertInstanceOf(\RuntimeException::class, $failure);
        $this->assertStringNotContainsString('private-transport-detail', $failure->getMessage());
        $this->assertStringNotContainsString('fictional-token', $failure->getMessage());
    }
}
