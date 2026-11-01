# Codex master build prompt — WebMail

You are building **WebMail**, a private, polished, strict-free Laravel webmail application for a small business that already owns a domain managed through Cloudflare.

Work as a senior Laravel engineer, email-systems engineer, security reviewer, and product designer. Deliver functioning, tested software—not a mock dashboard, not a landing page, and not an exaggerated claim of production readiness.

Read `AGENTS.md`, `PLAN.md`, `DESIGN.md`, `MOBILE_UX.md`, `UI_ACCEPTANCE.md`, and `SOURCES.md` first. The plan is the product specification. Recheck current official documentation for any version, API, free-tier allowance, or compatibility that affects implementation. Record verified versions and decisions. Do not use undocumented API guesses or silently replace this architecture with paid services.

## 1. Outcome

An owner can connect provider credentials and manage users, mailboxes, aliases, domains, limits, routing, and sending from our own administrator panel. Ordinary users log into our own browser application to read, compose, reply, reply-all, forward, organize, and search mail. They must never need Cloudflare, Resend, Render, or Neon accounts.

Explain the unavoidable initial bootstrap honestly: provider account creation/authorization, initial deployment, application master key, and database connectivity happen before the web wizard can run. Provider billing, account verification, appeals, inaccessible free-tier metrics, and offline disaster recovery are not magically available through an API. Do not invent buttons that claim otherwise.

## 2. Non-negotiable budget

Set `STRICT_FREE_MODE=true` in the default deployment. This means no R2 activation, no Workers Paid or Containers, no paid Render services, no paid database plans, no paid background workers, no managed Redis requirement, no paid search or editor services, no paid UI kit, no AI API calls, no automatic upgrades, and no overages deliberately enabled by the application.

The budget is for service operation, excluding the already-owned domain's renewal and any developer/Codex costs. Clearly call this a limited free-tier pilot, not an unlimited or uptime-guaranteed mail host. Do not create additional provider accounts to bypass quotas or use artificial uptime pings.

The app must safely hold or reject work when capacity is exhausted, preserving drafts and previously accepted messages. A free quota failure is not permission to provision a paid resource.

## 3. Stack

- Latest verified stable Laravel 13.x; v13.39.0 was verified when this specification was written on November 1, 2026. Recheck before scaffolding. Commit `composer.lock` and the frontend lockfile.
- Supported PHP 8.4 Docker runtime, unless a documented compatible decision changes it.
- Official Laravel React starter kit with compatible Inertia, React, TypeScript, Tailwind, and shadcn/ui versions. Customize the components and layouts thoroughly.
- Render Free Docker web service for PHP. Never store durable data on its local filesystem.
- Neon Free PostgreSQL for Eloquent, identity, configuration, message content, attachments, drafts, delivery jobs, sessions, and audits.
- Cloudflare Email Routing and a minimal TypeScript Email Worker.
- D1 Free for the durable ingress/webhook spool and a versioned recipient directory—not as an invented native Eloquent driver.
- Resend Free REST API for outbound mail.
- Tiptap open-source editor features, one consistent Lucide icon set, Playwright, and axe-core. Verify package licenses/compatibility; do not enable paid extensions.

Use provider interfaces so outbound delivery and usage reporting can be replaced independently of stored mail. Keep the application a coherent modular monolith with one small edge service, not unnecessary microservices.

## 4. Initial free-mode application limits

Start with one business domain and five admin-created users as product defaults. These are not provider mailbox limits.

Default to 25 MiB per mailbox, 350 MiB organization message-content budget, and 256 KiB maximum complete encoded MIME message. Attachments are initially disabled; enable only small allowlisted attachments after parser/security tests, still inside that total-message cap. Display the restriction clearly; never discard attachments silently.

Use a 50 MiB D1 ingress budget with reserved control/receipt capacity. Configure conservative PostgreSQL footprint thresholds below the verified account storage limit. Count raw messages, parsed representations, attachments, indexes, drafts, outbox records, and temporary duplication honestly.

Use current provider limits as verified defaults, not immutable facts: Resend 100 daily recipient deliveries and 3,000 monthly, Workers Free 100,000 requests/day and 10 ms CPU/invocation, D1 Free 500 MB/database with account read/write limits, and the actual Neon/Render account allowances. Admins can lower limits but cannot inflate provider ceilings by editing a form.

