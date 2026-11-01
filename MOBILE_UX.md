# WebMail — mobile app-like UX contract

**Revision:** 2 · November 1, 2026  
**Purpose:** A Gmail-familiar mobile webmail experience built from the same Laravel/Inertia application. This is a PWA-capable web app, not a promised App Store/Play Store native binary.

## 1. Product requirements

Mobile is a primary experience. A user must be able to read, search, compose, reply, forward, organize, and manage account settings without opening a desktop computer. An authorized administrator must be able to perform supported routine management from a phone.

Use our own identity and assets. Do not imitate Google authentication, show Google account consent when none exists, or claim Google affiliation. Keep strict-free architecture and provider restrictions unchanged.

Do not compress a three-column desktop interface into a phone. Use full-width lists, full-screen task views, an accessible drawer, bottom sheets for appropriate contextual choices, and a persistent draft model.

## 2. Screen inventory and navigation

| Screen                   | Required interaction                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------ |
| Inbox                    | Search header, mailbox identity, readable rows, Compose action, visible sync state when relevant |
| Mail navigation          | Drawer with folders/labels, account/settings, and Admin entry for authorized users               |
| Search                   | Focused full-screen search, filters sheet, results, clear/cancel, honest empty state             |
| Conversation             | Back, archive/trash/overflow, subject, messages, details, reply/forward                          |
| Compose                  | Full-screen editor with back/save behavior, sender, recipients, subject, body, Send              |
| Selection mode           | Count, archive, trash, read/unread, move/label, explicit exit                                    |
| Settings                 | Stacked preference lists and forms; appearance, density where relevant, swipe actions            |
| Administration           | Section drawer, lists, details, setup, credential forms, usage and maintenance                   |
| Installation help        | Platform-appropriate explanation, not a fake universal install button                            |
| Offline/host unavailable | Honest status, retry, unsaved-draft warning, no invented inbox data                              |

Routes must be deep-linkable and protected on the server. Inbox → conversation → Back returns to the same mailbox, filter, list position, and focused item. Search → conversation → Back returns to search results. A fresh deep link with no prior in-app entry uses a sensible mailbox fallback rather than navigating away unexpectedly.

Use the existing Inertia/router approach. Model drawers and sheets deliberately so browser/system Back closes or navigates them predictably without trapping the user. Do not blanket-disable browser navigation or edge gestures.

## 3. Inbox geometry and visual hierarchy

Starting layout values are design defaults to refine with real content:

- Approximately 16 px horizontal screen padding and a 52–56 px rounded search/header surface.
- Sender initials/avatar around 40 px, inside an adequate selection target.
- Message rows around 76–92 px depending on density and content, not hard-coded heights that clip enlarged text.
- Sender/subject around 15–16 px, snippet around 14 px, timestamp around 12–13 px with sufficient contrast.
- One Compose extended floating action button, approximately 56 px high, anchored above bottom safe areas and not covering the final message.
- Approximately 48 CSS px touch targets for primary interactive controls, with adequate spacing.

Each row shows sender, subject, a short snippet, timestamp, star, and an attachment indicator when real. Distinguish unread with weight and surface, not only a dot. No giant cards or decorative separators between every message.

The default mail-only app has **no bottom destination bar**. Folders and settings use the drawer; account switching uses the avatar/menu. Do not copy Gmail's unrelated Meet/Chat destinations. Extra navigation is justified only by real features.

## 4. Gestures and alternatives

Default left swipe: Archive. Default right swipe: Mark read/unread. Allow the user to change or disable these among implemented actions. Do not offer Snooze, scheduled sending, or other options with no backend support.

Reveal the action and label as the row moves; commit only after deliberate horizontal intent. Prioritize vertical scroll until horizontal intent is established. Handle pointer cancellation and accidental diagonal movement. Do not intercept operating-system back gestures near the screen edge.

