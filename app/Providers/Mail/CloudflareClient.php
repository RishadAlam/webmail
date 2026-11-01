<?php

namespace App\Providers\Mail;

use Illuminate\Support\Facades\Http;

class CloudflareClient implements CloudflareControlPlane
{
    public function __construct(private readonly string $token) {}

    /**  @return array<array-key, mixed> */
    private function read(string $path, int $perPage): array
    {
        $records = [];
        for ($page = 1; $page <= 20; $page++) {
            $response = Http::withToken($this->token)->acceptJson()->timeout(10)->get('https://api.cloudflare.com/client/v4'.$path, ['per_page' => $perPage, 'page' => $page]);
            if (! $response->successful() || $response->json('success') !== true || ! is_array($response->json('result'))) {
                throw new \RuntimeException('Cloudflare inspection failed. Check scopes and account access.');
            }
            $records = array_merge($records, $response->json('result'));
            if ($page >= (int) $response->json('result_info.total_pages', 1)) {
                return $records;
            }
        }
        throw new \RuntimeException('Cloudflare inspection exceeded the bounded page limit. Narrow the token scope; no partial DNS view is returned.');
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
