# WebMail by Hookstack: deployment and recovery

For the step-by-step first-time workflow, start with [Set up WebMail](CONFIGURATION.md). This runbook covers the hardened runtime and recovery commands. Its `rtk proxy` prefix is a development command wrapper; if RTK is not installed, run the command following that prefix directly.

This repository now has a production PHP/Apache runtime. The strict-free hosting choice remains a limited private pilot: Render explicitly says, “Do not use them for production applications.” Idle sleep, suspension, quotas and cold starts prevent an availability guarantee. A successful local image build is not evidence of a live deployment or reliable business mail. No external service, DNS record or paid feature was changed during this work. [Render Free](https://render.com/docs/free)

## Runtime and free blueprint

`Dockerfile` builds locked Composer production dependencies and frontend assets in separate stages. The final image uses the pinned official PHP 8.4.27 Apache image, with `/var/www/html/public` as its document root. It does not contain Node, Composer, PHPUnit, tests, source frontend, `.env` or development dependencies. PHP/Apache run as `www-data`; application code and public assets are not writable by that user. Only temporary Laravel caches, compiled views and runtime directories are writable. Durable mail, drafts, sessions and idempotency records belong in PostgreSQL, never this filesystem. Laravel 13.39.0 remains locked. [Laravel deployment](https://laravel.com/framework/docs/13.x/deployment), [Render PHP/Docker](https://render.com/docs/deploy-php-laravel-docker)

Apache has two request workers, bounded request/keep-alive timeouts and a 25-second graceful shutdown allowance. PHP has a 96 MiB per-request memory limit, a 30-second execution limit, bounded upload/input/socket settings and OPcache. PHP errors go to stderr; access logs omit URL paths, query strings, referrers, cookies and bodies. The entrypoint validates configuration, caches config/routes/views, and starts Apache. SIGTERM initiates graceful shutdown. Startup never migrates a database, seeds fixtures, generates an encryption key or provisions an owner. These resource limits need workload measurement; they are not a throughput promise.

`render.yaml` declares one Docker web service with `plan: free`, `autoDeployTrigger: 'off'`, `/up` health checks and a 30-second shutdown window. There is no Render database, worker, cron service, disk or keep-alive. Neon Free is an external, owner-provisioned database. No automatic cloud backup is activated. Render Free does not offer shell/SSH access or one-off jobs, so migration and owner bootstrap run from an owner-controlled machine using the same reviewed image. [Blueprint fields](https://render.com/docs/blueprint-spec), [Free restrictions](https://render.com/docs/free)

The `/up` route checks that Laravel can boot. It deliberately does not query Neon or providers on every platform health probe. It does not prove database connectivity, receiving, sending or mailbox readiness. Those are separate release checks.

## Configuration before the first deployment

Keep a protected environment file outside the repository on the owner's machine; use filesystem permissions equivalent to `0600`. The examples below use `/secure/webmail/production.env` as a path to be replaced. Never paste its values into an issue, log, screenshot or command argument. Supply the same values through Render's secret environment settings. Docker daemon administrators can inspect container environment variables, so run these commands only on a trusted machine.

| Setting                                       | Requirement                                                                                                                           |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `APP_ENV` / `APP_DEBUG`                       | `production` / `false`                                                                                                                |
| `APP_URL`                                     | The exact HTTPS origin that users and health checks will use, with no credentials, path, query or fragment                            |
| `APP_KEY`                                     | One owner-generated valid Laravel encryption key, preserved across every restart, redeploy and restore                                |
| `MAIL_DOMAIN`                                 | The owner's exact public receiving domain; local/example/reserved names, including the `postroom.test` fallback, fail production boot |
| `DB_CONNECTION` / `DB_URL`                    | `pgsql` and the owner's Neon PostgreSQL connection URL                                                                                |
| `DB_SSLMODE`                                  | `verify-full`; the guard also checks the resolved URL options and rejects any downgrade                                               |
| `SESSION_DRIVER` / `SESSION_ENCRYPT`          | `database` / `true`                                                                                                                   |
| `SESSION_SECURE_COOKIE` / `SESSION_HTTP_ONLY` | Both `true`                                                                                                                           |
| `SESSION_SAME_SITE` / `SESSION_DOMAIN`        | `lax` or `strict`; leave domain unset for host-only cookies                                                                           |
| `CACHE_STORE` / `QUEUE_CONNECTION`            | `database` / `database`; this blueprint starts no queue worker                                                                        |
| `LOG_CHANNEL` / `LOG_LEVEL`                   | `stderr` / `warning`                                                                                                                  |
| `EXTERNAL_SENDING_ENABLED` / `MAIL_MAILER`    | `false` / `array` until explicit live-provider checks are complete                                                                    |
| `POSTROOM_PROVIDER`                           | `resend` on the hosted pilot; `mock` only for clearly marked local tests                                                              |
| `TRUSTED_PROXIES`                             | Optional comma-separated verified ingress IPs or bounded CIDRs; unset means trust none                                                |

The image supplies the system CA bundle through `PGSSLROOTCERT` and sets a 10-second libpq connection timeout. Verify Neon TLS using the actual endpoint before release; local test-CA TLS does not exercise Neon's certificate chain. Database credentials are not needed to build the image. The receiving-domain guard validates syntax and excludes special-use/private namespaces; it performs no DNS lookup and does not prove domain ownership or mail routing. [libpq environment variables](https://www.postgresql.org/docs/current/libpq-envars.html), [IANA special-use domains](https://www.iana.org/assignments/special-use-domain-names)

`webmail:check-production` checks configuration without opening a database/provider connection. Boot rejects debug mode, non-PostgreSQL resolved database configuration (including a URL driver override), database/session connections without `sslmode=verify-full`, non-database or unencrypted/insecure sessions, missing/invalid encryption keys, non-HTTPS origins, reserved receiving domains and wildcard proxy trust. Provider credentials are not demanded merely to install the app. Passing this command does not authorize sending or prove infrastructure readiness.

The production host allowlist is the exact `APP_URL` hostname. Forwarded host headers are never trusted. Only explicitly configured proxies can supply forwarded client address, scheme and port; generated URLs use the configured HTTPS origin. Do not set wildcard proxy trust to fix a deployment. If ingress addresses are unknown, leave trust disabled, confirm canonical HTTPS links/cookies and accept that IP-based throttling may see the proxy address. Render health checks use a verified custom domain when present, otherwise the service's `onrender.com` hostname. Start with that hostname, or verify the single chosen custom domain and `APP_URL` together; adding another custom domain without matching this policy can fail health checks. [Render health-check Host behavior](https://render.com/docs/health-checks)

## Owner-controlled installation

Build an immutable candidate from the reviewed source, without altering the local development asset build:

```sh
rtk proxy docker build --tag webmail:reviewed --file Dockerfile .
rtk proxy docker run --rm --env-file /secure/webmail/production.env --entrypoint php webmail:reviewed artisan webmail:check-production --no-interaction
```

Create or authorize the owner's Neon Free project, then verify the intended database name/host and back up any existing data. Before an authorized schema change, inspect the migration plan. Never use `migrate:fresh`, `db:wipe`, `--seed`, the demo seeder or a new `APP_KEY` on an existing installation.

```sh
rtk proxy docker run --rm --env-file /secure/webmail/production.env --entrypoint php webmail:reviewed artisan migrate:status
rtk proxy docker run --rm --env-file /secure/webmail/production.env --entrypoint php webmail:reviewed artisan migrate --pretend --force
rtk proxy docker run --rm --env-file /secure/webmail/production.env --entrypoint php webmail:reviewed artisan migrate --force --no-interaction
```

For an empty installation only, the owner runs the following in a private interactive terminal. Verify ownership of the entered email address first; the CLI records it as owner-verified and sends no verification message. The password is hidden, has no command-line/environment option, and requires at least 16 characters with mixed case, a number and a symbol. There is no public installation-claim route or default production password.

```sh
rtk proxy docker run --rm -it --env-file /secure/webmail/production.env --entrypoint php webmail:reviewed artisan webmail:bootstrap-owner
```

The command locks a singleton installation row and creates one owner in a transaction. It refuses an existing user population, noninteractive input or a previously consumed bootstrap latch. Removing the owner does not reopen bootstrap; it is not an account-recovery backdoor. It creates no mailbox, provider account, sender address or MFA exemption.

After sign-in, open `/settings/security`, confirm the password, enroll and confirm an authenticator, and store recovery codes separately. Sign out and sign in with password plus TOTP before using Administration. Owners/admins cannot use passkey login because the installed passkey login flow does not establish the required Fortify TOTP session marker. Member passkey login and authenticated passkey confirmation retain their existing flows. Policy tests are not physical-device passkey certification.

Create the Render service only after reviewing the blueprint and these gates. Leave automatic deploys off; manually deploy the reviewed revision. Configure the owner's existing account so quota exhaustion stops service instead of charging overages; Free alone does not prevent bandwidth/build charges when a payment method permits them. Confirm account settings in the current dashboard. Never add quota-evasion accounts or artificial wake traffic. Provider accounts, initial secrets, billing/verification issues and unavailable-host recovery are explicit owner responsibilities. [Render usage limits](https://render.com/docs/free)

## Backup and restore procedure

The database backup must include encrypted original MIME, drafts and versions, send intents and provider IDs, quota reservations, ingress receipts, provider event IDs, directory revision state, encrypted provider settings and the installation latch. A database dump without the original `APP_KEY` cannot recover encrypted content. Preserve any configured previous encryption keys as well. Keep keys and MFA recovery material in a separate owner-controlled secure store.

Use a compatible PostgreSQL client on the owner's machine and its protected service/password files (`PGSERVICEFILE` and `PGPASSFILE`, password file mode `0600`). Do not put a connection URL/password in the command line. The service entries below are examples: `webmail_source` must resolve to the verified source; `webmail_restore_disposable` must resolve to a separately created, empty database. Confirm both with `current_database()` before any operation. [PostgreSQL connection service files](https://www.postgresql.org/docs/current/libpq-pgservice.html), [pg_dump](https://www.postgresql.org/docs/current/app-pgdump.html), [pg_restore](https://www.postgresql.org/docs/current/app-pgrestore.html)

```sh
rtk proxy env PGSERVICE=webmail_source psql --no-psqlrc --command 'select current_database(), current_user;'
rtk proxy env PGSERVICE=webmail_source pg_dump --format=custom --no-owner --no-privileges --file /secure/webmail/backup-before-change.dump
rtk proxy sha256sum /secure/webmail/backup-before-change.dump
rtk proxy env PGSERVICE=webmail_restore_disposable psql --no-psqlrc --command 'select current_database(), current_user;'
rtk proxy env PGSERVICE=webmail_restore_disposable pg_restore --exit-on-error --single-transaction --no-owner --no-privileges --dbname service=webmail_restore_disposable /secure/webmail/backup-before-change.dump
```

A PostgreSQL custom-format archive is not itself encrypted. Place real dumps in owner-controlled encrypted storage outside the ephemeral host, restrict local permissions, record checksum/schema/image revision/time, retain an independent copy, and verify that copy can be read. Do not store the sole backup beside the running service or assume a provider's short restore window is a full backup policy. Choose a backup frequency and retention policy with the owner; no scheduled backup or cloud transfer has been activated here.

Restore first into a new isolated database with external sending disabled and the original encryption key. Do not use `--clean` against the live database or switch application traffic before validation. Compare row counts and integrity manifests, decrypt representative original MIME and drafts, check draft versions and attachments where present, and confirm all ingress/event/idempotency IDs and uncertain sends survived. Preserve accepted D1 spool data; do not clear it to make a restore appear synchronized. Reconcile directory revision state before publishing another snapshot. A restored uncertain send must remain uncertain until provider evidence resolves it; never reset its idempotency key or blindly resend outside the provider's supported window.

An older database restore also rolls back import receipts, quotas, session state and directory revisions. Reconcile the restore point with retained D1/provider evidence, preserve original keys/IDs, and invalidate restored browser sessions before re-enabling access. Record and approve the actual recovery/cutover plan. Any DNS change requires a concrete reviewed diff and explicit approval. An inaccessible application cannot perform its own recovery; this procedure runs from the owner's trusted machine.

## Executed local recovery drill

On November 1, 2026, the following completed successfully against local PostgreSQL 17 and fictional records only:

```sh
rtk proxy sh docker/recovery-drill.sh /tmp/webmail-recovery-drill-20261101-final
```

The script creates only `webmail_recovery_source` and `webmail_recovery_restored`, refuses preexisting databases/evidence directories, bounds each operation with a timeout, and drops only the databases it created. It migrated the disposable source, inserted fictional encrypted content, made a custom-format dump, restored into the empty target in one transaction, and compared source/restored manifests byte-for-byte. The main `postroom` database was untouched. The test retained exactly one row in each of ten checked tables, equal MIME/draft plaintext and ciphertext hashes, draft version 7, stable draft/send/receipt/event IDs, an `uncertain` send, its quota reservation and the consumed owner latch. A wrong encryption key failed to decrypt MIME. Evidence and a separate fictional fixture key remain in the named local directory; the key is not committed.

This is an application-schema PostgreSQL recovery drill. It does not verify a live Neon backup, D1 disaster recovery, real attachments, provider reconciliation, off-machine backup transport or actual outage recovery.

## Release evidence and remaining gates

Executed on November 1, 2026: the full PHP suite passed on both in-memory SQLite and dedicated local PostgreSQL `postroom_test`, each with 201 passed, 16 disabled-feature skips and 1,045 assertions. The 54 focused production/owner/passkey/password-session/auth-throttle tests also passed with 159 assertions; scoped Pint passed; PHPStan reported zero errors; both shell scripts passed syntax checks; the blueprint parsed as one Free Docker web service with automatic deploys off, an explicit mail domain and no database service. The final isolated image built successfully, including 2,356 frontend modules. Docker reports its local image ID as `sha256:01312e5ca676fa94c90a8646b027d5266fa77a372754d038962300cc6b815852` (the OCI manifest-list digest in this Docker store).

This image includes the final composer save-state and serialization fixes, Trash draft-accounting fix, enlarged-text row spacing and HTML-table readability changes. A 276-file application/frontend/runtime input manifest stayed identical before and after the build and after its smoke test; all 108 copied runtime source files matched the image. The full PHP suites ran after the final backend changes; only the composer frontend changed afterward. The [source manifest](review/production-source.json) and [command/result evidence](review/production-runtime.json) record the exact snapshot and checks. The shared development `public/build` was not modified by the isolated image build.

The final container smoke test passed with its own PostgreSQL 17 container, internal Docker network, temporary database `webmail_runtime_review`, one-day test CA and server certificate. It confirmed TLS via `pg_stat_ssl`, rejected a wrong hostname and untrusted CA, and verified `/up` and `/login` return 200, private response headers, secure HttpOnly cookies, blocked private files, host/proxy handling, non-root permissions, absent development tools/dependencies, rejected unsafe startup configuration and graceful exit 0 without an OOM at 0.1 CPU / 512 MiB. It removed its own containers, volatile database and network; it never contacted the existing Compose database. The fixture scripts are not included in the production image.

Run this smoke script on a Linux Docker host with direct access to its private bridge. Docker omits published host ports on an internal network, so the harness inspects the test container's private address and probes it directly with HTTP proxies disabled. The check does not open a public port or relax production TLS/host validation.

```sh
rtk php artisan test --compact tests/Feature/ProductionRuntimeTest.php tests/Feature/OwnerBootstrapTest.php tests/Feature/Auth/ThrottleResponseTest.php tests/Feature/Auth/PasskeyLoginPolicyTest.php tests/Feature/Settings/PasswordSessionTest.php
rtk proxy docker build --tag webmail-production-review:local --file Dockerfile .
rtk proxy python3 docker/runtime-smoke.py
```

Still required before real mail: review final checks in `STATUS.md` and `UI_ACCEPTANCE.md`; verify actual Render/Neon Free account limits, HTTPS/canonical host and database TLS, cold-start behavior, owner MFA and recovery possession, external backup retention/restore, provider permissions and domain authorization, Cloudflare/D1 ingress durability and Free CPU limits, Resend idempotency/delivery behavior, quota enforcement, and physical-device acceptance. Use a controlled test mailbox before any migration. Keep external sending disabled until those checks and the owner's intended release are explicit. No live-provider, DNS, TLS-to-Neon or hosted uptime success is claimed by the local evidence.
