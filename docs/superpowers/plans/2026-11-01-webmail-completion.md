# WebMail completion work

## Target and decisions

The user supplied eleven Gmail screenshots and selected **Complete WebMail within the existing strict-free architecture**. Improve real mail workflows and usability while retaining WebMail branding, existing permissions, encrypted private content, shared drafts, and truthful provider states. The screenshots are visual/feature references only; no real message content or account identifiers are copied into this repository.

Approaches considered: a cosmetic Gmail imitation would leave missing behavior; a full Gmail platform would require a different architecture and budget. The selected approach is an integrated expansion of this private mail application, with production claims limited to verified evidence.

Global constraints: no paid services, R2, paid AI, artificial keep-alives, public signup, implicit admin mail access, real credentials in code, or authenticated offline caching. External DNS and deployment changes are not part of this local implementation. Exact timed/background delivery, Google integrations, POP/IMAP, and offline private mail are outside the selected architecture. Current live-provider, recovery, and physical-device release gates remain open until demonstrated.

## Implementation

- [x] Mail organization: visible All mail, manual importance, durable snooze, multiple labels with management, category assignment backed by explicit rules/manual actions, bounded search operators, filters and blocked senders.
- [x] Mail preferences and writing: full settings, shared persisted preferences, page size/inbox ordering, default reply, snippets/hover actions/spellcheck, opt-in shortcuts/tab unread count, signatures, private templates, contacts and recipient suggestions.
- [x] Reading and navigation: third density, below-list pane with small-screen fallback, better selection/actions, stable label colors, attachment indicators and authorized attachment access, preserved draft/query/scroll/focus.
- [x] Durability: recover unattempted queued sends safely, accommodate real cold starts, retain acknowledged inbound content for a bounded recovery window, and expose actionable import failures without private content.
- [x] Verification: meaningful backend and Worker regressions, complete available static checks, Chromium desktop/mobile/keyboard/accessibility flows, manual rendered review, updated comparison and release evidence.

## Component boundaries and contracts

Organization backend owns `MailController` query/mutations, organization models/services/controllers/migration, ingress-rule application, and organization PHP tests. Mail settings owns a separate settings controller, user-owned writing/contact data, settings pages/components, preference provider, and corresponding PHP tests. Root coordinates shared types, routes, mail UI, CSS, composer integration, and browser tests. Durability work owns Worker recovery and delivery recovery services/tests. Avoid edits to the previous login work.

Existing message labels remain serialized as names. New mail props include a mailbox label catalog (`id`, `name`, `color`); `filters.label` and `filters.category` preserve selected views. Messages expose `important`, `snoozed_until`, and `category`. Folder options include `important` and `snoozed`; category choices are `primary`, `promotions`, `social`, `updates`, and `forums`. Categories express manual/rule-based organization, not inferred AI classification.

Preferences: existing values plus density `default|comfortable|compact`, pane `none|right|bottom`, page_size `10|30|50|100`, inbox_order `newest|unread|starred|important`, default_reply `reply|reply-all`, snippets, hover_actions, spellcheck, keyboard_shortcuts, unread_badge, and auto_advance `list|next|previous`. Changes must merge atomically and remain in sync across settings and mail without replacing an unsaved composer. Default page size stays 30. Organization actions remain explicitly scoped to selected/displayed message IDs (maximum 100).

Shared mailbox organization follows existing shared message state. Contacts, templates, signatures and personal preferences belong to the current user. Blocking routes retained incoming messages to Spam; it never deletes accepted mail. Every new endpoint enforces ownership/membership server-side.

## Validation ledger

- Audit: existing backend, frontend, deployment code and official provider limits reviewed independently. Missing queued-send recovery, short cold-start timeout, and immediate acknowledged-payload deletion identified.
- Ruling: retain the current working tree so the user sees changes in the already running local preview; preserve all earlier uncommitted login work.
- Ruling: retain the existing strict-free services and do not claim Gmail feature parity or production readiness from local tests. Live deployment and provider proof are separate release gates.

## Delivered evidence

Organization, personal mail/writing preferences, authorized attachments, and bounded recovery are integrated into the existing application. Migrations 000010–000013 were applied locally after a protected SQLite backup; existing mail, identities, credentials and the application key were preserved. The normal local database was not reseeded.

Fresh backend validation: 297 PHP tests passed, 16 intentional starter-feature skips, 2,153 assertions; 28 local Miniflare/D1 Worker tests and 10 frontend state/search tests passed. Pint, PHPStan, frontend/Worker TypeScript, formatting/lint and the production asset build pass. The final complete Chromium, Firefox and WebKit suites each pass 48 workflows (144 total) against the isolated mock-provider SQLite test application. Final search validation, Unicode handling and composer-focus fixes are included. See [the current evidence report](../../UI_REPORT.md) for engine results and [STATUS.md](../../../STATUS.md) for release gates.

Review caught and corrected: destroyed Tiptap editor access during external updates, contact field focus, stale organization state after draft-save navigation, mutable controls during slow saves, duplicate conversation rows in auto-advance, label/color synchronization, paused-filter state, mixed-folder snooze actions, attachment request reconciliation and enlarged-text settings overflow. Browser tests cover real authorized database mutations, delayed saves, lost responses, exact attachment bytes, and the retained draft.

The checked tasks describe this local implementation milestone. The full target provisioning wizard, broader provider reconciliation, owner/role transfer, live provider deployment, hosted PostgreSQL validation, off-machine recovery and actual-device/assistive-technology evidence remain release work; they are not marked complete by these checks.
