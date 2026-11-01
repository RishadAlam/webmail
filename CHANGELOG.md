# Changelog

## WebMail review and implementation — November 1, 2026

- Renames the displayed product to **WebMail by Hookstack**, preserving existing accounts, encrypted mail and compatible internal identifiers.
- Unifies Gmail-familiar mail, mobile, authentication, MFA, account settings and administration; fixes theme contrast, search scope, selection/focus, draft navigation, enlarged text and protected wide-table rendering.
- Adds bounded mailbox/alias/member/quota administration, encrypted owner connections, idempotent receiving-directory synchronization, original MIME export and explicit Trash deletion with retained replay/delivery evidence.
- Fixes managed-identity/session security, MIME reply semantics, provider deadlines and draft-inclusive storage accounting.
- Adds a hardened Free-compatible Docker runtime, secure startup checks, single-use owner bootstrap and a verified isolated PostgreSQL recovery drill.
- Adds independent review, browser/axe/screenshots and SQLite/PostgreSQL/Worker regressions. Actual outcomes and unfinished release gates are in [STATUS.md](STATUS.md); no live deployment, provider verification or DNS changes are claimed.

## Revision 2 — November 1, 2026

### Design changes

- Gmail becomes the primary desktop and mobile UI/UX reference, with original Postroom identity and code.
- Replaces mandatory desktop three-pane layout with a full-width list/conversation default and optional reading pane.
- Replaces teal-first styling with cool neutral/white surfaces and restrained blue accents.
- Adds docked/minimizable/expandable desktop compose and shared full-screen mobile compose state.
- Specifies mobile inbox, drawer, selection, swipe alternatives, sheets, search, Back behavior, keyboard, safe areas, and touch targets.
- Adds a PWA installation shell without native-app, push, offline-mail, or always-on claims.
- Adds explicit private-data cache exclusions, logout/history checks, and safe service-worker updates.
- Requires phone-usable administration and accurately labeled usage meters.
- Adds UI_ACCEPTANCE.md and CODEX_UI_UPDATE.md.
- Synchronizes PLAN.md, CODEX_PROMPT.md, DESIGN.md, AGENTS.md, README.md, and SOURCES.md.

### Unchanged boundaries

- Existing Laravel/Cloudflare/Resend architecture and strict-free pilot constraints.
- No R2 activation, paid PWA wrappers, additional native-app infrastructure, or quota evasion.
- Provider account bootstrap exceptions and sending policies.
- Server-side authorization, safe mail rendering, idempotent sending, and quota enforcement.

### Evidence status

Documents updated only. No application code has been executed, no screenshot of an implemented UI produced, and no browser/device/provider tests run. Inherited platform facts require implementation-time verification; the research for this revision focused on public Gmail and PWA/mobile references.
