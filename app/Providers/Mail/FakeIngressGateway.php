<?php

namespace App\Providers\Mail;

class FakeIngressGateway implements IngressGateway
{
    /** @var list<array<string, mixed>> */
    public array $items = [];

    /** @var list<string> */
    public array $acknowledged = [];

    /**  @return array<array-key, mixed> */
    public function claim(): array
    {
        return $this->items;
    }

    public function acknowledge(string $id, string $checksum): void
    {
        $this->acknowledged[] = $id;
    }
}
