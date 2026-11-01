# Codex amendment — Gmail-style desktop and app-like mobile

Use this prompt when the previous Postroom specification has already been supplied. For a new repository, use the updated `CODEX_PROMPT.md` instead.

```text
Update the Postroom project's frontend specification and implementation.

Design reference:
Use Gmail as the primary reference for desktop and mobile mail UI/UX.
Recreate its familiar mail hierarchy, density, navigation, lists,
conversation view, composer, selection, and action feedback in our own code.
Keep our own Postroom identity, original icon, domain, and authentication.
Do not copy Google logos, Google sign-in screens, proprietary artwork,
production source code, or claims of affiliation.

Read DESIGN.md, MOBILE_UX.md, UI_ACCEPTANCE.md, PLAN.md, AGENTS.md,
and SOURCES.md before editing. This direction replaces the older mandatory
three-pane desktop layout and teal-first appearance. It does not replace
the backend, security model, admin/API requirements, or strict-free budget.

Desktop:
- Top app bar with a broad rounded search field and compact settings/account
  actions, collapsible left navigation, prominent Compose, and a coherent
  full-width message list.
- Default opening a thread replaces the list in the main mail surface.
- Add an optional right-hand reading pane when space permits, not a forced
  three-column layout on every screen.
- Use aligned message rows, real unread/read/selected states, keyboard-safe
  bulk actions, and exact selection scope.
- Use a bottom-right compose window with minimize/expand behavior and the
  same persistent draft model used by mobile.
- Add functional Quick settings for theme, density, and reading pane.
- Do not copy unsupported Chat, Meet, AI, category-classification, snooze,
  calendar, or Google-app-switcher modules.

Mobile:
- Build a dedicated app-style single-pane layout. Do not shrink desktop.
- Rounded search/header, menu drawer, avatar/account switcher, readable
  sender/subject/snippet rows, and floating Compose action.
- Full-screen conversation, search, and composer routes.
- Accessible bottom sheets for short contextual actions and label selection.
- Swipe-to-archive and swipe-to-mark-read/unread, configurable/disableable,
  with equivalent explicit controls and reversible Undo where supported.
- Avatar/select-menu selection; long press only as an extra option.
- Preserve scroll, filters, focus, and drafts through Back and rotation.
- No decorative bottom navigation or empty Meet/Chat destinations.
- Handle safe areas, software keyboard, zoom, portrait/landscape, and
  dynamic viewport changes. Keep Send and the current editor line reachable.
- Keep routine administration fully usable on phones, including real usage
  meters and configuration forms, subject to the existing permissions.

Installable experience:
- Provide HTTPS, a manifest, original icons, theme colors, and standalone
  display with correct installation guidance for supported browsers.
- Normal browser mode remains fully usable; do not promise hidden browser
  chrome in a normal tab or native-app-store distribution.
- Cache only allowlisted public static assets and a public offline shell.
  Do not cache authenticated pages, Inertia payloads, mail, attachments,
  credentials, exports, or private API responses in a service worker.
- No persistent offline mailbox or local draft storage by default. Show
  unsaved/offline state honestly. Do not promise background send or push.
- Never reload for an update over an unsaved draft. Test logout, Back,
  bfcache restoration, and account switching for private-data leakage.
- Do not add paid PWA services, new native-app infrastructure, continuous
  polling, artificial keep-alives, or provider quota bypasses.

Visual quality:
Follow the Gmail-familiar cool neutral/white surfaces, restrained blue
accents, rounded search/navigation, and dense professional message lists
specified in DESIGN.md. Use coherent spacing, crisp alignment, readable
type, original licensed icons, deliberate dark mode, and natural microcopy.
Avoid generic SaaS dashboards, oversized cards, gradients, glass effects,
fake charts, decorative emojis, and nonfunctional buttons.

Use the reviewed/pinned Impeccable skill when available. Run supported
critique, audit, and polish workflows; do not invent tool results.
Use customized accessible components, the existing free editor stack,
Playwright, axe-core, and manual visual/keyboard review.

Architecture and state:
Share authorization, drafts, message mutations, quota checks, and domain
state between responsive layouts. Do not mount duplicate hidden editors,
duplicate requests, or a conflicting second routing system.
Keep draft persistence truthful and send intents idempotent.
Keep free-limit bars accurate: provider-reported, measured, estimated,
unavailable, or stale. Unknown is not zero. Preserve drafts when blocked.

Verification:
Run UI_ACCEPTANCE.md. Review 320, 360, 390, 430, 768, 1024, and 1440 px,
light/dark, reduced motion, long content, empty/error/quota/offline states,
and full keyboard navigation. Capture screenshots of implemented screens.
Record real iPhone/Android install and keyboard tests where available.
Do not label Playwright emulation or WebKit as a physical-device test.

Work in complete vertical slices: inbox/read/back, then composer/drafts,
then gestures/actions, then mobile administration, then PWA/privacy polish.
Do not replace a working backend with a mock UI. Preserve existing tests.
Report changed files, commands actually run, real results, remaining
limitations, and physical/provider checks that are not yet verified.
```
