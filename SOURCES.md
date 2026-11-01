# Official references and verification notes

**Checked:** November 1, 2026. These references support time-sensitive platform facts. The product limits, architecture, UI direction, and acceptance gates are proposed design decisions, not provider guarantees. Recheck documentation and actual account capabilities before deployment.

## Framework and hosting

**S1 — Laravel framework stable release.** The verified release was v13.39.0, released October 27, 2026. Framework releases are different from the application skeleton's releases.

- https://github.com/laravel/framework/releases/tag/v13.39.0
- https://github.com/laravel/framework/releases/latest

**S2 — Laravel 13 release and PHP support policy.**

- https://laravel.com/framework/docs/releases

**S3 — Render's Docker/PHP/Laravel deployment documentation.** The example uses an older Laravel version; use it for the hosting approach, not as the project's dependency-version authority.

- https://render.com/docs/deploy-php-laravel-docker

**S4 — Cloudflare Containers pricing and Workers languages.** Containers' included resources belong to Workers Paid, not a strict-free Laravel runtime.

- https://developers.cloudflare.com/containers/platform/pricing/
- https://developers.cloudflare.com/workers/languages/

**S5 — Render Free behavior.** Consult for idle suspension, quotas, no-payment-method behavior, and limitations. Render describes Free as a preview/hobby option rather than a production recommendation.

- https://render.com/docs/free

**S6 — Render filesystem/runtime FAQ.**

- https://render.com/docs/faq

**S7 — Neon Free pricing.** The October 2, 2026 announcement and current pricing show 1 GB per project. Some older documentation still shows 0.5 GB; do not prefer that older value over the verified account's current allowance.

- https://neon.com/pricing
- https://neon.com/blog/neon-free-plan-1-gb-per-project

## Cloudflare and Resend

**S8 — Workers Free pricing and CPU/request limits.**

- https://developers.cloudflare.com/workers/platform/pricing/

**S9 — D1 pricing, read/write accounting, and Free-limit behavior.** Rows read are scanned rows, not necessarily rows returned. Indexes and maintenance affect usage.

- https://developers.cloudflare.com/d1/platform/pricing/

**S10 — D1 size and account limits.**

- https://developers.cloudflare.com/d1/platform/limits/

**S11 — Resend account quotas.** Recipient deliveries, not merely API calls, consume outbound allowance. Incoming messages processed entirely by Cloudflare do not use Resend's inbound service.

- https://resend.com/docs/knowledge-base/account-quotas-and-limits
- https://resend.com/pricing

**S12 — Cloudflare Email Routing APIs and rule configuration.** Verify required token scopes and exact routes during implementation.

- https://developers.cloudflare.com/api/resources/email_routing/
- https://developers.cloudflare.com/email-service/configuration/email-routing-addresses/

**S13 — Resend provisioning APIs.** Domain creation exposes DNS records/capabilities; webhook creation returns a signing secret.

- https://resend.com/docs/api-reference/domains/create-domain
- https://resend.com/docs/api-reference/webhooks/create-webhook

**S14 — Resend acceptable-use policy.** Verify the intended correspondence is permitted before enabling external sending. No quota evasion or cold-outreach tooling.

- https://resend.com/legal/acceptable-use

**S15 — Laravel official starter kits.** Use the compatible versions actually shipped by the selected stable starter kit.

- https://laravel.com/framework/docs/13.x/starter-kits

**S16 — Cloudflare Email Worker interface.** Includes envelope fields, raw MIME access, size, and rejection. The documented rejection is permanent.

- https://developers.cloudflare.com/email-service/api/route-emails/email-handler/

**S17 — Email Service limits.** Includes the warning about complex email handlers exceeding Workers Free CPU limits.

- https://developers.cloudflare.com/email-service/platform/limits/

**S18 — Resend idempotency.** Documented 24-hour key retention; application-level ambiguity handling is still necessary.

- https://resend.com/docs/dashboard/emails/idempotency-keys

**S19 — Resend Usage API.** Introduced October 1, 2026. It exposes usage, limits, and reset timestamps. The changelog specifies full-access credentials for this endpoint.

- https://resend.com/changelog/account-usage-api
- https://resend.com/docs/api-reference/usage/retrieve-usage

