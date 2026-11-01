# Postroom — a strict-free Laravel webmail planning specification

**Planning date:** November 1, 2026  
**Working product name:** Postroom (a placeholder, not a trademark clearance)  
**Purpose:** A private, single-business webmail application with administrator-created users, Cloudflare inbound email, and Resend outbound email.  
**Delivery status:** This package is a build specification, not implemented or tested application code.  
**Design revision:** 2 — Gmail-style desktop with a distinct app-like mobile experience. See `DESIGN.md`, `MOBILE_UX.md`, and `UI_ACCEPTANCE.md`. This revision changes the frontend specification; existing service/version facts must still be reverified before implementation.

## 1. Decision and boundaries

Build a small, carefully limited webmail application with Laravel 13, a custom React interface, an administrator control panel, and API-based provider integration. Laravel framework v13.39.0 was the latest stable framework release verified for this plan. Recheck before installation, use the latest stable compatible 13.x release, and commit dependency lockfiles. Laravel 13 supports PHP 8.3–8.5; use a supported PHP 8.4 container unless verified dependencies justify another supported version. [S1, S2]

The default deployment is **a $0-service-bill pilot**, not an unlimited or availability-guaranteed business email service. The budget excludes the existing domain's renewal, development labor, Internet access, and any Codex subscription. The deployed application must not depend on paid AI APIs.

Four boundaries are non-negotiable:

1. **Laravel needs PHP hosting.** Do not pretend a conventional Laravel application runs natively on Workers Free. The proposed PHP host is Render Free using Docker. Cloudflare Containers is not a strict-free substitute: its documented pricing requires Workers Paid. [S3, S4]
2. **Bootstrap cannot happen entirely inside an application that does not yet exist.** The owner must initially create/authorize provider accounts and supply deployment secrets. Account verification, billing, provider suspension appeals, and an unavailable application’s recovery cannot always be controlled through application APIs.
3. **Routine operations stay inside Postroom.** Users never need Cloudflare, Resend, Render, or Neon accounts. After initial authorization, an administrator manages users, addresses, routing, domain verification, sending, limits, and diagnostics inside Postroom wherever supported APIs exist.
4. **Strict-free mode excludes R2.** Do not activate R2, Workers Paid, paid compute, add-ons, or automatic overages. A future R2 adapter can be designed, but is not part of this deployment.

Resend's acceptable-use policy requires opted-in recipients and prohibits unsolicited messages, including cold outreach. Before enabling external sending, the owner must confirm that the intended correspondence is permitted. This application must not be presented as an unrestricted SMTP service. [S14]

## 2. Chosen architecture

| Responsibility                | Component                                                                      | Reason                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Browser UI and administration | Laravel React starter kit, Inertia, TypeScript, Tailwind, customized shadcn/ui | One coherent application rather than separate mismatched admin and mailbox products.    |
| PHP application               | Render Free Docker web service                                                 | A documented PHP/Laravel deployment path with no mandatory paid worker process.         |
| Main relational database      | Neon Free PostgreSQL                                                           | Native Laravel/Eloquent database support and durable storage outside the web container. |
| Incoming SMTP handling        | Cloudflare Email Routing and a small TypeScript Email Worker                   | Accept messages independently of PHP availability.                                      |
| Durable ingress buffer        | Cloudflare D1 Free                                                             | Preserve accepted raw messages and signed webhook events while the PHP host sleeps.     |
| Outgoing delivery             | Resend Free REST API                                                           | Keep outbound transport separate from mailbox ownership and storage.                    |
| Dispatch signal               | Worker scheduled handler plus D1 job hints                                     | Wake Laravel only when actual pending work exists.                                      |
| Static assets                 | Compiled into the app; ordinary Cloudflare caching for versioned public assets | Avoid an extra frontend hosting dependency initially.                                   |

The official Laravel React starter kit currently uses React 19, Inertia 3, Tailwind 4, and shadcn/ui. Match its compatible versions rather than mixing independently guessed versions. [S15]

