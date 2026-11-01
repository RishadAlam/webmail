# WebMail — UI/UX acceptance and evidence checklist

**Revision:** 2 · November 1, 2026  
**Initial status:** Every case is **not run**. This document describes required tests; it is not a test report.

**Execution report:** [November 1 local acceptance evidence](docs/UI_REPORT.md), with an explicit status for every case, browser/mock scope and physical-device gaps. [STATUS.md](STATUS.md) records final executed command results. The original cases below remain the acceptance requirements.

## 1. Evidence rules

Use fictional fixtures only. For each case record viewport/device, browser/version, light/dark preference, fixture, action, expected result, actual result, screenshot/video path, and status: `Passed`, `Failed`, `Blocked`, or `Not run`.

Do not label emulation as physical-device testing. Playwright WebKit is not proof of iPhone Safari installation, native keyboard, or safe-area behavior. Record provider-mocked tests separately from real-service tests. Automated accessibility checks and screenshots supplement, not replace, manual task review.

Suggested evidence directories:

```text
docs/ui-evidence/desktop/
docs/ui-evidence/tablet/
docs/ui-evidence/mobile/
docs/ui-evidence/pwa/
docs/ui-evidence/accessibility/
```

Maintain a review summary with remaining defects and unverified claims. An attractive static mock is not sufficient evidence of a working interface.

## 2. Viewport and platform matrix

| Context         | Required coverage                                                                         |
| --------------- | ----------------------------------------------------------------------------------------- |
| Narrow reflow   | 320 CSS px; enlarged text and zoom                                                        |
| Small phone     | 360 px; long names and small-height landscape                                             |
| Standard phone  | 390 px; main workflow screenshots                                                         |
| Large phone     | 430 px; full-screen composer and sheets                                                   |
| Tablet          | 768 px portrait and rotated/split-screen behavior                                         |
| Compact desktop | 1024 px; collapsed navigation and pane thresholds                                         |
| Desktop         | 1440 px; inbox, conversation, docked composer, optional split                             |
| Browsers        | Chromium, Firefox, and WebKit where tools allow                                           |
| Physical mobile | iPhone Safari and Android Chrome, normal and installed mode, when devices are available   |
| Accessibility   | Keyboard-only; screen-reader-oriented check; light/dark; reduced motion; text enlargement |

Breakpoints are design defaults. Layout must also behave at intermediate widths, not just the listed screenshot sizes.

## 3. Desktop mail cases

| ID  | Scenario                                       | Expected result                                                                                           |
| --- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| D01 | Open Inbox at 1440 px                          | Gmail-familiar top search, left Compose/navigation, coherent full-width list; no forced three-pane reader |
| D02 | Open a thread and return                       | Subject/details/body/actions readable; mailbox, filter, scroll, and relevant focus restored               |
| D03 | Toggle optional reading pane                   | Usable right pane at adequate width; saved preference; clean single-pane fallback on narrowing            |
| D04 | Toggle density/navigation                      | Rows and controls align; no clipping; settings persist without reloading away an unsaved draft            |
| D05 | Select messages and bulk archive               | Count and scope are accurate; repeated clicks do not duplicate operations; rollback handles failure       |
| D06 | Use row actions without a mouse                | Every action reachable through focus/menu; no hover-only action                                           |
| D07 | Open/minimize/expand compose                   | One draft ID/editor; body and recipients preserved; minimize remains discoverable                         |
| D08 | Reject send because quota is exhausted         | Draft retained; shared allowance explained; state is Held rather than Sent                                |
| D09 | Autosave/provider request fails                | Persistent actionable error; never show Saved or Delivered without evidence                               |
| D10 | Long subjects, no subject, large recipient set | Layout remains readable; truncation has a full-value path; BCC remains private                            |
| D11 | Search and change filters                      | Only supported filters/operators; previous query and pagination survive reading/back                      |
| D12 | Open Quick settings                            | Only implemented options; accessible close/focus; no fake Calendar/Chat/Meet/AI controls                  |

## 4. Mobile mail cases

| ID  | Scenario                                           | Expected result                                                                                 |
| --- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| M01 | Open inbox at 360/390/430 px                       | App-like single pane, rounded search header, readable rows, Compose action, no desktop overflow |
| M02 | Open drawer and mailbox selector                   | Correct identity/counts; focus and background handling; closing restores context                |
| M03 | Open conversation and use browser/system Back      | Restores list/filter/position; no accidental app exit or stale-account content                  |
| M04 | Open direct conversation deep link                 | Authorized content only; sensible fallback Back route                                           |
| M05 | Swipe horizontally while list is scrolling         | Clear intent detection; vertical scroll wins until horizontal gesture is intentional            |
| M06 | Archive by swipe, then Undo                        | Reversible operation restores exact message state; failure rolls back visibly                   |
| M07 | Use selection without gestures                     | Avatar/select/menu alternatives available; selected count and toolbar accurate                  |
| M08 | Open overflow/label/details sheet                  | Readable, focus-managed, closeable without drag; long content scrolls correctly                 |
| M09 | Compose with real keyboard open                    | Caret, essential actions, and subject/recipient inputs remain reachable; no hidden Send         |
| M10 | Rotate device or resize with dirty draft           | Same draft/body/recipients; no duplicate editor; save status stays truthful                     |
| M11 | Close draft after save failure                     | Does not silently discard; keep-editing/discard decision explains unsaved state                 |
| M12 | Tap Send twice during slow request                 | One persistent send intent; no duplicate delivery or false second success                       |
| M13 | Search, read, and return                           | Query/results/scroll retained; filters remain accessible on a phone                             |
| M14 | Open wide newsletter/table or long attachment name | App shell does not overflow; contained content fallback available                               |
| M15 | Use every swipe action through explicit controls   | Same outcome available to keyboard/screen-reader/touch users                                    |
| M16 | Increase text size and use 320 px reflow           | No clipped primary controls or inaccessible warnings; zoom stays enabled                        |
| M17 | Reach last list row with Compose button visible    | Adequate bottom padding; floating action does not permanently cover message content             |
| M18 | Edge-swipe/back and pull-to-refresh                | Platform gestures not hijacked; refresh bounded and not repeatedly triggered                    |

