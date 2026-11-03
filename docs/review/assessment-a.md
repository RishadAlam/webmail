# Assessment A — independent design review

Reviewed 2026-11-01. Target: `resources/js/pages/mail.tsx` and the app's account/auth/admin surfaces. Reviewer used pinned Impeccable 3.8.0 (`docs/impeccable-pin.json`), product register, and critique guidance. No detector output or Assessment B was read. The requested identity is **WebMail by Hookstack**, superseding Webmail in the existing design documents.

## Evidence and scope

Fresh, separate Chromium **156.0.8078.4** contexts inspected `http://localhost:8082` with fictional Mira data. Fresh screenshots cover login; inbox at 1440, 1024, 768, 390 and 320 CSS px; 390/320 selection; mobile navigation drawer, search and quick settings; password confirmation; account profile/security/appearance. Temporary captures are in `/tmp/webmail-assessment-a/`. No horizontal document overflow occurred in the five inbox widths; completed browser pass reported no page errors.

Only login/password-confirmation session actions were submitted. After authentication, non-GET requests were blocked. No drafts, mail state, account settings, provider state or DNS were changed. Conversations were not opened because the GET controller marks unread messages read. Compose and admin were reviewed in source and supplemented by **older** `docs/ui-evidence/mobile/chromium-compose.png` and existing acceptance documentation; they are not fresh end-to-end evidence. Owner MFA/recovery codes were not used. No physical iOS/Android, native keyboard, installation, screen reader or live-provider test was performed.

Executed browser checks used `rtk proxy /tmp/webmail-node/node_modules/node/bin/node` with installed Playwright. Browser launch through `node_repl` failed under sandbox restrictions; approved local exec worked. Three preliminary harness attempts failed on initial-page metadata and a test-id selector; the successful passes above used rendered DOM and explicit selectors. No build, shared E2E suite or app code mutation was performed by this reviewer. Root began editing source while the built preview remained stable, so these findings describe the **pre-remediation rendered build**, not proof that concurrent source fixes failed.

## Gmail reference