```text
                           YOUR EXISTING DOMAIN
                                   |
                  Cloudflare DNS / Email Routing
                                   |
                              Email Worker
                     validate envelope + small size
                                   |
                 D1 durable spool and recipient directory
                                   |
                authenticated pull / bounded reconciliation
                                   |
Browser ---> Cloudflare HTTPS ---> Laravel on Render Free
                                   |             |
                             Neon Postgres    Resend API
                        accounts + all mail       |
                                               recipient
                                                   |
                               signed Resend webhook
                                                   |
                              Worker verifies + D1 buffers
                                                   |
                                  Laravel reconciles status
```

**Database division:** PostgreSQL is the source of truth for users, authorization, mailbox contents, configuration, drafts, and send jobs. D1 is only the edge recipient read-model, ingress/event spool, job hints, and compact operational counters. Do not use D1 as a pretend native PostgreSQL/SQLite connection for Eloquent.

**No durable files on Render:** Original messages, attachments, exports-in-progress metadata, sessions, and jobs must survive container restart. Use PostgreSQL for durable application records; treat any local files as temporary. Render Free storage is ephemeral and its own free PostgreSQL offering is time-limited, so neither is the primary mailbox store. [S5, S6]

## 3. Free-tier envelope and conservative application defaults

Published provider allowances are reference values, not promises that never change. Capture the verified plan, source, scope, and verification date in the installation record.

| Resource                | Published allowance verified for this plan                                                              | Proposed application rule                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Render Free web service | 750 instance-hours/workspace/month; idle suspension applies                                             | One web service; no paid workers; no artificial keep-alive pings.        |
| Neon Free               | 1 GB PostgreSQL storage/project; 100 CU-hours/project/month; 5 GB public network transfer/project/month | Start below the maximum, with limited background activity.               |
| Workers Free            | 100,000 requests/day; 10 ms CPU/invocation                                                              | Minimal email handler; no MIME parsing or HTML sanitization at the edge. |
| D1 Free                 | 500 MB/database; 5 GB/account; 5 million rows read/day and 100,000 written/day                          | Small indexed spool, not a long-term attachment archive.                 |
| Resend Free             | 100 recipient deliveries/day; 3,000/month                                                               | Shared organizational allowance, enforced before each send.              |

Provider sources: [S5, S7, S8, S9, S10, S11].

**Initial product defaults (design choices, not provider limits):**

- One business domain and five admin-created users initially. Neither is an invented provider mailbox restriction.
- 25 MiB soft mailbox allocation per user; a 350 MiB organization mail-content budget.
- 256 KiB maximum complete encoded MIME message, incoming and outgoing, including headers and all attachments. Show this limitation before composition and file selection. This is intentionally restrictive.
- Attachments disabled initially; an admin can enable small allowlisted attachments only after parser/security tests pass, within the same whole-message cap. Never silently drop attachments from oversized mail.
- 50 MiB ingress-spool budget, including payloads and overhead reserve; additional space reserved for receipts/control records.
- PostgreSQL write-admission warning at 600 MiB measured database size and a conservative stop at 750 MiB, or a lower account-specific verified threshold. Logical bytes and actual database footprint are different measurements.
- Preserve capacity for security events, receipts, deletes, account recovery, and administrative actions. Admission limits must not consume the last writable space.

On Render, retain the no-payment-method configuration when available. Its documentation describes suspension rather than supplementary charges in that configuration. Stop onboarding if the actual signup/account state cannot meet the strict-free requirement; do not quietly add a card or select a paid alternative. [S5]

A service can become unavailable at a free quota without generating a bill. The application's UI must make this distinction clear. Free hosting is not the recommended long-term destination for mission-critical mail.

## 4. Bootstrap and installation wizard

### Unavoidable owner-only bootstrap

The owner creates or authorizes Cloudflare, Resend, Render, and Neon accounts. A deployment process supplies `APP_KEY`, database connectivity, HTTPS application URL, and a one-time installation secret. These minimal secrets must exist before a browser wizard can securely save configuration.

Provide a local Docker development profile using PostgreSQL and provider fakes. No real credentials should be needed to run tests or inspect the interface. Supply a deployment manifest with explicitly free service choices. Any optional provisioning script must print a resource/price plan and require approval before external side effects.

