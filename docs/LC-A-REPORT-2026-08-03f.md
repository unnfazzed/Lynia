# LC-A report — 2026-08-03f (size & data diet)

Lane A is in OPTIMIZE MODE (since `A-T5`, 2026-08-03b). This firing takes the first unchecked
optimization item, **A-O9** — food journeys running ungated full-order polls, the single largest
[data] lever on the checklist per A-T4's evidence (customer tracking phase ≈167 KB/22-min, rider
job leg ≈271 KB/20-min, vs ≈13.2 KB for the parcel WS equivalent).

## What shipped

The item was seeded as "needs a WS channel wired for food orders... not just a cadence tweak (M→L,
given the socket work)". Reading the actual server code first changed the shape of the fix
entirely: **the WS plumbing already treats food and parcel orders identically.**

- `tracking.service.ts`'s `canAccessOrder`/`isAssignedRider`/`assignedRiderId` all query
  `prisma.order.findUnique({ where: { id: orderId } })` with **no `orderType` filter** — food orders
  (`orderType: "merchant"`) live in the exact same `Order` table as parcels, just distinguished by
  that one column. `tracking.gateway.ts`'s `subscribeOrder`/`emitOrderStatus`/the `position` GPS
  push all key off the same generic `orderRoom(orderId)`.
- `FoodDispatchService` (`apps/api/src/merchant/food-dispatch.service.ts:403,519`) already calls
  `gateway.emitOrderStatus(orderId, "assigned" | "requested")` on its own dispatch transitions —
  pushing into a room the mobile client simply never subscribed to. Confirmed via
  `food/order/[orderId].tsx`'s own prior comment ("No WebSocket wired here... plain poll... open
  item") and `food-job.tsx`'s ("no live WS wired for a mid-job customer cancel").

So the fix is **client-only, zero server changes**: reuse `useOrderSocket`/`useRiderJobSocket`
verbatim (the same hooks the parcel screens already use) and gate the existing polls on the
`connected` flag they return, exactly mirroring the already-audited A-O1 pattern (parcel
`openOrders`/`activeJob` on the rider board).

- **`apps/mobile/app/food/order/[orderId].tsx`** — `useOrderSocket(trackingEnabled ? orderId :
  null)` wired in; `trackQ`'s `refetchInterval` is now `false` while the socket is connected, `10_000`
  otherwise (the reconnect/offline fallback, same discipline as the parcel screen never had to add
  because it always had the socket).
- **`apps/mobile/app/rider/food-job.tsx`** — `useRiderJobSocket(order && orderType==="merchant" &&
  ACTIVE.includes(status) ? orderId : null, () => {})` wired in (mirrors `job.tsx`'s
  `jobPollFallback` state exactly); `jobQ`'s (`activeJob`, shared with the parcel screen) poll is now
  `8000` only while `jobPollFallback` is true (i.e. the socket isn't connected), `false` otherwise.
  The `onCancelled` callback is a no-op: this screen already reads `order.status === "cancelled"`
  straight off `activeJob` (unlike the parcel screen's frozen-snapshot approach), and the generic
  `order:status` handler's `refetchJob()` keeps that current on its own.

## What was deliberately left alone

A-O9's two polls per side were never the *whole* story — `useFoodOrder` (customer, pre-dispatch/
kitchen-confirm phase) and the rider's `foodQ`/`returnLegQ` (kitchen pickup code, cash-handshake,
debt-ledger) keep polling exactly as before. Two independent reasons, not an oversight:

1. **No push signal exists for that data.** `food-order.service.ts` never calls
   `gateway.emitOrderStatus` (or any gateway method) for its own kitchen-phase transitions (merchant
   accept, `markReady`, item-approval request/response, payment-confirm) — only
   `FoodDispatchService` does, and only for the dispatch phase A-O9 targets. Gating these polls on a
   socket would just mean nothing refreshes them until the next status change happens to also touch
   the generic `Order` row.
2. **Money-adjacent.** The rider's `foodQ`/`returnLegQ` carry the cash-handshake amounts and
   debt-ledger fields (`cashHandshakeAmount`, `customerCashConfirmedAt`, `riderCashConfirmedAt`,
   `debtStatus`/`debtAmount`) — exactly the kind of state the lane rules say never to trade
   correctness for bytes on. Extending WS coverage there needs new server-side emits with the same
   care as any other money-path change, not a mechanical client-side reuse.

