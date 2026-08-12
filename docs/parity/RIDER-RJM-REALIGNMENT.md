# Rider RJM realignment — plan + progress (residual task #48)

The rider app is being realigned from the **superseded `r-rider` kit** (`packages/design/explorations/restaurants/r-rider.jsx`, the pre-July own-board/wallet flow) to the **current RJM one-app design** (`packages/design/explorations/journey/rider-one-app.jsx` — Jobs · Money · Account, one tagged board, one queue, prepaid-commission gate). Authority: CLAUDE.md *Pixel parity* — align rider look/IA to **RJM**, never to the retired `RJ` rider screens or the `r-rider` kit; the interactive mobile kit (`ui_kits/mobile/app.js`) still runs the pre-July rider flow and is stale for RIDER.

Adoption is machine-verified by the 4th pixel-parity guardrail (mock→RN codegen + structural-snapshot, `tools/parity/codegen/`): a screen is ✅ when it is region/state-adopted in `adopted.mjs`, its generated `.view.tsx` stays structurally congruent to the mock, and (for region-adopted interactive containers) the container mounts the region fragments in the mock's order — all enforced in CI.

**This is SENSITIVE work** (accept-offer / agreed-price / order-assignment / top-up-gate / payout). The rule for every increment: restructure only the **presentational element tree** to the RJM mock and wire the existing live handlers/data into it **byte-identical**; never re-home or alter a money/assignment code path; add/keep a regression test per touched screen; keep all existing rider tests green.

---

## RJM screen inventory → app files, and adoption disposition

The RJM registry (`window.RJM` in `rider-one-app.jsx`) is: `board`, `board_empty`, `offline`, `offer_food`, `offer_parcel`, `active_parcel`, `active_food`, `handoff`, `money`, `gate_topup`, `account`, `notifications`.

| RJM screen | App file(s) | Disposition |
|---|---|---|
| `board` (job list) | `app/rider/(tabs)/index.tsx` `RiderHome` | ✅ **ADOPTED this pass** (region `list`) |
| `account` | `app/rider/(tabs)/account.tsx` + `account.view.tsx` | ✅ adopted (prior) |
| `notifications` | `app/notifications/index.tsx` (shared, `LJ.notifications`) | ✅ adopted (prior, shared surface) |
| `board_empty` | `index.tsx` `boardEmptyState` | ✅ **ADOPTED this pass** (region `empty`) |
| `offline` | `index.tsx` offline branch | ⛔ deferred — commission-balance card needs a wallet read the board lacks |
| `offer_food` | `app/rider/food-offer.tsx` | ⏳ later — **touches accept-offer** |
| `offer_parcel` | `index.tsx` compose card (`selectedCard`) + `SentOfferCard` | ⏳ later — **touches agreed-price (auction)** |
| `active_food` | `app/rider/food-job.tsx` | ⏳ later — **touches advance/confirm** |
| `active_parcel` | `app/rider/job.tsx` | ⏳ later — **touches advance/confirm/assignment** |
| `handoff` | `src/ui/rider/DeliveryOtp.tsx` (in food-job/job) | ⏳ later — **touches delivery-code** |
| `money` | `app/rider/(tabs)/money.tsx` | ⛔ deferred (live-vs-static multi-state + fabricated "≈30 more jobs" figure) — SENSITIVE wallet |
| `gate_topup` | realized in `money.tsx` + board gate branch | ⛔ deferred (live-vs-static: no standalone gate screen by design) |

`money` / `gate_topup` deferrals are recorded honestly in `adopted.mjs` (CLAUDE.md: honesty over volume; never fabricate a figure or ship a standalone screen the one-app design intentionally does not draw).

---

## Safest-first increment order (with risk + preserved-logic per screen)

