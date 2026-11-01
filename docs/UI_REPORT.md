# Postroom UI acceptance report

**Date:** November 1, 2026. **Build:** local Phase 0 plus responsive mail slices; see [STATUS](../STATUS.md) for the final build/test record. This is an execution report for [UI_ACCEPTANCE.md](../UI_ACCEPTANCE.md), not a production/mobile certification.

## Environment and evidence

Playwright 1.64.1 on Linux: Chromium 156.0.8078.4, Firefox 157.0, WebKit 27.2. All browser flows run against the actual Laravel application, isolated SQLite database and deterministic outgoing provider. PostgreSQL authorization, quota and concurrency tests run separately. No actual email is sent. WebKit uses the official Playwright binary with missing Ubuntu libraries unpacked under `/tmp`; it is not iPhone Safari.

**Login/startup follow-up:** the Docker HTTP preview had fallen back to `.env` SQLite despite PostgreSQL working in CLI checks. Local startup and Playwright now explicitly use `--no-reload` to retain inherited environment settings. The host and container have different PHP environment handling; these browser runs must not be used as evidence for Docker's database choice. A separate real HTTP PostgreSQL startup/MFA regression and a fresh session on the restarted preview both passed. All three browser suites and their captures were repeated after the configuration fix. No physical-device evidence was added.

Fixtures: `DemoSeeder`'s Mira Chen/member and Alex Morgan/owner; 17 fictional messages (`fixture-1` through `fixture-17`), long international sender, long and empty subjects, and drafts created by the browser tests. Owner MFA is exercised with the public fictional TOTP seed. Two owner logins wait for distinct codes; replay protection remains enabled. The browser server's daily cap is deliberately **2 recipients**, so a two-recipient draft is held at the 95% admission boundary. This is a test configuration, not a provider measurement.

Viewports: 320, 360, 390, 430, 768, 1024 and 1440 CSS px, height 900 for inbox captures; 390×844 for mobile administration/routes; 430×740 for composer; 320×568 for reduced-motion composer; 1440×960 for desktop interactions. Light inbox and dark compact reading-pane/composer states are checked. Resizing exercises layout transitions, not physical rotation/keyboard behavior.

Evidence paths:

- `ui-evidence/inbox-{320,360,390,430,768,1024,1440}.png`: reflow captures; final matrix capture is WebKit (each engine runs the same matrix).
- `ui-evidence/desktop/{chromium,firefox,webkit}-dark-pane.png`: settled optional pane and collapsed navigation.
- `ui-evidence/mobile/{chromium,firefox,webkit}-compose.png`: same server draft after minimize/expand/resize, saved before capture.
- `ui-evidence/mobile/{chromium,firefox,webkit}-admin-usage.png`: phone usage and unavailable measurements.
- `ui-evidence/pwa/{chromium,firefox,webkit}-offline.png`: real local proxy stopped, public-only offline page.
- `ui-evidence/accessibility/{chromium,firefox,webkit}-inbox.json`: axe engine/time and zero-violation inbox results. Additional in-test axe assertions cover collapsed navigation, dark reader, narrow composer and phone Admin.
- `verification/`: executed command outputs. Ignored `playwright-report/` and failure traces are local diagnostic artifacts, not public or production telemetry.

Tests in `tests/e2e/mail.spec.ts` are referred to below by their workflow names. **Passed** means the stated local check passed. **Not run** means a required subcase still lacks direct evidence; any completed subcases are listed explicitly. **Blocked** identifies missing implementation or unavailable physical/live resources. No blanket pass is inferred from screenshots or axe.

## Desktop cases