### In-application wizard

Use short, resumable steps with a visible status for each connection:

1. Claim the installation using the one-time secret, create the owner, and enable owner MFA.
2. Connect Cloudflare with scoped tokens. Enumerate available accounts and zones, validate permissions, and select the business domain.
3. Connect Resend using an encrypted server-side management key. Test access and retrieve account limits.
4. Show a DNS/routing change preview. Preserve website, Cloudflare incoming MX, and unrelated TXT/DNS records. Identify existing address-specific routing rules that would bypass the new Worker.
5. Provision or attach the D1 spool; deploy the prebuilt Worker artifact, bindings, and secrets through documented APIs. Never execute arbitrary admin-supplied code as a deployment feature.
6. Create/attach the Resend domain with sending enabled and receiving disabled. Use its returned DNS records; do not invent universal SPF/DKIM values or overwrite root incoming MX.
7. Create the Resend webhook by API, store its returned signing secret, and synchronize it to the Worker secret binding. [S13]
8. Apply the confirmed routing plan to the Worker, publish the recipient-directory version, and run inbound/outbound smoke tests with an owner-controlled address.
9. Display a go-live checklist with independent receiving, sending, authentication, storage, and quota results. DNS propagation is asynchronous; “pending” is not “verified.”

Cloudflare exposes email-routing management APIs, while Resend exposes domain and webhook APIs. These support the wizard; they do not eliminate provider signup or account-level requirements. [S12, S13]

Every provisioning action needs a durable step record, provider request identifier, sanitized error, retry policy, and resource ID. Apply changes idempotently. Rollback only app-owned changes whose current values still match the saved prior operation. Never roll back by deleting an entire zone's records.

## 5. Administrator control panel

The administrator experience should cover the complete supported lifecycle, not only show a collection of API keys.

| Area           | Required controls                                                                                               |
| -------------- | --------------------------------------------------------------------------------------------------------------- |
| Overview       | Receiving/sending health, unresolved incidents, usage summaries, oldest queued message, last successful sync.   |
| People         | Create/invite users, role assignments, reset access, suspend/reinstate, revoke sessions, require MFA.           |
| Mailboxes      | Allocate quotas, manage memberships, aliases, shared mailboxes, ownership transfer, retention and exports.      |
| Domains        | Inspect DNS, receiving/sending readiness, verification retries, DNS change preview, drift detection.            |
| Integrations   | Test/rotate credentials, inspect scopes, display webhook status, provision/reconcile approved resources.        |
| Delivery       | Outbox, per-recipient results, quota-held mail, ambiguous sends, bounces, complaints, suppression status.       |
| Limits & usage | Provider limits, application limits, safety margins, progress bars, trends where real history exists.           |
| Policies       | Message size, permitted attachments, forwarding permissions, retention, sender rules, recipient policy.         |
| Security       | MFA posture, roles, audit trail, session revocation, restricted administrative mailbox access.                  |
| Maintenance    | Bounded reconciliation, safe export, backup manifest, restore validation, diagnostics, receiving/sending pause. |
| Appearance     | Business name/logo, restrained accent theme, default language/timezone, user theme preference.                  |

Use owner, administrator, and member roles, with explicit mailbox membership permissions. Administrative account management must not implicitly grant mailbox-content access. A separate audited, time-bounded support-access permission is required for viewing another person's mail. Disclose this in the interface. [S22]

Creating a user/address is a database operation followed by synchronization of the edge recipient directory. It does not create a Cloudflare account or Resend-hosted inbox. Show `Provisioning`, `Active`, `Suspending`, and `Sync failed` when appropriate; do not claim a remote change succeeded before acknowledgment.

## 6. Mailbox experience

The initial scope includes Inbox, Sent, Drafts, Archive, Trash, Spam, starred messages, folders/labels, contacts, signatures, search, compose, reply, reply-all, manual forwarding, and shared-mailbox access. Implement only visible controls that actually work.

