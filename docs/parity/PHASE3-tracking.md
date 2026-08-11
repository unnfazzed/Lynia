# Phase 3 — Customer parcel tracking cluster alignment

Pixel-parity alignment of the customer **parcel tracking** screen — its two in-scope states — against
the design mocks `window.LJ.track_code` (code-issued / hand-off, `assigned`) and `window.LJ.track_active`
(live delivery in progress, `en_route_dropoff`).

- **Mock (source of truth):** `packages/design/explorations/journey/screens.jsx` → `Tracking({variant})`
  — `variant="code"` (L283–299) and `variant="active"` (L301–321). Shared kit primitives: `OrderHead`
  (L31–39), `CallRow` (L47–60), `GMapsRow` (L95–108).
- **App screen:** `apps/mobile/app/order/[id].tsx` (one screen, all order states) + its extracted live
  card `apps/mobile/src/ui/order/LiveTrackingCard.tsx` (shared with food via `jobType`).
- **Side-by-side:** `tools/parity/out/phase3_tracking.png`
  (`cd tools/parity && node pair.mjs --keys "LJ.track_active,LJ.track_code" --out out/phase3_tracking`
  → both keys `mock ok · app ok`).

## Mock rule → exact change

| # | Mock rule | File:line change that satisfies it |
|---|---|---|
| 1 | **Re-issue lives inside the code card** — the `track_code` accent card is caption → 28px digits → a ghost **"Re-issue delivery code"** button, all one unit (screens.jsx:287–291). It is NOT a separate button lower down the screen. | `apps/mobile/app/order/[id].tsx` — the ghost `Button label="Re-issue delivery code"` (wired to `rotateM.mutate()` / `pendingOrQueued(rotateM)`) added to the **code-present** branch of the accent code card, directly under the digits. The duplicate re-issue button was **removed** from `LiveTrackingCard` (the mock's tracking card carries none). |
| 2 | **Fare + rider on one muted line** — `track_active`/`track_code` lead the tracking card with a single muted line "Agreed fare $2.50 · Tendai M." (screens.jsx:307), not a face card + a separate fare row. | `LiveTrackingCard.tsx` — the fare `Text` now appends `· {riderName}` for parcel when the cached `RiderIdentity` is present. `RiderMini` (the face/rating card) is **parcel-suppressed** — identity rides the fare line + CallRow, per the mock (food, which passes `riderIdentity={null}`, is unchanged). |
| 3 | **CallRow above the map** — a compact surface row (label / name / phone) with a 44px round **green** call button, placed directly after the fare line and BEFORE the map (screens.jsx:47–60, used at 294 & 308). | `LiveTrackingCard.tsx` — a new parcel `Pressable` CallRow (`backgroundColor: surface`, `borderRadius: radius.input`, label 11/600 muted · name 14/600 ink · phone 13 muted-tabular, trailing 44×44 `radius:22` `color.accent` circle with a white `phone` glyph) inserted between the fare line and `LiveMap`. It replaces the old bottom-of-card phone treatment for parcel (text "Rider phone: …" + privacy note + a bare call link), which now renders **for food only**. |
| 4 | **No ETA headline, no prose hint on the moving state** — the parcel tracking mock draws neither an "arriving in ~N min" headline nor a "Rider is on the move" line. | `LiveTrackingCard.tsx` — the ETA-headline block and the on-the-move / waiting hint are **food-gated** (`isFood`). For parcel the hint renders ONLY when the rider's GPS has gone stale (`riderStale && !isRiderViewer`) — the safety "location looks paused — call them" cue, the app's inline realization of the separate `track_paused` mock. |
| 5 | **Order: fare → CallRow → map → GMapsRow → Stepper** (screens.jsx:306–313) | `LiveTrackingCard.tsx` — element order for parcel is now fare·name line → CallRow → `LiveMap` → (stale hint only) → `GMapsRow` → 12px spacer → `Stepper`. `OrderHead` (Heading + StatusPill row) and `GMapsRow` already matched and are unchanged. |

## Values / tokens

All new geometry uses `@lynia/shared` tokens: `color.surface` / `color.accent` / `color.onAccent` /
`color.muted` / `color.ink`, `radius.input`, `space.sm` / `space.md`, `touchTargetMin` (44). The two
literal mock px kept off-scale are the CallRow's `paddingHorizontal: 10` and the 44/22 call-button
circle — the mock's exact `CallRow` geometry, matching the existing `GMapsRow`'s hand-tuned 30px circle.

## Preserved behaviour (layout-only restructure)

No logic/state/effect changed. Preserved intact: the live order socket + `connectionState`, the
telemetry-sliced `LiveTrackingCard` re-render isolation (the render-isolation proof still passes), the
delivery-code reveal/rotation reconcile (SecureStore high-water + `codeRotatedAt`), the stale-GPS
detection (still mutes the map pin), `liveEta`, the select/rotate/rate/cancel/notify mutations, the
rider-bail rebroadcast, and every terminal-state branch. The `rotateM` mutation is now driven from the
code card instead of the tracking card; `onReissueCode`/`reissuing` remain accepted props (now unread).
`pnpm --filter @lynia/mobile typecheck` clean and the full suite passes (**907** tests). Food tracking
(`FoodOrderLiveTrackerView`, `jobType="food"`) renders byte-for-byte as before — every parcel change is
behind `!isFood`.

## Known divergences (honest, not faked)

- **Inert SecureStore ⇒ re-issue prompt, not digits.** The plaintext hand-off code lives in
  customer-local SecureStore, written on the select response — inert in the parity harness. So both
  states render the real shipped "your hand-off code isn't showing — re-issue" card rather than the
  mock's `418 207` digits. On device with a live code, the code-present branch (now carrying the
  in-card re-issue button, rule #1) matches the mock. Not faked.
- **Gray map.** `LiveMap` is the react-native-maps web shim (gray fill + Expand/Recenter chrome) in the
  harness, real on device — the standard honest-stub. The mock's `track_code` (assigned) draws **no**
  map at all; the app shows the live map across the whole active window (assigned→en_route_dropoff),
  because the rider's position is worth seeing from assignment. **Candidate deviation** if the user wants
  the map hidden until the rider is en route.
- **No cached rider name in the harness.** With SecureStore inert, `RiderIdentity` is null, so the fare
  line shows "Agreed fare $4.50" (no "· name") and the CallRow shows label + number without the name.
  On device the cached identity fills both, matching the mock's "· Tendai M." / "Tendai M." Not faked.
- **Code card persists through `en_route_dropoff`.** The mock's `track_active` omits the code card
  (it draws only the tracking card). The app keeps the code card for the whole active window — correct,
  since `en_route_dropoff` is exactly when the recipient enters the code at hand-off. The mock simplified
  it away on that one screen. **Candidate deviation** only if the user wants it hidden post-pickup (not
  advised).
- **Removed for parity: RiderMini face card, ETA headline, on-the-move/waiting hint, phone privacy
  note** (all parcel-side; food keeps them). These are live features the mock never draws on the parcel
  tracking card. Removed per "not drawn ⇒ not rendered"; the underlying logic (identity cache, `liveEta`,
  stale detection) is retained. **Candidate deviations** — restore via a `docs/DESIGN-DEVIATIONS.md`
  ledger entry at the merge-gate review if the user wants any back.
- **Safety controls not in the mock.** `order/[id].tsx` also renders `SosControl`, `GetHelpControl` and
  a "Back home" button on the live states — cross-cutting safety/navigation controls the journey-map
  mock simplified away. Kept (removing SOS would be a safety regression). **Candidate deviations** for
  the ledger, not silently removed.
