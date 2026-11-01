<?php

namespace App\Services;

use App\Models\ProviderConnection;
use App\Providers\Mail\CloudflareClient;
use App\Providers\Mail\ResendProvider;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;

class ConnectionConfiguration
{
    public const FIELDS = ['resend_key', 'resend_management_key', 'cloudflare_token', 'worker_url', 'worker_secret'];

    public function value(string $field): ?string
    {
        if (! in_array($field, self::FIELDS, true)) {
            throw new \InvalidArgumentException('Unsupported connection field.');
        }
        $settings = $this->record()->settings ?? [];
        // A stored null is an explicit clear, not permission to revive an old
        // environment credential. Missing tables still permit first bootstrap.
        $value = array_key_exists($field, $settings) ? $settings[$field] : config('postroom.'.$field);

        return is_string($value) && $value !== '' ? $value : null;
    }

    public function workerUrl(): ?string
    {
        $url = $this->value('worker_url');
        if ($url !== null && ! $this->safeWorkerUrl($url)) {
            throw new \RuntimeException('Ingress endpoint must be an approved HTTPS origin.');
        }

        return $url === null ? null : rtrim($url, '/');
    }

    public function safeWorkerUrl(string $url): bool
    {
        $parts = parse_url($url);
        if (! is_array($parts) || ($parts['scheme'] ?? '') !== 'https' || empty($parts['host'])
            || isset($parts['user']) || isset($parts['pass'])
            || isset($parts['port']) || isset($parts['query']) || isset($parts['fragment'])
            || ! in_array($parts['path'] ?? '', ['', '/'], true)) {
            return false;
        }
        $host = strtolower($parts['host']);
        if (! preg_match('/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/', $host) || str_contains($host, '..') || filter_var($host, FILTER_VALIDATE_IP)
            || $host === 'localhost' || str_ends_with($host, '.localhost') || str_ends_with($host, '.local')) {
            return false;
        }
        if (str_ends_with($host, '.workers.dev')) {
            return true;
        }
        $bootstrap = config('postroom.worker_url');

        return is_string($bootstrap) && rtrim($url, '/') === rtrim($bootstrap, '/');
    }

    /** @param array<string, string|null> $values */
    public function save(array $values, int $actor): void
    {
        if (array_diff(array_keys($values), self::FIELDS)) {
            throw ValidationException::withMessages(['connections' => 'Only the listed connection settings can be changed.']);
        }
        if (! empty($values['worker_url']) && ! $this->safeWorkerUrl($values['worker_url'])) {
            throw ValidationException::withMessages(['worker_url' => 'Use an HTTPS workers.dev origin or the exact custom Worker origin configured at bootstrap. Paths, credentials, ports and redirects are not allowed.']);
        }
        $values = array_filter($values, fn ($value) => is_string($value) && $value !== '');
        if ($values === []) {
            return;
        }
        $this->mutate($values, $actor, 'connection.updated');
    }

    public function clear(string $field, int $actor): void
    {
        if (! in_array($field, self::FIELDS, true)) {
            throw ValidationException::withMessages(['connection' => 'Unknown connection setting.']);
        }
        $this->mutate([$field => null], $actor, 'connection.cleared');
    }

    /** @param array<string, string|null> $changes */
    private function mutate(array $changes, int $actor, string $action): void
    {
        DB::transaction(function () use ($changes, $actor, $action) {
            DB::table('quota_lock')->where('id', 1)->lockForUpdate()->first();
            $record = ProviderConnection::firstOrCreate(['id' => 1]);
            $settings = $record->settings ?? [];
            $checks = $record->checks ?? [];
            foreach ($changes as $field => $value) {
                if (($settings[$field] ?? config('postroom.'.$field)) !== $value) {
                    $check = match ($field) {
                        'resend_management_key' => 'resend_management',
                        'cloudflare_token' => 'cloudflare',
                        default => $field,
                    };
                    unset($checks[$check], $settings['_checked_'.$check]);
                }
                $settings[$field] = $value;
                DB::table('audit_events')->insert(['user_id' => $actor, 'action' => $action, 'target' => $field, 'created_at' => now(), 'updated_at' => now()]);
            }
            $record->update(['settings' => $settings, 'checks' => $checks]);
        }, 3);
    }