## 5. Bootstrap and administration

Implement a single-use installation claim, owner creation, owner MFA, and a resumable connection wizard. Credential fields are server-only, encrypted, masked, and write-only; never put management keys in JavaScript, localStorage, logs, or Git.

Cloudflare integration must validate scoped credentials, enumerate allowed accounts/zones, inspect DNS and existing routing, provision/attach D1, deploy the prebuilt Worker and secrets, configure routing to the Worker, and retrieve available analytics. Use exact current documented endpoints and permissions.

Resend integration must create/attach the sending domain, leave Resend receiving disabled, retrieve provider-generated DNS records, verify status, create a webhook by API, store/synchronize the signing secret, create/use an appropriately restricted sending key, and retrieve usage with the required management permission.

Before DNS changes, show a precise diff. Preserve Cloudflare incoming MX records and unrelated website/DNS records. Review existing address-specific routes that would bypass a catch-all. Never create a second conflicting SPF policy at the same hostname. Do not force DMARC enforcement without verification and a deliberate migration plan.

Provisioning must be an idempotent state machine with durable resource IDs, completed steps, retryable failures, and safe rollback of only application-owned changes. DNS propagation and provider verification must remain pending until actually confirmed.

Provide administration for people, mailbox memberships, aliases/shared mailboxes, storage allocations, permitted sender identities, credential rotation, DNS diagnostics, delivery status, suppressions, quotas, message-size/attachment policies, exports, audit records, and safe maintenance. Separate account-management permission from reading other people's messages.

## 6. Inbound email and sleeping-host resilience

Use the envelope recipient to resolve a configured active address in D1. Reject unknown/disabled recipients and over-limit messages explicitly. A catch-all must not become an arbitrary account generator.

Reserve spool capacity atomically. Store the bounded raw MIME payload, envelope data, receipt ID, checksum, and import state in D1 before completing acceptance. Keep the Worker small enough for the free CPU budget; do not perform MIME parsing or HTML sanitization there.

Laravel pulls bounded batches through a signed/authenticated Worker API, imports transactionally, records receipt IDs uniquely, and acknowledges only after commit. A crash or repeated request must not duplicate mail or lose the only copy. Do not deduplicate unrelated legitimate messages solely because their Message-ID headers match.

A Worker schedule checks D1 for real backlog at a conservative interval, initially 15 minutes. Wake PHP only for actual due work; never query the sleeping database simply to keep it awake. User-triggered sync is allowed and rate-limited. Use leases, bounded execution, backoff, circuit breakers, and visible last-sync/backlog status.

Never automatically expire unimported accepted messages. When the spool is full, stop new admission visibly. Document Cloudflare's permanent rejection semantics and test actual platform failure behavior; do not claim guaranteed SMTP retry or unlimited buffering.

## 7. Compose and delivery

Implement drafts with visible autosave state and conflict-safe versioning; compose; reply/reply-all; manual forwarding; signatures; authorized aliases; contacts; folders/labels; and header-based conversation threading. Preserve original MIME/headers. Keep BCC private.

Persist send intent and reserve recipient quota transactionally before calling Resend. Count To, CC, and BCC delivery attempts correctly. Check sender authorization on every request; editing a From field must not grant permission.

Use stable idempotency keys for immutable send intents. Resend's documented protection lasts 24 hours; persist our own delivery state and reconcile ambiguous results. Never blindly retry an old unknown send after that protection expires. A provider timeout is not automatically a confirmed failure.

Display queued, accepted, delivered-to-server, bounced, failed, held-for-quota, and uncertain states accurately. Verify webhook signatures and timestamps against raw bytes, persist before acknowledgment, deduplicate event IDs, and handle out-of-order events. Suppress hard-bounced/complaining recipients according to policy.

Use local transactional delivery for configured internal recipients where implemented, with independent mixed-recipient status and privacy. Keep campaigns, public relay, cold outreach, IMAP/POP, guaranteed scheduled sending, and AI features outside v1. Require owner confirmation that sending fits Resend policy; do not pretend an admin checkbox overrides that policy.

## 8. Real usage progress bars

Create reusable meters with provider/resource/scope, used/limit/reserved, units, window and reset time, last observation, accuracy, freshness, and error state.

