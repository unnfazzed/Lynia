# Phase 5 — Rider OFFER/JOB cluster alignment (RJM · RR · RJ)

Pixel-parity (structure-first) alignment of the rider make-an-offer and active-job screens against
their current gallery mocks. The current rider design is **RJM** (one app: Jobs · Money · Account),
with the restaurants **RR** flow and the parcel **RJ** active-job screens as the other two current
surfaces. The gallery/mock wins over any code comment; the retired nine `RJ` originals are never
aligned to.

- **Side-by-side:** `tools/parity/out/phase5_riderjobs.png`
  (`cd tools/parity && node pair.mjs --keys "RJM.offer_food,RR.offer_cash,RJM.active_food,RR.nav_rest,RJ.job_assigned" --out out/phase5_riderjobs`
  → all five print `mock ok · app ok`).
- **Result:** `pnpm --filter @lynia/mobile typecheck` clean, `lint` clean, `test` **907/907** pass.

Layout/structure only. No offer-expiry countdown math, dispatch accept/decline mutations, job-step
`advanceStatus`/`confirmDelivery` mutations, cash-handshake/debt-ledger state, socket/GPS wiring, or
navigation handlers were changed — only how the offer chrome is laid out. Per the harness's honest
stubs, the maps are gray tiles, the offer window ticks off the fixture's `expiresAt`, and the food
job's OWED figure renders **0.00** at the pre-pickup `confirmed` state — none of these are faked.

**Scope note — one screen, two mocks; like-for-like state.** `RJM.offer_food` and `RR.offer_cash`
both map to `app/rider/food-offer.tsx`. `RJM.active_food` and `RR.nav_rest` both map to
`app/rider/food-job.tsx` but are DIFFERENT lifecycle beats, so they are driven by **separate
fixtures** at the state each mock draws — `rider_food_job` (the `picked_up` carry state) and the new
`rider_food_nav` (the `en_route_pickup` map leg) — rather than sharing one screenshot. Each app column
is compared at its mock's own state; the only remaining cross-mock case is `food-offer.tsx`, whose one
screenshot pairs with both offer mocks (documented under `RJM.offer_food`).

---

## RR.offer_cash → `app/rider/food-offer.tsx` (the aligned target)

Fixture `rider_food_offer`: a live `collect_and_return` CASH dispatch offer (`restaurantsEnabled` on,
`expiresAt` ~55s out), which drives `foodOfferVariant` → `cash_collect`.

| # | Mock rule (`r-rider.jsx` `RR.offer_cash`, lines 36-66) | File change that satisfies it |
|---|---|---|
| 1 | **`OfferHead`** — a **cta-fill banner** with a `timer` icon, **"NEW ORDER"** (800, tracked), a right-aligned **`{secs}s`**, and a full-width **`TimerBar`** below | Replaced the `utensils` + `Heading "New food pickup"` row **and** the centred `CountdownRing`-inside-the-card with a `tokens.color.cta` banner: `timer` icon + "NEW ORDER" + `{secs}s` (from the existing `remaining`), then a linear bar whose fill width is `remaining / RESTAURANTS_DISPATCH.offerWindowMs`. Screen owns the 16px gutter, so it reads as a banner block, not the kit's full-bleed band. |
| 2 | **`PayTag CASH`** (left) beside a right-aligned **"YOU EARN" + Money** | Added an inline `PayTag` (`CASH` = highlight wash, `WALLET` = accent wash) and hoisted the `YOU EARN` + delivery-fee amount out of the three variant branches into one shared row. `Money` size dropped 26 → **22** to match the mock. |
| 3 | **"COLLECT AT THE DOOR"** card in the **highlight wash**: eyebrow, the collect total at **32/700**, then the return-the-cash consequence line | Unchanged copy/structure — was already present. Un-nested from the old wrapping `Card` so it is now a top-level card (the mock draws it as its own card), dropping the `marginTop`. |
| 4 | **Leg card** — two marked rows: **COLLECT FROM** (filled dot) → hairline → **DELIVER TO** (square), each with a landmark and meta | Added an inline `Leg` component + a `Card` with pickup/drop legs off `offer.pickup.landmark` / `offer.dropoff.landmark`, hairline-divided. Replaced the old bare "{pickup} → {dropoff} · {km}" text line. Pickup meta is omitted (no honest "ready in 12 min" field); drop meta is `{distanceKm} km from the restaurant`. |
| 5 | Map, then a **`refresh-cw` note**: "After the drop: return leg to the kitchen · … · no new offers until they confirm the cash" | Kept the `LiveMap` (now a top-level sibling, not inside the wrapper card) and added the muted return-leg note row under it, shown only for `cash_collect`. |
| — | Fixed-bottom **"Accept · collect at the door"** / **"Pass"** ghost | Already matched (the accept label already repeats the money commitment per variant). `Screen` has no footer slot, so the buttons stay in-flow after the content — the app's standing realization of the kit's fixed bar. |

