# WebMail — Gmail-style desktop and mobile design specification

**Revision:** 2 · November 1, 2026  
**Status:** Implementation specification, not a completed interface or tested application.  
**Related files:** `PLAN.md`, `MOBILE_UX.md`, `UI_ACCEPTANCE.md`, `CODEX_PROMPT.md`, `SOURCES.md`.

## 1. Design decision and precedence

Use Gmail's familiar desktop and mobile mail workflows as the primary reference. Recreate the recognizable hierarchy, density, navigation, composition, and feedback patterns in our own implementation. This replaces the earlier mandatory three-pane desktop layout and the earlier teal-first visual direction.

The result should immediately feel familiar to a Gmail user, while clearly being **WebMail**, the business's independent mail service. Keep our name, original icon, domain, and authentication identity. Do not use Google's logo, a Google sign-in lookalike, proprietary artwork, extracted production code, or claims of Google affiliation. Use licensed open-source assets and original code.

The approved identity is the connected W-and-envelope mark with the **WebMail** wordmark and **by Hookstack** endorsement. Use the shared `Brand` component for full lockups and `AppLogoIcon` for icon-only placements. Its color follows the current palette's accessible accent; browser/install icons keep white on WebMail blue. Keep the artwork's proportions, transparent counters, and clear space. [Brand assets and export instructions](docs/BRANDING.md) cover the raster source, variants and small-size limitations.

This is a close Gmail-style mail experience, not a promise of pixel-identical replication across every Gmail account, experiment, or operating-system version. Review current public Google references before implementation and record the chosen reference state. Gmail documents alternative inbox layouts and optional reading panes; select a deliberate default rather than combining incompatible layouts. [S30, S31]

Backend architecture, strict-free restrictions, provider policies, administration, and quota enforcement remain unchanged. Do not add paid services to imitate a visual feature.

## 2. Reference workflow and impeccable taste

Read this file and `MOBILE_UX.md` before scaffolding screens. Use the reviewed and pinned Impeccable design skill when available; verify its installed commands rather than inventing them. Use its design-context, critique, accessibility-audit, and polish workflows as supported by that version. Record unavailable tools honestly. [S27]

Create a reference matrix covering desktop inbox, conversation, composer, settings, mobile inbox, mobile conversation, and mobile compose. Each reference note should say what pattern is being adopted, what WebMail changes, and what backend capability is required. Public references must not contain real account data.

Build functional screens before polishing screenshots. Review realistic fictional mail, including long and missing subjects, international names, multi-recipient threads, quota holds, slow synchronization, and empty folders. A starter-kit component gallery is not the finished product.

Use Playwright screenshots, axe-core checks, keyboard review, and real-device review where available. Keep real messages, credentials, and sensitive screenshots out of design tools. Do not weaken production security for an agent overlay. [S25, S26, S27]

## 3. Visual system

These are **WebMail starting tokens**, not a claim to reproduce Google's exact design tokens. Validate contrast and adjust before shipping.

| Token              | Light starting value | Purpose                                                  |
| ------------------ | -------------------- | -------------------------------------------------------- |
| `canvas`           | `#F6F8FC`            | Quiet cool background around the mail surface            |
| `surface`          | `#FFFFFF`            | Inbox and conversation surfaces                          |
| `surface-subtle`   | `#F2F6FC`            | Read-row or secondary surfaces                           |
| `text-primary`     | `#1F1F1F`            | Main text                                                |
| `text-secondary`   | `#444746`            | Readable supporting text                                 |
| `border-subtle`    | `#DADCE0`            | Dividers, not the only interactive boundary              |
| `accent`           | `#0B57D0`            | Primary actions, links, and strong focus                 |
| `selected-surface` | `#D3E3FD`            | Selected navigation and selected rows                    |
| `compose-surface`  | `#C2E7FF`            | Prominent, calm Compose button                           |
| `warning`          | `#8A4B00`            | Warning text paired with a label and appropriate surface |
| `danger`           | `#B3261E`            | Error/destructive state paired with text                 |

Create semantic dark-theme tokens independently; do not invert incoming email or simply invert the whole page. Test selected, unread, hovered, focused, disabled, and error states in both themes.

