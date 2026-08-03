# LC-C report — 2026-08-03c (offline & 2G resilience)

Seventh LC-C increment. Phase 0: no in-flight `claude/lc-c*` PR to babysit, and all five Day-0
defects (C-D0a…e) plus the first three audit territories (C-T1, C-T2, C-T3) were already closed by
prior firings — so this run stays in **AUDIT MODE** and takes the next unchecked audit territory,
**C-T4: merchant order-intake on a tablet over mobile data (miss-an-order risk when dropped)**.

## Method

Dispatched a read-only Explore pass over the merchant order-intake surface — the new-order
delivery channel (poll vs. socket), the alarm-trigger logic, the 3-min accept-window countdown
(client vs. server truth), full app-kill/relaunch recovery, and the accept/reject mutation's
behavior on a connection drop mid-request — cross-checked against every prior LC-C/LC-D fix already
landed on this same surface (LC-C02…C05, LC-D02/D03/D12/D16/D17), since this territory has already
absorbed six prior fixes and the goal here was finding what's genuinely still open, not
re-litigating closed ground.

## Result: new-order delivery is reference-quality; one presence-check defect found and fixed

- **Delivery channel**: the 5s poll (`use-queue-poll.ts`) is the sole, working new-order delivery
  mechanism today — no merchant-app code anywhere opens a Socket.IO connection (confirmed by a
  repo-wide grep), so there is no "socket disconnects, poll also silently fails" compound risk to
  worry about for delivery specifically: there was only ever one channel.
