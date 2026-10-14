# R5: Customer order tracking

Lane: R5 · Model: Sonnet · Harness: **static-only** (no boot, by design) plus R2's trace · main SHA: `28e4437` · run 2026-10-14

**Result: 0 P0, 0 P1, 1 P2, 1 note.** Tracking is well defended against missed events, and the targeted tests are green.

## Proof run

`pnpm --filter @lynia/mobile exec jest app/order src/realtime src/logic/__tests__/order` → **22 suites, 274 tests, all pass.**

## Findings

| id | sev | journey step | what the user sees | repro | evidence file:line | proof | in KNOWN_BUGS? | fixed-on-main-not-shipped? |
|---|---|---|---|---|---|---|---|---|
| JQ-R5-01 | P2 | Cancel from the order sheet | When Cancel fails with a 409 ("can't be cancelled anymore", or "Order changed, retry"), the toast says **"Couldn't cancel. Your order is still active."** with **Try again**. If the order has meanwhile ended (rider delivered it, or it was cancelled), "still active" is false, and Try again hits the same 409 until a socket push or poll repairs the screen. | Customer taps Cancel at the moment the rider's status moves past what cancel allows; the cancel call returns 409. | `app/order/[id].tsx:657` (`onError` shows the toast and never refetches); `src/ui/order/copy.ts:160`; server `apps/api/src/orders/order-lifecycle.service.ts:1062` (`ConflictException` "…past that point") and `:1078` ("Order changed, retry") | Static. `onSuccess` (`:648-655`) refetches, `onError` does not. The socket normally repairs the screen: `use-order-socket.ts:129` refetches on every `order:status`. The gap is a missed push or a 5 s poll window. | no hit for `cancelFail` | no |

## What was checked and held up

| Hunt item | Result | Evidence |
|---|---|---|
| Map frozen on a stale position | Held. A `position` push is applied to the cache, and a REST refetch landing later cannot roll the pin back (`reconcileAfterRefetch`). A foreign rider's fix is ignored (U07). | `use-order-socket.ts:76-87`, `:178-196` |
| Stage sheet stuck after a missed event | Held. A (re)connect or a connect error refetches, gated to once per 5 s (`self-heal-gate.ts:15-21`). While the socket is down the screen polls every 5 s in active states and every 15 s in the auction. A foreground event also refetches. | `app/order/[id].tsx:266-274`, `:345-352`; `use-foreground-refetch.ts:11-20`; `use-order-socket.ts:99-106` |
| Socket closing at 15 min, as the customer sees it | Held. The handshake reads the live token (`auth` callback). When the server refuses with `io server disconnect`, the client renews the session and reconnects with backoff 1 s → 60 s. While down, `connected=false` re-enables the 5 s poll. | `socket.ts:68-103`; `app/order/[id].tsx:268-273`; covered by `socket.test.tsx` (green) |
| A push opening the wrong order | Held. The server stamps the recipient's per-order role `to` on every status push, so a biker who is also the customer on an order opens `/order/:id`, not `/rider/job`. The `assigned` and `cancelled` routes branch on `to`. | `apps/api/src/notifications/notifications.service.ts` (`notifyOrderStatus`, `data: { orderId, status, to: aud, orderType }`); `push.ts:240-245`, `:271-274` |
| A cancel racing an accept | The race is handled on the accept side. In R2's trace, a concurrent select returned `409 order_closed` ("Order was just taken, pick another"), and the app treats a 409 on select as a race rather than an error (`app/order/[id].tsx:717-722`, `selectOfferReconciled` `:445`). The cancel side is JQ-R5-01. | `R2-trace.jsonl` S1 `select A`; `select-offer-reconcile.test.tsx` (green) |
| Rider-bail rebroadcast | Held. In R2's trace S3 the customer got `confirmed`, `cancelled`, then `order:rebroadcast` within 21 ms. The screen keeps its socket through `cancelled` for the grace period and `router.replace`s to the new auction. | `R2-trace.jsonl` S3-biker-cancels; `app/order/[id].tsx:113`, `:319-335` |
| The code missing or stale after rotation | Held. `reconcileDeliveryCode` drops a local code when the snapshot's `codeRotatedAt` or attempt count moves, and clears the stored copy. | `app/order/[id].tsx:293-312`; `delivery-code-restore-flash.test.tsx` (green) |
| History without a just-finished order | Held. A terminal status from the socket invalidates history. The Orders tab re-reads history on focus and on foreground, and again when a running order leaves NOW. A rating also invalidates `["history"]`. | `use-order-socket.ts:88-93`; `app/(tabs)/orders.tsx:90-130`; `use-history-feed.ts:63` |

## R2 trace cross-check

For each `order:status` the server sent in `R2-trace.jsonl` (`confirmed`, `cancelled`, `rebroadcast`, `order:taken`), the client either refetches the REST snapshot (the snapshot is the source of truth) or follows the id. Nothing in the trace depends on the payload being applied directly. A missed event is therefore recoverable on reconnect, on foreground, or on the next poll.

## Field signal: LYNIA-MOBILE-6 ("compose-map-not-loaded" on the order screen)

Not reproducible on current main, agreeing with R7 (JQ-R7-03). `ComposeMap.tsx:238` is the only emitter, and the order screen's `OrderMap` imports only `PinView` from `ComposeMap`. The one event (release 40, Android 16) carries `map_load_signal=onMapLoaded`, `elapsed≈22 s`, which matches MOB-MAP-04 (key allowlist, fixed in GCP 2026-10-06). What the customer sees when a map does not draw is the lane's open question, and it has no live check here. Static-only claim.

## Not covered (static-only lane)

- Real map rendering, tile timing and the on-device look of the frozen-position fade.
- Push delivery and cold-start tap routing on a device.
- Behaviour on a flapping network (R6).
