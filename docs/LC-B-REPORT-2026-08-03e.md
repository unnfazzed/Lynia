# LC-B report — 2026-08-03e (Go-class runtime perf)

One LC-B increment today: **B-O8** (OPTIMIZE MODE — every audit territory, B-D0/B-T1..B-T4, was
already checked off before this firing started, so this ran straight from the top of the
optimization checklist per the loop's own selection rule).

## B-O8 — gated the unconditional 1s countdown tickers in the two food-order screens

Both `apps/mobile/app/food/order/[orderId].tsx` (customer) and `apps/mobile/app/rider/food-job.tsx`
(rider) ran a bare `setInterval(() => setNow/setNowMs(Date.now()), 1000)` with an empty deps array
— started on mount, torn down only on unmount, no phase/status gating. Each tick re-renders the
whole screen component regardless of whether anything currently on screen reads the clock. This is
the same anti-pattern `PERF20-02` fixed for the parcel tracker's auction countdown (extracted into
`AuctionClock`, a small self-ticking component so the 1s tick re-renders ~10 lines instead of the
whole screen) — but that sibling-sweep never reached these two food-order files.

**Customer screen.** Since the RF-18 refactor this screen is a thin phase-dispatcher — each
`merchantPhase`/status combination renders one extracted view component
(`FoodOrderAwaitingAcceptView`, `FoodOrderItemApprovalView`, `FoodOrderAwaitingPaymentView`,
`FoodOrderPreparingView`, `FoodOrderLiveTrackerView`) and passes `now` down as a prop. Of the eight
possible render branches, five read `now` (the four merchantPhase views listed above, plus the
post-dispatch live tracker) and three don't (`ready_for_pickup`'s dispatch-searching card,
`undelivered`, `delivered`/`completed`, and `cancelled`). Given the screen is already just
dispatching to pre-extracted view components, threading a self-ticking clock component through five
separate files for the same net effect would have meant touching considerably more surface than
the win justified — gating the one interval on the current phase is equally effective and lower
risk. Added a `needsClock` boolean computed from `order.merchantPhase`/`order.riderId`/
`order.status` (mirroring exactly the same condition each branch below it already checks), and the
effect now returns early instead of starting the interval when `needsClock` is false.

**Rider screen.** `nowMs` feeds exactly two things: `noShowStatus(...)`'s wait-countdown (visible
only once `canReportUnreachable`, i.e. `picked_up`/`en_route_dropoff`) and
`RiderCashHandshakeCard`'s countdown (visible only `en_route_dropoff` + cash + handshake not yet
confirmed) — both reachable only from the screen's main active-job render, below the
`deliveredFood`/`undeliveredFoodReason`/cancelled-and-unacknowledged-handback terminal returns. A
rider can sit on any of those terminal screens for the rest of a shift waiting for the next job —
exactly the "always-mounted, long-lived screen" shape this lane's mandate targets. The interval
effect moved (hooks stay in the same unconditional order every render, so relocating it is safe)
below the state it now depends on, gated by `needsClock = order != null && !deliveredFood &&
!undeliveredFoodReason && !(order.status === "cancelled" && !ackedHandbacks.has(order.id))` — the
exact condition guarding whether the main active-job branch is the one that renders.

**Regression tests.** Both fixes are pinned by spying on `global.setInterval` and asserting whether
a 1000ms interval was created, rather than a render-count assertion — the interval's presence/
absence *is* the whole bug here, unlike a memo-boundary fix where render counts are the more direct
signal. `app/food/order/__tests__/order-screen.test.tsx` gained a new describe block: no interval on
`delivered`, `ready_for_pickup`, or `cancelled`; interval present on `awaiting_accept` and once a
rider is secured. `app/rider/__tests__/food-job.test.tsx` is new — this screen had zero prior test
coverage — with two cases (interval present once the main active-job render is reached; absent with
no active order at all). Confirmed all five (order-screen) / both (food-job) assertions that expect
"no interval" genuinely fail against the pre-fix code (temporarily reverted the two source files,
re-ran, saw the expected failures, restored the fix) before landing, matching this lane's
regression-pin discipline.

No wrong output before or after this fix — pure JS-thread churn removed. `pnpm typecheck && pnpm
lint && pnpm test` all green (720 mobile + 1516 API tests, including the 7 new regression tests
above).

## Next firing

B-O8 is now ticked. The next unchecked optimization item in checklist order is `B-O11` (KYC/pickup-
photo preview images rendering the undownscaled camera capture instead of the already-produced
upload asset) — re-ranked to #5 by the 2026-08-03 steer, real avoidable peak-memory pressure in the
single most OOM-sensitive flow in the app, S-effort, no native-build dependency.
