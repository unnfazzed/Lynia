# J2 Send a parcel: automated E2E report (report-only)

**Verdict: 22 of 24 steps passed. No launch blockers.** The parcel auction, selection, lifecycle, delivery code, rating, 90-second expiry, raise price, both cancel paths and the service-area gate all work. The 2 failures are in the admin order detail (wrong fare label after a raise, and "Completed" shown as "now").

Run: 2026-10-05, ~09:23–09:28 UTC. Code: `origin/main` @ `124395c`. Local stack only (PostGIS + Redis in Docker, API on `localhost:3000`, `KYC_PROVIDER=stub`, `OTP_CHANNEL=console`, `PUSH_PROVIDER=noop`, `OTP_RL_DEVICE_SIGNUP_MAX=50`). Nothing in production or at any vendor was called.

Seed: customer `+263771000001`, riders `+263771000002` (R1) and `+263771000003` (R2), both stub-verified and online at -17.83, 31.05, admin `+263771000004` (promoted in the local DB only). Route: Eastgate Mall (-17.83, 31.05) → Avondale shops (-17.80, 31.03), 3.95 km, suggested fare $3.87.

| Step · Expected (from code) | Actual | Result |
|---|---|---|
| 1 · Create parcel → 201 `open_for_offers`, suggested fare, `expiresAt` = created + 90 s | 201, suggested 3.87, proposed 3, `ridersNearby: 2`, expiresAt = +90 s | PASS |
| 2 · Both online riders see it on `GET /orders/open` | Order is on R1's and R2's boards | PASS |
| 3 · A customer can't read the board → 403 "Riders only" | 403 "Riders only" | PASS |
| 4 · R1 accepts at the asking price, R2 counters above it → 201 pending | Accept $3 and counter $4.50, both pending | PASS |
| 5 · A second offer from the same rider → 409 "one round only" | 409 | PASS |
| 6 · Customer lists offers, selects R1 → `assigned`, 6-digit delivery code | 201 assigned, agreed $3, code returned | PASS |
| 7 · Losing offer closed (`declined`); a late offer from R2 → 409 | DB: R2 offer `declined`, R1 offer `selected`; late offer 409 | PASS |
| 8 · Rider: confirmed → en_route_pickup → picked_up → en_route_dropoff (no pickup photo needed) | All four 201; no photo was attached | PASS |
| 9 · Wrong delivery code → 401 "That code doesn't match. 4 attempts left." | Exact copy, `deliveryOtpAttempts` = 1 | PASS |
| 10 · Correct code → `delivered` | 201 delivered | PASS |
| 11 · Customer rates 5 → `completed` | 201 completed; `ratings.score` = 5 | PASS |
| 12 · Admin detail: timeline of every step plus fare provenance | Timeline has the timestamped steps; provenance `customer_ask`; last step reads `"now"` | **FAIL** (F2) |
| 13 · Rider trip count +1 (`GET /orders/earnings/summary`) | count 0 → 1, total $0 → $3 | PASS |
| 14 · Edge: no rider online → `expired` at 90 s plus 0–10 s jitter | Expired between 95 and 100 s (DB event at 97.7 s); `ridersNearby: 0` | PASS |
| 15 · Edge: raise price 3 → 4 → 201; `expiresAt` unchanged | 201; expiresAt the same; boards show $4 | PASS |
| 16 · Edge: lower raise → 400; another user raising → 403 | 400 "Your new price must be higher than your current price."; 403 "Not your order" | PASS |
| 17 · Edge: after a raise, a new accept must equal the new ask; earlier bids stay at the rider's own price | R2 accept at $4 → 201; R1's $3 accept kept | PASS |
| 18 · Edge: selecting a pre-raise $3 accept → admin fare provenance matches the deal | Agreed $3 against an ask of $4, yet labelled `customer_ask` | **FAIL** (F1) |
| 19 · Edge: customer cancels during the auction → cancelled, offers declined, nothing owed | Cancelled; both offers `declined`; no debt; 0 `customer_balance_entries` | PASS |
| 20 · Edge: customer cancels after selection, before pickup → cancelled, rider gets no strike | Cancelled at `en_route_pickup`; R2 `cancel_strikes` 0, reliability still 100 | PASS |
| 21 · Edge: drop-off in Bulawayo → 400 out-of-area copy | 400 "That drop-off is outside our service area. We deliver across Harare, Chitungwiza, … and Goromonzi." | PASS |
| 22 · Edge: drop-off in Marondera (just outside every disc) → 400 | 400, same copy | PASS |
| 23 · Edge: drop-off in Chitungwiza (inside a satellite-town disc) → 201 | 201, 20.13 km, suggested $13.58 | PASS |
| 24 · Rider cancels an assigned order → strike, re-broadcast clone | R1 strike 1, reliability 100 → 95; the clone later expired at 96.9 s | PASS |

