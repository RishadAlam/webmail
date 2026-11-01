<?php

namespace App\Providers\Mail;

interface OutboundMailProvider
{
    /**
     * @param  array<string, mixed>  $payload
     * @return array{status:string, id:?string, error:?string}
     */
    public function send(array $payload, string $idempotencyKey): array;
}
