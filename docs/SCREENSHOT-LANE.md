# The screenshot lane — every parity claim becomes an image

An alignment claim is made with a **side-by-side image**, not prose: the design's drawing of a
screen beside the app's render of it, at the same viewport. The tools live in
[`tools/parity/`](../tools/parity/) (outside the workspace globs, so they never enter turbo
build/typecheck/test). Quick reference: [`tools/parity/README.md`](../tools/parity/README.md).

Conformance itself is enforced by CI guardrails (`CLAUDE.md` → "Pixel parity"). The sheets are the
evidence attached to an alignment PR.

## Two kinds of sheet

| Kind | Mock side | Tool | Used for |
|---|---|---|---|
| **Handoff sheet** | the handoff's own HTML prototype or exported frame PNGs (`packages/design/handoff/<name>/…`) | one `shoot-<handoff>.mjs` script per handoff | every screen a handoff owns (most of the app today) |
| **Gallery sheet** | a registry screen from `All Screens Gallery.html`, rendered from the real design system | `pair.mjs` | screens no handoff has replaced, and admin |

Both put the app beside the mock and write a sheet as `<out>.png` plus a self-contained `<out>.html`
(`lib/sheet.mjs`).

## Handoff sheets — `shoot-*.mjs`

Each script stages the app from fixtures, drives it by accessible name where a state needs a tap,
and shoots the matching handoff frame. Its header comment gives the exact command.

| Script | Handoff | Ledger | App side |
|---|---|---|---|
| `shoot-send-v2.mjs` | `send-compose-v2` | D-52 | `app/send.tsx` |
| `shoot-after-send.mjs` | `after-send-v2` | D-53 | `app/order/[id].tsx` |
| `shoot-rider-v2.mjs` | `rider-v2` | D-54 | rider screens |
| `shoot-calm-mint.mjs` | `calm-mint-v2-2026-10` | D-55 | Home and onboarding |
| `shoot-tab-bar.mjs` | `tab-bar-v1` | D-56 | a tab root with the real `TabBar` |
| `shoot-browse-v2.mjs` | `browse-v2` | D-57 | Restaurants list, storefront, search |
| `shoot-order-flow-review.mjs` | `order-flow-v2` (R states) | D-59 | `app/food/checkout.tsx` |
| `shoot-order-flow-customer.mjs` | `order-flow-v2` (T/U/P/D states) | D-59 | `app/order/[id].tsx` |
| `shoot-order-flow-shops.mjs` | `order-flow-v2` + `browse-v2` | D-59 | shop and pharmacy ordering |
| `shoot-order-flow-merchant.mjs` | `order-flow-v2` (M and RD states) | D-59 | merchant hand-over (default) or rider (`--set rider`) |
| `shoot-orders-v2.mjs` | `orders-v2` | D-63 | Orders tab |
| `shoot-splash.mjs` | `splash-v1` | D-64 | `src/boot/splash/BootSplash.tsx` |
| `shoot-notifications-v1.mjs` | `notifications-v1` | D-66 | Notifications |
| `shoot-merchant-v2.mjs` | `merchant-v2` | D-77 | merchant web app |
| `shoot-merchant-mobile.mjs` | `merchant-mobile` | D-48 | merchant screens merchant-v2 doesn't redraw |
| `shoot-install-tip.mjs` | `download-qr-install-tip-2026-10` (§2) | D-108 | Home in the customer web build, iPhone Safari |

Mobile scripts need no server: the app renders through react-native-web. Example:

```bash
node tools/parity/shoot-orders-v2.mjs --out docs/parity/ORDERS-V2-2026-10-02
```

**Merchant is a phone (360×720).** Start the merchant Next dev server with its API stubbed in the
browser, then shoot a set:

```bash
API_BASE_URL=http://127.0.0.1:4312/__api node tools/parity/serve-web.mjs merchant
node tools/parity/shoot-merchant-v2.mjs --set shell --out docs/parity/MERCHANT-V2-SHELL-2026-10-04
```

Sets in `shoot-merchant-v2.mjs`: `shell` (default), `board`, `ticket`, `book`, `money`, `sheets`,
`boardx`, `k5x`, `tabsa`, `moneyx`, `arrival`. `PARITY_NARROW=1` shoots the 320×640 check instead.

Not every committed sheet has a script: `EMPTY-STATES-V2-2026-10-06.png` and
`FIRST-RUN-V2-2026-10-06.png` were made without one in `tools/parity/`.

### Where sheets go

