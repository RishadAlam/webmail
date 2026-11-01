<?php

namespace App\Providers\Mail;

class FakeIngressGateway implements IngressGateway, RecipientDirectoryGateway
{
    /** @var array{revision:int, checksum:string, count:int} */
    private array $directory = ['revision' => 0, 'checksum' => '', 'count' => 0];

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

    public function replaceDirectory(array $snapshot): array
    {
        if ($snapshot['revision'] < $this->directory['revision'] ||
            ($snapshot['revision'] === $this->directory['revision'] && $snapshot['checksum'] !== $this->directory['checksum'])) {
            throw new \RuntimeException('Stale or conflicting simulated directory revision.');
        }

        return $this->directory = [
            'revision' => $snapshot['revision'],
            'checksum' => $snapshot['checksum'],
            'count' => count($snapshot['recipients']),
        ];
    }

    public function simulated(): bool
    {
        return true;
    }

    public function directoryTarget(): string
    {
        return hash('sha256', 'simulated-recipient-directory');
    }
}
