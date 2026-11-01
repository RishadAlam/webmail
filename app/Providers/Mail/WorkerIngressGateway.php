<?php

namespace App\Providers\Mail;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

class WorkerIngressGateway implements IngressGateway
{
    /**  @param array<string, mixed> $payload
     * @return array<array-key, mixed> */
    private function request(string $path, array $payload): array
    {
        $url = config('postroom.worker_url');
        $secret = config('postroom.worker_secret');
        if (! $url || ! str_starts_with($url, 'https://') || ! $secret) {
            throw new \RuntimeException('Ingress connection is not configured.');
        }
        $body = json_encode($payload, JSON_THROW_ON_ERROR);
        $timestamp = (string) time();
        $nonce = (string) Str::uuid();
        $signature = hash_hmac('sha256', "$timestamp\n$nonce\nPOST\n$path\n$body", $secret);
        $response = Http::timeout(15)->withHeaders(['X-Postroom-Time' => $timestamp, 'X-Postroom-Nonce' => $nonce, 'X-Postroom-Signature' => $signature])
            ->withBody($body, 'application/json')->post(rtrim($url, '/').$path);
        if (! $response->successful()) {
            throw new \RuntimeException('Ingress request failed (HTTP '.$response->status().').');
        }

        return $response->json();
    }

    /**  @return array<array-key, mixed> */
    public function claim(): array
    {
        return $this->request('/v1/claim', ['limit' => 10])['items'];
    }

    public function acknowledge(string $id, string $checksum): void
    {
        $this->request('/v1/ack', compact('id', 'checksum'));
    }
}
