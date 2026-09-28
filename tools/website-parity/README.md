# tools/website-parity: LyniaGo website pixel parity

Renders the deployable site (`apps/website/site`) and the approved design
(`packages/design/handoff/lyniago-website/reference/LandingPage-reference-offline.html`) in the same headless
Chromium, at the same viewport, takes full-page screenshots and diffs them pixel by pixel. Every parity
claim becomes an image (CLAUDE.md → Pixel parity). It only measures: it never writes into the site or the
design package.

This is not a workspace package, so it never enters turbo. It reuses the screenshot lane's
`tools/parity/lib/{browser,sheet,args}.mjs` (global Playwright + Chromium, agent-proxy aware). PNGs are
read and written by the dependency-free `png.mjs`.

## Run

```bash
node tools/website-parity/compare.mjs                      # local site vs reference, 7 QA widths
node tools/website-parity/compare.mjs --normalize-raster   # same, reference shows the site's raster files
node tools/website-parity/compare.mjs --site https://lyniago.com   # live deploy (needs outbound HTTPS)
node tools/website-parity/compare.mjs --widths 390,1440 --out /tmp/wp    # subset, custom output dir
node tools/website-parity/compare.mjs --help
```

Viewports are fixed per width, and each side gets the same one: 360×720, 390×844, 768×1024, 1024×768,
1280×800, 1440×900 and 1920×1080 (`WxH` sets any other size). Height matters because the desktop tier
caps illustrations with `calc(100vh - 200px)`. Output defaults to `$TMPDIR/lyniago-website-parity/`.

## How a render is made deterministic

1. Wait for the page, not for `load`. The reference is a bundler file that swaps in the real document
   after DOMContentLoaded. The harness waits for `.hero` and `#zmap svg` (the inline script has run) and
   for `#__bundler_loading` to be gone. After the swap, none of the bundler's wrapper CSS
   (`body{display:flex;background:#00B14F}`) is left.
2. Apply the same steps to both pages:
   - inject `animation:none; transition:none; scroll-behavior:auto`;
   - switch every `loading=lazy` image to eager and scroll the page in steps;
   - wait for every image to be `complete` and `decode()`d;
   - `load()` every `@font-face` and wait for `document.fonts.ready`;
   - wait until the document height holds still.
3. Take a full-page capture clipped to the viewport width, with `animations:"disabled"`. In this
   Chromium, `vh` stays frozen during a full-page capture (verified). The clip stops hidden horizontal
   overflow from widening the image.
4. Count a pixel as mismatched when any RGBA channel differs by more than `--tolerance` (default 8).

## Outputs and verdict

| File | Contents |
|---|---|
| `ref-<w>.png`, `site-<w>.png` | Full-page captures |
| `diff-<w>.png` | Faded reference. Red: beyond tolerance. Amber: differs within tolerance. Magenta: only one side has pixels (heights differ) |
| `band-<w>-<n>.png` | The *n* largest mismatch bands as reference, site and diff side by side, at 1:1 scale |
| `sheet-<w>.png` / `.html` | Side-by-side sheet from `tools/parity/lib/sheet.mjs`, laid out for review on a phone |
| `report.json` | Everything below, plus section geometry for both pages and per-section and per-band attribution |

A width fails when any of these happens:
- its mismatch is above `--threshold` (default 0.1%);
- the two page heights differ;
- an image is broken or never loads.

The run also fails when any site request fails or returns ≥400. That covers the index page at every
width and the 404 page the host serves for `/__website-parity-missing-page__`. The local server serves
`404.html` with status 404, like the production host does.

Reported as warnings:
- console errors;
- a wrong `Content-Type` (`.webp` must be `image/webp`, `.woff2` `font/woff2`, `.svg` `image/svg+xml`);
- a "soft 404".

Exit codes: 0 means pass, 1 means a parity or network failure, 2 means the harness could not run.

## Baseline (2026-09-28, handoff "mobile optimisation" revision)

| Width | Height (ref = site) | Raw mismatch | `--normalize-raster` |
|---|---|---|---|
| 360 | 8822 | 0.4182% | 0 px |
| 390 | 8783 | 0.4440% | 0 px |
| 768 | 9869 | 0.2859% | 0 px |
| 1024 | 4935 | 0.3050% | 0 px |
| 1280 | 5089 | 0.3982% | 0 px |
| 1440 | 5089 | 0.3540% | 0 px |
| 1920 | 5089 | 0.2654% | 0 px |

Every raw mismatched pixel is inside `#send .shot` (the step screenshots) or `#app .phones` (the phone
screens). These are the 10 screenshots that the handoff converted from PNG to WebP at quality 0.92 and
re-sized to 2×, a change its README sanctions. Two things cause the differences:
- lossy compression noise;
- slightly different aspect ratios, e.g. `step-1-hl` is 644×200 in the reference and 600×186 on the site.
  This moves the rotated close-up cards by about 0.1px.

With the reference showing the site's own raster files, every width is pixel-identical: 0 mismatched,
0 within-tolerance and max Δ 0. That covers markup, CSS, fonts, SVGs and the JS-built map.

For a regression gate, run `--normalize-raster --threshold 0.001`. A 1px layout change moves thousands
of pixels, and this threshold still tolerates a lone anti-aliasing pixel. Attach the raw run's sheets
and band crops as the visual evidence. Noise floor: reference against itself and site against site both
come out at 0 px. Across 37 comparisons, a single anti-aliased corner pixel of the nav pill (under
`backdrop-filter`) flickered once.

## Limits

- The local server does not apply `_headers`, so it cannot check CSP, cache headers or real content
  types. Only a live `--site` URL checks those.
- `lyniago.com` is not reachable from the Claude container's egress proxy (CONNECT 502). Run the live
  check from a machine with direct outbound HTTPS.
- The reference declares no icon, so Chromium's own `/favicon.ico` probe on it is ignored.