## Failures

**F1 · Fix soon · Admin fare provenance mislabels a below-ask deal after a raise.**
If a customer raises from $3 to $4 and then picks a rider's earlier $3 "accept", admin shows `fareProvenance: customer_ask` next to proposed $4 and agreed $3. An ops person checking a fare dispute would read that as "rider took the customer's price" when the rider was actually paid less than the current ask.
Suspect: `apps/api/src/admin/admin-orders.service.ts:597`. It trusts `selectedOffer.type === "accept"`, and the comment above it assumes "makeOffer pins an accept's offeredFare to proposedFare". That holds only at the moment the offer is made. `raisePrice` deliberately leaves existing bids at the rider's own price (`apps/api/src/orders/orders.service.ts:499-500`).

**F2 · Polish · A finished order's admin timeline still says "now".**
On a `completed` order the final "Completed" step has `state: "now"` and `ts: "now"`, not the time the order completed. The admin page will show a finished job as still happening, with no completion time.
Suspect: `apps/api/src/admin/admin-orders.service.ts:627-631`. The current step is always `now` or `stall`, even when the status is terminal.

## Observations (not failures)

- In the admin timeline, "At pickup" shows `done` without a timestamp. This run never recorded a rider arrival, and no arrival route exists in the lifecycle controller.
- When the auction ends, the losing rider is told through the WebSocket `order:taken` event only (`apps/api/src/matching/matching.service.ts:175-178`). Their offer row becomes `declined` (`:157-160`), and `GET /orders/:id` returns 403 "Not your order" to them. This run had no WebSocket client, so the push to the board itself was not observed.
- Trips go up at `delivered`, not at `completed`: `COMPLETED_ORDER_STATUSES` = [delivered, completed] (`packages/shared/src/enums.ts:79`, `orders.service.ts:966-972`).

## Doc vs code

| Doc / prompt says | Code does |
|---|---|
| CLAUDE.md (send-compose-v2): "no declared value" | `CreateOrderRequest.declaredValue` is **required**, ≤150 (`packages/shared/src/contracts.ts:70`). The app always sends `0` (`apps/mobile/app/send.tsx:400`). An API client that leaves it out gets a 400. |
| Prompt: "losing rider's offer closed" | The status is `declined`, not `closed` (`matching.service.ts:157-160`). Behaviour matches the intent. |
| Prompt: expiry "90 s window (+ up to 10 s)" | Matches: `OFFER_WINDOW_MS = 90_000` (`contracts.ts:10`) plus jitter of `JITTER_MAX_MS = 10_000` (`offer-expiry.service.ts:19,41`). With pending offers there is also a 15 s choosing grace (`contracts.ts:16`, `matching.service.ts:107`). |
| Prompt: "pickup photo optional server-side" | Confirmed: `advance()` has no photo check (`order-lifecycle.service.ts:209-243`). `POST /orders/:id/pickup-photo` is a separate, optional attach. |

## Code cited for expected behaviour

- Create, service-area gate, quote: `orders.service.ts:215-233`, `:31-36`. The discs are in `packages/shared/src/service-area.ts:19-28`.
- Board eligibility: `orders.controller.ts:75-89` → `tracking.service.ts:294-300`.
- Offers: an accept must equal the ask (`offers.service.ts:120`); one round only (`:169`). Select needs a heartbeat under 60 s (`matching.service.ts:27,115`).
- Delivery code: a wrong code returns 401 with the tries left; there are 5 tries (`order-lifecycle.service.ts:436-442`, `contracts.ts:27`).
- Cancel: allowed from open_for_offers through en_route_pickup (`enums.ts:104`). Only a rider cancel adds a strike (`order-lifecycle.service.ts:990` vs `:1043`).
- Raise price: must be strictly higher and inside the window, and the window is not reset (`orders.service.ts:507-545`).

<details><summary>Evidence: happy path (order c00f7282)</summary>

