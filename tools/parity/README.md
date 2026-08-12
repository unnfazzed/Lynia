# tools/parity — the pixel-parity screenshot lane

Renders the **design mock** beside the **app screen** in one browser, at one viewport per side, and
composes a side-by-side sheet. Every alignment claim becomes an image; you approve the picture, not the
prose. Full spec + rationale: [`docs/SCREENSHOT-LANE.md`](../../docs/SCREENSHOT-LANE.md).

Deliberately **not** a workspace package (repo globs are `apps/*` / `packages/*`), so it never enters
turbo build/typecheck/test. It is a Claude-run tool.

## Quick start

```bash
cd tools/parity
npm i                              # esbuild + react-native-web (Playwright is global in this container)

node render-mock.mjs   --src RC --id home --out out/rc-home.png          # design mock → PNG
node render-mobile.mjs --component app/force-update.tsx --fixture force_update --out out/app.png
node pair.mjs --keys LJ.force_update --title "Parity — force update" --out out/sheet   # side-by-side

node serve-web.mjs admin           # then, in another shell: pair.mjs --category admin
```

## The rendered-conformance lane (CI-blocking)

The screenshot lane produces evidence a human looks at. The rendered-conformance lane produces a
FAILING BUILD when a wired screen stops matching the mock's copy or structure — it is what closes the
gap static checks can't see (which conditional branch won, what the live wiring interpolated, copy the
app invented). It is split in two so the blocking half needs no browser:

```bash
node extract-expected.mjs                 # browser: mock DOM → tools/parity/expected/<key>.json (COMMIT these)
node extract-expected.mjs --keys RC.home  # one screen
node extract-expected.mjs --check         # determinism gate: must reproduce byte-for-byte

pnpm --filter ./apps/mobile exec jest rendered-conformance   # no browser; this is the CI gate
```

- **Expected side** (`extract-expected.mjs`) renders the mock exactly as `render-mock.mjs` does, walks
  the DOM into a normalized `{role, text}` tree, and commits it. Date/`Math.random` are frozen so the
  output is reproducible; the mocks' faux status bar and root tab bar are dropped (the app screen
  renders neither — the OS and `app/(tabs)/_layout.tsx` do) and recorded in `chromeDropped`.
- **App side** (`apps/mobile/src/parity/__tests__/rendered-conformance.test.tsx`) mounts the real
  screen with the SAME fixture from `mobile/fixtures/` — never a second copy of the data — and diffs
  the same normal form. Both sides import `lib/rendered-tree.mjs`, so normalization cannot drift.
- **Escapes are per-string and reviewable**, never blanket: `dynamic` (a value a fixture can't pin —
  needs a regex the app string must satisfy), `extra` (an app string the mock doesn't draw), `undrawn`
  (a mock string the app doesn't render). Each needs a reason and a `ref`. A wired+fixtured key that is
  neither asserted nor listed in `rendered-conformance.pending.json` fails the test.
- After changing a screen, a fixture, or the mocks: re-run `extract-expected.mjs`, then the jest gate.

## Layout

```
render-mock.mjs      render one design screen (registry harness) → PNG
render-mobile.mjs    render one RN screen via react-native-web → PNG
serve-web.mjs        next dev --webpack for admin/merchant (screenshotted by the web renderer)
pair.mjs             render both sides for screen keys → a side-by-side sheet (.html + .png)
gen-manifest.mjs     regenerate screens.generated.json from the design gallery data

extract-expected.mjs rendered-conformance: mock DOM → expected/<key>.json (browser, run locally)
expected/            committed mock-side expectations + hand-maintained per-string escapes
rendered-conformance.pending.json   wired keys not yet asserted, each with a written blocker

screens.mjs          merged registry: generated inventory + app-targets
app-targets.mjs      hand-maintained app-side map (grows per screen as they're aligned)
screens.generated.json   mock-side inventory (275 screens), generated — do not hand-edit

lib/    design-server, harness-html, mock, mobile, web, sheet, browser, vendor, args
mobile/ bundle.mjs (esbuild+rn-web), fonts.mjs, shims/, fixtures/
```

`out/`, `.vendor/` (downloaded libs) and `node_modules/` are gitignored.