- **Alarm**: purely derived every render from `unansweredCount` (`queue/page.tsx:66-71`), never an
  edge-triggered "just detected a NEW order" concept — `alarm.ring()`/`silence()` are idempotent, so
  the alarm correctly re-arms on two orders landing back-to-back, an out-of-order poll response
  (already guarded by `use-queue-poll.ts`'s generation counter before `orders` is ever updated), or a
  background→foreground cycle (the existing `visibilitychange` refetch re-derives it).
- **3-min accept countdown**: rendered straight from the server's own `acceptDeadlineAt` ISO
  timestamp on every poll (`countdown.ts`'s `msUntil`) — the client never invents or locally ticks
  a deadline, so it cannot drift out of sync with server truth by construction.
- **Full app/tab kill + relaunch** while an order is `awaiting_accept`: `useQueuePoll` fires
  immediately once ready, `NewOrderTakeover` is keyed per order (`key={active.id}`) so it remounts
  cleanly, and the countdown recomputes fresh from the server deadline — no manual navigation
  trick needed, no double-counting risk since nothing about the countdown is client-tracked state.
- **Accept/reject CAS**: `acceptOrder`/`rejectOrder` (`food-order.service.ts`) are both
  `updateMany`-on-precondition CAS writes — a retry after a lost-but-successful response always
  409s rather than double-applying. Structurally safe.

**One genuine defect found and FIXED this run — LC-C12**: `sweepExpiredAcceptWindows()`
(`food-order.service.ts:575-608`, N-03, "unanswered merchant accept auto-cancels — never a silent
hang," D-13) deliberately pauses a past-deadline order's clock instead of cancelling it when
`TrackingGateway.isMerchantOnline(merchantId)` reports the tablet as disconnected — a documented,
correct design (D-16: don't punish a merchant for missing a window they physically couldn't see).
`isMerchantOnline()` checks whether any socket has joined `merchantQueueRoom(merchantId)`
(`tracking.gateway.ts:482-490`). But per the delivery-channel finding above, **no merchant-app code
anywhere ever emits `WS_EVENTS.merchantQueueSubscribe`** — `use-queue-poll.ts`'s own comment
concedes "Lane C5 (kitchen realtime socket) hasn't merged yet." The presence check therefore
returns `false` for every merchant, always, regardless of whether their tablet is fully online and
polling fine over HTTP. Consequence: the "merchant is dark, pause the clock" branch fires
unconditionally on every sweep tick (every 20s), and a past-deadline `awaiting_accept` order
**never** reaches `commitStaleCancellation` — D-13's "never a silent hang" guarantee has been
silently unenforced since the presence channel was added, for connected and disconnected merchants
alike. This is a real "dead end" (an ignored order sits forever, un-expired) rather than a
delayed-but-eventually-consistent issue, and it sits squarely in this lane's resilience mandate:
the whole point of the presence channel is to distinguish "genuinely offline" (fair, pause) from
"online but ignoring it" (should auto-cancel) — and that distinction was structurally impossible to
make.

**Fix**: added `apps/merchant/app/lib/queue-socket.ts` — a Socket.IO client connection scoped
purely to presence, not new-order delivery (which stays exactly as-is on the 5s poll). Its `auth`
option is a callback that reads `loadMerchantSession()?.accessToken` fresh at each
connect/reconnect attempt, not a token captured once, so a reconnect after the original access
token has rotated still authenticates correctly. `KitchenConnectionProvider` opens this connection
whenever a session exists, emits `WS_EVENTS.merchantQueueSubscribe` on every `connect` event
(mirroring the codebase's own established mobile pattern of re-subscribing inside the `connect`
handler itself, since Socket.IO does not persist room membership across a reconnect — a poll-only
merchant tablet's socket will reconnect after every dead zone, and each reconnect needs to rejoin
the room), and disconnects the socket on sign-out/unmount so a closed tablet stops reporting itself
online. No server-side code changed — the gateway's `isMerchantOnline`/`sweepExpiredAcceptWindows`
logic was already correct; it only ever needed a real client to join the room it checks.

**Sensitive-lane doctrine** (this affects `sweepExpiredAcceptWindows`, an `apps/api/src/merchant`
order-lifecycle path, once a real merchant tablet actually joins the room it checks):

1. **Idempotency** — no new mutation was added. The existing CAS in `sweepExpiredAcceptWindows`
   (`updateMany` on `{id, status:"requested", merchantPhase:"awaiting_accept", acceptDeadlineAt}`
   for the pause branch, `commitStaleCancellation`'s own CAS for the cancel branch) is unchanged
   and already exactly-once; this PR only makes the presence signal that branch consults true.
2. **State transition** — no new transition. `awaiting_accept` (`requested`) → `cancelled` via
   `commitStaleCancellation(reason: "shop_closed")` already exists in
   `order-lifecycle.transitions.ts` and was already reachable (and tested) for a genuinely-offline-
   turned-online-and-still-silent merchant path before this change on paper; in practice it could
   never fire for ANY merchant because the presence check was always false. This PR restores an
   already-designed, already-tested edge to actual reachability — it does not add one.
3. **Money arithmetic** — none; no money math touched.
4. **Regression test** — `apps/merchant/app/components/KitchenConnectionProvider.queue-socket.test.tsx`
   (new): asserts the provider opens the queue socket once signed in, emits
   `WS_EVENTS.merchantQueueSubscribe` on `connect`, re-emits it on a second `connect` (a reconnect —
   Socket.IO re-fires `connect` on every one, not just the first), and disconnects on unmount.
   Confirmed all three fail against the pre-fix code (no socket was ever created — `queue-socket.ts`
   didn't exist).

## One narrow new gap — appended to the optimization checklist, not force-fixed

**LC-C13 / C-O9**: `NewOrderTakeover.submitAccept`/`submitReject`'s catch block sets a local error
string and re-enables the Accept/Reject buttons on a 409 (or any rejection) but never calls
`refetch()` — unlike the success path (`withRefetch`, already fixed under LC-D17), which awaits a
refetch end-to-end. The stale, already-resolved order's buttons stay tappable until the next
ambient queue poll (≤5s) or a `visibilitychange` refetch removes it from `awaitingAccept`. This
self-heals within that window, and the server's per-order CAS turns a mistaken retry into a
harmless 409 (no double-apply) — but it's a real, reproducible confusion window on a slow
reconnect, matching the bar the lane already applied to C-O5/C-O6/C-O7/C-O8: appended to the
checklist rather than force-fixed under this run's single-increment scope.

## Verification

`pnpm --filter @lynia/merchant typecheck`/`lint`/`test` all green (168 tests, 24 files, including
the 3 new regression tests). Full-monorepo `pnpm typecheck`/`pnpm lint`/`pnpm test` also run: after
generating the Prisma client (a one-time local sandbox setup step, unrelated to this diff),
`@lynia/api` typecheck/test are green (1516 tests); `@lynia/mobile` test is green (684 tests) but
its `tsc --noEmit` and `@lynia/admin`'s both fail on pre-existing `@types/react` version-hoisting
errors confirmed present on `origin/main` with this branch's diff stashed out — unrelated to this
change, not introduced by it, and not touched by this PR's scope (neither app's code was modified).
`pnpm lint` is clean across every package (one pre-existing unrelated `no-shadow` warning in
`@lynia/api`'s test suite, also present without this diff).