### 1. `board` job-list — ✅ DONE this pass · RISK: display-only (no accept/assignment)
- **App:** `app/rider/(tabs)/index.tsx` (`RiderHome`), list rows.
- **Superseded-kit tree vs RJM tree:** the app already renders `src/ui/rider/JobCard` rows that mirror the RJM `JobCard` anatomy (TypeTag `PARCEL`/`FOOD` + km + `Money` fare · pickup→drop route line · note · one action Button). The mock's `board` is `S( div( AppBar "Jobs near you"·bell, OnlinePill, Pad( JOBS.map(j => <JobCard {...j}/>) ) ) )`. The **list** is the region adopted.
- **Structural diff resolved:** `JobCard` normalizes to an opaque leaf (`JOBCARD`), so the region reduces to `MAP(JOBCARD)` on both sides. Two guardrail-ENGINE gaps had to be closed for any S()-wrapped RJM screen to region-adopt (parity tooling only — **no app-logic change**, inert for the existing 32):
  1. `mockCompositionTree` now folds the RJM render-helper shell `S(<div>,opts)` → `SCREEN` (mirroring the normalized-tree path's `renderHelperUnwrap`), so the mock composition roots at `SCREEN(REGION:list)` like the app's `<AppScreen>` — otherwise the SCREEN-less mock body never matched the AppScreen-rooted container.
  2. the composition check now selects the container's **default-exported** component (`findContainerRenderer`) instead of the first renderer, so a helper component defined above the export (`ActiveJobCheckFailedBanner`, index.tsx:67) is not mistaken for the screen.
- **Live logic preserved (byte-identical):** a parcel row's action is `chooseOrder(o)` — the OFFER-COMPOSE seam (sets `selected`/`offerMode:"accept"`/`fare`/`eta`); it is passed through unchanged as the row's `onAction`. NO accept-offer / agreed-price / assignment mutation lives on the board list (accepting/bidding happens on the compose card + offer/active screens). The virtualized happy-path list (the `showOpenOrdersList` early-return `FlatList`, B-O1b) is **untouched**; the adopted `RiderBoardListView` mounts in the container's main/fallback branch (the one the composition guardrail reduces), where a plain `.map` is the faithful, non-nested realization (no nested-VirtualizedList inside the main ScrollView).
- **Adopted as:** `RJM.board` region `list` → `board-list.view.tsx` (`RiderBoardListView`), `JobCard` imported from its OWN module (`src/ui/rider/JobCard`), not the `src/ui` barrel (avoids the `no-circular` depcruise violation; `emit.mjs` `NON_BARREL`).
- **Regression test:** `app/rider/(tabs)/__tests__/board-list.view.test.tsx` — one card per job in order; empty list draws no cards; tapping a row fires THAT job's `onAction` exactly once (never a sibling's); a FOOD row carries its accept action verbatim.

### 2. `board_empty` — ✅ DONE this pass · RISK: display-only
- **App:** `index.tsx` — the empty state (rendered in both the FlatList `ListEmptyComponent` and the main-branch fallback).
- **Diff resolved:** RJM `board_empty` is `S( div( AppBar, OnlinePill, Pad( Card( EmptyState icon="inbox" "Nothing in range yet" … · ghost "Refresh" ) ) ) )`. The app's empty state was a **bare `EmptyState`** with no Card; the adopted `RiderBoardEmptyView` (region `empty`, locator `{el:"Card"}`) restores the mock's `Card(padding:16)` wrapper — the structural win. icon/title stay the mock's verbatim literals; the **message is a data-seam leaf** so the container keeps its flag-honest copy (parcels-only flag-off / parcels+food-offer flag-on) — the same live-vs-static leaf treatment `RJM.account` used for its identity line (the normalizer drops text, so the wired copy is invisible to the diff).
- **Live logic preserved (byte-identical):** the ghost Refresh forwards `openQ.refetch()` unchanged; `refreshing` reflects `openQ.isFetching`. No accept/assignment/online-toggle path is touched.
- **Adopted as:** `RJM.board_empty` region `empty` → `board-empty.view.tsx` (`RiderBoardEmptyView`). A SEPARATE entry (not a second region on `RJM.board`) because `board_empty` is its own mock component and the composition check keys every region to the screen-level `mockComponent`. The container mounts `<RiderBoardEmptyView/>` **inline** in the fallback ScrollView (the last return the composition walker reduces) so the empty region is visible; `RJM.board`'s own `SCREEN(REGION:list)` composition is unaffected (RiderBoardEmptyView is pruned there, and vice-versa).
- **Regression test:** `board-empty.view.test.tsx` (Card wrapper present · message renders · Refresh fires `onRefresh` once) + two container assertions in `index.test.tsx` (the empty-state Refresh re-fetches the open-orders board; the offline toggle still calls `setOnline(true)`).