| ID  | Status  | Action, expected outcome, actual evidence                                                                                                                                                                                     |
| --- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D01 | Passed  | Open seeded Inbox at 1440/light: broad search, left Compose/navigation and a coherent list. Inspected inbox capture; no forced reader.                                                                                        |
| D02 | Not run | Read/search/Back and keyboard focus restoration passed. Query remains `collection`; server-backed Archive/Undo restores the row. Nonzero scroll restoration has implementation but no explicit numeric assertion in this run. |
| D03 | Passed  | Select Right of inbox, open a conversation, then narrow to 768: settled pane at 1440, no document overflow after narrowing. Dark-pane captures and settings test.                                                             |
| D04 | Passed  | Compact density, dark theme and collapsed navigation persist between requests; same dirty draft survives minimize and resize. Collapsed rail additionally passes axe.                                                         |
| D05 | Not run | Real selected-row archive/Undo passed and server rejects undo after intervening changes. Multiple-row rollback and repeated-click failure injection were not separately run in-browser.                                       |
| D06 | Passed  | Read by keyboard and restore row focus; explicit row controls and selection toolbar remain keyboard reachable. Named collapsed links pass axe. Full assistive-technology review remains X02.                                  |
| D07 | Passed  | Open/minimize/restore/expand/resize composer: one body editor, same saved draft, subject/body retained. An unfinished Cc input survives minimize without losing text.                                                         |
| D08 | Passed  | Real configured quota rejection holds a two-recipient draft, retains editable body/subject and shows the shared-allowance explanation; no simulated acceptance label. Server quota tests cover To/Cc/Bcc.                     |
| D09 | Passed  | Abort draft PUT: persistent Not saved error, Close cannot discard the body. HTTP timeout/ambiguous provider states separately pass server tests; no browser test implies real Resend delivery.                                |
| D10 | Not run | Long sender/subject and no-subject fixtures appear in reflow captures; full values are available in conversation/details. Maximum recipient-set layout and BCC privacy across every recipient view were not manually audited. |
| D11 | Not run | Query/read/Back and mobile query route passed. Server paginates 30 rows and mobile paging controls are implemented; >30-row pagination/filter restoration is not covered by the 17-message browser fixture.                   |
| D12 | Passed  | Theme/density/pane controls work; sheets use focus-managed dialogs and explicit close. Inspected settings; no fake Calendar/Chat/Meet/AI modules.                                                                             |

## Mobile cases

| ID  | Status  | Action, expected outcome, actual evidence                                                                                                                                                         |
| --- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M01 | Passed  | 360/390/430 inbox captures: single pane, rounded search/account header, avatar selection, readable sender/subject/snippet and Compose action. No document overflow.                               |
| M02 | Passed  | Open drawer, navigate to Drafts and resume; owner enters Admin through drawer. Identity and named controls are visible; dialog manages focus/background.                                          |
| M03 | Passed  | Mobile search/read/browser Back returns to results. Compose has a query route; browser Back saves and closes instead of leaving the app. Logout/history tested separately.                        |
| M04 | Not run | Direct saved-draft URL resume passed, and server rejects cross-mailbox thread links. Direct authorized mobile conversation URL with empty history was not separately exercised.                   |
| M05 | Not run | Horizontal synthetic touch-pointer archive passed. Vertical-scroll dominance/diagonal/edge gesture combinations need more pointer tests and physical-device review.                               |
| M06 | Passed  | Synthetic horizontal swipe archives; explicit Undo restores the row using the real database operation. Server tests enforce exact version conflicts. Physical gesture comfort remains unverified. |
| M07 | Passed  | Avatar checkbox exposes an accurate selection toolbar and explicit Archive action at 390; same mutation path as gestures.                                                                         |
| M08 | Not run | Account/drawer/settings and compose dialogs were used and audited; all long label/details/overflow sheet combinations were not separately exercised.                                              |
| M09 | Blocked | No physical software keyboard available. VisualViewport, dynamic height and safe-area CSS exist; this is not evidence of reachable caret/Send on a real phone keyboard.                           |
| M10 | Passed  | Resize 1440→390 and 1440→430 with dirty draft: one editor and retained subject/body; close/reopen reads the same server draft. Physical rotation remains untested.                                |
| M11 | Passed  | Abort autosave then Close: editor remains open with the original text and actionable save error. No durable offline persistence claim.                                                            |
| M12 | Passed  | Delay Send and double-click: one request, one immutable intent, acceptance-only simulator label and locked editor. PostgreSQL parallel test independently proves one provider invocation.         |
| M13 | Passed  | Full-screen mobile search route → results → conversation → Back retains query/results.                                                                                                            |
| M14 | Blocked | Attachments are disabled. Sandboxed HTML containment/security is server-tested, but no wide newsletter/table visual fixture was reviewed.                                                         |
| M15 | Passed  | Explicit archive/read controls and selection toolbar exist alongside configurable/off swipes. Archive/Undo explicit and gesture paths exercised.                                                  |
| M16 | Not run | 320 px inbox/composer reflow passed, including the account button's right-edge bounds and Send in viewport. Zoom is enabled. Actual 200% text enlargement/browser zoom remains untested.          |
| M17 | Not run | Bottom padding exists and the floating action is visually reviewed. A last-row/end-of-scroll unobscured-control assertion was not run.                                                            |
| M18 | Blocked | No custom pull-to-refresh intercepts browser gestures; explicit refresh is server-throttled. Real edge-swipe/pull behavior needs devices.                                                         |

