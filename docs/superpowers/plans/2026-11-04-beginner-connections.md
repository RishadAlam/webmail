# Beginner connection setup implementation plan

**Goal:** Help a first-time owner understand every connection value, locate it, save it and understand what remains before real mail works.

**Design:** Retain the existing administration layout and protected connection API. Group fields by receiving, sending and domain checks. Explain each value in everyday language, with expandable numbered instructions and a link to the matching public guide section. Put a beginner route before technical deployment details. Add original, clearly labeled visual examples and an actual fictional-data WebMail screenshot; link official provider videos/screenshots instead of inventing dashboard captures.

**Constraints:** No new dependency, external provider mutation, DNS change, credential logging or change to authorization. No claim that saved means working. Preserve existing local-guide edits. Technical deployment remains a prerequisite, described explicitly.

- [x] Rewrite and group connection fields; retain blank-value preservation and explicit removal.
- [x] Rewrite the guide entry path and add five credential walkthroughs, visuals, provider media links and troubleshooting.
- [x] Run types, formatting/build, connection/help feature tests and focused browser checks at desktop/mobile; inspect screenshots.
- [x] Record actual results and limitations in STATUS.md.

**Review focus:** Lost edits when opening help; secret values in screenshots; broken guide fragments; mobile overflow; simulation incorrectly presented as a live check. Existing API tests cover credential handling. Browser review covers help navigation, accessible descriptions and responsive layout.

## Execution notes

Kept work in the existing shared checkout and preserved pre-existing user edits. No dependency, backend authorization, provider configuration or DNS changes. The Impeccable launcher could not run because its engine cache was unavailable; read existing project context and guidance directly.

A fresh review found delivery-notification setup missing from the beginner checklist. Added a dedicated webhook section, its separate Cloudflare signing secret, and an explicit checklist step. Only actually handled event types are listed. Browser review uses fictional local data; provider diagrams are explicitly illustrative, with official video/screenshot links.

The existing MySQL connection regression and browser save/check/clear flow exposed a real fixed-ID model bug: provider_connections.id is not auto-incremented, but Eloquent treated it as generated. Explicitly marked ProviderConnection non-incrementing; the unchanged connection tests now pass on MySQL as well as SQLite. Corrected the separate theme test to compare sorted JSON object keys while preserving strict value comparison. Before fix: MySQL 19 passed / 9 failed / 1 error, browser clear action absent after save. After fix: MySQL and SQLite each 29 passed, 180 assertions. No credential data was inspected or logged.

Final browser results: Chromium 3 passed (31.2s), WebKit 2 passed (10.5s); zero axe violations in audited views. Build, type checks, scoped formatting/lint, Pint, model PHPStan and whitespace checks passed. Manual screenshots reviewed. All task changes remain local and uncommitted; existing user edits retained. Detailed evidence and limitations are recorded in STATUS.md.