Use Gmail as the primary desktop/mobile interaction reference, with Postroom identity and original implementation. The desktop default is a top search bar, collapsible left navigation, and a full-width mail list; opening a thread replaces that list in the main surface. Provide an optional right-hand reading pane on sufficiently wide screens rather than forcing three panes. A lower-right desktop compose window can minimize/expand. Gmail documents alternative layouts and optional reading panes. [S30, S31]

Mobile is a separate app-style single-pane layout: rounded search header, drawer/account navigation, readable avatar-based rows, floating Compose action, full-screen conversations and composer, contextual sheets, and accessible swipe/selection actions. Preserve Back navigation, list position, search, and draft state. Do not add unsupported Chat, Meet, category classification, or decorative bottom navigation. Detailed geometry and behavior are specified in `MOBILE_UX.md`.

Both layouts share draft IDs, authorization, state transitions, mutations, quota checks, and server APIs. Store appearance, density, reading-pane, and swipe preferences per user, with safe responsive overrides. Do not create duplicate hidden editors or network requests. Maintain only real visible features and keep branding independent of Google.

Conversation threading should use message identifiers and reply/reference headers, scoped to the mailbox. Subject similarity alone is insufficient. Preserve original headers and raw MIME so parsing can be corrected later. Treat BCC as private data and test both mixed local/external recipients and shared-mailbox visibility.

Drafts autosave with a visible state and optimistic version check. Preserve the draft after provider errors, quota errors, browser navigation, or an attempted send from an unauthorized alias. Use explicit `Queued`, `Accepted by provider`, `Delivered to recipient server`, `Bounced`, `Failed`, `Held for quota`, and `Delivery status uncertain` states. Do not equate API acceptance or a delivered event with the recipient reading the message.

Default search is sender, recipient, subject, date, folder, unread, and attachment presence. Body search is a later indexed feature, with an explicit privacy/storage design. No external search SaaS is required.

Automatic external forwarding is a later, admin-approved feature: verify ownership of the destination, honor Resend policy and quota, use an authorized sender identity, preserve original attribution without spoofing the sender, and prevent loops. Local mailbox aliases can be supported immediately without external delivery.

Exclude from v1: public signup, mailing campaigns, cold outreach, arbitrary SMTP relay, IMAP/POP, native desktop clients, AI summaries, calendar sync, paid push services, unlimited attachments, and guaranteed scheduled-send timing.

## 7. Incoming mail: durable before acknowledgment

1. The Worker reads the actual envelope recipient, not only the visible `To` header, and checks an indexed D1 directory of configured active addresses.
2. It rejects unknown/disabled recipients and oversize messages with an explicit reason. A catch-all is an application router, not permission to create arbitrary inboxes.
3. It checks application admission limits and reserves spool bytes atomically. Concurrent messages must not overrun the buffer.
4. It streams/reads at most the configured small raw limit, records raw MIME, envelope metadata, receipt ID, checksum, and status in D1, and awaits durable completion before finishing acceptance.
5. It does not do full MIME decoding, attachment transformations, remote fetches, or HTML sanitization in the email invocation.
6. Laravel claims a bounded batch through an authenticated Worker API, imports each item transactionally into PostgreSQL, and records the receipt ID uniquely.
7. Laravel acknowledges the receipt only after commit. D1 retires acknowledged payloads after a small recovery window; unacknowledged payloads are never automatically deleted merely because they are old.
8. Replayed receipts do not duplicate mailbox items. Different legitimate messages sharing a `Message-ID` must not be discarded merely because that header matches. Use receipt IDs plus cautiously designed transport-deduplication evidence.

Cloudflare's handler provides `raw`, `rawSize`, envelope fields, and a rejection method. Its documented rejection is permanent, not a general configurable SMTP temporary-defer facility. Do not promise senders will retry an explicit rejection. Document and test the actual handler failure behavior. [S16]

Any failure before durable storage must fail visibly; never catch an exception and return a successful no-op. A full buffer means new mail may be rejected. Existing accepted content remains intact. CPU exhaustion that prevents code from running cannot be repaired by UI progress bars; the small handler must be load-tested against Free limits. [S8, S17]