## Administration and usage

| ID  | Status  | Action, expected outcome, actual evidence                                                                                                                                                                                           |
| --- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A01 | Passed  | Ordinary member lacks Admin entry; server denies Admin. Even an enrolled owner is denied without MFA verified in the current session.                                                                                               |
| A02 | Passed  | At 390 px, owner completes password/TOTP, creates Fictional Robin and confirms suspension. Actual database changes; receiving clearly stays pending directory sync. No provider account is created for Robin.                       |
| A03 | Blocked | Domain/DNS diff approval wizard is not implemented. No DNS or routing mutation was attempted.                                                                                                                                       |
| A04 | Blocked | In-app credential connection/test/rotation is not implemented. Environment bootstrap adapters exist; no live secrets entered.                                                                                                       |
| A05 | Not run | Usage has numeric labels, policy severities, 95% headroom and unavailable/stale states. Full 69/70/85/95/100/over-limit visual fixture matrix not executed. D08 verifies real admission rejection.                                  |
| A06 | Passed  | Unknown provider compute/activity show Unavailable with no percentage; SQLite physical size also unavailable. Server test preserves an old Resend value as stale after failed refresh and denies send; failure backoff is asserted. |
| A07 | Blocked | Physical/logical limits hold writes and retain drafts/accepted spool, verified server-side. Cleanup/export/recovery workflow remains unfinished; no storage-full release claim.                                                     |
| A08 | Passed  | Owner enters Admin from a filtered mailbox and Back to mail restores `q=fictional` and Search results. Return location is in-memory and account-scoped.                                                                             |
| A09 | Not run | Delivery/audit summaries are vertically readable and errors redacted in code. Long-failure detail and diagnostic remediation workflows have not been fully exercised.                                                               |

## PWA, offline and privacy

