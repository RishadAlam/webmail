<?php

namespace App\Providers\Mail;

interface UsageProvider
{
    /**  @return array<array-key, mixed> */
    /** @return array<string, mixed> */
    public function usage(): array;
}