Preserved: the `getFoodDispatchOffer` 3s poll, `acceptFoodDispatch`/`declineFoodDispatch` mutations,
`foodOfferVariant` and its `cash_collect` / `cash_upfront` / `wallet` / default branches (all copy
verbatim), the offline/flag-off/expired `EmptyState` branches, `pendingOrQueued` button states, and
`ErrorText`.

**Honest deviations (not faked):**
- **Gray map tile.** The parity harness's `LiveMap` is an inert stub — not faked.
- **No "~9 min" return-leg ETA.** The kit prints one; there is no honest computed value, so it is
  omitted rather than invented. Candidate for `docs/DESIGN-DEVIATIONS.md`.
- **Pickup leg has no secondary meta** ("Fife Ave · 1.4 km away · ready in 12 min" in the kit). No
  such per-leg distance/prep field exists on the offer payload; the leg renders its landmark only.

## RJM.offer_food → `app/rider/food-offer.tsx` (the sibling mock)

Fixture: same as above. `RJM.offer_food` (`rider-one-app.jsx` J4) is the **one-app, no-countdown**
food-offer surface — an `AppBar "Food job"`, a fixed-fare explainer, a "MONEY AT THE DOOR" box, and
"Accept this job" / "Not this one".

**Honest deviation (not faked):** the harness fixture is a live cash **dispatch** offer with a real
60s window (`restaurantsEnabled` on), which is exactly the `RR.offer_cash` scenario — so the app
honestly renders the countdown-bearing offer, not the RJM no-countdown still. The two are the two
branches of the food-dispatch flag; the app matches the branch the fixture exercises. Candidate for
`docs/DESIGN-DEVIATIONS.md`.

---

## RJM.active_food → `app/rider/food-job.tsx`

Fixture `rider_food_job` — **re-driven to the CARRY state**: a merchant order at status **`picked_up`**
(food collected, on the bike) with the collect-and-return goods **debt open** ($13.00 owed to the
kitchen). This is the stepper-card carry layout the mock draws — the app routes the en-route legs
map-first through `FoodNavLeg` (the current `RR.nav_cust`/`RR.nav_rest` design), so `picked_up` is the
reachable working-card carry beat, not `en_route_dropoff`.

