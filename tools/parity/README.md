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

## Layout

```
render-mock.mjs      render one design screen (registry harness) → PNG
render-mobile.mjs    render one RN screen via react-native-web → PNG
serve-web.mjs        next dev --webpack for admin/merchant (screenshotted by the web renderer)
pair.mjs             render both sides for screen keys → a side-by-side sheet (.html + .png)
gen-manifest.mjs     regenerate screens.generated.json from the design gallery data

screens.mjs          merged registry: generated inventory + app-targets
app-targets.mjs      hand-maintained app-side map (grows per screen as they're aligned)
screens.generated.json   mock-side inventory (275 screens), generated — do not hand-edit

lib/    design-server, harness-html, mock, mobile, web, sheet, browser, vendor, args
mobile/ bundle.mjs (esbuild+rn-web), fonts.mjs, shims/, fixtures/
```

`out/`, `.vendor/` (downloaded libs) and `node_modules/` are gitignored.