Current public Google documentation was checked on the review date. Gmail puts folders/labels in a collapsible left menu and offers multiple inbox layouts; Webmail's left navigation plus full list is a reasonable deliberate subset. [Gmail inbox layout](https://support.google.com/mail/answer/18522?hl=en&co=GENIE.Platform%3DDesktop). Its optional no-split/right/below reading pane supports this project's no-split default and optional right pane. [Reading pane](https://support.google.com/mail/answer/9499937?hl=en). Android Gmail documents sender-image selection and configurable swipe actions, matching the app's avatar/gesture model. [Android settings](https://support.google.com/mail/answer/6562?hl=en&co=GENIE.Platform%3DAndroid).

The cool `#F6F8FC` canvas, white content, blue selection/action colors, coherent rows, rounded search and pale-blue Compose produce recognizable Gmail familiarity. These are the project's stated tokens; Google sources consulted do not establish exact current production hex values. This review does not claim pixel identity, authenticated Gmail-account inspection, or Gmail feature parity. Do not add unsupported categories, AI, Chat or Meet to increase resemblance.

## Overall judgment

**Earned familiarity in mail; incomplete cohesion at account/security boundaries.** The inbox does not look like a generic AI dashboard: it is a real dense task surface with a consistent icon family and clear reading hierarchy. Authentication and settings still expose starter-kit styling and identity. Those seams matter more than decorative polish because users encounter them while entering credentials or changing account security.

Strengths:

- The desktop list and mobile avatar/subject/snippet hierarchy feel familiar immediately. There is no forced reader, card grid, fake category tab or decorative bottom navigation.
- Unread and selected rows have distinct weight/surfaces; keyboard focus is visibly separate. Familiar folders, visible compose, and accurate current-page wording reduce learning effort.
- Limitations are concrete: fictional-provider status, locally measured storage, remote-content protection and draft-save states are exposed instead of implying unsupported capabilities. Source-level draft retention is a strong foundation, though this pass did not retest failure paths.

## Priority findings

1. **[P1] Account settings have a color-token collision and undersized mobile controls.** Fresh `profile-1440.png` and `security-settings-390.png` show the active tab as dark text on a dark gray surface, black primary buttons, and short fields unlike the mail UI. Runtime measurement on the active Profile tab: foreground `rgb(31,31,31)`, background `rgb(84,91,102)`, **2.41:1 contrast**. Settings tabs were 30 px high; inputs and Save were 33.75 px high with 15 px text, below this project's 48 px/16 px mobile defaults. The baseline custom CSS uses `--muted` as a text color while Tailwind `bg-muted` expects a surface. Relevant files: `resources/css/app.css` theme mappings; `resources/css/webmail.css` root tokens; `resources/js/layouts/settings/layout.tsx:54`; shared UI input/button components. **Fix:** reconcile semantic surface/text/accent tokens across custom and shared components; keep original mail colors, use a pale selected surface, and make mobile settings/auth controls meet product targets. Recheck actual built light/dark contrast after the in-progress token work. Suggested: `/impeccable audit` then `/impeccable adapt`.

2. **[P1] Mobile selection has no explicit exit and wastes its constrained toolbar.** Fresh `selection-390.png` and `selection-320.png`: two selected rows retain the normal search header, Compose and Quick settings; no Clear selection/Back control appears. At 320 px, the selected count wraps to three lines and `1–17 of 17` to four lines. The toolbar technically fits, but its meaning becomes hard to scan. With many selected messages the available exit is to uncheck rows individually or navigate away. Relevant files: `resources/js/pages/mail.tsx:775` and adjacent toolbar rendering; mobile `.mail-toolbar`, `.selection-scope`, `.toolbar-right` rules in `resources/css/webmail.css`. **Fix:** make selection a deliberate mode with a named 48 px exit, compact count, and only selection actions; hide pagination/settings in that mode and move lower-priority actions into More when needed. Suggested: `/impeccable adapt`.

3. **[P1] Reauthentication breaks product identity at the moment trust matters most.** Fresh `security-390.png` shows the Laravel mark and a black starter-style password-confirmation form after leaving the blue Webmail mailbox. The brand name disappears and the icon link's accessible name is the page title rather than a clear destination. Source confirms the same auth layout serves the MFA challenge. Relevant files: `resources/js/layouts/auth/auth-simple-layout.tsx:2`, `resources/js/components/app-logo-icon.tsx`, `resources/js/pages/auth/confirm-password.tsx`, `resources/js/pages/auth/two-factor-challenge.tsx`, and `resources/js/components/webmail/ui.tsx:25`. **Fix:** apply the original WebMail mark and consistent **WebMail by Hookstack** identity to login, reauthentication and MFA; use shared accessible form tokens and a clear return/sign-in alternative without weakening the password/MFA requirement. Rename titles, help, manifest and saved-state copy together. Suggested: `/impeccable polish`.

4. **[P2] Appearance has two competing preference systems.** Quick settings uses `auth.user.preferences.theme` and `PUT /preferences`; account Appearance uses `useAppearance`, localStorage/cookie `appearance`, and a separate module state. The two screens can disagree about the chosen mode; returning to Mail applies the server preference again. Mail's system-theme effect also only runs when `prefs.theme` changes, while the global hook listens to OS changes with its own state. This is a source-level finding, not a reproduced preference mutation. Relevant files: `resources/js/pages/mail.tsx:179`, `resources/js/pages/mail.tsx:187`, `resources/js/hooks/use-appearance.tsx:32`, `resources/js/hooks/use-appearance.tsx:71`, `resources/js/pages/settings/appearance.tsx`. **Fix:** use one shared authenticated appearance state and persistence path, with a live system-theme listener; ensure mail, settings, admin and reload agree. Suggested: `/impeccable harden`.

5. **[P2] Search visually promises broader coverage than it performs.** The main header says “Search mail,” but the controller limits searches to the current folder and only sender/address/subject. Desktop scope is disclosed only after opening Search options. The mobile full-screen search says “Search this folder,” but supplies no scope/filter control and an unrelated membership note. A user looking for archived or sent mail from Inbox can receive an empty result and assume the mail is missing. Relevant files: `resources/js/pages/mail.tsx:677`, `resources/js/pages/mail.tsx:1159`, `resources/js/pages/mail.tsx:1189`; `app/Http/Controllers/MailController.php:27`. **Fix:** explicitly display the current folder and supported search fields in header/results, or add an authorized all-mail scope as a real backend feature. Keep a reachable supported Unread filter on mobile. Gmail's search exposes narrowing controls and scope in advanced options, so its broad visual search affordance carries stronger expectations. [Gmail search](https://support.google.com/mail/answer/6593?hl=en&co=GENIE.Platform%3DDesktop). Suggested: `/impeccable clarify`.

## Nielsen scores

Scores reflect this limited independent source/visual review; error and send behavior were not freshly exercised.

| Heuristic                       |  Score /4 | Evidence                                                                     |
| ------------------------------- | --------: | ---------------------------------------------------------------------------- |
| Visibility of system status     |         3 | Accurate pilot/storage/save labels; fresh failure transitions untested       |
| Match with the real world       |         3 | Familiar mail language; search scope and account jargon need clarity         |
| User control and freedom        |         2 | Selection lacks direct exit; visible Back elsewhere                          |
| Consistency and standards       |         2 | Mail, shared settings and auth do not yet share one system                   |
| Error prevention                |         3 | Draft/recipient guards in source; small account controls hinder safe action  |
| Recognition rather than recall  |         3 | Familiar folders and explicit actions; hidden search scope                   |
| Flexibility and efficiency      |         2 | Density, pane, gestures and bulk controls; inefficient bulk exit/search      |
| Aesthetic and minimalist design |         3 | Coherent mail surface; redundant header and account seams                    |
| Error recovery                  |         3 | Source retains drafts and offers reversible-operation feedback; not retested |
| Help and documentation          |         2 | Honest contextual limits/install help; shallow task guidance                 |
| **Total**                       | **26/40** | **Acceptable foundation; improvements needed before release**                |

## Cognitive load and emotional journey

Inbox: low load, clear primary task, familiar grouped folders. Seven folder destinations are recognizable categories rather than seven novel decisions. Mobile selection: **moderate load, 3 checklist failures**—single focus (normal search/Compose remain), hierarchy (vertical counts), and minimal choices (four mutation controls plus settings compete). Five simultaneously visible selection-related/general actions exceed the four-item working-memory guideline. Settings add a consistency burden: the same appearance decision exists in two locations with different state owners.

The emotional peak is the calm, readable inbox. The valley is being sent to an unfamiliar Laravel-branded credential screen, followed by small low-contrast security controls. The completion experience for sending/quota failure remains unverified in this pass; do not infer confidence from screenshots.

Persona red flags: **Sam** encounters 2.41:1 active navigation and 30–34 px account controls; **Casey** has no one-tap selection exit and dense wrapped toolbar text at 320 px; **Alex** must discover folder-limited search and manually clear many mobile selections.

Minor observations: remove the redundant desktop inbox tagline/vertical header space if density is the goal; explicitly mark any mobile-only setting's desktop effect; mobile admin currently uses a horizontally scrolling section row in source instead of the specified section drawer. These are secondary to the five findings above.

Questions for synthesis (not blockers): Can every credential screen preserve the same brand and form vocabulary? Can selection occupy a single unmistakable mode? Should search keep its deliberately narrow scope with stronger labeling, or become a genuine all-mail search?
