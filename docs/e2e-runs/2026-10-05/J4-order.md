# J4 — Customer orders from a restaurant (report only)

**Verdict: PASS. All 32 rows passed (setup, golden path, all 6 edge cases and test:int). No launch blockers. `test:int` is 80/80 green. The ledger for the order nets to exactly $0.00.**

Run 4 of 7. Tested `origin/main` @ `2f260df` on 2026-10-05 against a local stack only (PostGIS + Redis in Docker, API on `localhost:3000`). The API process's outbound proxy was pointed at a dead port, so it could not reach any vendor (GCS, Didit, FCM, Bird).

| Step | Expected (from code) | Actual | Result |
|---|---|---|---|
| S1 Merchant sign-up | `POST /merchant/become` returns 201, dormant (`pilotEnabled:false`) | 201, `pilotEnabled:false`, `autoAccept:true` | PASS |
| S2 Hours + manual accept | `PATCH /merchant/hours` 200; `PATCH /merchant/order-settings {autoAccept:false}` 200 | 200 / 200, `autoAccept:false` | PASS |
| S3 Dish without photo is a draft | `isDraft: !photoUrl` (`merchant.service.ts:523`) | 201, `isDraft:true` | PASS |
| S4 Go-live refused with no photo | 409 `no_live_dishes` (`admin-merchants.service.ts:319`) | 409, "This restaurant has no dish with a photo yet — its menu would be empty." | PASS |
| S5 Go-live after photo seeded | 201, `pilotEnabled:true`; listed in `GET /restaurants` | 201, `true`; customer list contains it | PASS |
| S6 Rider (stub ID check) online 330 m away | `become` returns `verified` (`rider.service.ts:352`); `online:true` | `verified`; `online:true` | PASS |
| 1 Place CASH order (2 × $6.25) | 201, `awaiting_accept`, goods $12.50, rule `collect_and_return` | 201, all match; delivery $2.50, total $15.00 | PASS |
| 2 Merchant sees it | in `GET /merchant/orders` | present | PASS |
| 3 Accept, ready in 10 min | `preparing` with `prepStartedAt` | `preparing` | PASS |
| 4 No rider offer while cooking | dispatch only picks `ready_for_pickup` (`food-dispatch.service.ts:134`) | `{offer:null}` 22 s after accept | PASS |
| 5 Mark ready + reveal code | `ready_for_pickup`; code `^\d{6}$` | both | PASS |
| 6 Auto-dispatch reaches rider | an offer within one 20 s sweep | offer for this order in ≤25 s | PASS |
| 7 Rider accepts | `{status:"assigned"}` | assigned | PASS |
| 8 Rider confirmed, then on the way to pickup | 201 each | `confirmed`, then `en_route_pickup` | PASS |
| 9 Wrong pickup code (edge) | 400 "That code doesn't match. N attempts left." (`food-order.service.ts:1032`) | 400 "…4 attempts left." | PASS |
| 10 Right pickup code, collected | `picked_up`; ledger `opened +12.50` | `picked_up`; ledger `opened 12.50` | PASS |
| 11 Delivery code hidden before the cash confirms | 409 | 409 "The code appears once you both confirm the cash exchange" | PASS |
| 12 Rider confirms cash before the customer | 409 | 409 "Waiting on the customer's confirm first" | PASS |
| 13 Door: customer, then rider confirm cash | 201 each | both timestamps set | PASS |
| 14 Delivery code → delivered | 6 digits; `delivered` | both | PASS |
| 15 Short cash count (edge) | 409 "expected $12.50, got $12.00" (`food-debt.service.ts:295`) | exact match | PASS |
| 16 "I got $12.50" | `settled_cash` | `settled_cash` | PASS |
| 17 Ratings (rider + venue) | rider rating sets `completed`; venue rating 201 | `completed`; `{score:5}` | PASS |
| 18 Admin order detail food panel | `food` block with debt | `food.debt.status = settled_cash`, goods 12.5, fee 2.5 | PASS |
| 19 `merchant_debt_ledger` nets to 0.00 | `opened +12.50`, `settled_cash −12.50`, sum 0.00 | as expected | PASS |
| E1 Merchant ignores → auto-cancel | cancelled by the 20 s sweep after the 3:00 window (`restaurants-order.ts:102`, `food-order.service.ts:1198`) | cancelled at 186 s, reason `shop_closed` | PASS |
| E2 Merchant declines | `cancelled`, reason kept | `cancelled`, `too_busy`; customer read shows cancelled | PASS |
| E3 Customer cancels while waiting | 201 `cancelled`; a late merchant accept gets 409 | 201; then 409 "This order can no longer be accepted" | PASS |
| E4 Wrong pickup code | see step 9 | — | PASS |
| E5 Short cash count | see step 15 | — | PASS |
| E6 Order from a closed restaurant | 409 `restaurant_closed` (`food-order.service.ts:335`) | 409 "This restaurant is closed right now. Opens tomorrow at 00:00." | PASS |
| INT `pnpm --filter @lynia/api test:int` | green | 10 files, 80 tests, all passed (16.7 s) | PASS |

