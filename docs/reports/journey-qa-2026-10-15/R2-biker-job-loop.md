# R2 — Biker job loop + the customer's live view

Lane: R2 · Model: Sonnet · Harness: **live** (R0 stack: native PG16 + PostGIS, redis, API on :3000, `PAYMENT_RAIL=stub`, `PUSH_PROVIDER=noop`) · main SHA: `28e4437` · run 2026-10-14 ~15:40 UTC
Trace for R5: `R2-trace.jsonl` (one JSON line per call/socket event, `scenario` + `step`). Scenario drivers: `harness/r2-run.mjs` (S1, S2), `r2-run2.mjs` (S0, S3, S4, S5), `r2-run3.mjs` (S6), `r2-run4.mjs` (S7); S2b is a 20-line `r2-run5.mjs`.
Helper: **none started.** There is no P0/P1, so the Opus skeptic had nothing to confirm; the domain-events question (JQ-R2-03) was settled with a direct Postgres reproduction instead.

**Verdict: the biker job loop is sound server-side.** 0 P0, 0 P1. Two P2, two P3. Everything the plan lists under "Hunt for" was tried live except the final 15-minute wall-clock expiry (done with a 6 s token instead) and the app-side items (static).

## Findings

| id | sev | journey step | what the user sees | repro | evidence file:line | proof | in KNOWN_BUGS? | fixed-on-main-not-shipped? |
|---|---|---|---|---|---|---|---|---|
| JQ-R2-01 | P2 (static, not reproduced: needs a device) | job in progress, biker's app killed by the OEM / swiped away | Customer's map stops moving until the biker reopens the app. A budget phone that kills the process while the foreground service lives on keeps producing GPS fixes that go nowhere. The customer is eventually shown the "biker's app went quiet" state (`presence:stale`), but the live dot is frozen in between. | Start a job, swipe the app away on a phone with aggressive task killing; the expo-location foreground service survives, the JS runtime is re-created for the headless task. | `apps/mobile/src/realtime/background-location-task.ts:15,28-42` — `forwarder` is module state set only by the hook while the job screen is mounted (`setBackgroundFixForwarder`); in a fresh headless runtime it is `null`, so `handleBackgroundLocations` returns at line 39 and the fix is dropped. Tests (`background-location-task.test.tsx`) only cover the registered-forwarder path. | Static + `jest src/realtime`: 84/84 pass (they assert the drop when no forwarder, which is the privacy intent). No device available. | no (`rg -n "forwarder\|background-location" docs/KNOWN_BUGS.md` → no hit) | no |
| JQ-R2-02 | P3 (harness) | QA tooling | R0's note says run socket scripts with `NODE_PATH=apps/mobile/node_modules`. That does **not** work: `drive.mjs` is ESM and Node ignores `NODE_PATH` for ESM `import`. `listen()` throws `ERR_MODULE_NOT_FOUND`. | `NODE_PATH=apps/mobile/node_modules node harness/r2-run.mjs` before the fix | `harness/drive.mjs` (`listen`, `await import("socket.io-client")`) | Worked after `ln -s /home/user/Lynia/apps/mobile/node_modules harness/node_modules` (untracked; I added it to `.git/info/exclude`). Later lanes: use the symlink, don't commit it. | n/a | n/a |
| JQ-R2-03 | P3 (refuted as reachable; kept because of the plan's explicit question) | match / bid / lifecycle transactions | nothing today | see "domain-events check" below | `apps/api/src/common/domain-events.ts:112-119` (`record` swallows), `matching/matching.service.ts:169`, `offers/offers.service.ts:195,290`, `orders/order-lifecycle.service.ts:635,879,1128,1144` | Direct psql: a failing INSERT inside `BEGIN` → next statement `ERROR: current transaction is aborted` | no | n/a |
| JQ-R2-04 | P3 | deliver, 3rd call | After a successful `/deliver`, a third call within seconds returns `429 Too many requests` instead of `409 not ready`. Harmless (a double-tap just sees a throttle message). | `deliver` A ok, B (concurrent) 409, C → 429 | throttle on `POST /orders/:id/deliver` (see trace S5-commission) | `R2-trace.jsonl` S5-commission "deliver C (after)" | no | n/a |

### The domain-events check (what the plan asked the skeptic to settle)

The claim "a caught error still aborts the whole Postgres transaction" is **true as mechanism**: a failed `INSERT INTO domain_events` inside an interactive transaction leaves it aborted, and the `catch` in `record()` hides that, so the next statement fails (`25P02`) and the bid/select/lifecycle call would 500. Reproduced: `insert ... '{"a":"\u0000"}'` → `ERROR: unsupported Unicode escape sequence`, then `ERROR: current transaction is aborted`.

It is **not reachable from the in-transaction call sites**, because every `data` value they write is a number, an enum literal or a UUID, and the table has no foreign keys, no unique key beyond a random UUID primary key, and `order_id` is always a real order UUID:

- `offer.bid/rebid`: `kind` (enum), `fare` (zod-validated number), `etaMinutes` (number) — `offers.service.ts:195-205`
- `offer.withdraw`: `fare` number or null — `offers.service.ts:290-299`
- `order.assigned`: ids and `Number(offeredFare)` — `matching.service.ts:169-177`
- `rider.offline`: `reason` is the closed `RiderOfflineReason` union — `order-lifecycle.service.ts:635,879,1128,1144`

So no input a user controls can make the insert reject; the doc comment at `domain-events.ts:12-14` ("an error means the connection is already broken") holds in practice. Residual risk is a future call site that adds free text to `data`. No fix requested; if R8 wants a guard it is one line in `cleanData` (strip `\u0000`). Live evidence: the S1/S3/S4/S5 flows all wrote domain events in-transaction with 0 failures (`/tmp/api.log` has no `domain_event_write_failed`).

## What was tried and held (no defect) — the "Hunt for" list

| Hunt item | Result | Proof (R2-trace.jsonl scenario) |
|---|---|---|
| Two bikers bid at once, customer selects | Both bids 201. Two **concurrent** selects → exactly one `201 assigned`, the other `409 order_closed "Order was just taken, pick another"`. The loser gets `403 Not your order` on `GET /orders/:id` and `403 Not the assigned biker` on `/status`; their `/orders/mine/active` is `null`. | S1-two-bidders |
| "Two bikers both think they won" | No. `order:taken` is broadcast to the whole board room, including the winner, by design; the app resolves who won by refetching the active job (`use-rider-board.ts:188-196`). After select, the winner's `GET /orders/mine/active` returns the job and the loser's returns `null`. | S0-bidder-learns |
| "Job on the board already taken" | After assignment the order is absent from `GET /orders/open` for a third biker (`board-contains-taken=false`). | S1-two-bidders |
| "Selected biker never sees the job" | Server side fine: `order:taken` reaches both bidders' board sockets in the same millisecond; `GET /orders/mine/active` has the job right after select. The app polls it every 8 s only while the board socket is down (`app/rider/(tabs)/index.tsx:397`), and reconciles on every (re)connect (`use-rider-board.ts:107-119`). The only other path is the FCM push (noop here). | S0-bidder-learns |
| Selecting a biker whose heartbeat lapsed | `409 rider_unavailable "Biker just became unavailable, pick another"`. A lapsed bidder is also **hidden** from `GET /orders/:id/offers`, so the customer is not offered a biker they cannot pick; the bid reappears after a heartbeat. | S2-stale-heartbeat, S2b-lapsed-bidder-listing |
| The chosen biker cancels | `201 {status: cancelled, cancelledBy: rider}`; customer socket gets `order:status cancelled` then `order:rebroadcast {newOrderId}`; a new `open_for_offers` clone exists and is linked (`rebroadcast_of_id`), so the customer's active-orders list shows it at once. Rider: `cancel_strikes` +1 per cancel, `reliability_score` 100→95→90, still online. | S3-biker-cancels |
| Wrong code ×5, then the right code | Attempts 1–4: `401 … N attempts left`; #5: `401 no attempts left. Ask the customer to re-issue`; #6 and the **original right code**: `403 Too many attempts`. Customer `rotate` returns a new code; `deliver` with it → `delivered`; rating → `completed`; `delivery_attempts` reset to 0. No dead end. | S4-wrong-code |
| `/deliver` twice, `/rating` twice (concurrent) | One `delivered`, the concurrent duplicate `409 Order is not ready for delivery`; one rating `completed`, duplicates `409 Order already completed` / `Order already rated`. | S5-commission |
| Commission missing or doubled | Biker past their free jobs (`trips_count=10`, balance $10): each $3 job is charged once, **at completion** (not at delivery): balance 10 → 9.70 (after rating job 1) → 9.40 (after rating job 2). Ledger: one `commission` row per order, `10% of $3.00`, `amount -0.3`; `commission_ledger` count per order = 1. Delivered-but-unrated stays at the old balance until the rating, consistent with `commission-cover.ts` counting it as owed. | S4/S5 |
| "No bids while on a job" (#1157) | A biker with an unfinished job gets `403 Finish your current job before making another offer`. | (hit while running S0; not in the final trace — reproduced by running `r2-run2.mjs` without clearing orders) |
| Token expiry on a trip (#1185/#1187) | A socket authenticated with a 6 s token is closed by the server at 5.8 s (`transport close`, matches `scheduleAuthExpiry`). A reconnect with the same expired token connects then gets an immediate `io server disconnect`; that is the case the app handles (`socket.ts:78-98` renews the session, then `socket.connect()`; `auth` is a callback so the new token is read). My bare client does not retry after a server disconnect, as Socket.IO specifies, so the recovery itself is proved by jest, not live. | S6-token-expiry; `jest src/realtime` 84/84 |
| Position updates to the customer | Rider fixes reach the customer's `position` event; 5 fixes in 15 ms are coalesced to the first immediately and the **last one (trailing edge) ~1 s later**, so the final dot is the true last position. A non-assigned biker's `rider:location` and `subscribe:order` both get `{error:"forbidden"}`. | S7-position |
| Restart / stuck job | The job is read from the DB (`/orders/mine/active`), not held in memory, so an API restart or a killed app resumes it. Not tested with an app kill (no device). | S0 |

Int specs run by R0 on this stack (offer-loop 3, order-lifecycle 24, tracking 8): all pass; I did not re-run them.

## Speed (localhost floor, ms; the network is R6's lane)

| Call | ms | Call | ms |
|---|---|---|---|
| bid (two concurrent) | 76 / 82 | select | 24–46 |
| list offers | 12 | stage | 9–16 |
| deliver | 10–13 | rating | 21–30 |
| cancel (chosen biker, includes rebroadcast clone) | 20–31 | wallet read | 2–3 |
| position emit → customer, first fix | <10 | position, coalesced trailing fix | ~1000 (by design) |
| server closes socket at token expiry | 5843 for a 6000 ms token | | |

## Notes for R5 (customer tracking, static + this trace)

- Customer-visible event order for a normal job: `order:status` events for `confirmed … delivered/completed` (no `assigned` event is emitted to the customer, because they performed the select); on a biker cancel: `order:status cancelled` followed by `order:rebroadcast {orderId, newOrderId}` — the customer app must follow `newOrderId` (R5 should check `use-order-socket` does).
- `position` payload is `{riderId, lat, lng, at}` without an `orderId`; it is delivered per order room.
- `GET /orders/mine/active-orders` returns the clone immediately after a biker cancel.

## Not covered

Real 15-minute wall-clock expiry (6 s token used instead); photo upload (static-only per plan); background GPS on a physical phone (JQ-R2-01 is static); merchant/food jobs (out of scope).