### 3. `offline` — ⛔ DEFERRED this pass · RISK: needs a wallet read the board lacks
- **App:** `index.tsx` offline branch (`onlineToggleCard`).
- **Diff:** RJM `offline` is `S( div( AppBar "Jobs", Pad( Card( power-circle, "You're offline", one-queue copy, "Go online" ), Card( wallet tile · "Commission balance" · Money · "Top up" ) ) ) )` — **two** cards.
- **Why deferred (honest, recorded in `adopted.mjs` `RJM.offline`):** the go-online Card is safely restructurable, but the mock's **second card is a live commission-balance tile** (`$` + "Top up"). The board container reads **no** wallet/commission balance — `Me.rider` (auth.ts) has no balance field and the board mounts no `useWallet` query (only the Money tab does). Rendering the drawn card would need either a **new wallet read on this sensitive accept/assignment board** (beyond a display-only pass) or a fabricated figure / a dropped drawn card (both forbidden by CLAUDE.md). There is also a live-vs-static skew: `onlineToggleCard` is an **always-shown** toggle (online→"Go offline", offline→"Go online") mounted via a hoisted-const identifier, not an inline offline-only region.
- **Preserve when adopted:** `onlineM.mutate(true)`, the balance read, the Top-up nav — all byte-identical.
- **Adoptable once** the board legitimately carries the commission balance (a wallet read wired here, or surfaced on `Me.rider`) so the mock's second card wires to real data — or the offline mock is re-split.

### 4. `offer_food` — RISK: **HIGH — accept-offer**
- **App:** `app/rider/food-offer.tsx`.
- **Diff:** RJM `offer_food` is `S( div( AppBar "Food job"·sub, Pad( Card( TypeTag·Money, fixed-fare copy, "MONEY AT THE DOOR" tile ) ) ), { footer: Accept + ghost "Not this one" } )`. The app screen carries the same idea but aligned to the `r-rider` kit accept labels; restructure to the RJM Card + the `<Screen footer=>` accept/ghost pair.
- **Preserve (byte-identical):** `acceptM` (`acceptFoodDispatch(orderId)`), `declineM` (`declineFoodDispatch`), `offerQ` (`getFoodDispatchOffer`, 3 s poll), the carry-amount/`total` gating copy. This is the food-dispatch ACCEPT path — restructure the tree only; wire `acceptM`/`declineM` into the mock's footer buttons unchanged; add a test asserting Accept still calls `acceptFoodDispatch` with the same orderId and Decline still calls `declineFoodDispatch`.

### 5. `offer_parcel` — RISK: **HIGH — agreed-price (auction)**
- **App:** the compose card inside `index.tsx` (`selectedCard`, opened by `chooseOrder`) + `SentOfferCard`.
- **Diff:** RJM `offer_parcel` is `S( div( AppBar "Parcel job"·sub, Pad( Card( TypeTag · "Sender asking" · Money, Field "Your fare (USD)", Field "You'll be there in" ) ) ), { footer: "Send offer" + ghost "Skip this job" } )`. The app realizes this as an inline compose card on the board, not a routed screen — a **live-vs-static** case: restructure the compose card's element tree to the mock's Card+two-Fields+footer while keeping it in the board container.
- **Preserve (byte-identical):** the fare/ETA state (`fare`, `eta`, `offerMode`), the `makeOffer` mutation (bid submission), the one-offer-per-job rule, `SentOfferCard`. This is the AGREED-PRICE/auction seam — the fare Field feeds the bid; do not alter the mutation or ranking. Test: Send offer still calls `makeOffer` with the same `{orderId, fare, eta}`.

