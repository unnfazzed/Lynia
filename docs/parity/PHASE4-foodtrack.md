# Phase 4 — Customer food ORDER TRACKER cluster alignment

Pixel-parity (structure-first) alignment of the customer **food order tracker** — three states of the
one screen `apps/mobile/app/food/order/[orderId].tsx` — against the `window.RC` (registered as `RCB`)
mocks in `packages/design/explorations/restaurants/r-customer-b.jsx` (helper primitives — `AppBar`,
`RiderCard`, `RTracker`, `SafetyRow`, `CodeCard` — in `r-parts.jsx`). The gallery/mock wins over any
code comment.

- **Side-by-side:** `tools/parity/out/phase4_foodtrack.png`
  (`cd tools/parity && node pair.mjs --keys "RC.track_way,RC.pay_now,RC.delivered_rate" --out out/phase4_foodtrack`
  → all three print `mock ok · app ok`).
- **Result:** `pnpm --filter @lynia/mobile typecheck` clean; `pnpm --filter @lynia/mobile test`
  **907/907** pass.

Layout/structure only — no live-socket status, pay-now flow, reference submission, delivery-code
rotation/handshake, cash confirm, rating submission (tap-to-arm + durable-pending + undo), or cancel
logic was changed. The one order-screen test that touches these states asserts on copy substrings
(`Delivered`, `merchant number`, the merchant phone) that all survive the restructure, so no test
asserted the old geometry and none needed rewriting; the full suite was re-run to confirm.

Since the harness maps are **inert gray stubs** and the customer food-order API carries **no rider
identity** (name / plate / vehicle / photo), the genuine structural deviations below are flagged as
candidates for `docs/DESIGN-DEVIATIONS.md` rather than faked.

---

## RC.pay_now → `FoodOrderAwaitingPaymentView` (R5·3 pay branch)

Fixture `food_pay_now`: WALLET, `merchantPhase: awaiting_payment`, request logged, no reference yet →
the manual-rail pay screen.

| # | Mock rule (`RCB.pay_now`, r-customer-b.jsx:82-113) | File:line change that satisfies it |
|---|---|---|
| 1 | Header is **`AppBar title="Pay Sadza Republic" sub="Order LG-4471"`** — 16/700 title, 11.5 muted order-ref sub, rotated-chevron back (r-parts.jsx:74) | Replaced the `OrderHeader` (restaurant name + "Payment requested" status pill) with `<AppBar title={\`Pay ${restaurantName}\`} sub={\`Order ${order.id.slice(0,8).toUpperCase()}\`} onBack={onBack} />`. A new `onBack` prop is wired from `[orderId].tsx` to `router.back()` so the drawn chevron is live. |
| 2 | Amount card is **accent-bordered**, accent-text `PAY EXACTLY` eyebrow, the total as a **30px/800** hero | Already an accent `Card` with an accent-text eyebrow; bumped `Money` `weight` 700→**800** to match the mock's hero weight. |
| 3 | Under the total: **"Food $13.00 + delivery $2.50"** (12/muted) — the goods+delivery split | Added the split line from the real fields: `Food {formatMoney(merchantGoodsTotal)} + delivery {formatMoney(deliveryFee)}` (rendered only when both are non-null). Extended the view's `Pick` with `deliveryFee`. |
| 4 | Reassurance names the **phone-confirm time**: "No deadline — you confirmed by phone at **09:46**, and the kitchen starts the moment the money lands." | Copy now interpolates the logged call time: `…you confirmed by phone at ${fmtClock(paymentCallLoggedAt)}, and the kitchen starts…` (falls back to the old un-timed sentence when `paymentCallLoggedAt` is null). Extended the `Pick` with `paymentCallLoggedAt`. |
| 5 | "No prompt? Pay manually" — merchant number / exact amount / reference, each Copy-able | Already the `ManualPayRail` (merchant number, exact amount, reference) — unchanged. |
| 6 | Transaction-reference field + submit | Already present (`Field` + "Submit my reference") — unchanged. |

Preserved: the `awaiting_payment` sub-branch fan-out (R5·1b calling-first, R5·6 paid-waiting, R5·b1
still-unpaid free-cancel reminder — all keep their own `OrderHeader`), the `isTestBuild()`-gated
QA-only rail simulation, the journey `Stepper`, `OfflineBanner`, and `cancelFooter`.

**Honest deviations (not faked):**
- **No "PAY WITH" rail selector, no "Send payment prompt" CTA.** The mock draws a selectable
  EcoCash/InnBucks/O'mari rail list (`RAILS.map(RailRow)`) and a footer that *sends a rail prompt*.
  **No prompt-send endpoint and no decline callback exist in this codebase** (documented at length in
  the view, lines 60-73) — the only shipped payment path is the manual reference below. Rendering a
  rail selector + prompt button would be a control that does nothing. Strong candidate for
  `docs/DESIGN-DEVIATIONS.md`.
- **Info blurb + `OfflineBanner`.** The mock's "money goes straight to the restaurant's merchant
  number…" surface blurb is folded into the existing manual-rail context; the app keeps its
  `OfflineBanner` (a null-when-online interrupt, not a drawn element — `RC.checkout_offline` is the
  separate offline mock).

---

## RC.delivered_rate → `FoodOrderDeliveredView` (delivered branch)

Fixture `food_delivered_rate`: CASH, `status: delivered` (not `completed`) with a `delivered` event →
the confirmation hero + `RatingCard`.

