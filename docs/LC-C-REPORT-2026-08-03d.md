# LC-C report — 2026-08-03d (offline & 2G resilience)

Eighth LC-C increment. Phase 0: no in-flight `claude/lc-c*` PR to babysit; all five Day-0 defects
(C-D0a…e) and the first four audit territories (C-T1…C-T4) were already closed by prior firings —
so this run stays in **AUDIT MODE** and takes the last unchecked audit territory, **C-T5:
reconnect semantics across ALL realtime hooks + the server catch-up seam**. Closing C-T5 exhausts
Lane C's audit-territory phase; Lane C moves permanently into OPTIMIZE MODE next firing.

## Method

C-T1…C-T4 already traced four full end-to-end journeys (customer order, rider shift, onboarding/
KYC, merchant order-intake) under the program's three adversarial conditions, and each of those
traces touches the realtime hooks in passing. C-T5 is the focused pass on the plumbing itself:
every realtime hook the app opens, read start-to-finish, plus the server-side gateway seam they
all talk to — hunting specifically for "what does a client that was gone ~90s actually get back,
and does it cost more bytes than it should." Given the known `lane-bug-hunt` custom-lane tooling
misconfiguration already root-caused at `LC-B-SIB-1..4`/reproduced again at B-T3/B-T4, this ran as
a direct linear trace (not the agentic workflow) across:

- `apps/mobile/src/realtime/socket.ts` (`createSocket`, the one place every mobile hook builds
  its connection)
- `use-order-socket.ts` (customer live tracking), `use-rider-board.ts` (rider board),
  `use-rider-job-socket.ts` (rider active job), `use-rider-location.ts` (rider GPS stream)
- `apps/merchant/app/lib/queue-socket.ts` + `KitchenConnectionProvider.tsx` (merchant presence-only
  socket)
- The server catch-up seam: `apps/api/src/tracking/tracking.gateway.ts`'s `handleConnection`/
  `handleDisconnect`/`subscribeOrder`/`boardSubscribe`/`scanPresence`/`scanCustomerPresence`, plus
  the REST endpoints each hook's reconnect handler calls (`orders.service.ts`'s `activeForRider`/
  `activeForCustomer`/`getSnapshot`).

For each hook: what fires on `connect` vs. `connect_error` vs. `disconnect`; whether room
membership is re-established; whether any state is held ONLY in the socket's live-event stream
with no REST-derivable equivalent (a genuine "gone while it happened = lost forever" risk); and,
per C-T5's explicit brief, the approximate byte cost of what a reconnect triggers.

## Result: reference-quality, matching C-T1–C-T4's bar — zero defects

**Every hook re-syncs on both `connect` and `connect_error`, not just a clean reconnect.** All
four mobile hooks and the merchant presence socket call a REST invalidate/refetch (or re-emit the
room-join) from inside their `connect` handler, and every one of the three data-carrying mobile
hooks (order/board/job) does the SAME on `connect_error` — so a push missed during a dead zone is
caught up the moment ANY successful round trip happens, not just a clean reconnect. Socket.IO does
not persist room membership across a reconnect, and every hook re-emits its subscribe
(`subscribeOrder`/`boardSubscribe`/`merchantQueueSubscribe`) inside the same `connect` handler that
triggers the catch-up refetch, so a client that reconnects to a DIFFERENT server instance (behind
the Redis adapter) still ends up correctly re-scoped.

**The hardest cross-hook case — F-01's rider-bail auto-rebroadcast — is triple-covered.** A rider
bailing on an accepted job cancels the original order and clones a fresh auction under a NEW order
id; a customer sitting on the original order's tracking screen only ever learns the new id via a
live `order:rebroadcast` push. Missing that push while dark could plausibly strand the customer on
a dead "cancelled" screen with no way back to their new auction. It doesn't:
1. A dedicated push notification (`order-lifecycle.service.ts:886-891`) carries
   `data: { orderId: rebroadcastId, kind: "rebroadcast" }` — an OS-level notification independent
   of the socket, tap-routes straight to the new order.
2. `OrdersService.getSnapshot` (`orders.service.ts:796-805`), when the order status is `cancelled`,
   does an on-demand reverse lookup (`rebroadcastOfId`) and exposes the new id as
   `rebroadcastedToId` on the plain REST snapshot — so a bare reconnect-triggered refetch of the
   OLD order (no live event needed) recovers the link.
3. `order/[id].tsx:1001-1013` already reads `order.rebroadcastedToId` from that REST snapshot as a
   client-side fallback, rendering a "follow your re-sent request" button independent of whether
   the live push ever arrived.

