# The screenshot lane — every parity claim becomes an image

**Status:** Phase 1 landed (the lane itself). Per-screen app fixtures grow as screens are aligned.

This is the process fix behind the pixel-parity workstream (`CLAUDE.md` → "Pixel parity"). Five days of
"alignment" PRs merged green while the app still didn't look like the designs, because the checks were
copy-string and route-existence greps — a 2026-08-05 pixel audit then found **1 of 244 screens actually
matched**. The lane closes that gap: for any screen it renders the **design mock** beside the **app
screen** in the same browser, at the same viewport, and composes a side-by-side sheet. The reviewer
**approves the picture, not the prose.**

The tool lives in [`tools/parity/`](../tools/parity/) (a root-level tool, deliberately outside the
`apps/*`/`packages/*` workspace globs, so it never enters turbo build/typecheck/test gates).

## What it renders — three paths, one sheet

| Surface | Mock side (source of truth) | App side | Viewport |
|---|---|---|---|
| Customer + Rider (mobile) | design registry screen, rendered from the real design system | the RN screen via **react-native-web** | 360×720 (·320×640) |
| Merchant (tablet) | design registry screen | the Next.js app (Playwright) | 1024×680 |
| Admin (console) | the `ui_kits/admin/*.html` kit page | the Next.js app (Playwright) | 1440×900 |

All three feed one compositor that emits `<name>.html` (self-contained, PR-attachable) and `<name>.png`.

### Mock side — hermetic, byte-faithful to the design tool

`lib/design-server.mjs` serves `packages/design/` over loopback and answers one virtual path,
`/explorations/journey/__parity_harness.html` (generated in memory — **nothing is written into the
design mirror**). The harness reproduces the exact head + script load order of
`All Screens Gallery.html` up to but not including `gallery.jsx`, then mounts **one** registry screen
(`window.LJ/RC/RJ/RR/RJM/RM[id]`) into a container sized to the real app viewport. Same React, same
Babel, same DS bundle, same Inter the gallery uses.

Why hermetic: this container's Chromium can't complete a TLS handshake to external hosts through the
agent proxy (the egress MITM resets its BoringSSL ClientHello, though curl/node succeed). So the pinned
CDN libs (react/react-dom/@babel-standalone/leaflet) are vendored once into a gitignored cache
(`lib/vendor.mjs`) and served from loopback — the "serve a local mirror" path the design
`EXPORT-README` sanctions. OSM map tiles are stubbed to neutral gray (`stubExternals`), which keeps the
render deterministic **and honest**: a parity shot never claims the live map matches — that's what a
native-map device spot-check is for.

### Mobile app side — react-native-web

`mobile/bundle.mjs` bundles a screen with esbuild, aliasing `react-native`→`react-native-web`, deduping
React to one copy (two copies = "invalid hook call"), routing native-only modules to shims
(`mobile/shims/`: safe-area, `react-native-svg`→DOM, expo-router, expo-constants, sentry, a generic
empty), and `@lynia/shared`→its TS source. lucide icons draw through the svg shim. The bundle mounts in
a blank 360×720 page with Inter inlined, and `#root` is a flex column so a root `flex:1` fills the
height the way the RN root does on device.

Per-screen data comes from a **fixture** (`mobile/fixtures/<name>.mjs`, `{ wrap?, props? }`) — the same
provider-mocking the jest suites already do. A screen with no fixture yet still shows its **mock**; its
app column shows an honest "pending", never a blank that reads as "matches".

### Web app side — Playwright on the Next dev server

`serve-web.mjs` runs `next dev --webpack` for admin (:4311) / merchant (:4312). `--webpack` is required:
Next 16's default Turbopack mis-labels `@lynia/shared`'s ESM as CommonJS and 500s every page (the apps'
own build scripts use `next build --webpack` for the same reason). In dev the admin auth gate is off,
and with `API_BASE_URL` unset the pages render their **offline/empty state** rather than crashing — a
faithful render of the console/tablet shell with no API/DB/auth to stand up. Point
`PARITY_ADMIN_URL` / `PARITY_MERCHANT_URL` at a seeded instance to shoot populated data instead.

## Commands

```bash
cd tools/parity
npm i                                    # one-time: esbuild + react-native-web (playwright is global here)

# one screen, one side
node render-mock.mjs   --src RC --id home --out out/rc-home.png
node render-mock.mjs   --src RM --id queue_board --mode tablet --out out/rm.png
node render-mobile.mjs --component app/force-update.tsx --fixture force_update --out out/app.png

# a full side-by-side sheet (mock + app) for a PR
node pair.mjs --keys LJ.force_update,RC.home --title "Parity — X" --out out/sheet-x
node pair.mjs --category admin --out out/sheet-admin      # needs: node serve-web.mjs admin (separate shell)
node pair.mjs --wired --out out/sheet-wired               # every screen that has an app target
```

`pair.mjs` writes `out/sheet-x.html` (attach to the PR) and `out/sheet-x.png` (drop in chat). Each row
shows the mock, the app (or an honest pending), and the screen's parity status chip.

## The registry

- `screens.generated.json` — the **mock-side inventory** (244 screens: customer 102 · rider 91 ·
  merchant 44 · admin 7), generated from the design's own gallery data. Regenerate after a new export:
  `node gen-manifest.mjs`. Never hand-edit.
- `app-targets.mjs` — the **hand-maintained** app-side map, keyed by `${src}.${id}`. This is where the
  lane grows: as each screen is aligned, add its target.

  ```js
  "RC.home":        { kind: "mobile", component: "app/(tabs)/home.tsx", fixture: "home" },
  "ADMIN.orders.html": { kind: "web", app: "admin", route: "/orders", mode: "admin" },
  ```

## How it plugs into an alignment PR

1. Add/verify the screen's `app-targets.mjs` entry (+ a fixture if the mobile screen needs data).
2. `node pair.mjs --keys <the screens> --out out/sheet-<pr>`.
3. Attach `out/sheet-<pr>.html` (or the `.png`) to the PR.
4. The **user approves the picture** — an alignment PR waits for that visual OK (`CLAUDE.md` merge gate),
   and the screen is marked ✅ in `docs/PIXEL-PARITY-TRACKER.md` only then.

## Honesty rules (do not "fix" these away)

- **Not drawn ⇒ not rendered.** The mock side renders exactly what the design system draws — including
  its own image-slot placeholders. Don't dress it up.
- **Stubbed map ≠ matched map.** Map tiles are gray stubs; the native map is verified by device
  spot-check, not by this lane.
- **Offline admin/merchant** shows the empty state until you point the renderer at a seeded API.
- **Pending is not pass.** A missing app render is a labelled placeholder, never a blank.

## What Phase 1 proved, and what's incremental

Proven end-to-end: the hermetic mock renderer (all 244 screens, phone/320/tablet + admin kit pages), the
mobile react-native-web renderer (`force-update` as the reference screen), the web renderer (admin
console, both `/` and `/orders`), and the pair→sheet pipeline. Incremental, per screen, as alignment
proceeds: the `app-targets.mjs` entries and mobile `fixtures/` — each is the same provider-mocking the
jest suites already encode, added when a screen is actually being aligned.

## Environment notes (this container)

- Playwright + Chromium are global (`/opt/pw-browsers`); the loader prefers the global install and pins
  the pre-installed Chromium, so a locally `npm i`-ed `playwright-core` with an undownloaded browser
  can't break it.
- Chromium is pointed at `$HTTPS_PROXY` with `<-loopback>` bypass as a safety net, but the mock render
  is fully hermetic (loopback + stubbed externals) and needs no egress at render time — only the
  one-time vendor download does.
