<?php

namespace App\Providers\Mail;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;

class ResendProvider implements OutboundMailProvider, UsageProvider
{
    /**  @param array<string, mixed> $payload
     * @return array<array-key, mixed> */
    public function send(array $payload, string $idempotencyKey): array
    {
        if (! config('postroom.sending_enabled') || ! config('postroom.resend_key')) {
            return ['status' => 'failed', 'id' => null, 'error' => 'External sending is disabled. Ask the owner to complete provider verification.'];
        }
        try {
            $response = Http::withToken(config('postroom.resend_key'))->acceptJson()->timeout(15)
                ->withHeaders(['Idempotency-Key' => $idempotencyKey])->post('https://api.resend.com/emails', $payload);
            if ($response->successful() && is_string($response->json('id'))) {
                return ['status' => 'accepted', 'id' => $response->json('id'), 'error' => null];
            }
            $uncertain = $response->serverError() || $response->successful() || $response->status() === 409;

            return ['status' => $uncertain ? 'uncertain' : 'failed', 'id' => null,
                'error' => $uncertain ? 'Provider result is uncertain. Reconcile before another send.' : 'Provider rejected the request (HTTP '.$response->status().'). Draft retained.'];
        } catch (ConnectionException) {
            return ['status' => 'uncertain', 'id' => null, 'error' => 'Provider connection timed out. Delivery may have occurred; do not resend.'];
        }
    }

    /**  @return array<array-key, mixed> */
    public function usage(): array
    {
        if (! config('postroom.resend_management_key')) {
            throw new \RuntimeException('A full-access Resend management key is required for usage.');
        }
        $response = Http::withToken(config('postroom.resend_management_key'))->acceptJson()->timeout(10)->get('https://api.resend.com/usage');
        if (! $response->successful()) {
            throw new \RuntimeException('Usage unavailable (HTTP '.$response->status().').');
        }
        $data = $response->json('emails');
        foreach (['daily', 'monthly'] as $window) {
            if (! is_numeric($data[$window]['used'] ?? null) || ! is_numeric($data[$window]['limit'] ?? null) || empty($data[$window]['resets_at'])) {
                throw new \RuntimeException('Provider usage response is incomplete.');
            }
        }

        return $data;
    }
}