### Sleeping-host recovery

An authenticated inbox refresh requests a bounded sync. A scheduled Worker checks only D1 for actual backlog, initially every 15 minutes. It sends a bounded wake/sync request only when work is due, with exponential backoff and a daily processing budget. Do not ping the host solely to keep it awake. Do not query Neon periodically when there is no work.

A wake request is a hint, not proof processing completed. Claims have leases; acknowledgments are independent. If a cold start or timeout interrupts processing, the next invocation resumes. Keep “last synced” and pending/oldest-message indicators visible. Long outages or account suspension can eventually exhaust the spool; this design is bounded resilience, not guaranteed unlimited buffering.

## 8. Sending, retries, and delivery events

1. Authorize the current user's sender identity and mailbox membership server-side.
2. Validate recipient format, policy, message size after encoding, and attachment restrictions.
3. Persist the send intent/content and reserve daily/monthly recipient allowance in one PostgreSQL transaction.
4. Send through a domain-scoped Resend sending key. Retain a separate encrypted management key for domain operations and usage retrieval where necessary.
5. Persist the returned provider message ID and accepted state. Finalize usage reservations conservatively; a timeout with an unknown result is not a definite failure.
6. Use a stable Resend idempotency key per immutable send intent. Resend's documented idempotency window is 24 hours. Outside that window, reconcile ambiguous delivery before retrying; do not create blind duplicate sends. [S18]
7. Verify webhook signatures and timestamp against the exact raw request body at the Worker. Persist the event before returning success, deduplicate by event ID, and let Laravel reconcile out-of-order events without regressing status.
8. Record delivery status per recipient when available. Apply suppression policy for hard bounces and complaints. Do not retry suppressed recipients automatically.

Internal delivery between configured local mailboxes can be handled transactionally within the app without Resend. Mixed internal/external sends must have independent, correctly private recipient states. This is local application delivery, not a claim that Resend delivered those copies.

Build an `OutboundMailProvider` interface so policy or provider changes do not require rewriting mailbox storage. Only Resend is implemented for this plan. Do not distribute traffic across extra accounts to evade quotas.

## 9. Usage dashboard and admission controls

### Meter contract

Every meter must carry:

`provider`, `resource`, `scope`, `used`, `limit`, `reserved`, `unit`, `window_start`, `window_end`, `resets_at`, `observed_at`, `source`, `accuracy`, `status`, and `last_error`.

Accuracy is one of `provider_reported`, `locally_measured`, `estimated`, or `unavailable`. Freshness is independent: a provider-reported value can be stale. Do not render a failed request as zero usage or “healthy.”

Use `used / limit` for an available positive numerical limit; display the actual percentage even above 100%, while clipping only the visual fill. Display “No cap reported” for a documented null cap and “Unavailable” for a missing one—these are not the same state. Include reservations separately to avoid silently double-counting provider totals and local sends.

### Data sources

| Meter                            | Source and interpretation                                                                       |
| -------------------------------- | ----------------------------------------------------------------------------------------------- |
| Resend daily/monthly emails      | Real `GET /usage` totals and limits, reconciled with a local send/reservation ledger.           |
| Resend verified domains          | Usage API and domain API; mailbox count is a separate app metric.                               |
| D1 storage/read/write activity   | Cloudflare D1 GraphQL analytics plus per-query metadata, with correct account/database scope.   |
| Workers requests/CPU errors      | Cloudflare analytics where accessible, showing timestamps and aggregation/sampling limitations. |
| Mailbox and ingress bytes        | Application reservations, payload totals, and measured database/spool size.                     |
| PostgreSQL footprint             | Measured database size; label as database footprint, not an exact provider invoice meter.       |
| Neon compute/egress              | Only a documented Free-accessible source; otherwise unavailable or clearly bounded estimates.   |
| Render hours/bandwidth/build use | Documented accessible metrics only; otherwise unavailable or labeled local estimates.           |

Resend introduced its Usage API on October 1, 2026. Cloudflare documents D1 programmatic analytics. Neon's documented consumption-history v2 API is restricted to paid/agent/enterprise plans, so do not fabricate exact Neon Free consumption bars. [S19, S20, S21]