### 6. `active_food` — RISK: **HIGH — advance/confirm**
- **App:** `app/rider/food-job.tsx`.
- **Diff:** RJM `active_food` is `S( div( AppBar "Active job"·sub, CashStrip(yours·owed), Pad( Card( TypeTag·Navigate · Stepper FOOD_STEPS ), Card accent( "Collect $ at the door" ) ) ), { tab:"jobs", footer: "Enter the delivery code" } )`. Restructure to the CashStrip + Stepper + accent cash-card tree.
- **Preserve (byte-identical):** `advanceM` (`advanceStatus` assigned→confirmed→en_route_pickup, picked_up→en_route_dropoff), `confirmPickupM`, `dropM`, `confirmDelivery`, the pickup-code + delivery-code seams, `getActiveOrder`/`foodQ` polls. Restructure the tree only; wire the existing steppers/CTAs. Needs a `CashStrip` and `Stepper` congruence path (Stepper already folds via DS_RENAME; `CashStrip` is a candidate DS primitive to build tokens-only). Test: each CTA still calls the same `advanceStatus`/`confirmDelivery` with the same args.

### 7. `active_parcel` — RISK: **HIGH — advance/confirm/assignment**
- **App:** `app/rider/job.tsx`.
- **Diff:** RJM `active_parcel` is `S( div( AppBar, CashStrip(yours), Pad( Card( TypeTag·Navigate · Stepper PARCEL_STEPS ) ) ), { tab:"jobs", footer: "I've arrived at the drop-off" } )`.
- **Preserve (byte-identical):** `advanceM`, `deliverM` (`confirmDelivery` + code), `cancelM`, `senderRateM`, `undeliverM`, `confirmItems`, the delivery-code rotation seam (KB-DELIVERY-CODE-ROTATION-SIGNAL), `saveRiderJobTerminal`, the self-heal poll. This is the most entangled active screen — restructure the presentational Stepper/CashStrip tree only; every mutation stays put.

### 8. `handoff` — RISK: **HIGH — delivery-code**
- **App:** `src/ui/rider/DeliveryOtp.tsx` (mounted inside food-job/job).
- **Diff:** RJM `handoff` is `S( div( AppBar "Delivery code"·sub, Pad( Card( 6 code cells · "Same code…three wrong tries…locks" copy ) ) ), { footer: "Confirm delivery" } )`. Align the 6-cell code entry + copy to the mock.
- **Preserve (byte-identical):** the code-entry state, the 3-wrong-tries lock, `confirmDelivery(orderId, code)`, code rotation. Delivery-code is sensitive — restructure the cells' presentation only.

### Deferred (recorded in `adopted.mjs`, not forced)
- **`money`** — live-vs-static multi-state container (loading/error/pending-topup-recovery branches the static mock never draws) + a fabricated "≈ 30 more jobs" projection the app honestly omits + a `CashStrip` composite. SENSITIVE wallet; behaviour kept byte-identical. Adoptable once the static data-state earns a boundary and the projection is dropped-or-backed.
- **`gate_topup`** — the one-app design intentionally renders no standalone "Top up to keep riding" gate; the low-balance gate is realized in the Money hero + the board's `commission_low_balance` EmptyState. Adoptable only if the product reintroduces a standalone gate screen.

---

## Guardrail state after this pass
- `node tools/parity/codegen/cli.mjs check` → **36/36** structurally congruent (was 34/34): `RJM.board_empty` adds `region empty` (`CARD(EMPTYSTATE(BUTTON))`) + `∴ composition` (`SCREEN(REGION:empty)`). The prior 34 (incl. `RJM.board`'s `SCREEN(REGION:list)`) stay congruent — unchanged. `RJM.offline` is recorded as a DEFERRED entry (wallet-read gap; see §3).
- No `packages/design/**` edits. No `docs/DESIGN-DEVIATIONS.md` entry needed (nothing diverges from the mock — the empty-board message is a container-owned leaf, structurally invisible).
