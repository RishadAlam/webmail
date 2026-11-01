# Login refinement implementation plan

**Goal:** Make signing in clear, comfortable, and accessible with the centered panel selected by the user.

**Architecture:** Keep the existing Laravel/Fortify and Inertia form contract. Refine only `auth/login.tsx` and add scoped CSS; shared MFA and password-confirmation layouts stay independent.

**Tech stack:** Existing React, Inertia, CSS tokens, Lucide, Playwright, and axe. No new packages or external assets.

## Design

Operate mode: a single centered panel with integrated WebMail branding, a direct sign-in heading, generous field spacing, and one blue primary action. Use the existing surface, text, accent, danger, and dark-theme tokens. Provide a keyboard-accessible password visibility control that masks the value again on submission. Connect server errors to fields and focus the first invalid field while retaining the email for retry. Keep administrator-managed access and recovery instructions visible; do not invent signup or reset routes. Mobile uses the same form with smaller outer gutters, 48 px controls, safe-area padding, and natural scrolling when the keyboard or enlarged text reduces available space.

## Implementation and validation

- [x] Capture the current layout and add meaningful login regression checks. Baseline fails for absent password visibility and absent field error semantics.
- [x] Implement the centered panel, responsive and dark styles, password control, accessible errors, and truthful loading state.
- [x] Build and run login browser checks, existing authentication tests, TypeScript, and lint. Review screenshots at desktop, 390 px, 320 px, dark mode, and 200% text size.
- [x] Review the diff for changes outside scope and record results in STATUS.md.
- [x] Add the requested keyboard-accessible **Forgot password?** disclosure with accurate administrator/operator recovery guidance. Confirm entered values survive opening/closing, no form submission occurs, narrow/enlarged layouts fit, and subsequent sign-in succeeds. Email recovery endpoints remain disabled under the existing policy.

## Review focus

- Password visibility must never submit the form or change the typed value.
- Submission must remask the password and disable repeat actions while pending.
- Failed credentials must retain the email and expose an associated, announced error; retry must work.
- Small screens and enlarged text must scroll without clipping the inputs or primary action.
- Dark mode, keyboard focus, autofill, and admin-only account recovery must remain usable.

## Guidance provenance

Used the locally available Impeccable 4.7.1 guidance for polish, Operate surfaces, and its craft floor. The repository's historical 3.8.0 installation path is absent on this Mac. The reviewed 4.7.1 launcher could not run because its engine was not installed and its cache directory was not writable. No engine, installer, overlay, hook, or production dependency was added; PRODUCT.md and DESIGN.md provided context directly. The historical pin file remains unchanged.
