<?php

namespace App\Providers\Mail;

use Closure;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;

class CloudflareClient implements CloudflareControlPlane
{
    /** @var Closure(): float */
    private readonly Closure $clock;

    private readonly float $deadline;

    /** @param (Closure(): float)|null $clock */
    public function __construct(private readonly string $token, ?Closure $clock = null)
    {
        $this->clock = $clock ?? static fn (): float => hrtime(true) / 1_000_000_000;
        // One instance represents one inspection: zones and DNS share this
        // budget rather than renewing it for every endpoint or page.
        $this->deadline = ($this->clock)() + 12.0;
    }

    /**  @return array<array-key, mixed> */
    private function read(string $path, int $perPage): array
    {
        $records = [];
        for ($page = 1; $page <= 20; $page++) {
            $remaining = $this->remaining();
            $requestTimeout = min(5.0, $remaining);
            try {
                // The total timeout includes response-body reads. The stream
                // read option also stays bounded if the HTTP transport changes.
                $response = Http::withToken($this->token)->acceptJson()
                    ->timeout($requestTimeout)->connectTimeout(min(2.0, $remaining))
                    ->withOptions(['read_timeout' => $requestTimeout])->withoutRedirecting()
                    ->get('https://api.cloudflare.com/client/v4'.$path, ['per_page' => $perPage, 'page' => $page]);
            } catch (ConnectionException) {
                throw new \RuntimeException('Cloudflare inspection timed out or could not connect. No partial DNS view is returned.');
            }
            $this->remaining();
            if (! $response->successful() || $response->json('success') !== true || ! is_array($response->json('result'))) {
                throw new \RuntimeException('Cloudflare inspection failed. Check scopes and account access.');
            }
            $records = array_merge($records, $response->json('result'));
            if ($page >= (int) $response->json('result_info.total_pages', 1)) {
                $this->remaining();

                return $records;
            }
        }
        throw new \RuntimeException('Cloudflare inspection exceeded the bounded page limit. Narrow the token scope; no partial DNS view is returned.');
    }

    private function remaining(): float
    {
        $remaining = $this->deadline - ($this->clock)();
        if ($remaining <= 0) {
            throw new \RuntimeException('Cloudflare inspection timed out. No partial DNS view is returned.');
        }

        return $remaining;
    }

    /**  @return array<array-key, mixed> */
    public function zones(): array
    {
        return $this->read('/zones', 50);
    }

    /**  @return array<array-key, mixed> */
    public function dns(string $zone): array
    {
        if (! preg_match('/^[a-f0-9]{32}$/', $zone)) {
            throw new \InvalidArgumentException('Invalid zone identifier.');
        }

        return $this->read('/zones/'.$zone.'/dns_records', 100);
    }
}