Use a well-tuned system font stack or a locally served, openly licensed font. Do not depend on downloading proprietary Google fonts. Main application text is generally 14–16 px; message reading text starts at 16 px; message subjects may use 20–24 px. Mobile editable fields are at least 16 px as a product default. Support text enlargement without breaking controls.

Use a 4/8 px spacing rhythm. The desktop mail surface can have an approximately 16 px outer radius, pill-shaped active navigation, a rounded search surface, and a softly rounded Compose control. Message rows remain a coherent list, not individually floating cards. Use shadows for floating menus, the compose window, or sheets only when needed.

Use one consistent icon family, initially Lucide, customized for optical size and alignment. Never mix inconsistent outline/fill styles or use emoji as UI icons. Use restrained functional animation, approximately 120–180 ms as a starting point, with reduced-motion support.

## 4. Desktop shell: Gmail-like, not a generic dashboard

At approximately 1024 CSS px and wider, provide:

- A compact top app bar: menu toggle, WebMail identity, broad rounded mail search, search options, settings, and account/avatar controls.
- A collapsible left navigation, approximately 240–256 px expanded, with Compose, Inbox, Starred, Sent, Drafts, All mail/Archive, Spam, Trash, labels, and mailbox switcher where applicable.
- A large, calm mail surface containing a compact toolbar and message list.
- A quick-settings side panel for implemented preferences only: appearance, density, reading-pane mode, and navigation behavior.

The **default is navigation plus a full-width list**. Opening a thread replaces the list with a full-width conversation in the same main surface. Back returns to the previous query, pagination, scroll position, focus, and selection where appropriate.

Offer an optional right-hand reading pane when there is sufficient width. A below-list reading pane is a later optional enhancement, not a required MVP feature. Persist preferences per user, but automatically use single-pane navigation when the available space cannot support the saved split. Gmail's documented preview choices are a reference, not a requirement to implement every variant. [S31]

Do not render Chat, Meet, a Google app switcher, Calendar, AI summaries, or unused right-side productivity rails. Do not add category tabs such as Promotions or Social unless there is a genuine implemented classification feature. The first inbox can use honest filters such as All and Unread instead.

## 5. Desktop message list and conversation

Use rows with aligned selection control, star, sender, subject/snippet, optional attachment indicator, and timestamp. Comfortable density starts around 44–48 px per row; compact mode may be denser only where pointer and accessibility requirements remain satisfied. Increase target areas for coarse pointers.

Unread rows use stronger sender/subject weight and a distinct surface. Keyboard focus must remain distinct from unread and selected states. Hover actions must also be available through keyboard focus and an explicit action menu; never make hover the only path.

Bulk actions show the selected count and exact selection scope. Do not imply that selecting the current page selected all search results. Use optimistic feedback only for reversible operations with a tested rollback.

In conversations, show a clear subject, compact sender headers, expandable recipient details, attachment states, and reply/reply-all/forward controls. Keep original BCC private. Place delivery status on our outgoing messages without falsely marking them read by the recipient.

Incoming HTML remains isolated and sanitized. Bound its width without shrinking the entire application to fit a wide newsletter; offer a contained overflow area or plain-text view for difficult content. Remote-image notices are clear and calm, not hidden for visual neatness.

## 6. Desktop composer and draft continuity

Use a Gmail-familiar compose window anchored near the lower-right of the mail workspace, roughly 520–600 px wide when space permits. It is not necessarily modal: allow reading the inbox while composing. Supply minimize, expand, and close controls with explicit accessible names. A single active compose window is sufficient for v1; other saved drafts remain in Drafts.

Show the authorized From identity, validated recipient chips, CC/BCC toggles, subject, editor, optional attachment area, and a clear Send action. Keep formatting compact and secondary. Attachment restrictions must be visible before a user spends time uploading an unsupported file.

Desktop expansion and mobile full-screen compose must use the same draft ID and version, not create new independent drafts. Closing saves and dismisses only after a confirmed save; permanent discard is a separate action with confirmation. When saving fails, explain the risk and retain the open draft.