No failures to tag. Observations, not defects:
- **Polish (copy, to check):** an order the kitchen never answers is stored with `rejection_reason = shop_closed` (`food-order.service.ts:1221`). That is the same code as "the shop is closed", so any customer copy keyed on it will say the restaurant was closed, not that it didn't answer. The customer screen was not checked.
- The dish-photo key could not go through the real upload check locally. It returned 503 `uploads_unavailable`, because the GCS call is blocked by rule 2. The photo was seeded in the local DB (`UPDATE merchant_dishes SET photo_url=…, is_draft=false`). The upload path itself is **not tested** by this run.

## Doc vs code

- **Dispatch starts at "ready", not at "accept".** The prompt's order is "accept → auto-dispatch → rider accepts → merchant marks ready". In the code, `sweepSearch` only picks orders with `merchantPhase: "ready_for_pickup"` (`apps/api/src/merchant/food-dispatch.service.ts:127-137`). The run saw no offer 22 s after accept and an offer within one sweep of mark-ready, so it tested what the code does. (Orders that were auto-accepted have a separate early-dispatch lead, `RESTAURANTS_AUTO_ACCEPT.dispatchLeadMs` = 8 min, at `food-order.service.ts:1425`. This run did not exercise it.)
- **"Auto-cancel after 3 minutes" applies only to manual-accept kitchens.** The plan (§6 E6, "3-minute merchant accept") and the prompt imply every new order has a 3-minute clock. In the code, `merchants.auto_accept` defaults to `true` (`apps/api/prisma/schema.prisma:1051`), and sign-up returned `autoAccept:true`. A cash order at a default kitchen skips `awaiting_accept` (`food-order.service.ts:380`), and an unconfirmed auto-accepted order is cancelled only after 60 min (`packages/shared/src/restaurants-order.ts:129`, `autoCancelAfterMs`). This run switched auto-accept off to test the 3-minute path.
- **The 3-minute clock pauses when the kitchen is offline.** `sweepExpiredAcceptWindows` pushes the deadline back while no merchant socket is in the queue room (D-16, `food-order.service.ts:1208`). The run kept a socket subscribed (`merchant:queue-subscribe`) so the cancel would fire. If no tablet is open, an ignored order waits indefinitely instead.
- **Closing by hand closes until midnight.** `PATCH /merchant/open {open:false}` sets `closedUntil = startOfNextDay` (`merchant.service.ts:393`). That is why the refusal says "Opens tomorrow at 00:00" even though the hours were 00:00–23:59.

<details><summary>Evidence: golden path (HTTP)</summary>

```
POST /restaurants/{m}/orders        201 phase=awaiting_accept goods=12.5 pay=cash rule=collect_and_return total=15
POST /merchant/orders/{o}/accept    201 phase=preparing
GET  /merchant/orders/dispatch/offer (t+22s, not ready) 200 {"offer":null}
POST /merchant/orders/{o}/mark-ready 201 phase=ready_for_pickup
GET  /merchant/orders/dispatch/offer 200 {"offer":{"orderId":"13425fba…","itemDesc":"2x Sadza & stew","merchantGoodsTotal":12.5,"deliveryFee":2.5,"distanceKm":3.22,…}}
POST /merchant/orders/{o}/dispatch/accept 201 {"status":"assigned"}
POST /merchant/orders/{o}/confirm-pickup (wrong) 400 "That code doesn't match. 4 attempts left."
POST /merchant/orders/{o}/confirm-pickup        201 {"status":"picked_up"}
POST /orders/{o}/delivery-code/rotate (pre-cash) 409 "The code appears once you both confirm the cash exchange"
POST /orders/{o}/deliver            201 {"status":"delivered"}
```
</details>