**Locally-only resolution state on the rider board self-heals.** `use-rider-board.ts`'s
`expiredOrderIds`/`takenOrderIds` are built purely from live `bid:expired`/`order:taken` pushes —
`healBoard()` on reconnect invalidates `openOrders`/`activeJob` but does NOT re-derive these two
sets (there's no `/offers/mine`-shaped endpoint to derive them from, per `rider-bid-draft.ts`'s own
comment). A rider who bid on an order and then missed its resolving push entirely would be left
with a permanently-counting-down `SentOfferCard`, EXCEPT `SentOfferCard.tsx:44-56` already has a
documented local fallback (`staleClosed`): once the shared auction-close timestamp is >10s in the
past and no `taken`/`expired` prop ever arrived, the card renders a neutral "that window has
closed — if you were picked, it'll show under Active job" message instead of counting forever.
Combined with `activeJob` being invalidated on every board reconnect (so a win is recovered
regardless), this is never a dead end.

**GPS catch-up is deliberately cheap, not lossy.** `use-rider-location.ts` coalesces to the single
FRESHEST fix while disconnected (not Socket.IO's default queue-everything buffer) and flushes it
immediately on reconnect — the customer's map wants "where is the rider now," not a breadcrumb
replay, so a long dead zone costs one fix on reconnect, not N. The server durably flushes the last
live position to PG on `handleDisconnect` (best-effort), so even if the in-memory coalesce/Redis
state is pruned during a long gap, `getSnapshot`'s position resolution
(`live ?? order.rider.currentLat/Lng`) never regresses to nothing.

**The presence watchdog (`scanPresence`) is already hardened against the failure modes a reconnect
audit would normally flag.** Both directions (rider-dark→customer, customer-dark→rider) use
cluster-wide `fetchSockets()` liveness checks to refute a false-positive "dark" reading before
escalating (a rider parked at the pickup produces no GPS fixes but IS connected; a customer on a
peer instance still counts as live), one-shot dedup via a claimed Redis key so a multi-instance
cluster escalates exactly once, and an explicit recovery re-arm loop so a self-healed false
positive doesn't stay stuck showing stale forever. `subscribeOrder`'s `syncCustomerPresenceToRider`
(BH-20, already-landed) additionally reconciles a LATE-joining rider socket to the room's current
truth, closing the one gap a room-broadcast-only design would otherwise have (a socket that
(re)joins after the event fired never receives a past room broadcast).

**Two candidate gaps were traced to ground and both turned out to already be covered or bounded —
neither meets the DEFECT bar (lost work / dead end / double-apply / stale-as-fresh):**

- A rider whose job is cancelled by the customer BEFORE pickup, while the rider's `job:cancelled`
  push is missed (dead zone spanning the exact cancel moment): `activeForRider`'s R8 hand-back
  lookback only resurfaces a cancelled order when `collectedAt` is set (the money-adjacent case —
  the rider is physically holding a parcel that needs handing back), so a pre-pickup cancel
  correctly drops straight to "No active job" with no in-app terminal screen. This looked like a
  silent vanish at first read, but the rider still gets an OS-level push
  (`STATUS_NOTICES.cancelled`, routed to `["customer", "rider"]`) explaining exactly what happened,
  independent of socket/app state — so there's no lost information, just no dedicated in-app
  terminal for a case where (unlike the collected-parcel case) there's nothing left to reconcile.
- `apps/mobile/src/realtime/socket.ts`'s `createSocket` captures the auth token in a static object
  rather than a refreshable callback (detailed in `C-O10`/`LC-C14` below). Traced the actual
  failure window: the access token TTL is 900s (15 min); Socket.IO's own `connect_error` handler
  already fires a REST call on every retry, which self-heals the moment that call 401s and rotates
  the session. The gap only bites during an outage that outlasts 15 minutes AND has no other REST
  activity in between — real, but bounded and self-healing, not a defect.

## 1 CONFIRMED optimization finding — appended to the checklist, not fixed this run

**`LC-C14` / `C-O10`**: `apps/mobile/src/realtime/socket.ts:13`'s `createSocket` passes
`auth: { token }` (a captured object) to `io()`. Socket.IO's internal auto-reconnect (triggered by
a bare network drop, no React re-render involved) replays that SAME object on every retry attempt —
unlike `apps/merchant/app/lib/queue-socket.ts:19-24`'s `createMerchantQueueSocket`, which already
uses an `auth` CALLBACK (`(cb) => cb({ token: loadMerchantSession()?.accessToken ?? "" })`)
specifically so a reconnect after a token rotation authenticates with whatever's current — the
merchant socket's own comment states this exact rationale. The mobile app's four hooks never got
the matching fix. Consistent with how C-O5/C-O6/C-O7/C-O8/C-O9 were triaged (self-heals, no data
loss, real-but-not-urgent), this is ranked #9 (last) on the checklist — lowest priority of the open
items since it needs an outage 10x longer than this program's 90s/600ms-RTT baseline scenario to
ever matter in practice.

## Ledger + doc updates in this PR

- `docs/KNOWN_BUGS.md`: new row `LC-C14` (OPEN → LC-C, C-O10).
- `docs/plans/2026-08-01-low-connectivity-program.md`: `C-T5` ticked with this summary; `C-O10`
  appended to Lane C's optimization checklist (ranked #9, last).

No code changes this run — zero defects met the same-run fix bar. `pnpm typecheck && pnpm lint &&
pnpm test` unaffected (docs-only diff).