Provide the same actions in menus and accessible controls. Avatar selection and an explicit Select option must work even without long press. Long press is supplemental; respect platform text-selection behavior in the reader/editor.

After a reversible archive, offer Undo and maintain a tested server-side rollback path. Do not label a permanent purge Undo. Prevent repeated taps/swipes from causing duplicate mutations. On an API failure, restore the row and show an actionable error.

Pull-to-refresh is optional progressive enhancement at the top of the inbox only. Do not hijack body/editor scrolling or create repeated provider synchronization requests. Always provide an explicit Refresh action. Rate-limit refreshes and show actual last-sync state.

Gmail's documented swipe and selection patterns are reference material; these exact defaults are WebMail's design choices. [S32]

## 5. Conversation and contextual actions

Use a compact top bar with Back and high-value actions. Keep a full sender/address disclosure available, especially when names could be misleading. Long subjects wrap naturally. Recipient details open a readable panel/sheet without leaking BCC.

Provide Reply, Reply all where applicable, and Forward near the conversation content. A compact reply entry may expand into the full-screen composer, preserving the thread context. A full composer is required for editing recipients, sender identity, or attachments.

Sanitized message content remains isolated. Wide images fit the reader; wide tables scroll within a contained message region or offer plain text. Do not let a sender-controlled email force the app's navigation off-screen. Do not proxy arbitrary image URLs without the existing security checks.

Use bottom sheets for short contextual menus, label selection, and details where appropriate. Long forms get their own screen. Every sheet has an accessible heading, close control, logical focus, and scrolling that does not move the background unexpectedly. Provide alternatives to drag-to-dismiss.

## 6. Full-screen composer

The top row contains back/dismiss, a clear Compose/Reply title, Send, and overflow where needed. The body contains authorized From identity, recipient chips with CC/BCC, subject, editor, and conditional attachment controls. Formatting tools are secondary and keyboard-accessible.

The same draft state powers desktop and mobile. Resizing, rotating, expanding, or switching layouts must not generate duplicate drafts or destroy editor selection. Keep only one active mounted editor for a draft.

Autosave is debounced and server-confirmed. Display Saving, Saved, Not saved, Conflict, and quota/provider errors. Sending runs exactly once per persistent intent despite double taps. Do not close the screen until the send state is safely recorded; uncertain sending needs a visible status, not an automatic resend.

Back closes a draft only after a confirmed save. When offline or saving fails, keep it open or present an explicit keep-editing/discard decision. Discard needs confirmation. Browser unload recovery cannot be guaranteed; warn that in-memory unsaved work will be lost on reload/closure when no local persistence is enabled.

No silent localStorage/IndexedDB persistence of private drafts in v1. Any later opt-in local recovery requires an administrator policy, device/privacy warning, scoped storage, retention, logout cleanup, and a separate security review. Do not claim that hiding content in IndexedDB encrypts it.

## 7. Safe areas, viewport, and software keyboard

Use an appropriate viewport meta configuration without disabling user zoom. Account for safe-area insets around notches and home indicators. Use dynamic viewport sizing with sensible fallbacks; do not assume `100vh` or `100dvh` alone solves all keyboard behavior.

Treat `window.visualViewport` as a feature-detected aid, not a mandatory dependency. The visual viewport can change independently of the layout viewport when the keyboard or zoom changes. Avoid overwriting user zoom or applying redundant keyboard offsets. [S34]

Keep the current editable field/caret, Send, and essential close/save actions reachable when the keyboard opens. Do not force the viewport back to the top after each autosave. Ensure the formatting toolbar does not obscure the current line. Use a scrollable content area and reserve safe bottom space for fixed actions.

Test both browser-tab and installed modes, portrait and landscape, with keyboard open/closed and text enlarged. CSS viewport emulation alone is insufficient evidence for physical keyboard behavior.

## 8. App installation and PWA boundaries

