# WebMail brand assets

The approved identity combines a connected W and envelope with the **WebMail** wordmark and **by Hookstack** endorsement. The owner supplied the identity sheet and authorized theme-specific color adaptation on November 1, 2026.

![WebMail by Hookstack](../public/brand/webmail-logo-light.png)

## Use in the application

`resources/js/components/postroom/ui.tsx` exposes the accessible `Brand` lockup. `AppLogoIcon` shares the same PNG silhouette through an alpha mask with `currentColor`; there is no separate hand-drawn replacement. The full lockup is used by authentication, the desktop header, mobile navigation drawer, settings, administration and the public configuration guide. Offline and access-error pages carry the same identity without needing React.

The mark uses `--brand-accent` so the six palettes and Light/Dark/System modes stay consistent. The wordmark and byline use the existing readable text tokens. Browser and installed-app icons retain white on blue `#0B57D0` for recognition. Palette changes never change the logo shape.

## Files

| Asset                                                   | Purpose                                                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `resources/brand/webmail-identity-reference.png`        | Original owner-supplied identity sheet; provenance/reference, not served to clients              |
| `resources/brand/webmail-mark-master.png`               | Transparent raster production adaptation of the approved connected concept                       |
| `public/brand/webmail-mark.png`                         | 1024 × 544 transparent mark, shared by interface alpha masks                                     |
| `public/brand/webmail-logo-{light,dark,mono,white}.png` | 720 × 192 transparent lockups for documentation or other project surfaces                        |
| `public/brand/favicon-{16,32,48}.png`                   | Actual-size favicon exports for inspection/reuse                                                 |
| `public/favicon.svg`, `public/favicon.ico`              | Browser icons; SVG contains an embedded PNG, ICO contains 16/32/48 px PNG entries                |
| `public/apple-touch-icon.png`                           | Opaque 180 × 180 Apple touch icon                                                                |
| `public/icon-192.png`, `public/icon-512.png`            | Opaque install icons                                                                             |
| `public/icon-maskable-512.png`                          | Separate opaque maskable icon with essential artwork inside the central 80%-diameter safe circle |

These are raster assets. The SVG favicon and React SVG mask **are not editable vector masters**. A genuine vector master would require a separate design deliverable. The tiny auxiliary Hookstack symbol in the reference sheet is not reproduced; the readable endorsement is retained as text.

## Rebuild exports

With the project's Node version and development dependencies installed:

```sh
npm ci
npm run brand:build
npm run build
```

`scripts/build-brand-assets.mjs` uses the pinned Sharp 0.35.5 development dependency. It trims unused transparent margins, scales the single master proportionally, uses its alpha for theme/color variants, and packages PNG/ICO/SVG-container exports. It does not call an image API or generate a new logo. Committed public assets are sufficient for normal application builds; production does not need to run the export script. Lockup text uses Arial/Helvetica fallbacks, so export lettering may vary with installed fonts; the application uses accessible live text.

Keep at least one stroke-width of clear space around the mark. Use the full lockup when space allows and the icon alone for browser/install surfaces. Keep the byline out of 16–48 px icons. Do not stretch, rotate, add shadows, or replace the mark with a generic envelope. Check small icons at their actual size and inspect both light and dark backgrounds before replacing assets.

The public service-worker cache version is updated for this identity. Its exact allowlist contains only `/offline.html`, `/favicon.svg?v=3`, `/icon-192.png?v=3`, and `/icon-512.png?v=3`. Versioned icon URLs prevent an older cached logo from appearing in the new interface. Other query strings are not cached. The new maskable file is used by the manifest and is not added to private or navigation caching. Updates activate through the normal service-worker lifecycle; no forced reload or draft interruption is added.

## Source preparation

The master was prepared with the built-in image tool from the supplied reference. It is an adapted flat rendition, not a pixel-exact crop or a traced vector. No API key, application AI integration, or paid provider dependency was added. The selected production prompt was:

> Produce a transparent clean logo asset from this brand sheet. Use ONLY the connected W/envelope symbol in the PRIMARY LOGO (center of sheet) and CONCEPT 3 (upper right). Faithfully match that approved symbol's compact proportions: the actual drawn mark is approximately 1.55 times as wide as it is tall, NOT a wide 2-to-1 symbol. The left W intertwines with the envelope outline; all three diagonal intersections and the compact rounded envelope must remain as shown. Do not redesign. Reproduce the silhouette as a clean flat single blue #0B57D0 with smooth precise edges, fully opaque solid strokes and fully transparent counters; no texture, gradients, shadows, speckles, paper, residual pixels, typography or layout guides. Large isolated symbol centered on transparent background with very little padding. Keep the mark's aspect ratio 1.55:1 and the original relative stroke thickness. Only the approved connected icon, no wordmark or any other elements.

Generated pixels remain the source of truth for exports; the prompt's proportions are guidance, not a claim of exact vector fidelity. Historical screenshots are dated verification evidence and may show the earlier envelope icon. Current branding captures are linked from `STATUS.md`.