Show Saving, Saved, Not saved, Conflict, Sending, and Held for quota accurately. Do not label a draft saved while it exists only in memory. Retain the draft after quota, permission, provider, or network failure. No fake successful send animation.

## 7. Mobile: a distinct app experience

`MOBILE_UX.md` is the detailed mobile implementation contract. Below approximately 768 CSS px, use a deliberately composed single-pane application, not a reduced desktop layout.

The inbox has a rounded search/header surface, menu entry point, account avatar, sender avatars/initials, readable two- or three-line rows, and a floating Compose action. Messages and compose open as full-screen routes. Overflow actions use accessible bottom sheets where appropriate. Selection mode replaces the normal toolbar with a count and bulk actions.

Support swipe-to-archive and swipe-to-mark-read/unread with explicit non-gesture alternatives. Archive can offer Undo when the operation is genuinely reversible. Long-press selection is supplemental, not the only method. These patterns are consistent with Gmail's documented mobile settings; our exact defaults are product choices. [S32]

Do not add a decorative bottom navigation bar merely to resemble a native app. The default mail-only app uses its drawer/account menu for navigation and no empty Chat/Meet destinations. If a future release has several real top-level destinations, review the navigation architecture then.

Respect device safe areas, the software keyboard, browser navigation, text scaling, rotation, reduced motion, and touch targets. Installation should enhance the experience; the same tasks must work in a normal browser tab.

## 8. Tablet and responsive transitions

Treat breakpoints as initial layout rules, not device detection:

| Available width   | Initial behavior                                                                          |
| ----------------- | ----------------------------------------------------------------------------------------- |
| Below 768 px      | Mobile single-pane routes and full-screen compose                                         |
| 768–1023 px       | Compact/tablet shell; drawer navigation; reader replaces list unless both fit comfortably |
| 1024–1279 px      | Desktop shell with collapsible navigation; optional pane only if usable                   |
| 1280 px and above | Full desktop shell; optional reading pane and expandable compose                          |

Use available container space and content needs to refine these thresholds. A tablet in split-screen may need mobile layout. Do not use user-agent sniffing for layout. Never render duplicate hidden composers or readers that multiply network requests, drafts, or accessibility landmarks.

## 9. Administrator workspace

Extend the same Gmail-like visual system into a custom administration workspace. Gmail is the reference for mail interaction, not a reason to omit business administration or copy a different product's console wholesale.

Use a clearly marked Admin mode with a return-to-mail control. Desktop navigation covers Overview, People, Mailboxes, Domains, Integrations, Delivery, Usage, Security, and Maintenance. Prioritize operational health and actionable incidents over decorative statistics.

On mobile, use a section drawer, stacked forms, concise list summaries, full-screen details, and action sheets. Critical fields, quota values, and credential status must remain accessible without horizontal scrolling. Advanced DNS diffs may use an explicitly contained, keyboard-accessible horizontal region; ordinary tasks must not require it.

Provide all supported routine administrator workflows on mobile, not just read-only charts. Require reauthentication/MFA for sensitive operations; show exact DNS changes and risks before approval. Never hide provider failure states behind a polished success screen.

## 10. Usage meters and limit-state design

Keep real usage meters in Admin → Usage and expose a small, relevant mailbox-storage summary to users. Do not clutter ordinary email reading with every infrastructure statistic.

Every meter includes resource, scope, used, limit, remaining, reserved where applicable, observation time, freshness, accuracy label, and the next safe action. Distinguish provider-reported, locally measured, estimated, unavailable, and stale. Unknown is never 0%.

Example **fictional layout fixture, not live usage**:

```text
Outgoing email · daily · shared account
78 / 100 recipient deliveries                    78%
[=======================-------]
22 remaining · Provider-reported · Updated 2 min ago
```

On phones, stack values and details rather than clipping them. At warning thresholds show an explanatory label and text, not color alone. Preserve the prior safe-state behaviors: application headroom is different from provider exhaustion; a stale snapshot is not proof that sending remains available.

When a user hits a sending limit, keep the composer intact and explain that the account allowance is shared. Admins get a route to Usage; ordinary users get a clear explanation without access to credentials or other users' mail.

