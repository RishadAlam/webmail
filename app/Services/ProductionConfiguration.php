<?php

namespace App\Services;

use Illuminate\Encryption\Encrypter;
use Illuminate\Support\ConfigurationUrlParser;

class ProductionConfiguration
{
    /** @return list<string> */
    public function errors(): array
    {
        $errors = [];
        if (config('app.debug') !== false) {
            $errors[] = 'APP_DEBUG must be false.';
        }
        if (! $this->isPostgres((string) config('database.default'))) {
            $errors[] = 'DB_CONNECTION and its URL must use durable PostgreSQL (pgsql).';
        }
        if (! $this->verifiedDatabaseTls((string) config('database.default'))) {
            $errors[] = 'PostgreSQL must use sslmode=verify-full, including any DB_URL override.';
        }
        $sessionConnection = (string) (config('session.connection') ?: config('database.default'));
        if (config('session.driver') !== 'database' || ! $this->isPostgres($sessionConnection) || ! $this->verifiedDatabaseTls($sessionConnection)) {
            $errors[] = 'Sessions must use the database driver with a PostgreSQL connection and sslmode=verify-full.';
        }
        if (config('session.encrypt') !== true || config('session.secure') !== true || config('session.http_only') !== true) {
            $errors[] = 'SESSION_ENCRYPT, SESSION_SECURE_COOKIE and SESSION_HTTP_ONLY must be true.';
        }
        if (! in_array(config('session.same_site'), ['lax', 'strict'], true) || config('session.domain')) {
            $errors[] = 'Sessions require SameSite lax/strict and a host-only cookie (no SESSION_DOMAIN).';
        }
        $url = parse_url((string) config('app.url'));
        if (! is_array($url) || ($url['scheme'] ?? null) !== 'https' || empty($url['host']) || ! in_array($url['path'] ?? '', ['', '/'], true) || isset($url['user']) || isset($url['pass']) || isset($url['query']) || isset($url['fragment'])) {
            $errors[] = 'APP_URL must be an HTTPS origin without credentials, path, query or fragment.';
        }
        if (! $this->publicMailDomain((string) config('postroom.domain'))) {
            $errors[] = 'MAIL_DOMAIN must be an explicit public receiving domain; local, example and reserved domains are forbidden.';
        }
        $key = (string) config('app.key');
        $decoded = str_starts_with($key, 'base64:') ? base64_decode(substr($key, 7), true) : $key;
        if (! is_string($decoded) || ! Encrypter::supported($decoded, (string) config('app.cipher'))) {
            $errors[] = 'APP_KEY must be a valid encryption key for APP_CIPHER. Preserve the existing key when restoring mail.';
        }
        foreach (config('deployment.trusted_proxies', []) as $proxy) {
            if (! $this->validProxy($proxy)) {
                $errors[] = 'TRUSTED_PROXIES must contain explicit IP addresses or bounded CIDRs; wildcards are forbidden.';
                break;
            }
        }

        return $errors;
    }

    public function assertSafe(): void
    {
        $errors = $this->errors();
        if ($errors !== []) {
            throw new \RuntimeException('Unsafe production configuration: '.implode(' ', $errors));
        }
    }

    private function isPostgres(string $connection): bool
    {
        if (config("database.connections.$connection.driver") !== 'pgsql') {
            return false;
        }

        return ($this->resolvedConnection($connection)['driver'] ?? null) === 'pgsql';
    }

    private function verifiedDatabaseTls(string $connection): bool
    {
        return ($this->resolvedConnection($connection)['sslmode'] ?? null) === 'verify-full';
    }

    /** @return array<string, mixed> */
    private function resolvedConnection(string $connection): array
    {
        $configuration = config("database.connections.$connection");
        if (! is_array($configuration)) {
            return [];
        }
        try {
            return (new ConfigurationUrlParser)->parseConfiguration($configuration);
        } catch (\InvalidArgumentException) {
            return [];
        }
    }

    private function publicMailDomain(string $domain): bool
    {
        $domain = strtolower($domain);
        if (strlen($domain) > 253 || filter_var($domain, FILTER_VALIDATE_IP)
            || ! preg_match('/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/D', $domain)) {
            return false;
        }
        // IANA special-use names plus private/internal namespace conventions.
        foreach (['alt', 'arpa', 'example', 'example.com', 'example.net', 'example.org', 'internal', 'invalid', 'local', 'localhost', 'onion', 'test'] as $reserved) {
            if ($domain === $reserved || str_ends_with($domain, '.'.$reserved)) {
                return false;
            }
        }

        return true;
    }

    private function validProxy(mixed $proxy): bool
    {
        if (! is_string($proxy)) {
            return false;
        }
        $parts = explode('/', $proxy);
        if (count($parts) > 2 || ! filter_var($parts[0], FILTER_VALIDATE_IP)) {
            return false;
        }

        return count($parts) === 1 || (ctype_digit($parts[1]) && (int) $parts[1] > 0 && (int) $parts[1] <= (str_contains($parts[0], ':') ? 128 : 32));
    }
}