| # | Mock rule (`RCB.delivered_rate`, r-customer-b.jsx:504-525) | File:line change that satisfies it |
|---|---|---|
| 1 | **No top bar / status pill.** The screen leads with a **centered** confirmation hero | Removed the `OrderHeader` (restaurant name + "Delivered" pill) entirely — not drawn in the mock. |
| 2 | Hero: a **56×56 accent-wash circle** with a **26px** `circle-check` (accent-text), centered, 12px below it | Replaced the left-aligned 44px row inside a `Card` with a centered `View`: 56×56 (radius 28) accent-wash circle, `circle-check` size **26** accent-text, `marginBottom: 12`, `alignItems: center`. |
| 3 | **"Delivered at 10:16"** — 18/700, centered | Title now **18/700** centered (was 16/700 left in a row): `Delivered at ${deliveredAt}` (falls back to "Delivered" when no `delivered` event is present). |
| 4 | **"$15.50 paid in cash · Sadza Republic"** — 13/muted, centered | Sub-line now **13/muted** centered (was 12.5), `marginTop: 4`. Copy already matched (`{money} paid in cash · {kitchen}`). |
| 5 | A rating `Card` follows | Kept the shared `RatingCard`; `completed` still drops it for the "Order from somewhere else" button. |

Preserved: the `RatingCard` tap-to-arm → 4s undo-window → commit interaction, the BH-06 durable
"rating pending" marker (`onArm`/`onUndo`), the `completed`-drops-the-card branch, `OfflineBanner`
and `ErrorText`.

**Honest deviations (not faked):**
- **One rating vs the mock's two questions + chip tags.** The mock asks *both* "How was the food?" and
  "How was Tendai M.?" (two 5-star rows) and offers four tag chips (Hot food / On time / Polite /
  Right order). `rateOrder(orderId, { score })` carries a **single** score and no tags, and
  `RatingCard` is shared verbatim with the Express parcel screen (`app/order/[id].tsx`) — splitting it
  into food+rider ratings or adding a tag taxonomy would be forked UI backed by no API. Kept the single
  shared rider rating. Candidate for `docs/DESIGN-DEVIATIONS.md`.
- **Tap-to-rate vs "Submit rating" footer.** The mock is a frozen still with a static "Submit rating"
  footer button. The app's `RatingCard` commits on a tap-to-arm + 4s undo window (BH-06 durable
  pending marker survives an app-kill) — a load-bearing live interaction the static mock can't draw.
  Kept the app's model; no footer button.

---

## RC.track_way → `FoodOrderLiveTrackerView` (rider-secured / en_route_dropoff branch)

Fixture `food_track_way`: WALLET, `status: en_route_dropoff`, `riderId` set → the shared live tracker.
This state is the **least** structurally alignable of the three, for reasons that are all genuine
capability/data limits, not code arguing against the design:

| Mock element (`RCB.track_way`, r-customer-b.jsx:275-291) | App reality |
|---|---|
| **Map fills the background**, a floating **bottom sheet** (drag handle, rounded top, shadow) sits over it | The app renders the trip inside the shared `LiveTrackingCard` (a `Card` in a scrolling column), the **same** pattern the Express parcel tracker uses (`app/order/[id].tsx`) — so this is a systemic tracker-shape deviation, not a food-specific miss. `LiveMap` is an **inert gray stub** in the harness (the explicit "do not fake maps" rule), and `LiveTrackingCard`'s GPS-telemetry isolation (`React.memo` + per-tick observer) is load-bearing shared logic. |
| **`RiderCard`**: rider avatar, **"Tendai M. · 6 min away"**, an **"AEE 4471" plate badge** + "red Honda", "Picked up 4 min ago · pay $15.50 cash at the door", a phone button | The customer food-order API (`MerchantOrderResponse` / `OrderSnapshot`) carries **no rider identity** for a food job — dispatch is fully automatic, so there is no client-side "choose an offer" moment to cache a name/plate/vehicle from (documented at `[orderId].tsx:534-538`; `LiveTrackingCard` is passed `riderIdentity={null}`). The card degrades honestly to the ETA headline + phone row rather than inventing "Tendai M." / "AEE 4471". |
| **`SafetyRow`**: a compact 3-cell row — Get help / Share trip / SOS | The app uses the shared `GetHelpControl` + `SosControl` safety components (their own logic) stacked, not the mock's tri-cell strip. |
| **DELIVERY CODE** block (surface bg, `DELIVERY CODE` eyebrow, masked `••• •••`, "Appears at the door, once you and Tendai both confirm the cash.") | Already closely matched by `DeliveryCodeCard` (surface bg, 11.5/700 muted eyebrow, masked dots in `line`, hint). The fixture is WALLET (already paid), so the app correctly shows the **plain** code — the mock's masked/cash copy is a payment-method difference driven by the fixture, honest not faked. |

**No code change** was made to the tracker for this state: every divergence bottoms out in the gray-map
honest-stub, the shared-tracker preserve-logic constraint, or the missing rider-identity data.
Retaining the top `OrderHeader` (restaurant name + status pill) is the honest substitute for the
context the mock puts in `RiderCard` — removing it would leave *less* than the mock intends. The
map-bg+sheet layout, the `RiderCard`, and the tri-cell `SafetyRow` are all candidates for
`docs/DESIGN-DEVIATIONS.md`.
