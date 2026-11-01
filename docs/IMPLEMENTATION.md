# Postroom Phase 0 and responsive mail implementation plan

**Goal:** Establish a runnable Laravel pilot with durable inbound/outbound contracts and functioning Gmail-familiar desktop/mobile vertical slices.
**Architecture:** Laravel 13.39.0, Inertia 3, React 19; PostgreSQL production source of truth. A small TypeScript Worker uses D1 for durable ingress; deterministic local providers require no credentials. Desktop/mobile share one draft and server authorization.
**Spec:** CODEX_PROMPT.md, PLAN.md, DESIGN.md, MOBILE_UX.md, CODEX_UI_UPDATE.md, UI_ACCEPTANCE.md.

## Constraints and scope

Strict-free mode; no paid services, R2, overages, external DNS mutations or keep-alives. 256 KiB MIME, 25 MiB mailboxes, 350 MiB content and 50 MiB spool defaults. Attachments disabled. Phase 0 live-provider and physical-device gates remain explicitly pending without credentials/devices. Advanced control-plane provisioning, backup/restore and the full later-phase administrator lifecycle are tracked separately, never presented as implemented.

## Review focus

Cross-mailbox access; import replay/crash before acknowledgment; ambiguous sends and quota races; dirty draft navigation/conflicts; private history/cache/account isolation.

## Tasks

- [x] Scaffold official pinned starter, lock dependencies, local Docker/PostgreSQL and direct local development, safe authentication and fictional seed.
- [x] Add server regressions for scoped mail, versioned drafts, idempotent quota-protected sending and durable import. Implement models, policies, providers, controller endpoints and signed callbacks; verify SQLite and PostgreSQL.
- [x] Add Worker regressions against local D1 for bounded receipt storage, rejection, replay, restart and acknowledgment. Implement the minimal Worker; live CPU/failure gates remain explicit.
- [x] Implement desktop/mobile inbox/read/back, search, composer, reply/forward, actions/undo, quick settings and phone-usable local admin people/usage. Verify actual Laravel workflows with a simulated provider.
- [x] Add public-only PWA shell, failure/privacy/browser coverage and viewport screenshots. Run axe, manual critique/polish and static/server/Worker checks; record remaining device and full-case gaps.
- [x] Record evidence, commands and pending provider/device/later-phase work in STATUS.md and the linked UI acceptance report.

## Execution notes

The user supplied the approved architecture/design and explicitly requested implementation without broad product questions. The workspace initially had no usable Git metadata; local Git was initialized for the implementation and dependency-lockfile commit. No remote is configured or pushed. Local SQLite is an explicit convenience profile, never a Render durable-store choice; Docker/PostgreSQL is the production-compatible profile.

These checked tasks describe the **local milestone**, not completion of the full product or every UI case. Live provider, full provisioning/recovery, production hosting and physical-device gates are listed in STATUS.md. Independent read-only backend and UI reviews found concrete defects that were fixed and retested; the final backend review's suspension race was reproduced with a regression test and authorization was moved inside the reservation lock.
