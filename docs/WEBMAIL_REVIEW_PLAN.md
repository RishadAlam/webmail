# WebMail by Hookstack review and implementation

Date: November 1, 2026. User authorization: compare the entire application with Gmail UI/UX and colors, fix verified issues, rename the product to **WebMail by Hookstack**, and prepare it for production while preserving the existing strict-free architecture and security requirements.

The existing DESIGN.md, MOBILE_UX.md, UI_ACCEPTANCE.md and CODEX_PROMPT.md remain the specification; the user's new name supersedes their Postroom branding. The implementation builds on Laravel/React/Inertia and the existing database. No Google branding or authentication imitation, paid resource activation, real-mail fixtures, silent DNS changes, or invented verification.

## Approach and boundaries

Improve the current modular application instead of replacing working mail and draft state. Keep the familiar cool-neutral surfaces, blue primary actions, compact desktop rows and full-screen mobile flows. Unify authentication/settings/admin with the mail design system. Internal configuration names, protocol headers and persistent identifiers may retain legacy names where changing them would break existing data or installations; user-facing identity must be WebMail by Hookstack.

Production readiness has two parts: implement and test the local release requirements, then validate the actual free provider accounts, deployment, DNS approval, real email path, backups and physical devices. Local tests cannot certify those external gates. Record every remaining gate explicitly, and request credentials only when that live validation is the next executable step.

## Work packages

- [x] Review official Gmail references, existing code and live fictional UI; record independent visual and technical assessments and a comparison matrix.
- [x] Apply consistent WebMail by Hookstack branding to mail, authentication, settings, administration, page titles, install metadata, offline state, icons and current documentation. Preserve existing identities/data.
- [x] Fix verified account/session/authorization defects with regressions: administrator-controlled identity, safe account lifecycle, session invalidation and actionable MFA flows.
- [x] Complete the functional UI corrections found by review: typography/color tokens, mobile targets/reflow, enlarged text, safe navigation/drafts, meaningful error/loading/empty states and administration navigation.
- [x] Implement missing bounded administration/integration work needed for routine mailbox management: encrypted connection configuration, honest diagnostics, recipient-directory synchronization, aliases/membership/limits and authorized recovery/export operations. Provider mutations must remain explicit and reviewable; DNS changes require an exact diff and approval.
- [x] Prepare production execution and recovery: hardened Docker/runtime configuration, secure environment checks, owner bootstrap, release checks and verified local backup/restore procedure. Preserve strict-free limits and accepted mail.
- [x] Expand meaningful regression and acceptance coverage; run PHP on SQLite/PostgreSQL, Worker tests, static/type/build checks, browser/axe/screenshots across engines. Verify physical-device behavior only if actual devices are available.
- [x] Review the integrated change, resolve release-blocking findings, update STATUS.md, comparison/audit evidence and runbooks. Report actual results and unresolved external gates without calling an unverified service production-ready.

## Review focus

- Account changes must not delete accepted mail, orphan the owner, change provisioned identities or preserve stolen sessions.
- Rebranding must not rename stored keys/protocols in a way that loses drafts, breaks imports, resets accounts or consumes recovery codes.
- Search, Back, resizing, reauthentication and failed saves must preserve correct account-scoped navigation and drafts.
- Provider failure, stale usage and partial provisioning must never become success or zero usage; directory changes must be versioned and retryable.
- A deployment must fail closed on unsafe configuration and offer a tested restore path without relying on ephemeral storage.

## Execution notes

The user already authorized implementation and supplied the product/design specifications; routine reversible changes proceed without another design-approval pause. Impeccable 3.8.0 is reviewed/pinned in docs/impeccable-pin.json. Independent A/B critique runs are isolated; their findings are synthesized only after A completes. Backend account-safety fixes run separately from the UI work.

Baseline: commit 1b73af3, 55 PHP tests passing on each database (16 explicitly skipped starter features), 39 browser tests passing, local providers mocked. These results are a baseline, not proof of new changes.

Implementation scope is bounded: the complete domain/DNS/Worker/webhook wizard, role/ownership lifecycle and incident-reconciliation UI remain unfinished. Completed administration above means the documented supported vertical slices, not all later-phase requirements. Runtime and restore evidence is local only.
