# Contributing to WebMail by Hookstack

Contributions should improve a complete, testable mailbox workflow. This is a strict-free pilot with unfinished release gates, not a hosted email service.

## Start here

Read [README.md](README.md) for local setup, [STATUS.md](STATUS.md) for current evidence and [PLAN.md](PLAN.md) for scope. UI work follows [DESIGN.md](DESIGN.md), [MOBILE_UX.md](MOBILE_UX.md) and [UI_ACCEPTANCE.md](UI_ACCEPTANCE.md). Check relevant official documentation before changing provider endpoints, permissions, limits or dependencies; update [SOURCES.md](SOURCES.md) and commit lockfiles.

Use the local mock providers and fictional fixtures. Do not seed a production database, replace an existing `APP_KEY`, put secrets in Git, or use real email in tests or screenshots. Playwright resets only its dedicated `storage/e2e.sqlite` database. PostgreSQL tests must use the dedicated test databases documented in the README.

## Propose a change

1. Open an issue describing the concrete problem and intended behavior for substantial changes.
2. Create a focused branch from `main` and implement a complete workflow, including failure handling.
3. Add regression coverage for meaningful behavior changes. Keep commits focused on completed steps.
4. Run the relevant checks below and record exact results, including skipped or unavailable checks.
5. Open a pull request with the problem, resulting behavior, tests, and any remaining limitations. UI changes need fictional screenshots at desktop and mobile sizes.

Security reports belong in the [private reporting process](SECURITY.md), not public issues.

## Local checks

```sh
php artisan test
vendor/bin/pint --test
vendor/bin/phpstan analyse --no-progress
npm run check
npm run types:check
npm run types:worker
npm run test:worker
npm run build
npm run test:e2e
POSTROOM_BROWSER=firefox npm run test:e2e
POSTROOM_BROWSER=webkit npm run test:e2e
```

Install Playwright browsers and their OS dependencies as described in the README. Run browser suites sequentially in a shared checkout and do not rebuild assets during a suite. Run PostgreSQL validation for data, authorization, retention or quota changes. Provider mocks, browser emulation and local container tests do not prove live delivery or physical-device behavior.

The GitHub workflow uses standard public-repository Ubuntu runners, read-only repository permissions, immutable action references and mock providers. It has no deployment job, provider credentials, scheduled keep-alive, artifact upload or dependency-cache upload. It is not a substitute for live-provider and deployment acceptance.

## Required boundaries

- Accept incoming mail only after durable storage; acknowledge imports only after the main database commits.
- Preserve drafts and accepted mail on failure. Keep acceptance, delivery, failure and uncertainty distinct.
- Enforce mailbox access, sender identities and quota reservations server-side. Administrators do not implicitly gain access to user mail.
- Keep unknown and stale usage visible. Do not report missing provider usage as zero.
- Do not add paid services, R2, paid extensions, automatic overages or artificial keep-alives.
- Do not cache private pages, mail, attachments, Inertia payloads or exports in the service worker.
- Present an exact DNS/routing diff and obtain the operator's approval before any external mutation.

## Community and licensing

Be respectful, discuss the work rather than the person, and avoid sharing anyone's private data. Contributions are submitted under this repository's [MIT license](LICENSE); retain third-party attribution and license notices.