**Reset-window caveat:** The Resend account-limits page describes UTC calendar days, while the Usage API reference currently describes its daily field as rolling 24 hours. Follow live provider totals and `resets_at`, log the documentation discrepancy, and test reset behavior. Until resolved, a conservative local guard can enforce both interpretations. Never reset at the user's local midnight by assumption. [S11, S19]

### Behavior

- Below 70%: normal.
- At 70%: in-app warning and projected remaining capacity when enough history exists.
- At 85%: prominent warning with the affected operation and remedy.
- At 95%: hold optional outbound work and imports/admissions that would consume protected headroom, using resource-specific rules.
- At the actual hard cap: block the affected operation; retain drafts and accepted mail; do not automatically upgrade.

These percentages are application defaults. Administrators can lower thresholds and allocations, but cannot increase verified provider ceilings by editing settings.

Use transaction-safe reservations. With one delivery left and two concurrent sends, at most one may consume that slot. Count each To/CC/BCC delivery; include account activity outside this app in provider totals. A dedicated legitimate provider workspace simplifies reconciliation but does not justify creating accounts to bypass limits.

Refresh quotas before sending when a cached snapshot is too old, refresh on admin view at a bounded rate, and cache provider responses. Background metric refresh must not become the workload that exhausts the free plan. Stale or unavailable critical usage makes outbound admission conservative, not unlimited.

Warnings go to the in-app notification center first. Emailing warnings consumes quota and cannot be the only alert mechanism. When the PHP application itself is unavailable, its dashboard may also be unavailable; do not imply always-on monitoring.

## 10. Core data model and interfaces

Use ordinary PostgreSQL migrations and Laravel models/policies. Suggested tables:

- Identity: `users`, `roles`, `mailboxes`, `mailbox_memberships`, `addresses`, `sessions`, MFA/recovery records.
- Mail: `messages`, `message_contents`, `message_recipients`, `mailbox_messages`, `message_user_states`, `threads`, `attachments`, `folders`, `labels`, `message_labels`, `contacts`, `drafts`.
- Delivery: `send_intents`, `send_recipients`, `delivery_attempts`, `provider_events`, `suppressions`, `ingress_receipts`, `jobs`, `failed_jobs`.
- Control plane: `domains`, `integrations`, `encrypted_credentials`, `settings`, `provisioning_runs`, `provisioning_steps`, `managed_resources`, `directory_sync_outbox`.
- Limits/security: `quota_windows`, `quota_reservations`, `usage_snapshots`, `audit_events`, `incidents`, `export_manifests`.

D1 holds compact `recipient_directory`, `ingress_items`, `webhook_events`, `work_hints`, `spool_counters`, and acknowledged-receipt records. Scope every ID to the organization/mailbox and prevent accidental cross-mailbox data access. Do not assume UUIDs alone provide authorization.

Keep provider-specific code behind `CloudflareControlPlane`, `IngressGateway`, `OutboundMailProvider`, `UsageProvider`, and `ProvisioningService`. Use authenticated HTTPS and strict request schemas between Worker and Laravel. Protect internal requests with a timestamped body signature or a documented equivalent, replay protection, scoped secrets, and rotation.

Do not expose generic SQL execution, arbitrary URL fetching, arbitrary DNS mutation, or provider master credentials as user-facing APIs. All provider integrations run server-side. The browser talks only to the application.

## 11. Security, privacy, and recovery

Require administrator MFA, secure HttpOnly session cookies, CSRF protection, login throttling, role policies, and authorization on every message, attachment, export, and admin action. Disable public registration. Invalidation of membership or suspension must revoke active application access immediately, with edge-directory changes tracked separately. [S22]

Treat every incoming message as untrusted. Sanitize HTML with maintained libraries and render inside a sandboxed, scriptless frame with a restrictive content policy. Block remote images by default; allow intentional per-message loading without creating an unrestricted server-side fetch proxy. Escape text and protect links. Never execute mail HTML in the admin/app origin. [S23]