```
POST /orders 201 {"status":"open_for_offers","proposedFare":"3","suggestedFare":"3.87","distanceKm":3.95,"ridersNearby":2}
POST /orders/:id/offers (R1) 201 {"type":"accept","offeredFare":"3","status":"pending"}
POST /orders/:id/offers (R2) 201 {"type":"counter","offeredFare":"4.5","status":"pending"}
POST /orders/:id/offers (R1 again) 409 "You already responded to this order (one round only)"
POST /orders/:id/offers/:R1/select 201 {"agreedFare":"3","status":"assigned","deliveryCode":"662413"}
POST /orders/:id/offers (R2 late) 409 "This order is not open for offers"
POST /orders/:id/deliver {code:000000} 401 "That code doesn't match. 4 attempts left."
POST /orders/:id/deliver {code:662413} 201 {"status":"delivered"}
POST /orders/:id/rating {score:5} 201 {"status":"completed"}
GET /orders/earnings/summary (R1) before {"total":"0","count":0} after {"total":"3","count":1}
```

```
 type    | offered_fare | status          order_events: open_for_offers 09:23:57.935, assigned .319,
 accept  |         3.00 | selected        confirmed .389, en_route_pickup .425, picked_up .444,
 counter |         4.50 | declined        en_route_dropoff .461, delivered .502, completed .530
```
</details>

<details><summary>Evidence: admin detail (F2)</summary>

```
"status":"completed","deliveryOtpAttempts":1,"riderPhone":"+263•••••0002","proposed":"3","agreed":"3",
"fareProvenance":{"kind":"customer_ask"},
"timeline":[{"label":"Broadcast — customer named a price","state":"done","ts":"…09:23:57.935Z"},
 {"label":"Offer selected","state":"done",…},{"label":"En route to pickup","state":"done",…},
 {"label":"At pickup","state":"done"},{"label":"Picked up","state":"done",…},
 {"label":"En route to drop-off","state":"done",…},{"label":"Delivered — code entered","state":"done",…},
 {"label":"Completed","state":"now","ts":"now"}]
```
</details>

<details><summary>Evidence: raise price and provenance (F1, order c03ac1db)</summary>

```
POST /orders 201 {"proposedFare":"3"}
POST /orders/:id/offers (R1) 201 {"type":"accept","offeredFare":"3"}
POST /orders/:id/price {proposedFare:4} 201 {"proposedFare":"4"}
POST /orders/:id/offers/:R1/select 201 {"agreedFare":"3","status":"assigned"}
GET /admin/orders/:id 200 "proposed":"4","agreed":"3","fareProvenance":{"kind":"customer_ask"}
```
Raise on order 80324ff7: lower raise → 400 "Your new price must be higher than your current price."; rider raising → 403 "Not your order". `expiresAt` was 09:26:03.054Z both before and after the raise.
</details>

<details><summary>Evidence: cancels</summary>

```
80324ff7 (auction)       POST /cancel 201 {"status":"cancelled","cancelledBy":"customer","cooldownUntil":null}
  offers: accept 3.00 declined, accept 4.00 declined; debt_status null; customer_balance_entries = 0
0dbc0976 (en_route_pickup) POST /cancel 201 {"status":"cancelled","cancelledBy":"customer","cooldownUntil":null}
  riders: +263771000003 cancel_strikes 0, reliability_score 100, on_hold f
c03ac1db (rider cancel, cleanup) 201 cancelledBy rider → +263771000002 cancel_strikes 1, reliability 95;
  clone 5c1ac267 re-broadcast, expired at 96.9 s
```
</details>

<details><summary>Evidence: expiry with no riders online (order ed15f0c2)</summary>

```
PATCH /riders/online {online:false} ×2 → 200
POST /orders 201 {"expiresAt":"2026-10-05T09:26:27.754Z","ridersNearby":0}
polls (5 s): … t=90 open_for_offers, t=95 open_for_offers, t=100 expired
SQL: secs from created_at to the 'expired' event = 97.7
```
</details>

<details><summary>Evidence: service area</summary>

```
drop-off -20.15,28.58 (Bulawayo)   → 400 "That drop-off is outside our service area. We deliver across Harare, Chitungwiza, Norton, Ruwa, Epworth, Domboshava, Mt Hampden and Goromonzi."
drop-off -18.18,31.55 (Marondera)  → 400 (same)
drop-off -18.01,31.07 (Chitungwiza)→ 201 distanceKm 20.13, suggestedFare 13.58 (then cancelled)
```
</details>

## Not tested by automation

- The native app screens (compose, auction, rider board, tracking, rating sheet)
- Push notifications (`PUSH_PROVIDER=noop`) and the WebSocket board events (`order:taken`, `bid:expired`)
- GPS and live tracking (positions were sent by hand)
- The pickup photo upload (camera and storage)
- A real OTP delivery (console channel)
- The real ID check (`KYC_PROVIDER=stub`)
- The live server's config

Run hygiene: `git status --porcelain` showed only this file under `docs/e2e-runs/`. No other paths were changed.