<details><summary>Evidence: money (HTTP + SQL)</summary>

```
POST /merchant/orders/{o}/debt/confirm-cash {"amount":12}   409 "Amount doesn't match — expected $12.50, got $12.00"
POST /merchant/orders/{o}/debt/confirm-cash {"amount":12.5} 201 {"debtStatus":"settled_cash"}

SELECT type, amount FROM merchant_debt_ledger WHERE order_id='13425fba-…' ORDER BY created_at;
 opened       |  12.50
 settled_cash | -12.50
SELECT SUM(amount)::numeric(10,2) …  →  0.00
SELECT status, debt_status, debt_amount FROM orders …  →  completed | settled_cash | 12.50
```
</details>

<details><summary>Evidence: admin food panel</summary>

```
GET /admin/orders/{o} 200
keys: id, orderType, food, route, status, stuck, …, rider, customer, items, timeline, deliveryProof
food: {"merchant":"J4 Kitchen","paymentMethod":"cash","cashRule":"collect_and_return",
       "goodsTotal":"12.5","deliveryFee":"2.5",
       "debt":{"status":"settled_cash","amount":"12.5","openedAt":"2026-10-05T16:05:38.819Z",…}}
```
</details>

<details><summary>Evidence: edges</summary>

```
E1 ignore: placed 16:04:56Z, acceptDeadlineAt 16:07:56.086Z
   SQL orders row → cancelled | rejection_reason=shop_closed | cancelled_at 16:07:56.247 (186 s after placing)
E2 POST /merchant/orders/{o}/reject {"reason":"too_busy"} 201 status=cancelled
E3 POST /restaurants/orders/{o}/cancel 201 status=cancelled
   POST /merchant/orders/{o}/accept → 409 "This order can no longer be accepted"
E6 PATCH /merchant/open {"open":false} 200
   POST /restaurants/{m}/orders 409 {"reason":"restaurant_closed","message":"This restaurant is closed right now. Opens tomorrow at 00:00."}
Go-live with no photo: 409 {"reason":"no_live_dishes"}
```
</details>

<details><summary>Evidence: test:int</summary>

```
 Test Files  10 passed (10)
      Tests  80 passed (80)
   Duration  16.68s
```
These are the existing integration specs, run as they are. The specs clear the tables, so they ran after the journey, once its evidence had been captured.
</details>

<details><summary>Setup notes</summary>

- API env: `NODE_ENV=development OTP_CHANNEL=console OTP_TEST_PHONES=+263771000001..7 KYC_PROVIDER=stub PUSH_PROVIDER=noop RESTAURANTS_ENABLED=true MERCHANT_DISPATCH_AUTO_ENABLED=true`. `OTP_RL_*` limits were raised (E2), and `HTTPS_PROXY`/`GCE_METADATA_HOST` were pointed at `127.0.0.1:9` to block vendor egress.
- Accounts: merchant …0001, customer …0002, rider …0003, admin …0004. The admin was promoted with `UPDATE profiles SET role='admin'` in the local DB (E1). Each account used its own `x-device-id`.
- Kitchen at -17.8292, 31.0522 and drop-off in Avondale (3.22 km). The rider went online 330 m from the kitchen (inside the 8 km radius, `restaurants-order.ts:195`).
- The merchant's presence came from a socket.io client subscribed to `merchant:queue-subscribe`.
- `git status --porcelain` showed nothing outside `docs/e2e-runs/` before the commit.
</details>

## Not tested by automation

- Native app screens: the customer order screen, the rider app, and the merchant web screens for this flow.
- Push notifications (noop provider) and live socket UI updates.
- Real GPS (fixed coordinates were used) and the real camera/photo upload (GCS was blocked; the photo was seeded in the DB).
- Real OTP delivery (console channel) and the real ID check (Didit stubbed to an instant pass).
- The auto-accept default path (60-minute unconfirmed cancel, 8-minute early dispatch) and NO_RIDER hold/resume.
