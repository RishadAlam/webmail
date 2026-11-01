<?php

namespace App\Providers\Mail;

interface IngressGateway
{
    /**  @return array<array-key, mixed> */
    /** @return list<array<string, mixed>> */
    public function claim(): array;

    public function acknowledge(string $id, string $checksum): void;
}