Retain original MIME privately. Consider application-layer encryption for raw bodies and attachments; keys stay outside the database and source repository. Document that server-side encryption is not end-to-end encryption and that searchable metadata remains available to the service. Keep secrets write-only in forms, mask displays, scrub logs, and test rotation without locking out the installation.

Apply limits to MIME nesting, decoded size, attachment count, filename length, and parsing time. No attachment previews for executable or active document formats. Do not label files “virus scanned” unless a real scanner was actually used. Avoid external avatars, analytics, and email tracking by default.

Provide chunked, authenticated mailbox export with an integrity manifest, and an owner-only encrypted backup export. Store downloaded backups on owner-controlled storage, not on the ephemeral container. Test restoration in an isolated environment. Retain recovery keys separately. A free database's short restore window is not a complete backup strategy.

Keep redacted audit records for administration, credential changes, routing edits, exports, and privileged mailbox access. The dashboard includes failures and unacknowledged items rather than hiding them to look clean.

## 12. Frontend quality and design workflow

Follow `DESIGN.md`, `MOBILE_UX.md`, and `UI_ACCEPTANCE.md`. The target is a close Gmail-familiar desktop and mobile mail experience with our own branding: a quiet, professional workspace, not a landing page or generic card dashboard. This supersedes the older mandatory three-pane layout and teal-first visual direction.

Provide an installable PWA shell using original icons and a standalone manifest, with browser-appropriate installation help. Installation does not imply native-app distribution, permanent background execution, offline mailbox access, or notification parity. Normal browser mode remains supported. [S33]

Cache only allowlisted public static assets and a public offline shell. Authenticated HTML/Inertia data, mailbox APIs, message content, attachments, exports, and credentials must not enter service-worker caches. V1 does not persist private drafts offline by default. Show unsaved state honestly, avoid update reloads over dirty drafts, and test logout/history/account switching. [S35]

Design for safe areas, software keyboards, dynamic viewports, text enlargement, and touch. Use feature-detected visual-viewport support where needed and test physical devices when possible; do not assume a CSS viewport unit alone solves keyboard behavior. [S34]

Keep all supported routine administrator workflows usable on mobile. Usage meters stack without losing exact values, freshness, or unknown/stale indicators. PWA/mobile improvements must not introduce paid infrastructure, artificial keep-alive requests, or continuous background polling.

Use the open-source portions of the chosen starter/UI stack. Add Tiptap core/open-source extensions for composition, Lucide for a single coherent icon language, Playwright for workflow/screenshot tests, and axe-core for automated accessibility checks. Do not accidentally add paid editor extensions, hosted collaboration, commercial icon packs, or a second admin UI system. [S15, S24, S25, S26]

Use the Impeccable design skill with Codex as development guidance, not as a production dependency. Review its source and installer, pin a reviewed version, and run its initialization, critique/audit, and polish workflow supported by that version. Its documented Codex invocation uses `$impeccable`; verify commands rather than guessing. Never send real mail or credentials to visual-review tools or weaken production security to enable a local overlay. [S27]

Required quality evidence: the cases in `UI_ACCEPTANCE.md`, screenshots at 320, 360, 390, 430, 768, 1024, and 1440 px, keyboard-only core workflows, meaningful accessible names and focus behavior, contrast checks, realistic empty/error/over-limit/offline states, and manual visual critique. Test real iPhone/Android installation and keyboard behavior when devices are available; label emulation and unperformed physical tests honestly. Aim for WCAG 2.2 AA; automated checks alone do not certify it. [S25, S26, S28]

## 13. Delivery sequence and acceptance gates

### Phase 0 — feasibility, limits, and setup skeleton

Create the repository, documentation, local Docker setup, source-verification notes, compatible dependency lockfiles, and mock provider adapters. Prove a real small inbound message can reach D1 and survive an offline PHP host. Prove a Resend send, signed webhook, and a usage query with owner-provided credentials. Benchmark Worker CPU on representative maximum-size fixtures. Real provider tests are optional locally but mandatory before go-live; label unexecuted tests honestly.