    /** @return array<string, mixed> */
    public function status(): array
    {
        $record = $this->record();
        $saved = $record->settings ?? [];
        $fields = [];
        foreach (self::FIELDS as $field) {
            $value = $this->value($field);
            $source = array_key_exists($field, $saved) ? 'database' : ($value !== null ? 'environment' : 'none');
            // A malformed legacy environment URL may contain credentials. Keep
            // the repair screen usable without returning or requesting it.
            if ($field === 'worker_url' && $value !== null && ! $this->safeWorkerUrl($value)) {
                $value = null;
            }
            $fields[$field] = ['configured' => $value !== null, 'source' => $source];
            $fields[$field][$field === 'worker_url' ? 'value' : 'masked'] = $field === 'worker_url' ? $value : ($value !== null ? 'Configured (hidden)' : null);
        }
        $checks = [];
        foreach (['resend_management' => 'resend_management_key', 'cloudflare' => 'cloudflare_token'] as $name => $field) {
            $credential = $this->value($field);
            $status = config('postroom.provider') === 'mock' ? 'mock' : ($credential === null ? 'not_configured' : 'unchecked');
            $current = $credential !== null && ($saved['_checked_'.$name] ?? null) === $this->checkFingerprint($name, $credential);
            $checks[$name] = $status === 'unchecked' && $current ? ($record?->checks[$name] ?? ['status' => $status, 'checked_at' => null, 'error' => null]) : ['status' => $status, 'checked_at' => null, 'error' => null];
        }

        return ['mode' => config('postroom.provider') === 'mock' ? 'mock' : 'live', 'domain' => config('postroom.domain'),
            'sending_enabled' => (bool) config('postroom.sending_enabled'), 'fields' => $fields, 'checks' => $checks];
    }

    /** @return array{status: string, error: string|null} */
    public function check(string $connection, int $actor): array
    {
        $field = match ($connection) {
            'resend_management' => 'resend_management_key',
            'cloudflare' => 'cloudflare_token',
            default => throw ValidationException::withMessages(['connection' => 'Only Resend management access and Cloudflare read access have a supported read-only check. Sending keys and Worker delivery are not verified here.']),
        };
        if (config('postroom.provider') === 'mock') {
            return ['status' => 'mock', 'error' => null];
        }
        $credential = $this->value($field);
        if ($credential === null) {
            return ['status' => 'not_configured', 'error' => 'Save the required credential before testing this connection.'];
        }
        $result = ['status' => 'checked', 'checked_at' => now()->toIso8601String(), 'error' => null];
        try {
            if ($connection === 'resend_management') {
                app(ResendProvider::class)->usage($credential);
            } else {
                $client = new CloudflareClient($credential);
                $domain = strtolower((string) config('postroom.domain'));
                $zone = collect($client->zones())->first(fn ($zone) => is_array($zone) && strtolower($zone['name'] ?? '') === $domain);
                if (! is_array($zone) || ! is_string($zone['id'] ?? null)) {
                    throw new \RuntimeException('Configured domain zone not accessible.');
                }
                $client->dns($zone['id']);
            }
        } catch (\Throwable) {
            $result['status'] = 'failed';
            $result['error'] = $connection === 'resend_management'
                ? 'Resend usage could not be read. Check the full-access management key and retry; a sending-only key cannot verify usage.'
                : 'Cloudflare zone and DNS read access could not be confirmed for the configured domain. Check token scopes and retry.';
        }
        DB::transaction(function () use ($connection, $field, $credential, $result, $actor) {
            DB::table('quota_lock')->where('id', 1)->lockForUpdate()->first();
            // A result for a key replaced during this request is not evidence
            // that its replacement works.
            if ($this->value($field) !== $credential) {
                return;
            }
            $record = ProviderConnection::firstOrCreate(['id' => 1]);
            $record->update([
                'checks' => [...($record->checks ?? []), $connection => $result],
                'settings' => [...($record->settings ?? []), '_checked_'.$connection => $this->checkFingerprint($connection, $credential)],
            ]);
            DB::table('audit_events')->insert(['user_id' => $actor, 'action' => 'connection.checked', 'target' => $connection, 'created_at' => now(), 'updated_at' => now()]);
        }, 3);

        return ['status' => $result['status'], 'error' => $result['error']];
    }

    private function checkFingerprint(string $connection, string $credential): string
    {
        // Keep this binding encrypted with the settings. An environment key or
        // configured-domain change must not inherit another connection's check.
        return hash_hmac('sha256', json_encode([$connection, $credential, $connection === 'cloudflare' ? config('postroom.domain') : null], JSON_THROW_ON_ERROR), (string) config('app.key'));
    }

    private function record(): ?ProviderConnection
    {
        return Schema::hasTable('provider_connections') ? ProviderConnection::find(1) : null;
    }
}