At this state the app renders the mock's anatomy like-for-like: the header, the **`CashHeldStrip`**
with a **non-zero OWED-TO-A-KITCHEN ($13.00)**, a job card + **food-flavoured `Stepper`** mid-flow
(via `JobDetailsCard`'s `jobType="food"`), the order line-items, and the advance CTA.

| # | Mock rule (`rider-one-app.jsx` `RJM.active_food`, J7) | State/edit that satisfies it |
|---|---|---|
| 1 | `CashStrip` with **YOURS + a populated OWED TO A KITCHEN** | Fixture debt now open (`debtStatus:"open"`, `debtAmount:13.0`) → `CashHeldStrip` shows YOURS $2.50 / OWED $13.00. |
| 2 | Card + **food `Stepper` mid-flow** | Fixture events now run assigned→confirmed→en_route_pickup→picked_up → the food stepper shows the carry progress. |
| 3 | An **accent "Collect $X at the door"** card: "Food first, then the cash, then the code. The kitchen's money rides back with you." | **Added** (`food-job.tsx`) a minimal `Card accent` — copy verbatim — gated on `cashOrder && merchantCashRule==="collect_and_return" && debtStatus==="open"` so it rides only with the actual carry. Presentational only; no logic touched. |

**Honest deviations (not faked):**
- **CTA reads "Navigate to the customer", not the mock's "Enter the delivery code".** The app's code
  entry lives at the door, reached through the map-first `en_route_dropoff` leg (`FoodNavLeg` +
  doorstep handshake → `DeliveryOtp`) — the current `RR.nav_cust` design — not a persistent CTA on the
  carry card. Driving to a state that shows the code entry would need `en_route_dropoff` + local
  "arrived" UI state, which renders the map leg, not this card layout. Architectural, gallery-backed
  (RR.nav_cust is current), not a structural miss.
- **OWED is $13.00 (the goods debt), not the mock's $15.50.** The rider owes the kitchen the goods
  total; the $2.50 fee is theirs. The honest debt figure is used, not the mock's full-collect number.
- **Header reads "Your job" + a "Parcel collected" status pill (not "Active job" / a food label).**
  Kept consistent with the parcel screen and this file's delivered/undelivered/cancelled terminals
  (all "Your job"); the pill is the shared generic `orderStatusTone` label for `picked_up`. Candidate
  for `docs/DESIGN-DEVIATIONS.md`.

## RR.nav_rest → `app/rider/food-job.tsx`

Fixture **`rider_food_nav` (new, distinct from `rider_food_job`)**: a merchant CASH order at status
**`en_route_pickup`**, which drives food-job.tsx's **`FoodNavLeg` (leg="restaurant")** — the full-bleed
`LiveMap` with a bottom sheet carrying the restaurant name, the **CASH `PayTag`**, the call control and
the **"Open in Maps" / "I've arrived at the restaurant"** actions. This is now the map-dominant
navigate-to-restaurant state the mock draws, no longer sharing the carry-state screenshot. No app-code
edits — `FoodNavLeg` was already built and aligned.

**Honest deviations (not faked):**
- **Sheet sub-copy differs** — app "Cash order — the counter settles before the food travels" vs the
  mock's "Food ready in 12 min · nothing to pay here"; and the title carries no "· 4 min" ETA (no
  honest routing-ETA field). `FoodNavLeg`'s own copy, left unchanged. Candidate for
  `docs/DESIGN-DEVIATIONS.md`.
- **An SOS pill overlays the map** — a live-job safety control the mock's still doesn't draw; kept
  (a live map is exactly where SOS belongs). The gray map + Recenter/Expand controls are harness stub
  chrome.

---

## RJ.job_assigned → `app/rider/job.tsx`

Fixture `rider_parcel_job` — **now seeds the revealed phones**: a parcel `OrderSnapshot` at status
**`assigned`** with `counterpartyPhone` + `pickup.contactPhone` (sender) + `dropoff.contactPhone`
(recipient) populated, since contacts ARE revealed to the assigned rider inside the reveal window
(`PHONE_REVEAL_STATUSES`).

The app renders the mock's anatomy (`rider-screens.jsx` `Job status="assigned"`): the **"Your job" +
`assigned` `StatusPill`** header, **"Agreed fare"**, the now-revealed **contacts** (Call customer /
Call pickup contact / Call drop-off contact), the **items** block, the rider-view **`Stepper`**, and a
primary CTA whose label is literally **"Confirm the job"** (from `NEXT.assigned`). No app-code edits.

**Honest deviations (not faked):**
- **Contact rows render as `JobDetailsCard`'s text "Call …" links, not the mock's boxed CallRows**
  (surface-filled row with label + name + phone and a 44px round green call button). The contacts now
  render (the phones are seeded), but `JobDetailsCard` is the verbatim-extracted card shared across all
  parcel/food active states — restyling its contact rows into the mock's boxed CallRow shape is a
  broader shared-component change, out of scope for this fixture-focused pass. Candidate for
  `docs/DESIGN-DEVIATIONS.md`.
- **`CashHeldStrip` (YOURS/OWED) above the card.** The retired-era RJ mock predates it, but the
  current RJM design draws the cash-held split on active jobs (`RJM.active_parcel`); it is the
  sanctioned newer-design element, not an invented extra. Candidate for `docs/DESIGN-DEVIATIONS.md`.
- **`LiveMap` inside `JobDetailsCard`.** `job_assigned` is the kit's pre-map "review & confirm" still;
  the app's shared job card always carries the route map. Left unforked (the map is the shared card's
  core and the RJM active surfaces do show a map/navigate affordance).