### Phase 1 — identity, control plane, and design system

Implement secure bootstrap, auth/MFA, users, mailboxes, scoped policies, integration settings, provisioning state machine, design tokens, the application shell, and a synthetic component gallery. Build the setup flow without destructive default DNS edits. Implement the Gmail-style desktop shell and distinct mobile shell with shared state; record original-brand design tokens.

### Phase 2 — incoming mail and read-only mailbox

Implement the recipient directory, durable spool, bounded import, deduplication, MIME parser, safe reader, message list, search, and storage admission. Test sleeping-host recovery and PostgreSQL outages. Show backlog and last sync. Verify inbox → conversation → Back on desktop and mobile, including safe rendering and list-state restoration.

### Phase 3 — compose and outbound delivery

Implement drafts, authorized identities, local delivery, Resend transport, quota reservations, idempotency, webhooks, bounces, suppressions, and honest delivery states. Avoid bulk sending and public relay behavior. Share one persistent draft model between the docked desktop composer and full-screen mobile editor; test keyboard, rotation, failed autosave, and duplicate-send prevention.

### Phase 4 — administration and limits

Complete user lifecycle, aliases/shared mailboxes, DNS diagnostics, credential rotation, usage progress bars, quotas, exports, retention, and audit records. Prove provider API failures display unknown/stale—not 0%.

### Phase 5 — hardening and visual review

Run PHP/TypeScript linting and analysis, unit/integration/browser tests, security fixtures, concurrency tests, export/restore, and visual/accessibility review. Record screenshots and findings. Complete mobile/PWA cache, logout, update, and keyboard checks in `UI_ACCEPTANCE.md`; mark physical tests not performed. Deploy one test mailbox before migrating existing addresses.

### Required acceptance scenarios

- An ordinary user never needs a provider account or provider dashboard.
- An authorized administrator creates a user/address, verifies a domain, and diagnoses delivery within the app after bootstrap.
- Incoming mail remains in D1 if PHP is asleep, crashes, or loses its database; no receipt is acknowledged before durable import.
- Repeating imports, callbacks, and provisioning requests does not duplicate mail/resources.
- User A cannot read User B's content or attachments through guessed IDs, search, exports, or shared-mailbox bugs.
- Unknown recipient and oversized message failures are explicit; accepted mail is not silently expired from the spool.
- Parallel sends cannot overbook the same final quota slot; BCC does not leak.
- An ambiguous send older than the provider's idempotency window is not blindly retried.
- Quota and provider failures preserve drafts and show exact next steps.
- The free configuration never requests a paid resource or silently upgrades a provider account.
- Host restarts do not lose accounts, sessions, drafts, messages, or jobs.
- No production page contains simulated healthy provider metrics or fake delivery success.
- All visible major actions are functional; all critical tasks work with keyboard and mobile navigation.
- Mobile is a full-screen task-oriented app experience, not a compressed desktop layout; all supported admin tasks remain accessible.
- Optional reading-pane preferences never force unusable columns on a phone; resizing preserves the active draft.
- PWA caches contain no private mail/authentication data, and logout/history/account switching do not expose the prior mailbox.
- Installation and keyboard claims are supported by named real tests; unperformed physical-device checks are marked pending.
- A backup can be restored and checked without using the original application instance.

## 14. Handover deliverables

A runnable Laravel repository with the Worker source, migrations, seeders containing synthetic data only, local Docker profile, free-host deployment configuration, `.env.example`, provider-scope checklist, API contracts, test suites, screenshots, limit/recovery runbooks, and a feature-status report.

Keep a concise root `AGENTS.md`, a detailed `PLAN.md`, a visual `DESIGN.md`, mobile contract `MOBILE_UX.md`, evidence checklist `UI_ACCEPTANCE.md`, and milestone status. Codex supports repository guidance through `AGENTS.md`; keep durable instructions separate from transient progress. [S29]

The completion report must distinguish implemented, tested locally, tested against real providers, and blocked features. Without credentials, implement real adapters and mocked tests, but do not claim DNS verification, delivery, or deployment actually happened.
