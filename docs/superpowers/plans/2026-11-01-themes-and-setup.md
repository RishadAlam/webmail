# Themes and setup guide implementation plan

**Goal:** Make theme selection and configuration help easy to find, and supply an original WebMail logo brief.

**Design:** Extend the existing mail settings with six account-saved color palettes, independently selectable Light/Dark/System modes, and miniature inbox previews. Keep the current appearance URL compatible. Provide one canonical Markdown configuration guide through a public, fixed-path help route and include it in the production image. Link help from login, mail help, settings and Connections. Keep drafts in the persistent mail layout; open longer configuration help separately from an active composer.

**Architecture:** Existing Laravel preferences transaction and React preference store; CSS semantic tokens; installed CommonMark renderer with raw HTML and unsafe links disabled. No new dependencies, external assets or provider mutations.

**Authorization:** The user requested themes, configuration documentation and a logo-agent prompt within the existing strict-free architecture. Native implementation continues under that scope.

## Tasks

- [x] Verify palette validation, account isolation, first render and help access with focused PHP tests.
- [x] Implement palette tokens, gallery, quick-settings discovery and saved/error feedback; preserve appearance compatibility and draft continuity.
- [x] Write the configuration guide from actual code and checked official references; render it with a mobile contents menu and readable code blocks. Include selected guides in the production image.
- [x] Add a reusable logo-agent prompt without generating or replacing branding.
- [x] Run PHP/static/build checks and focused browser checks for persistence, rollback, dark mode, 320 px reflow, keyboard navigation and help links. Review fictional screenshots and update STATUS.

## Review focus

Failed saves must restore the old palette. A second account must not inherit the first account's palette. Light/dark choices must remain independent. Help must expose no runtime settings or credentials and must work before sign-in. A build must contain the documentation file it renders. Theme changes must not remount or erase a draft.

## Outcome

Six palettes and the public setup guide are implemented; the original appearance route remains compatible. Local PHP/static/build checks and the final 51-workflow Chromium suite passed, plus five focused tests each in WebKit and Firefox. All twelve palette/mode gallery states passed axe in each engine. Configuration cutover ordering was corrected after independent review. See STATUS and `docs/verification/2026-11-01-themes-and-help.json` for exact evidence and remaining live/image/device gates. No provider changes or logo generation were performed.