## 11. Installable app shell and truthful offline behavior

Provide a PWA manifest, original icons, HTTPS deployment, theme colors, and `display: standalone`. Installed behavior and installation prompts vary by browser; provide compatible instructions instead of pretending every browser exposes the same button. Standalone launch can give the app its own window, but ordinary browser tabs retain browser chrome. [S33]

A service worker may cache a carefully allowlisted static shell and a public offline explanation. It must not indiscriminately cache authenticated HTML, Inertia payloads, APIs, messages, attachments, credentials, or exports. `Cache-Control` headers do not replace the need for explicit service-worker cache rules. [S35]

V1 does not promise offline mail access, background delivery, native push, or persistent offline drafts. Do not save private content in localStorage/IndexedDB by default. Preserve an unsaved draft in the active view and clearly warn when it is not durable. A later local-storage feature requires an explicit privacy design and administrator policy.

Never auto-reload the app to install an update while a draft is dirty. Prompt for a safe update after saving. Do not add continuous background polling or artificial keep-alive requests to make the free host appear always-on.

## 12. Accessibility and interaction quality

Target WCAG 2.2 AA. Use semantic navigation, headings, real controls, meaningful names, focus restoration, non-color states, and keyboard alternatives to all gestures. Use a 48 CSS px mobile target as our design default, not as a claim about the exact WCAG threshold. Verify zoom and reflow at 320 CSS px. [S28]

Shortcuts are opt-in/discoverable and must not trigger while typing in a field, editor, or assistive composition session. Escape dismisses a dismissible layer; it must not discard unsaved work. Browser Back should behave as navigation, not a logout or data-loss shortcut.

Announce meaningful changes without reading every autosave keystroke. Undo actions must remain available long enough to use; destructive settings use persistent confirmation, not a fleeting toast. Dialogs and sheets need focus handling and accessible close controls.

## 13. Taste and editorial rules

No generic SaaS landing page, giant welcome banner, purple gradient backdrop, glassmorphism, animated decorative blobs, fake charts, oversized metric grids, or floating cards around every row. No arbitrary novelty to make the interface look less like a reference.

The crafted quality comes from alignment, whitespace, content density, coherent iconography, useful text, and state continuity. Use natural copy: “Draft not saved,” “Sending paused,” “Verify domain,” “Move to Trash.” Avoid promotional filler.

Use original fictional data, not scraped mail. Include realistic short messages as well as long threads. Keep user-visible timestamps localized and preserve exact UTC data internally. Truncate only with a way to access the full value.

## 14. Required implementation components

Share domain state and permissions across layouts. A proposed component boundary is:

```text
MailShell / DesktopMailLayout / MobileMailLayout
MailSearch / MailNavigation / MailboxSwitcher
MessageList / DesktopMessageRow / MobileMessageRow
SelectionToolbar / ConversationReader / MessageDetails
ComposeController / DesktopComposeWindow / MobileComposeScreen
DraftSaveStatus / RecipientInput / AttachmentPolicyNotice
MobileActionSheet / SwipeActionRow / UndoNotice
AdminShell / SetupWizard / UsageMeter / ProviderStatus
InstallHelp / SafeAppUpdateNotice / OfflineState
```

These names are suggestions, not a demand for unnecessary abstraction. Avoid two separate business-logic implementations for desktop and mobile. Do not add a second router that conflicts with the chosen Inertia navigation model. Avoid licensing surprises and mandatory hosted UI services.

## 15. Definition of design complete

Use `UI_ACCEPTANCE.md` as the release checklist. Capture desktop, tablet, and mobile evidence for all core screens and failure states. Include 320, 360, 390, 430, 768, 1024, and 1440 px layouts, plus real iOS/Android testing where available.

Check the first-screen hierarchy, message scanability, long content, draft continuity, action reachability, keyboard behavior, safe areas, light/dark themes, and admin usage warnings. Playwright WebKit is useful but is not a claim of testing a real iPhone or a physical soft keyboard.

A polished screenshot is not completion. Record what was implemented, what tests were actually run, what passed, and which physical-device/provider checks remain unverified.