Use Resend `GET /usage` for real daily/monthly totals and limits. Use Cloudflare's documented analytics and D1 metadata where accessible. Measure mailbox/spool bytes and PostgreSQL footprint locally. The documented Neon consumption-history v2 API is not available on Free: show unavailable or an explicitly labeled estimate rather than inventing a provider total. Apply the same rule to inaccessible Render billing metrics.

Distinguish provider-reported, locally measured, estimated, unavailable, and stale. Never turn a failed API request into 0% or a green health state. A null unlimited cap is different from a missing cap.

Use proposed 70% warning, 85% critical warning, 95% protected-headroom behavior, and actual-limit blocking. These are application policies. Make enforcement resource-specific so cleaning up storage or acknowledging durable data remains possible. Preserve a small operational reserve.

Quota admission must be concurrency-safe. Reconcile local reservations with provider snapshots without double-counting. Account for other applications sharing an account. Cache/schedule usage refresh conservatively; monitoring must not exhaust the service it monitors.

Use provider-reported reset metadata, and document the current disagreement between Resend's account-limits description and its API reference concerning calendar-day versus rolling-day wording. Until tested, use a conservative guard rather than assuming local midnight. Display times in the admin's timezone, initially Asia/Dhaka, while preserving UTC data.

All bars need accessible names, text values, remaining capacity, and explanatory status beyond color. Unknown data gets no fake numeric percentage. Do not label the operating cost as “$0 guaranteed”; show the configured free-only mode and its limitations.

## 9. Security requirements

Use native Laravel policies/middleware, secure sessions, CSRF protection, authentication throttling, and administrator MFA. Disable public registration. Enforce organization/mailbox authorization for message lists, searches, attachments, exports, and provider actions. UUIDs are not access control.

Sanitize untrusted mail HTML with maintained libraries and display it in a sandboxed scriptless reader, not the application's DOM. Block remote images by default. Prevent active content, unsafe URL schemes, header injection, open redirects, forwarding loops, and arbitrary server-side URL fetching. Restrict MIME nesting/decoded sizes and attachment types. Do not claim malware scanning without an actual scanner.

Keep master encryption keys outside the database. Encrypt provider credentials and consider separately encrypted raw content. Document search/privacy trade-offs and that server-side encryption is not end-to-end encryption. Redact sensitive logs and audit privileged actions. Test safe credential rotation and recovery.

Exports must be authorized, resumable/bounded, integrity-checked, and backed by a tested restore procedure. Do not store the only backup on the ephemeral web host.

## 10. Gmail-style design, app-like mobile, and impeccable taste

The user explicitly chose Gmail as the desktop and mobile UI/UX reference. Follow `DESIGN.md`, `MOBILE_UX.md`, and `UI_ACCEPTANCE.md`. This replaces the earlier mandatory three-pane desktop layout and teal-first aesthetic. Keep WebMail's own name, original icon, domain, and authentication; do not use Google's logo, a Google sign-in lookalike, proprietary assets, copied production code, or claims of affiliation.

Use the reviewed/pinned Impeccable skill with Codex when available. Verify supported initialization, critique, audit, and polish commands; do not pretend a tool ran when unavailable. Use the existing customized accessible UI/editor stack, Playwright, axe-core, and manual visual review. Keep all real mail and credentials out of design tools.

### Desktop

Build a Gmail-familiar top search bar, collapsible left navigation with Compose, aligned message rows, restrained blue accents on cool neutral/white surfaces, and functional Quick settings. The default main surface shows the list; opening a conversation replaces it. Provide an optional right-side reading pane only where it fits. A below-list pane is optional later work, not a prerequisite.

Use a lower-right compose window with minimize/expand, a shared persistent draft, authorized From identity, recipient chips, clear CC/BCC, subject, compact formatting, accurate save state, and Send. Preserve context on Back. Use real selection counts/scope and keyboard-safe actions.

Do not copy unsupported Chat, Meet, AI, calendar, snooze, category-classification, or Google-app-switcher UI. No nonfunctional buttons or simulated provider state. Component defaults are not finished design.

### Mobile and tablet

Build a dedicated app-style single-pane mobile shell, not a shrunken desktop. Use a rounded search/header, menu drawer, account avatar, sender-based message rows, a floating Compose action, full-screen conversation/search/compose routes, and accessible contextual bottom sheets. Use tablet/desktop panes only when available width supports them.