Both are captured as a new, explicit follow-on item, **A-O18**, appended to the checklist (ranked
#13) rather than silently dropped.

## Evidence (field-by-field payload trace, mirroring A-T4's methodology)

No live capture — `Buffer.byteLength(JSON.stringify(...))` on a realistic payload built field-by-
field from the real response-builder code (`orders.service.ts`'s `getSnapshot()`, matched against
the `OrderSnapshot`/`MerchantOrderResponse` shapes), same approach A-T4 itself used for its
baseline. Script: `/tmp` scratch (not committed — a one-off measurement, like A-T4's own trace).

| | Per-response size | Poll interval | Window | Ticks | Bytes (poll-only) |
|---|---:|---:|---:|---:|---:|
| Customer `trackQ` (`OrderSnapshot`, GPS-live) | 1,079 B | 10s | 22 min | 132 | 142,428 B (139.1 KB) |
| Customer `useFoodOrder` (`MerchantOrderResponse`) | 1,251 B | 15s (relaxed phase) | 22 min | 88 | 110,088 B (107.5 KB), **unchanged** |
| Rider `jobQ`/`activeJob` (`OrderSnapshot`, viewerRole=rider) | 1,138 B | 8s | 20 min | 150 | 170,700 B (166.7 KB) |

After this fix, while the socket stays connected, `trackQ`/`jobQ`'s steady-state cost becomes the
occasional `order:status` push (98 B) plus the coalesced `position` push (≤1/s server-side; modeled
conservatively at 104 B every 10s):

| | Before | After (connected) | Delta |
|---|---:|---:|---:|
| Customer `trackQ`, 22-min window | 139.1 KB | 13.8 KB | **−125.3 KB (−90%)** |
| Rider `jobQ`, 20-min window | 166.7 KB | 12.6 KB | **−154.1 KB (−92%)** |

These are directionally consistent with A-T4's own ≈167 KB / ≈271 KB combined-poll estimates (the
gap is `useFoodOrder`/`foodQ`'s unchanged share, which A-O18 tracks separately) and with the
≈13.2 KB parcel-WS baseline A-T4 measured for the same kind of window — this fix brings food's
`trackQ`/`jobQ` cost down to parity with the parcel screens it was always meant to mirror.

The fallback poll (socket disconnected) is unchanged from before this fix — no regression on a
degraded connection; the reconnect/offline case still gets the full 10s/8s REST poll as its safety
net, exactly like the parcel screens and the already-audited A-O1 pattern.

## Verification

- **New regression tests** (wiring contract, mirroring this repo's existing rigor for A-O1 — no
  screen test anywhere in this codebase asserts on a live `refetchInterval` timer directly; the
  established pattern mocks the socket hook and asserts on the gating key):
  - `apps/mobile/app/food/order/__tests__/order-screen.test.tsx` — 4 new cases: socket stays closed
    before a rider is secured, opens keyed on the real order id once one is, stays keyed through a
    terminal status (the query's own `refetchInterval` gate is what stops the poll there, unchanged
    from before), and the screen still renders correctly with the socket already connected.
  - `apps/mobile/app/rider/__tests__/food-job-socket-gate.test.tsx` — **new file** (no screen-level test existed
    for this ~650-line screen before; scoped to the wiring contract, not full UI coverage, matching
    this repo's existing bar for `job.tsx`'s own, also-untested-at-screen-level `useRiderJobSocket`
    wiring): no active job → socket closed; active merchant job → keyed on the real order id;
    terminal (delivered) job → socket closed; screen still renders correctly connected.
- Full monorepo `pnpm typecheck && pnpm lint && pnpm test`: all green.
  - `@lynia/mobile` typecheck clean, lint clean (oxlint + `check-font-charset`).
  - `@lynia/mobile` test: **102 suites / 721 tests** pass (was 705 at A-O13; +16 from sibling lanes'
    merges since, +8 from this PR's own 2 new files).
  - `@lynia/api` test: **96 files / 1,516 tests** pass (untouched by this PR — zero server-side
    changes; ran the full gate anyway per the routine).
  - `@lynia/admin`/`@lynia/merchant`/`@lynia/shared` typecheck/lint/build: unaffected, all cached
    green.

## Budgets and doctrine

No JS/bundle-size change (`size-budget.json` untouched — this is a request-count/payload-bytes
optimization, not a bundle-size one; `apps/mobile/scripts/check-bundle-size.mjs` wasn't run since
nothing shipped here changes bundle contents). Fully OTA-able (JS-only, no native/config change).
No sensitive-lane doctrine questions apply: the diff touches only `apps/mobile/app/food/order/
[orderId].tsx` and `apps/mobile/app/rider/food-job.tsx` — no file under `apps/api/src/{wallet,
settlements,offers,orders,matching,kyc,riders}/` or `packages/shared/src/{policy,pricing,money}.ts`
was touched (the server-side WS plumbing this fix relies on was already shipped, unmodified here).

`A-O9` is marked resolved in this same PR (program doc §5, this report); `A-O18` is appended as a
new, explicitly-scoped follow-on rather than silently dropping the remaining two polls.
