<?php

namespace App\Providers\Mail;

interface RecipientDirectoryGateway
{
    /**
     * @param  array{revision:int, checksum:string, recipients:list<array{address:string, active:bool}>}  $snapshot
     * @return array<string, mixed>
     */
    public function replaceDirectory(array $snapshot): array;

    public function simulated(): bool;

    /** A non-secret fingerprint of the effective directory destination. */
    public function directoryTarget(): string;
}