**Important discrepancy:** S11 describes the Free daily quota as a UTC calendar day; the S19 API reference describes the daily field as rolling 24 hours. Do not conceal the disagreement or guess a local reset. Use live provider reports, verify actual reset behavior, and conservatively guard sends while unresolved.

**S20 — Cloudflare analytics.** Access/scope/aggregation must be checked on the actual account. Missing metrics are not zero.

- https://developers.cloudflare.com/d1/observability/metrics-analytics/
- https://developers.cloudflare.com/workers/observability/metrics-and-analytics/

**S21 — Neon consumption API availability.** The documented v2 consumption endpoints are not listed for Free. Do not invent exact Free compute/egress telemetry.

- https://neon.com/docs/guides/consumption-metrics

## Security, frontend, and agent workflow

**S22 — OWASP authorization guidance.**

- https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html

**S23 — OWASP XSS prevention guidance.** Sanitization, encoding, and isolated rendering require implementation and testing, not just a library dependency.

- https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html

**S24 — Tiptap open-source editor.** Use core/open-source capabilities and inspect extension licenses; hosted services and premium extensions are outside this plan.

- https://github.com/ueberdosis/tiptap

**S25 — Playwright visual comparisons.**

- https://playwright.dev/docs/test-snapshots

**S26 — axe-core.** Automated accessibility coverage is not complete conformance certification.

- https://github.com/dequelabs/axe-core

**S27 — Impeccable official project.** Supports Codex and a design-review workflow. Review/pin tools before installation; do not weaken production security for its local development overlay.

- https://github.com/pbakaus/impeccable
- https://impeccable.style/

**S28 — W3C WCAG quick reference.**

- https://www.w3.org/WAI/WCAG22/quickref/

**S29 — OpenAI Codex repository instructions and workflow.**

- https://developers.openai.com/codex/guides/agents-md
- https://developers.openai.com/cookbook/examples/codex/iterating-development-workflows-with-codex

## Gmail-style desktop, mobile, and PWA revision

**Design revision checked:** November 1, 2026. The references below were consulted for this frontend update. Existing framework, pricing, and provider-API statements above are inherited from the original planning kit and were not comprehensively re-audited for this design-only change. Reverify them during implementation. Numeric UI dimensions, colors, gesture defaults, breakpoints, and the cache policy are proposed Postroom decisions, not claims about exact Gmail internals.

**S30 — Gmail inbox layouts and navigation.** Use as a public workflow reference; do not imply every Gmail category/feature exists in Postroom.

- https://support.google.com/mail/answer/18522?hl=en&co=GENIE.Platform%3DDesktop

**S31 — Gmail reading-pane choices.** Supports the choice to make a split reader optional rather than mandatory.

- https://support.google.com/mail/answer/9499937?hl=en

**S32 — Gmail Android settings and interaction patterns.** Includes swipe actions, selection, conversation preferences, and sync controls. Postroom's exact gesture defaults are its own design choices.

- https://support.google.com/mail/answer/6562?hl=en&co=GENIE.Platform%3DAndroid

**S33 — Installability and standalone app presentation.** Browser capabilities differ; a manifest is not a promise of native capabilities or identical installation on every platform.

- https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable
- https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Create_a_standalone_app
- https://web.dev/learn/pwa/app-design

**S34 — Visual viewport and keyboard-sensitive layout.** Visual and layout viewports can differ; test browser/device behavior rather than assuming one CSS unit solves every case.

- https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport

**S35 — Service-worker lifecycle, cache control, and updates.** Postroom's public-static-only policy is a security design requirement, not an automatic browser default.

- https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers

Accessibility remains covered by S28. Agent/design tools and browser testing remain covered by S25–S27. Review current tool versions and licenses before installation.

## Implementation verification — November 1, 2026

Documentation checks are separate from account verification. No live provider credentials were used. The implemented endpoints below were checked against official references; HTTP contract tests use fictional responses.