Implement an HTTPS-served manifest with original icons, stable app identity, start URL/scope, appropriate colors, and `display: standalone`. Generate icons at build time without paid branding tools. Do not include credentials or private mailbox IDs in manifest metadata.

Use the supported browser install flow when available; otherwise show accurate platform instructions. Do not show “Install” after a successful installation or repeatedly nag the user. Test launch from a home-screen icon as a separate scenario. [S33]

Normal browser mode still contains browser UI. Installed standalone mode can provide a dedicated app window where supported. Do not promise an APK, native app-store release, permanent background execution, or notification parity with Gmail merely because a manifest exists.

Web push and persistent offline mail are out of the initial scope. Do not request notification permissions on first launch for an unimplemented feature. Installation must not require a paid PWA service, Capacitor build service, or app-store subscription.

## 9. Caching, offline state, updates, and logout

Use a narrow service-worker allowlist: versioned public CSS/JS/icons and a public offline shell without user data. Network requests for authenticated HTML, Inertia responses, APIs, mail bodies, attachments, exports, and administrator content remain outside that cache. [S35]

After logout or account switching, clear application state and any app-owned private caches that may exist. Account for browser history/bfcache: restored private views must be locked/revalidated before becoming interactive. Do not cache CSRF/session responses in the public shell. Test that a different user cannot see the prior mailbox on a shared device.

When offline, distinguish the shell being available from email being available. Do not fabricate unread counts or “Saved” state. Keep an open unsaved draft in memory with a clear warning; there is no durable offline recovery promise in v1.

Do not immediately activate/reload a new service worker over an unsaved draft. Notify of an update and apply it after safe save/confirmation. Test upgrade paths and cache invalidation so old frontend code does not submit incompatible payloads.

Do not poll continuously to keep the PHP host awake. Refresh only for actual visible user work or the existing bounded incoming-backlog process. A cold start must be labeled honestly without a fake countdown or indefinite unexplained spinner.

## 10. Mobile administration and usage

The Admin entry appears only to authorized users. Server permissions remain authoritative. Keep the current mode and a clear return-to-mail action visible.

Users/mailboxes/domains become concise list rows with detail screens; creation/editing uses stacked forms. DNS changes use a review screen before confirmation. Use platform-friendly password/credential inputs without weakening masking, reauthentication, CSRF protection, or secret handling.

Usage meters stack vertically with full values, shared-account scope, freshness, and accuracy labels. Warnings are text plus color; unknown values remain unknown. A user can read the exact restriction and next action without horizontal scrolling. Credential setup can allow secure paste; never require typing long tokens manually for superficial security.

All applicable admin workflows stay in the application after bootstrap. Mobile polish must not remove the original initial-authorization exceptions or invent provider APIs.

## 11. Accessibility and performance

Maintain at least our 48 px touch-target design default for primary controls. Provide proper labels, headings, live-region restraint, focus restoration, screen-reader alternatives to gestures, and reduced-motion behavior. Do not disable pinch zoom. Test 200% text scaling and 320 px reflow. [S28]

Lazy-load the editor, rich preview, and admin sections as appropriate. Avoid a large animation framework for simple transitions. Debounce autosave/search, cancel obsolete queries, paginate mail, and do not preload all messages or remote images. Rendering separate desktop/mobile trees must not double requests.

Use modest loading skeletons only for real in-progress work. Show long delays and failures explicitly. On mutation failure, restore the prior usable state and keep drafts.

## 12. Required evidence

Complete the mobile and PWA cases in `UI_ACCEPTANCE.md`. Record real browsers/devices and executed steps. At minimum, cover inbox → read → reply, compose with keyboard, select/archive/undo, filter/search/back, quota hold, offline draft warning, installed launch, logout privacy, and mobile admin provisioning/usage.

Playwright's emulated devices and WebKit engine are useful but are not a substitute for claiming real iPhone/Android installation or keyboard tests. Mark unperformed physical tests as pending. No decorative phone mockup counts as a functioning mobile UI.
