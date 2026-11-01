<?php

namespace App\Providers\Mail;

interface CloudflareControlPlane
{
    /**  @return array<array-key, mixed> */
    public function zones(): array;

    /**  @return array<array-key, mixed> */
    public function dns(string $zone): array;
}
