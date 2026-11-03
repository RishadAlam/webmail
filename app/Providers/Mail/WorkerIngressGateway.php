<?php

namespace App\Providers\Mail;

use App\Services\ConnectionConfiguration;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

class WorkerIngressGateway implements IngressGateway, RecipientDirectoryGateway
{
    /**  @param array<string, mixed> $payload
     * @return array<array-key, mixed> */
    private function request(string $path, array $payload): array
    {
        $url = app(ConnectionConfiguration::class)->workerUrl();
        $secret = app(ConnectionConfiguration::class)->value('worker_secret');
        if (! $url || ! str_starts_with($url, 'https://') || ! $secret) {
            throw new \RuntimeException('Ingress connection is not configured.');
        }
        $body = json_encode($payload, JSON_THROW_ON_ERROR);
        $timestamp = (string) time();
        $nonce = (string) Str::uuid();
        $signature = hash_hmac('sha256', "$timestamp\n$nonce\nPOST\n$path\n$body", $secret);
        $response = Http::timeout(15)->withoutRedirecting()->withHeaders(['X-Webmail-Time' => $timestamp, 'X-Webmail-Nonce' => $nonce, 'X-Webmail-Signature' => $signature])
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

    public function replaceDirectory(array $snapshot): array
    {
        return $this->request('/v1/directory', $snapshot);
    }

    public function simulated(): bool
    {
        return false;
    }

    public function directoryTarget(): string
    {
        // Status remains available for repairing an invalid bootstrap URL;
        // request() validates the origin before any network operation.
        return hash('sha256', rtrim(app(ConnectionConfiguration::class)->value('worker_url') ?? '', '/'));
    }
}
