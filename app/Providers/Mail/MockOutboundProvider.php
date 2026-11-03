<?php

namespace App\Providers\Mail;

class MockOutboundProvider implements OutboundMailProvider
{
    /**  @param array<string, mixed> $payload
     * @return array<array-key, mixed> */
    public function send(array $payload, string $idempotencyKey): array
    {
        return match (config('webmail.mock_outcome')) {
            'timeout' => ['status' => 'uncertain', 'id' => null, 'error' => 'The simulated provider timed out. Delivery is uncertain; do not resend.'],
            'failed' => ['status' => 'failed', 'id' => null, 'error' => 'The simulated provider rejected the request. Your draft is retained.'],
            default => ['status' => 'accepted', 'id' => 'mock_'.hash('sha256', $idempotencyKey), 'error' => null],
        };
    }
}
