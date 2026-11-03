<?php

namespace App\Services;

use App\Providers\Mail\ResendProvider;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class UsageService
{
    public function snapshot(bool $refresh = false): ?\stdClass
    {
        if (config('webmail.provider') === 'mock') {
            return null;
        }
        $snapshot = DB::table('usage_snapshots')->where('provider', 'resend')->first();
        if (! $refresh && $snapshot?->last_error && $snapshot->updated_at && Carbon::parse($snapshot->updated_at)->gt(now()->subMinute())) {
            return $snapshot;
        }
        if (! $refresh && $snapshot && $snapshot->observed_at && Carbon::parse($snapshot->observed_at)->gt(now()->subSeconds(config('webmail.usage_ttl')))) {
            return $snapshot;
        }
        try {
            $started = now();
            $data = app(ResendProvider::class)->usage();
            DB::table('usage_snapshots')->updateOrInsert(['provider' => 'resend'], ['data' => json_encode($data), 'observed_at' => $started, 'last_error' => null, 'updated_at' => now(), 'created_at' => now()]);
        } catch (\Throwable) {
            DB::table('usage_snapshots')->updateOrInsert(['provider' => 'resend'], ['last_error' => 'Provider usage is unavailable. Check the management credential and retry.', 'updated_at' => now(), 'created_at' => now()]);
        }

        return DB::table('usage_snapshots')->where('provider', 'resend')->first();
    }

    public function allowance(int $recipients, ?\stdClass $snapshot): bool
    {
        $daily = (int) DB::table('quota_ledger')->where('created_at', '>=', now()->subDay())->sum('recipients');
        $monthly = (int) DB::table('quota_ledger')->where('created_at', '>=', now()->startOfMonth())->sum('recipients');
        $dailyLimit = config('webmail.daily_limit');
        $monthlyLimit = config('webmail.monthly_limit');
        if (config('webmail.provider') !== 'mock') {
            if (! $snapshot?->observed_at || $snapshot->last_error || Carbon::parse($snapshot->observed_at)->lt(now()->subSeconds(config('webmail.usage_ttl')))) {
                return false;
            }
            $data = json_decode($snapshot->data, true);
            // Keep every unresolved reservation, including those older than the snapshot.
            // Provider counters may already include some of them; conservative double counting is intentional.
            $since = (int) DB::table('send_intents')->where(function ($query) use ($snapshot) {
                $query->whereIn('status', ['queued', 'dispatching', 'uncertain'])->orWhere('updated_at', '>=', $snapshot->observed_at);
            })->sum('recipients');
            $daily = max($daily, $data['daily']['used'] + $since);
            $monthly = max($monthly, $data['monthly']['used'] + $since);
            $dailyLimit = min($dailyLimit, $data['daily']['limit']);
            $monthlyLimit = min($monthlyLimit, $data['monthly']['limit']);
        }

        return $daily + $recipients <= floor($dailyLimit * .95) && $monthly + $recipients <= floor($monthlyLimit * .95);
    }

    /**  @return array<array-key, mixed> */
    public function meters(): array
    {
        $snapshot = config('webmail.provider') === 'mock' ? null : $this->snapshot();
        $data = $snapshot?->data ? json_decode($snapshot->data, true) : [];
        $meters = [];
        foreach (['daily' => config('webmail.daily_limit'), 'monthly' => config('webmail.monthly_limit')] as $window => $limit) {
            $mock = config('webmail.provider') === 'mock';
            $used = $mock ? (int) DB::table('quota_ledger')->where('created_at', '>=', $window === 'daily' ? now()->subDay() : now()->startOfMonth())->sum('recipients') : ($data[$window]['used'] ?? null);
            $stale = $snapshot && ($snapshot->last_error || ! $snapshot->observed_at || Carbon::parse($snapshot->observed_at)->lt(now()->subSeconds(config('webmail.usage_ttl'))));
            $meters[] = ['provider' => $mock ? 'Local simulator' : 'Resend', 'resource' => 'Outgoing email · '.$window, 'scope' => 'Shared organization',
                'used' => $used, 'limit' => $data[$window]['limit'] ?? $limit, 'reserved' => (int) DB::table('send_intents')->whereIn('status', ['queued', 'dispatching', 'uncertain'])->sum('recipients'),
                'unit' => 'recipient deliveries', 'accuracy' => $mock ? 'locally_measured' : ($used === null ? 'unavailable' : 'provider_reported'),
                'status' => $stale ? 'stale' : ($used === null ? 'unavailable' : 'current'), 'observed_at' => $mock ? now()->toIso8601String() : $snapshot?->observed_at,
                'resets_at' => $data[$window]['resets_at'] ?? null, 'last_error' => $snapshot?->last_error];
        }
        $physical = app(StorageBudget::class)->measuredBytes();
        $meters[] = ['provider' => 'PostgreSQL', 'resource' => 'Database footprint', 'scope' => 'Current database; not the whole Neon project',
            'used' => $physical, 'limit' => config('webmail.database_stop_bytes'), 'reserved' => null, 'unit' => 'bytes',
            'accuracy' => $physical === null ? 'unavailable' : 'locally_measured', 'status' => $physical === null ? 'unavailable' : 'current',
            'observed_at' => $physical === null ? null : now()->toIso8601String(), 'resets_at' => null,
            'last_error' => 'Webmail stops new content writes at 750 MiB or a lower configured cap. This is an application safeguard; other Neon branches and compute need separate account checks.'];
        foreach (['Neon compute', 'Render instance hours', 'Cloudflare D1 activity'] as $resource) {
            $meters[] = ['provider' => explode(' ', $resource)[0], 'resource' => $resource, 'scope' => 'Provider account', 'used' => null, 'limit' => null, 'reserved' => null, 'unit' => '',
                'accuracy' => 'unavailable', 'status' => 'unavailable', 'observed_at' => null, 'resets_at' => null, 'last_error' => 'No verified account measurement is available.'];
        }

        return $meters;
    }
}