Implement swipe-to-archive and swipe-to-mark-read/unread with explicit control alternatives and genuinely reversible Undo. Long-press selection is supplemental; provide avatar/select-menu selection. Preserve search, scroll, focus, and draft state through Back, rotation, and responsive changes. Do not add a decorative bottom bar or empty Chat/Meet destinations.

Handle safe areas, zoom, real software keyboards, dynamic viewport changes, and reduced motion. Keep the caret and essential compose actions reachable. Do not rely on 100vh/100dvh alone. Use a roughly 48 CSS px mobile target design default and reflow at 320 px. All supported administration and usage-meter workflows must remain usable on a phone.

### PWA and privacy

Provide HTTPS, a manifest, original icons, theme colors, and standalone display with accurate install guidance. Normal browser tabs remain supported; do not claim that installation creates a native binary or guarantees background operation.

Allowlist only public static assets and a public offline shell for service-worker caching. Do not cache authenticated HTML, Inertia payloads, APIs, private mail, attachments, exports, or secrets. No persistent offline mailbox or private draft storage by default. Keep an open unsaved draft in memory with an honest Not saved warning; do not promise survival after reload/closure.

Do not force an update/reload over a dirty draft. Test logout, history/bfcache, and account switching for private-data leakage. Do not add paid PWA infrastructure, continuous background polling, artificial keep-alives, or permission prompts for nonexistent push features.

### Craftsmanship and verification

Use deliberate spacing, restrained surfaces, readable typography, coherent icons, natural microcopy, and real failure states. Avoid generic SaaS dashboards, decorative gradients/glass, oversized cards, giant headings, emoji icons, fake charts, and gratuitous animation. Dark mode must be designed; do not invert message HTML.

Share domain logic and state across layouts. Never mount duplicate hidden composers or double requests. Use the existing Inertia routing approach, not a conflicting second router. Preserve drafts on any failure, distinguish saved from in-memory, and keep real free-limit bars honest.

Run `UI_ACCEPTANCE.md` with screenshots at 320, 360, 390, 430, 768, 1024, and 1440 px, plus intermediate widths, text enlargement, keyboard-only, light/dark, reduced-motion, and failure states. Aim for WCAG 2.2 AA. Record real iPhone/Android install/keyboard tests when available; Playwright emulation/WebKit is not evidence of a physical-device test. Mark blocked checks explicitly.

## 11. Build sequence and deliverables

Work in runnable vertical milestones:

0. Verify versions/limits, create local environment and provider fakes, prove one inbound durable receipt and one outbound send path, benchmark the email Worker.
1. Bootstrap, auth/MFA, policies, users/mailboxes, setup wizard, design tokens, Gmail-style desktop shell, and app-style mobile shell sharing state.
2. Recipient directory, D1 spool, bounded import, safe MIME reader, read-only inbox and search.
3. Drafts/composer, authorized sending, quota reservations, delivery events and recovery.
4. Full administration, progress bars, aliases/shared mailboxes, diagnostics, exports and audit.
5. Security/concurrency/recovery tests, mobile/PWA privacy and update tests, UI_ACCEPTANCE.md evidence, accessibility/visual polish, and deployment runbook.

Deliver application and Worker source, migrations, Docker and free-host configuration, `.env.example`, realistic synthetic seeds, PHP/TypeScript tests, browser screenshots, mobile/PWA verification report, provider scope documentation, quota/recovery runbooks, and an honest feature-status report.

Run available checks and record exact results. Test cross-user access denial, disabled accounts, malicious HTML, malformed MIME, storage full, duplicate callbacks/imports, rate limiting, stale metrics, last-quota-slot races, BCC privacy, ambiguous sends, credential rotation, sleeping-host recovery, and backup restore.

When real credentials are unavailable, build real integration adapters with deterministic mocks and mark live verification as blocked. Never report invented delivery, DNS verification, deployment, or test results. Keep `STATUS.md` current with implemented, tested, blocked, and next actions. Do not stop at a plan or scaffold while pretending the product is complete.

Begin with Phase 0 and the documented design foundation. Ask only for secrets or genuinely blocking external authorization when needed; do not ask broad product questions already answered by this specification. Do not perform paid or destructive provider actions without explicit authorization.