`--out docs/parity/<HANDOFF>-<YYYY-MM-DD>` writes `docs/parity/<HANDOFF>-<YYYY-MM-DD>.png` (and
`.html`) and puts the single shots in a `<HANDOFF>-<YYYY-MM-DD>-shots/` folder beside it. Commit the
`.png` sheet and cite it from the ledger entry and the tracker row. Add a suffix for a part or round
(`ORDER-FLOW-V2-CUSTOMER-2026-10-02-ROUND2.png`, `MERCHANT-V2-FOLLOWUPS-TAP-2026-10-05.png`).

### Retired scripts

`shoot-merchant-current.mjs` and `shoot-merchant-l1.mjs` … `l5.mjs` shoot the old merchant tablet at
1024×680 against the `RM` mocks. D-48 and D-77 replaced that design, so don't use them for new
alignment work.

## Gallery sheets — `pair.mjs`

For a screen whose authority is still the gallery (or the admin kit):

```bash
cd tools/parity && npm i            # one-time: esbuild + react-native-web
node render-mock.mjs   --src RC --id home --out out/rc-home.png
node render-mobile.mjs --component app/force-update.tsx --fixture force_update --out out/app.png
node pair.mjs --keys LJ.force_update --title "Parity — force update" --out out/sheet
node pair.mjs --wired --out out/sheet-wired          # every screen with an app target
node serve-web.mjs admin                              # then: node pair.mjs --category admin --out out/sheet-admin
```

- **Mock side:** `lib/design-server.mjs` serves `packages/design/` on loopback and mounts one
  registry screen in a generated harness page (nothing is written into the design mirror). Pinned
  CDN libraries are downloaded once into the gitignored `.vendor/`. Map tiles are grey stubs.
- **Mobile app side:** `mobile/bundle.mjs` bundles the screen with esbuild and react-native-web,
  with native modules shimmed (`mobile/shims/`) and data from a fixture (`mobile/fixtures/`, recipe
  in its `README.md`).
- **Admin side:** Playwright on the Next dev server (`serve-web.mjs`, admin on :4311) at 1440×900.
- **Registry:** `screens.generated.json` (277 screens: customer 122, rider 100, merchant 48,
  admin 7) is generated by `node gen-manifest.mjs`; never hand-edit it. `app-targets.mjs` maps
  `${src}.${id}` keys to app screens. `parity-status.mjs` holds `PENDING` and `BACKEND_GATED` keys.
  The screen-inventory guardrail (`apps/api/src/parity/screen-inventory.spec.ts`) checks all three.

A wired screen that throws is a **failed** render, not a pass. `pair.mjs` prints `app FAILED` and
exits 1. A screen with no fixture shows an honest "pending" in its app column.

`old-vs-new.mjs` composes a before/after sheet of two app renders, for a change with no mock.

## The rendered-conformance lane — the same fixtures, but blocking

The sheets are evidence a human looks at. The rendered-conformance check turns the same fixtures into
a failing build when a wired gallery screen stops matching the mock's copy or structure.

```bash
node tools/parity/extract-expected.mjs            # browser: mock DOM → tools/parity/expected/<key>.json (commit these)
node tools/parity/extract-expected.mjs --check    # must reproduce byte-for-byte
pnpm --filter ./apps/mobile exec jest rendered-conformance   # no browser; the blocking CI check
```

- The app side (`apps/mobile/src/parity/__tests__/rendered-conformance.test.tsx`) mounts the real
  screen with the same fixture and diffs the same normalized tree (`lib/rendered-tree.mjs`).
- Escapes are per string, with a reason and a ref: `dynamic`, `extra`, `undrawn`.
- A wired, fixtured key that is neither asserted nor listed in
  `tools/parity/rendered-conformance.pending.json` fails the test. Every wired key needs a committed
  `expected/<key>.json`, even when its assertion is pending.
- A key that `--check` reports `≠` with no file on disk is an extractor that was never run, not drift.

| Check | Browser? | CI |
|---|---|---|
| `node render-wired-mobile.mjs --out out` | yes | `parity-render` job, non-blocking; uploads the PNGs as PR evidence |
| `extract-expected.mjs --check` | yes | last step of `parity-render`, non-blocking |
| `jest rendered-conformance` | no | mobile test job, **blocking** |

## Honesty rules

- **Not drawn ⇒ not rendered.** The mock side shows exactly what the design draws.
- **Stubbed map ≠ matched map.** Native maps render as a grey field (the react-native-maps web shim).
  Check the map on a device.
- **Pending is not pass.** A missing app render is a labelled placeholder, never a blank.
- Say on the sheet what is stubbed (no Places key, no camera shot, live loops caught mid-motion).

## Environment notes

- Playwright and Chromium are global in this container (`/opt/pw-browsers`); the loader prefers them.
- The mock render needs no network after the one-time `.vendor/` download.