## 5. Mobile administration and limit meters

| ID  | Scenario                                   | Expected result                                                                                |
| --- | ------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| A01 | Enter Admin as ordinary user               | Entry absent and server access denied; no client-only security                                 |
| A02 | Create/suspend a user on phone             | Complete in-app workflow; provisioning state accurate; appropriate confirmation                |
| A03 | Review domain/DNS diff on phone            | Records and consequences readable; no unapproved changes; preserved unrelated records          |
| A04 | Connect/test/rotate credentials            | Secret masking and safe paste work; secrets do not enter screenshots/logs                      |
| A05 | Render 69/70/85/95/100/over-limit fixtures | Correct policy warning/blocking; exact values/scope visible; not just colors                   |
| A06 | Provider usage unavailable/stale           | No fabricated percentage or healthy state; source/freshness and remedy shown                   |
| A07 | Storage almost full                        | Cleanup/recovery remains reachable; accepting/sending behavior consistent with enforced limits |
| A08 | Return from Admin to mailbox               | Mail context preserved; admin navigation does not leak into ordinary-user controls             |
| A09 | Long delivery failure/audit detail         | Detail accessible with redaction; no tiny overflowing desktop table                            |

## 6. PWA, offline, and privacy cases

| ID  | Scenario                                         | Expected result                                                                          |
| --- | ------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| P01 | Install on a supported browser                   | Own name/icon, correct manifest/scope; no Google affiliation or paid wrapper required    |
| P02 | Launch from home-screen icon                     | Standalone behavior where supported; usable normal-browser fallback                      |
| P03 | Unsupported programmatic install                 | Accurate instructions; no nonfunctional install button                                   |
| P04 | Inspect service-worker caches after reading mail | Only allowlisted public static assets/offline shell; no mail/API/auth/export content     |
| P05 | Lose network with open draft                     | Accurate Not saved state; in-view draft preserved; no promise of durable offline storage |
| P06 | Reload offline with no private cache             | Public offline explanation; no fabricated inbox or leaked prior user's content           |
| P07 | Logout and press Back/reopen app                 | Sensitive state cleared/locked; restored view revalidated; no prior mailbox exposed      |
| P08 | Switch accounts on shared device                 | No cross-account draft/message/history leakage                                           |
| P09 | New service-worker version while draft is dirty  | No forced reload; safe-save/update flow                                                  |
| P10 | Free host sleeps or is unavailable               | Honest loading/delay/retry state; no artificial keep-alive or fake live connection       |
| P11 | App becomes backgrounded                         | No continuous quota-consuming polling or unsupported background-send promise             |

## 7. Accessibility and visual polish

| ID  | Scenario                                                | Expected result                                                                             |
| --- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| X01 | Complete read/reply/archive/settings by keyboard        | Logical tab order, no traps, visible focus, focus restored after layers close               |
| X02 | Screen-reader review                                    | Named controls, headings/landmarks, non-chatty announcements, meaningful error association  |
| X03 | Automated axe scan of key states                        | Violations reviewed and resolved; limitations documented                                    |
| X04 | Contrast in light/dark and selected/unread/error states | Legible text and controls; no color-only status; incoming HTML not blindly inverted         |
| X05 | Reduced-motion preference                               | Functional transitions remain understandable without unnecessary movement                   |
| X06 | Mobile target/spacing review                            | Primary controls follow the 48 px product target; adjacent actions are not easy to confuse  |
| X07 | Visual critique at all principal sizes                  | Gmail familiarity without Google branding, generic cards, fake modules, or clipped controls |
| X08 | Offline/quota/permissions failure copy                  | Specific, natural language; safe next action; no promotional filler                         |

## 8. Release evidence summary template

```text
Build/commit:
Date:
Reviewer/tools:
Screens and fixture IDs:
Automated commands actually executed:
Desktop/browser results:
Emulated-mobile results:
Physical iOS results (or NOT RUN):
Physical Android results (or NOT RUN):
Install/keyboard/safe-area results:
Mock-provider versus live-provider scope:
Known visual/accessibility/privacy defects:
Blocked checks and why:
Next remediation:
```

No release claim may say “fully tested on mobile” when only viewport screenshots were generated. Do not claim Gmail feature parity; report the actual implemented scope.
