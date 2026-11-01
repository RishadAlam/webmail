<?php

namespace App\Services;

use App\Models\Address;
use App\Models\RecipientDirectorySync;
use App\Providers\Mail\IngressGateway;
use App\Providers\Mail\RecipientDirectoryGateway;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use RuntimeException;
use Throwable;

class RecipientDirectory
{
    private const INVALID_DIRECTORY = 'Use at most 100 explicit addresses on the configured WebMail domain.';

    private const UNCONFIRMED = 'Recipient directory synchronization was not confirmed. Accepted mail is retained; retry this revision.';

    public function __construct(private IngressGateway $gateway) {}

    /** @return array{status:string, revision:int, count:int, last_synced_at:?string, last_error:?string, simulation:bool} */
    public function sync(): array
    {
        $snapshot = null;
        try {
            $snapshot = $this->prepare();
            if ($snapshot !== null) {
                $payload = $snapshot->payload;
                if (! $this->gateway instanceof RecipientDirectoryGateway || $payload === null) {
                    throw new RuntimeException('Directory synchronization is unavailable.');
                }
                $acknowledgement = $this->gateway->replaceDirectory($payload);
                if (($acknowledgement['revision'] ?? null) !== $snapshot->revision ||
                    ($acknowledgement['checksum'] ?? null) !== $snapshot->checksum ||
                    ($acknowledgement['count'] ?? null) !== count($payload['recipients'])) {
                    throw new RuntimeException('Directory acknowledgement mismatch.');
                }
                $this->confirm($snapshot);
            }
        } catch (Throwable $error) {
            $query = RecipientDirectorySync::whereKey(1);
            if ($snapshot !== null) {
                // A late failure must not undo another request's acknowledgement or newer snapshot.
                $query->where('revision', $snapshot->revision)->where('checksum', $snapshot->checksum)
                    ->whereIn('status', ['pending', 'failed']);
            }
            $query->update([
                'status' => 'failed',
                'last_error' => $error instanceof InvalidArgumentException ? self::INVALID_DIRECTORY : self::UNCONFIRMED,
            ]);
        }

        return $this->status();
    }

    /** @return array{status:string, revision:int, count:int, last_synced_at:?string, last_error:?string, simulation:bool} */
    public function status(): array
    {
        $state = RecipientDirectorySync::findOrFail(1);
        $status = $state->status;
        $error = $state->last_error;
        try {
            $current = $this->currentSnapshot();
            if ($state->target !== $this->target() ||
                (in_array($status, ['synced', 'simulated'], true) &&
                    ($state->checksum !== $current['checksum'] || $state->address_snapshot !== $current['addresses']))) {
                $status = 'pending';
                $error = null;
            }
        } catch (InvalidArgumentException) {
            $status = 'failed';
            $error = self::INVALID_DIRECTORY;
        }

        return [
            'status' => $status,
            'revision' => $state->revision,
            'count' => Address::count(),
            'last_synced_at' => ! $this->simulated() && $state->target === $this->target()
                ? $state->last_synced_at?->toIso8601String() : null,
            'last_error' => $error,
            'simulation' => $this->simulated(),
        ];
    }

    private function prepare(): ?RecipientDirectorySync
    {
        return DB::transaction(function () {
            // Use the same lock order as administrator address creation and suspension.
            DB::table('quota_lock')->where('id', 1)->lockForUpdate()->first();
            $state = RecipientDirectorySync::whereKey(1)->lockForUpdate()->firstOrFail();
            $current = $this->currentSnapshot();
            $target = $this->target();

            if ($state->payload !== null && $state->target === $target && $state->revision > $state->acknowledged_revision) {
                return $state;
            }
            if ($state->revision > 0 && $state->target === $target && $state->checksum === $current['checksum'] && $state->address_snapshot === $current['addresses']) {
                Address::whereIn('id', array_column($current['addresses'], 'id'))
                    ->update(['directory_status' => $this->simulated() ? 'simulated' : 'synced']);
                $state->update(['status' => $this->simulated() ? 'simulated' : 'synced', 'last_error' => null]);

                return null;
            }
            if ($state->revision >= 9007199254740991) {
                throw new RuntimeException('Directory revision limit reached.');
            }
            $revision = $state->revision + 1;
            $state->fill([
                'revision' => $revision,
                'checksum' => $current['checksum'],
                'payload' => ['revision' => $revision, 'checksum' => $current['checksum'], 'recipients' => $current['recipients']],
                'address_snapshot' => $current['addresses'],
                'status' => 'pending',
                'last_error' => null,
                'last_synced_at' => $state->target === $target ? $state->last_synced_at : null,
                'target' => $target,
            ])->save();

            return $state;
        }, 3);
    }

    private function confirm(RecipientDirectorySync $snapshot): void
    {
        DB::transaction(function () use ($snapshot) {
            DB::table('quota_lock')->where('id', 1)->lockForUpdate()->first();
            $state = RecipientDirectorySync::whereKey(1)->lockForUpdate()->firstOrFail();
            if ($state->revision !== $snapshot->revision || $state->checksum !== $snapshot->checksum || $state->target !== $snapshot->target) {
                return;
            }
            $status = $this->simulated() ? 'simulated' : 'synced';
            if ($snapshot->address_snapshot === null) {
                throw new RuntimeException('Directory address snapshot is unavailable.');
            }
            foreach ($snapshot->address_snapshot as $address) {
                // Compare the actual current address and enabled state, not only its ID.
                Address::whereKey($address['id'])->update(['directory_status' => 'pending']);
                Address::whereKey($address['id'])->where('email', $address['email'])->where('active', $address['active'])
                    ->update(['directory_status' => $status]);
            }
            $state->update([
                'acknowledged_revision' => $snapshot->revision,
                'status' => $status,
                'last_synced_at' => $this->simulated() ? null : now(),
                'last_error' => null,
            ]);
        }, 3);
    }

    /** @return array{checksum:string, recipients:list<array{address:string, active:bool}>, addresses:list<array{id:int, email:string, active:bool}>} */
    private function currentSnapshot(): array
    {
        $domain = strtolower((string) config('postroom.domain'));
        $rows = Address::orderBy('id')->limit(101)->get(['id', 'email', 'active']);
        if (strlen($domain) > 253 || ! preg_match('/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/D', $domain) || $rows->count() > 100) {
            throw new InvalidArgumentException(self::INVALID_DIRECTORY);
        }
        $recipients = [];
        $addresses = [];
        foreach ($rows as $row) {
            if (strlen($row->email) > 254 || ! preg_match('/^[a-z0-9][a-z0-9._-]{0,63}@'.preg_quote($domain, '/').'$/D', $row->email)) {
                throw new InvalidArgumentException(self::INVALID_DIRECTORY);
            }
            $recipients[] = ['address' => $row->email, 'active' => $row->active];
            $addresses[] = ['id' => $row->id, 'email' => $row->email, 'active' => $row->active];
        }
        usort($recipients, fn ($a, $b) => strcmp($a['address'], $b['address']));
        $checksum = hash('sha256', json_encode($recipients, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES));

        return compact('checksum', 'recipients', 'addresses');
    }

    private function simulated(): bool
    {
        return $this->gateway instanceof RecipientDirectoryGateway && $this->gateway->simulated();
    }

    private function target(): string
    {
        $destination = $this->gateway instanceof RecipientDirectoryGateway ? $this->gateway->directoryTarget() : null;

        return hash('sha256', json_encode([$this->simulated(), $destination, config('postroom.domain')], JSON_THROW_ON_ERROR));
    }
}