| Choice                        | Evidence and implemented boundary                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework                     | [Laravel's latest release](https://github.com/laravel/framework/releases/latest) resolved to **v13.39.0**. `composer.json` pins it exactly; `composer.lock` records the complete graph.                                                                                                                                                                                                                                                                               |
| Compatible frontend           | [Official React starter](https://github.com/laravel/react-starter-kit/tree/98d9b821baba4f4cc4120c96d35971366cec53e6) pinned at `98d9b821baba4f4cc4120c96d35971366cec53e6`; React 19, Inertia 3, Tailwind 4 and Vite Plus. Installed package versions are locked, not inferred from generic examples.                                                                                                                                                                  |
| Persistent layout and history | [Inertia v3 layouts](https://inertiajs.com/docs/v3/the-basics/layouts) and the installed Inertia implementation support the shared compose layout and encrypted history. Session revalidation is separately implemented; encryption alone is not logout isolation.                                                                                                                                                                                                    |
| Cloudflare inspection         | [List zones](https://developers.cloudflare.com/api/resources/zones/methods/list/) uses `GET /client/v4/zones`, with Zone Zone Read permission. [List DNS records](https://developers.cloudflare.com/api/resources/dns/subresources/records/methods/list/) uses `GET /client/v4/zones/{zone_id}/dns_records`, with DNS Read sufficient. The adapter follows pagination with a bounded fail-closed limit; it has no mutation method. No write scope has been requested. |
| Incoming envelope             | S16/S17: raw MIME and envelope recipient are accepted only after the D1 write. `setReject()` is a permanent rejection; this implementation does not claim SMTP temporary-retry control. Actual Free CPU feasibility is unverified.                                                                                                                                                                                                                                    |
| D1 budget                     | [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) list 500 MB/database on Free, 5 GB/account and 2 MB maximum row size. Postroom's much smaller 50 MiB accounting budget includes base64 expansion and per-record headroom; it is not an exact physical D1 size metric.                                                                                                                                                                              |
| Outbound                      | [Send email](https://resend.com/docs/api-reference/emails/send-email) uses `POST https://api.resend.com/emails`, with one stable idempotency key per immutable intent. S18 documents a 24-hour provider window. No automatic retry occurs for uncertain sends.                                                                                                                                                                                                        |
| Usage                         | [Retrieve usage](https://resend.com/docs/api-reference/usage/retrieve-usage) uses `GET https://api.resend.com/usage`, reading `emails.daily/monthly.used`, `limit`, and `resets_at`. [Usage API announcement](https://resend.com/changelog/account-usage-api) requires a full-access key. S11/S19's daily-window discrepancy remains open; local rolling reservations and provider snapshots are conservatively combined.                                             |
| Provider events               | [Webhook verification](https://resend.com/docs/dashboard/webhooks/verify-webhooks-requests), [event types](https://resend.com/docs/dashboard/webhooks/event-types), and [Message-ID support](https://resend.com/changelog/message-id-for-sent-emails). Raw signature checks precede durable event storage. Per-recipient outcomes and permanent versus transient bounces are handled separately.                                                                      |
| Neon                          | [Current plans](https://neon.com/docs/introduction/plans) confirm 1 GB/project, 100 CU-hours/project and 5 GB public transfer on Free. Actual account allowance is unverified. `pg_database_size` measures the current database only; it cannot certify whole-project/branch consumption. Free compute telemetry is shown unavailable.                                                                                                                                |
| Render                        | S5/S6 checked: Free idle sleep and ephemeral filesystem make PostgreSQL/D1 essential. No artificial wake traffic is implemented. Cold-start latency and actual account capacity remain live gates.                                                                                                                                                                                                                                                                    |
| Browser tools                 | [Playwright browsers](https://playwright.dev/docs/browsers), [service-worker testing](https://playwright.dev/docs/service-workers), S25/S26. Playwright 1.64.1 and axe are locked; browser versions and executed results are recorded in STATUS. A real stopped local proxy tests network outage because simulated offline handling differed across engines.                                                                                                          |
| Design guidance               | Impeccable 3.8.0 from S27, reviewed before use. [Hash manifest](docs/impeccable-pin.json) pins local guidance/scripts. No overlay or production CSP exception was installed.                                                                                                                                                                                                                                                                                          |

Package registries, official release metadata and compatibility constraints were checked before installation. Docker base images are pinned by digest in `Dockerfile.local` and `compose.yaml`. Dependency security audit results are a dated check, not a claim that every dependency is vulnerability-free forever. Tiptap uses open-source core extensions only; no paid services or extensions were enabled.
