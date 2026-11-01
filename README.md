# Postroom

A private Laravel 13.39.0 / React / Inertia webmail pilot. Desktop uses a full-width mailbox and conversation route with an optional reading pane. Phones use a drawer, full-screen search, reader and composer. Both layouts use the same authorized mailbox and versioned server draft.

**Local milestone, not a deployed mail service.** Provider adapters and deterministic simulators are implemented. External sending is disabled by default. No live email, DNS, provider account or paid resource has been changed. See [STATUS.md](STATUS.md) for executed tests and remaining release gates, and [the UI evidence report](docs/UI_REPORT.md) for the supplied acceptance checklist.

## Run locally with Docker and PostgreSQL

Docker Compose is the production-compatible database profile. Its database lives in the `postroom-db` named volume; the PHP development server is local-only. These setup commands are for a new checkout. Keep an existing `.env` and `APP_KEY`; replacing the key makes encrypted stored mail unreadable.

```sh
cp -n .env.example .env
docker compose build
docker compose run --rm app composer install
docker compose run --rm app php artisan key:generate
docker compose run --rm app php artisan migrate
docker compose run --rm app php artisan db:seed --class=DemoSeeder
docker compose run --rm app npm ci
docker compose run --rm app npm run build
docker compose up -d
```

Open [Postroom locally](http://localhost:8082). Normal restarts only need `docker compose up -d`. Do not use `down -v` unless you intend to delete the local database. This is not a Render production image.

The fictional demo member is `mira@postroom.test`, password `postroom-local-only`. The fictional owner is `owner@postroom.test`, with the same password and the local-only authenticator seed `JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP`. The demo recovery code is `fictional-recovery-code`. These are public fixtures, never production credentials. The seed refuses to run outside local/testing mock mode. The owner cannot read Mira's mailbox.

## Direct local profile

Requires PHP 8.4+, Composer 2, and Node 22.18+ or 24.11+. The verified local Node release was 22.23.4. Install the PHP extensions required by `composer check-platform-reqs`, including SQLite for this convenience profile.

```sh
cp -n .env.example .env
composer install
php artisan key:generate
php -r "if (!is_file('database/database.sqlite')) touch('database/database.sqlite');"
php artisan migrate
php artisan db:seed --class=DemoSeeder
npm ci
npm run build
php artisan serve --no-reload --host=127.0.0.1 --port=8000
```

SQLite is only a local convenience. Production startup refuses non-PostgreSQL storage. `npm run dev` is available for development; browser/security evidence uses the built assets and the normal CSP. No paid editor extension or external font service is needed.

The local and test servers use `--no-reload` so Laravel preserves inherited database and security settings when starting PHP. Restart the server after changing environment configuration; PHP source changes still apply on the next request. Without this flag, the server can silently fall back to `.env` instead of the Compose or Playwright database.

## Verification

```sh
php artisan test
vendor/bin/pint --test
vendor/bin/phpstan analyse --no-progress
npm run check
npm run types:check
npm run types:worker
npm run test:worker
npm run build
npx playwright install chromium firefox webkit
npm run test:e2e
POSTROOM_BROWSER=firefox npm run test:e2e
POSTROOM_BROWSER=webkit npm run test:e2e
```

Playwright owns only `storage/e2e.sqlite`, seeds fictional messages, starts port 8010, and applies a deliberately small two-recipient daily test cap. It does not reset the normal application database. Browsers may require OS libraries (`npx playwright install-deps`); physical devices remain a separate gate. Traces and authentication state are ignored by source control. Screenshots in `docs/ui-evidence` contain fictional data only.

For PostgreSQL checks, first create **dedicated disposable** databases `postroom_test`, `postroom_concurrency`, and `postroom_auth_e2e` in the local container. The concurrency and HTTP authentication scripts each enforce their own database name and testing environment:

```sh
docker compose exec -T postgres createdb -U postroom postroom_test
docker compose exec -T postgres createdb -U postroom postroom_concurrency
docker compose exec -T postgres createdb -U postroom postroom_auth_e2e
docker compose exec -T -e APP_ENV=testing -e DB_DATABASE=postroom_test app php artisan test
docker compose exec -T -e APP_ENV=testing -e DB_DATABASE=postroom_concurrency app php scripts/verify-concurrency.php
docker compose exec -T -e APP_ENV=testing -e DB_DATABASE=postroom_auth_e2e app php artisan migrate --force
docker compose exec -T -e APP_ENV=testing -e DB_DATABASE=postroom_auth_e2e app php scripts/verify-auth-runtime.php
```

## Implemented boundaries

- Authentication without signup, owner/admin MFA session verification, server mailbox policies, no implicit administrator access to mail, original Postroom branding.
- Scoped lists/search, conversations, reply/forward drafts, star/read/archive/spam/trash/labels, version-checked Undo, shared autosaving composer, recipient validation, permitted From identities and saved preferences.
- User creation/suspension and usage/delivery/audit views inside Postroom. New receiving addresses explicitly remain **pending directory synchronization**; provider provisioning is not presented as complete.
- Transactional recipient reservations, immutable send intents, ambiguous outcomes kept separate from acceptance/delivery, recipient-level signed event processing, retained drafts on failure. Definite failures can be copied; uncertain sends cannot be blindly retried.
- Bounded MIME persisted in D1 before acceptance; leased imports acknowledge only after database commit. Raw MIME is retained; active HTML is sanitized and sandboxed, remote images blocked. Attachments are retained only within the original MIME; upload/download is disabled.
- Public-static-only service-worker cache, public offline explanation and private history/session checks. No durable offline draft, push, background send or native keyboard claim.

The default application budgets are 5 people, 25 MiB per mailbox, 350 MiB logical organization content, a 50 MiB accounted D1 spool, 256 KiB encoded MIME and a 750 MiB physical PostgreSQL admission ceiling. These are **application safeguards**, not provider plan guarantees. Unknown provider usage stays unavailable; stale outbound usage blocks admission. Quota reconciliation intentionally errs toward holding mail.

## Provider bootstrap and deployment

The Worker is in `worker/`, with D1 schema, signature verification and local runtime tests. `worker/wrangler.jsonc` deliberately contains undeployed placeholders. Its scheduled wake occurs only for an actual pending backlog, with backoff; there are no keep-alive pings.

The current control-plane surface supports read-only Cloudflare zone/DNS inspection and a deterministic mock. The integrated domain/DNS approval wizard, credential rotation, recipient-directory provisioning and complete administrator recovery lifecycle are still later-phase work. Do not deploy this as a finished routine-administration product yet.

Provider account creation/authorization, initial hosting/database deployment and application master-key creation are documented owner bootstrap exceptions. Billing, account verification/appeals, inaccessible Free metrics and offline disaster recovery remain provider/owner responsibilities. Before changing DNS or routing, generate an exact diff and obtain explicit approval. Do not activate R2, paid Workers, overages, extra quota-evasion accounts or keep-alives.

Go-live additionally needs real Cloudflare/Resend verification, Worker Free CPU measurement, backup/restore drills, production deployment hardening and physical-device acceptance. See [PLAN.md](PLAN.md), [SOURCES.md](SOURCES.md) and [STATUS.md](STATUS.md).