| ID  | Status  | Action, expected outcome, actual evidence                                                                                                                                                                                    |
| --- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P01 | Blocked | Original icons/manifest/scope exist; actual browser installation not performed.                                                                                                                                              |
| P02 | Blocked | No physical home-screen launch or installed-mode session.                                                                                                                                                                    |
| P03 | Passed  | Help supplies platform guidance; no nonfunctional scripted install button or native-feature promise. Reviewed in the application source and local UI review.                                                                 |
| P04 | Passed  | After mail/draft activity, Cache Storage contains only four exact public asset URLs. No private route, Inertia payload, API, attachment or export is allowlisted.                                                            |
| P05 | Passed  | Browser-aborted saves retain in-view draft and show Not saved. Reload survival is explicitly not promised.                                                                                                                   |
| P06 | Passed  | After activation/control, stop the local proxy and reload: each engine shows the public offline explanation without mail. Initial Firefox `setOffline` result was inconclusive; the final test uses real connection failure. |
| P07 | Passed  | Sign out, Back: no prior conversation, login route restored. Server session invalidation and no-store headers complement encrypted Inertia history and bfcache revalidation.                                                 |
| P08 | Passed  | Sign out Mira, sign in owner with a fresh TOTP, then navigate to Mira's prior thread URL: HTTP 403, no Mira conversation. This covers sequential same-browser switching, not every concurrent-tab/bfcache interleaving.      |
| P09 | Not run | Source has no skipWaiting, forced reload or background sync; new-worker installation while editing has not been simulated.                                                                                                   |
| P10 | Blocked | Real local connection failure has honest offline/retry copy. Actual Render sleep/cold-start timing is unverified; there are no keep-alive pings.                                                                             |
| P11 | Passed  | Code review confirms no mailbox polling/background sends. Worker scheduled wake only follows real pending spool work and backoff. Physical background/foreground behavior remains untested.                                  |

## Accessibility and critique

| ID  | Status  | Action, expected outcome, actual evidence                                                                                                                                                                              |
| --- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| X01 | Not run | Keyboard read/Back/focus, modal controls and reduced-motion compose passed; a complete keyboard-only reply/archive/settings task sequence was not separately recorded.                                                 |
| X02 | Blocked | Accessible names/landmarks/alerts and axe checked; no NVDA, VoiceOver or TalkBack session. Automated tooling is not a screen-reader certification.                                                                     |
| X03 | Passed  | Zero axe violations in asserted inbox, collapsed rail, dark reader, 320 composer and 390 Admin states for executed browser suites. Scope is limited to those states.                                                   |
| X04 | Passed  | Light/dark captures manually inspected, selected/unread states use weight/background as well as color. Axe contrast checks pass in audited states. Email HTML is separately sandboxed, not blindly theme-inverted.     |
| X05 | Passed  | Reduced-motion emulation keeps keyboard read and 320 composer usable; CSS removes nonessential transitions.                                                                                                            |
| X06 | Not run | Primary touch controls follow 48 px targets and are visually reviewed; not every secondary target/spacing combination has been measured on devices.                                                                    |
| X07 | Passed  | Principal layout captures reviewed manually. Original Postroom mark, familiar mail hierarchy, mobile single-pane, aligned desktop rows and optional dark reading pane; no generic dashboard/card grid or fake modules. |
| X08 | Passed  | Save failure, held quota, provider uncertainty, unavailable usage and public offline copy give concrete next actions. No success copy is inferred from pending provisioning.                                           |

### Manual critique and remediation

The desktop hierarchy reads as mail: broad search, distinct Compose, restrained navigation, aligned rows and clear unread weight. The default surface is a list; the optional reader earns its extra width. The 320–430 layouts use a separate header, touch rows and full-screen composer instead of squeezed desktop columns. Dark mode keeps the reader and controls legible, and usage becomes a readable vertical list on a phone.

Manual/browser review found and fixed: clipped account control at 320, inaccessible collapsed-rail names, hidden mobile paging/refresh, missing dirty Cc text after minimize, close/navigation races, a displaced settings fieldset, and mobile history that previously exited the app. Screenshots were changed to wait for settled reader/saved-draft states rather than capturing transient disabled rows. Small measured percentages now say `<1%` instead of rounding positive consumption to zero.

The remaining evidence gaps above are release work, not implied passes. Priority: physical iOS/Android keyboard/install/safe areas and assistive technology; enlarged-text and gesture edge cases; larger mailbox/recipient/newsletter fixtures; complete DNS/credential/provisioning and storage-recovery workflows. No “fully tested mobile”, “offline mail”, Gmail parity or go-live claim is made.

After the login/startup fix, the refreshed 390 px inbox and mobile Usage captures were inspected again: single-pane mail hierarchy, readable usage values, explicitly unavailable provider measurements and pending provisioning remain visible. This was a screenshot review, not a physical-device test.
