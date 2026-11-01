<?php

namespace App\Providers\Mail;

final class MockCloudflareControlPlane implements CloudflareControlPlane
{
    public const ZONE = '00000000000000000000000000000001';

    /** @return array<array-key, mixed> */
    public function zones(): array
    {
        return [['id' => self::ZONE, 'name' => 'postroom.test', 'status' => 'pending']];
    }

    /** @return array<array-key, mixed> */
    public function dns(string $zone): array
    {
        if ($zone !== self::ZONE) {
            throw new \InvalidArgumentException('Unknown fictional zone.');
        }

        return [['id' => 'fictional-record', 'type' => 'TXT', 'name' => 'postroom.test', 'content' => 'fictional-inspection-fixture', 'ttl' => 1]];
    }
}
