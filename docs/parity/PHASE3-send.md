# Phase 3 — Send-home template (map-behind-sheet) alignment

Pixel-parity alignment of the customer **Send composer** — the flagship map-anchored template —
against the design mock `window.LJ.home_empty` / `window.LJ.home_pins`.

- **Mock (source of truth):** `packages/design/explorations/journey/screens.jsx` → `Home({pins,expanded})`
  (approx L144–207), rendering `K.MapSheet` from `packages/design/ui_kits/mobile/kit-parts.js` (L129–150).
  Both `home_empty` and `home_pins` register with `expanded={false}` (screens.jsx L896–897) — i.e. the
  sheet rests at **PEEK**.
- **Side-by-side:** `tools/parity/out/send_v2.png`
  (`cd tools/parity && node pair.mjs --keys "LJ.home_empty,LJ.home_pins" --out out/send_v2` → `mock ok · app ok`).

## Mock rule → exact change

| # | Mock rule | File:line change that satisfies it |
|---|---|---|
| 1 | **Map-anchored** — one full-bleed map fills the screen BEHIND the sheet (kit `K.FauxMap fill` under `K.MapSheet`) | `apps/mobile/app/send.tsx` — `ComposeMap` now wrapped in `<View style={StyleSheet.absoluteFill}>` (L627–640); the compose `KeyboardAvoidingView` is `position:"absolute", bottom:0` over it (L~723) instead of a docked flex sibling |
| 2 | **58 / 88 snaps** — sheet snaps PEEK ≈ 58% / EXPANDED ≈ 88% of screen height, footer pinned | `apps/mobile/app/send.tsx` — `SHEET_PEEK=0.58` / `SHEET_EXPANDED=0.88` (L~57), passed to `<BottomSheet maxHeight={screenH} snapPoints={[SHEET_PEEK, SHEET_EXPANDED]} initialSnap={0}>` (L~726). New **height-snap mode** in `apps/mobile/src/ui/BottomSheet.tsx`: `maxHeight` prop (L~95) makes the fractions heights of the screen and drives the sheet's **height** (`Animated.subtract(H, translateY)`, L~213) so the top edge moves and the footer stays pinned — instead of the legacy translateY collapse that would drag the CTA off-screen. Existing consumers (no `maxHeight`) are byte-for-byte unchanged. |
| 3 | **Address rows in the sheet** — the pickup/drop-off rows + caption are the FIRST content inside the sheet, not a block floating above it | `apps/mobile/app/send.tsx` — `<AddressRows>` + `<AddressHint>` moved out of the map overlay into the top of the sheet `ScrollView` (L~800–807). The inline `AddressSearch` for the active slot travels with them (the app's realization of the mock's separate `addr_search` screen — see Divergences). |
| 4 | **Single top-bar action** — only the account avatar floats top-right; no second (notifications) button | `apps/mobile/src/ui/MapHome.tsx` — `MapHomeTopBar` drops the `inbox`/Notifications `RoundButton` and its `onNotifications` prop (L14–37); `apps/mobile/app/send.tsx` call site updated to `<MapHomeTopBar onAccount={…}/>` (L~650). Notifications stay reachable from the Account tab (`apps/mobile/app/(tabs)/account.tsx:82`). New coverage: `apps/mobile/app/__tests__/send.test.tsx` "map-anchored top bar (pixel parity: single action)". |
| 5 | **No invented heading** — no "Delivery details" collapsible; the compose fields follow the address rows directly | `apps/mobile/app/send.tsx` — the `Delivery details` `Pressable` header + the `composeCollapsed`/`toggleCompose` state/handler are removed (state block L~208; header + `{composeCollapsed ? null : …}` wrapper L~800). The sheet body `ScrollView` now opens straight into the address block then fields. The mock's own bottom collapse ("Add landmarks & declared value") is kept via `SendLandmarksDetails`. |
| 6 | **Inline add-item** — "Add another item" is a small text link with a package icon, not a full-width outlined button | `apps/mobile/src/ui/send/SendItemsList.tsx` — the `<Button variant="ghost">` is replaced by an inline `<Pressable>` = `package` icon + 13px/600 accent-text label, `alignSelf:"flex-start"`, 44px hit area (L~79–98). `Button` import dropped. |
| 7 | **Use-my-location pill** — a nav-icon pill top-right (kit screens.jsx:166), below the avatar | `apps/mobile/src/ui/ComposeMap.tsx` — the pill moves from `bottom` to `top: topOffset` (L~200), where `topOffset` (new prop, default `space.md`) is passed as `insets.top + space.sm + 48` from `send.tsx` so it clears the brand/avatar row. Anchoring it to the top (not bottom-right) is also what keeps it visible now that the sheet covers the map's lower half. The dark "Tap the map to drop your pickup pin" hint pill likewise moves to a centred, auto-width pill in the top band with the mock's verbatim copy (L~240). |

## Values / tokens

All new geometry uses `@lynia/shared` tokens (`space`, `radius`, `touchTargetMin`, `color`, `font`,
`shadow`); the two snap fractions (0.58 / 0.88) are the mock's `K.MapSheet maxHeight` percentages,
and the sheet's reference height is the live `useWindowDimensions().height`.

## Preserved behaviour (layout-only restructure)

No logic/state/effect in `send.tsx` was changed: draft save/restore + debounce flush (LC-C06),
disclaimer accept-to-continue gate, rebroadcast (`rb…`) params, active-order restore gating,
idempotency nonce/key, out-of-area state, saved recipients/pickup-phone, on-hold wall, and the
bottom landmarks/declared-value collapse all remain. `pnpm --filter @lynia/mobile typecheck` and the
full mobile test suite (`905 → 907` tests) pass.

## Known divergences (honest, not faked)

- **Gray map tiles** in the side-by-side are the parity harness's stubbed `react-native-maps` — a
  full-bleed `ComposeMap` that is gray in the harness and real on device (per `CLAUDE.md` honest-stub
  rule). Because the shim never fires `onMapReady`, the dark "tap the map" hint pill (gated on
  `mapReady`) also does not appear in the harness; it renders on a real map. Not faked.
- **Inline `AddressSearch` box** appears in the sheet's address block. The mock reaches search via a
  separate `addr_search` screen; the app compresses that into an always-mounted inline field (keyed
  build = a real search field; unkeyed parity build = the honest "search is unavailable — tap the map"
  explainer). It is a functional element, not a cosmetic extra, so it is kept and grouped with the
  rows rather than removed. Candidate for `docs/DESIGN-DEVIATIONS.md` if the user wants the sheet to
  match the mock's search-as-separate-screen exactly.
- **`home_pins`**: the "Draft restored" chip shows and Broadcast renders **disabled** — both are
  fixture artifacts (pins are seeded via `rb…` params, and the fixture sets no phones), documented in
  `tools/parity/mobile/fixtures/send_pins.mjs`. The mock draws the enabled/clean state.
