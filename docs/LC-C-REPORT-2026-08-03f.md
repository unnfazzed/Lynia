# LC-C report — 2026-08-03f (offline & 2G resilience)

Ninth LC-C increment. Phase 0: read `docs/plans/2026-08-01-low-connectivity-program.md` on main —
all five Lane C audit territories (C-T1…C-T5) are already checked, so Lane C is in **OPTIMIZE
MODE**. Checked open `claude/*` PRs: none from this lane (`claude/lc-c*`) — no in-flight work to
babysit. Read `docs/KNOWN_BUGS.md` — LC-C07 (this run's target) was ledgered OPEN by the 2026-08-02
C-T1 audit; LC-C08/09/10/11/13 (the other open Lane C findings) are untouched by this run and stay
OPEN for future firings.

Took the first unchecked Lane C optimization item: **C-O5 (LC-C07)**.

## The gap

`apps/mobile/app/rider/job.tsx`'s `deliverM` mutation (the rider's delivery-code confirm) only
ever called `saveRiderJobTerminal({ orderId, kind: "delivered" })` from inside `onSuccess` or the
409-reconciled branch of `onError` — i.e. only once a response had actually been processed. A
`confirmDelivery` request that reached the server and succeeded, but whose response the client
never got to process (an app kill, not just a lost network response, sitting strictly between the
request going out and the response arriving) left **no marker at all**.

That matters because `reconcileRiderJobTerminal()` (`apps/mobile/src/logic/rider-job.ts:110`) is a
pure PROMOTION function — it only ever surfaces an *existing* persisted marker once the order has
left the active feed (`hasActiveOrder` false). With no marker to promote, a relaunch after that
exact kill window saw: `getActiveOrder` returns `null` (the order is genuinely `delivered`
server-side, so it's no longer active) + no persisted terminal → straight to the dead-end "No
active job" screen, with zero acknowledgement the parcel arrived and no "rate the sender"
affordance ever surfaced. The order itself was never at risk (CAS-guarded, correct in Trip
History) — purely a lost terminal-UX recovery, the same class of gap C-O5's siblings on this
checklist (C-O7/C-O8) already describe for other rider-screen markers.

## Fix

Write the marker **provisionally in `onMutate`**, before `confirmDelivery` fires, then decide
whether to keep or roll it back once a response (if any) arrives:

- **Success** → marker is already durable from `onMutate`; no rewrite needed.
- **409, reconciled via `getOrder` to `delivered`/`completed`** → same; the reconciled snapshot
  confirms the marker was right all along.
- **409, reconciled to anything else** → **roll back** (`clearRiderJobTerminal()`) — the direct
  `getOrder` check is a definitive signal this specific attempt did not deliver.
- **401 (wrong code) / 403 (lockout)** → **roll back** — both are definitive non-409 rejections;
  this attempt did not deliver.
- **The 409-reconciliation `getOrder` call itself fails (still offline)**, or **any other error**
  (network throw, timeout, 5xx) → **leave the marker in place**. This is the genuinely ambiguous
  case (did the request land or not?), and it's safe to leave inert: `reconcileRiderJobTerminal`
  only promotes once `hasActiveOrder` is false, so a marker sitting there for a request that in
  fact failed just does nothing while the order stays active. If the request actually *had* landed
  silently, the marker is exactly what recovers the acknowledgement screen once the order leaves
  the active feed on the next refetch.

This mirrors the same "write the durable signal before the network round-trip, not after" pattern
already used elsewhere on this screen (the pickup-item confirmation marker, the rate-the-sender
marker) and the doctrine the C-T1 finding itself named for this fix ("promoted to final on
success, rolled back only on a definitive non-409 rejection").

No server-side change — `apps/api/src/orders/order-lifecycle.service.ts:343` (`confirmDelivery`'s
CAS) was already correct and untouched; this is purely a client-side terminal-UX recovery fix.

## Regression test

New `apps/mobile/app/rider/__tests__/job.test.tsx`, following the existing full-screen-render
pattern (`app/food/order/__tests__/order-screen.test.tsx`, `app/profile/__tests__/setup.test.tsx`):
mocks only the API/router/storage/socket edges and drives the real `RiderJob` screen plus the real
`src/auth/session`/`src/auth/device-state` persistence layer (backed by an in-memory
`expo-secure-store` mock), so the test exercises the actual `saveRiderJobTerminal`/
`loadRiderJobTerminal`/`reconcileRiderJobTerminal` codepath, not a stub of it.

1. **Kill-mid-request case**: renders the screen at `en_route_dropoff`, enters a delivery code, and
   taps "Confirm delivery" against a `confirmDelivery` mock whose promise never resolves (the app
   is "killed" — the response is never processed). Asserts the durable marker is already on disk
   before any response could have arrived. Unmounts (the kill), points `getActiveOrder` at `null`
   (the delivery had, in fact, landed server-side), and remounts (the relaunch) — asserting the
   acknowledgement/rate-the-sender terminal renders, not the dead-end "No active job" screen.
   Confirmed this fails against the pre-fix code: with the marker only written in `onSuccess`,
   which never fires here, the relaunch has nothing to promote.
2. **Definitive-rejection rollback case**: same setup, but `confirmDelivery` rejects with a 401
   (wrong code). Asserts the provisional marker is cleared, so a genuinely-failed attempt can never
   later falsely promote to the delivered terminal.

## Verification

`pnpm --filter mobile typecheck && pnpm --filter mobile lint && pnpm --filter mobile test` —
all green, including the new test file (2 new tests) and the pre-existing
`src/logic/__tests__/rider-job.test.ts` suite (24 tests, `reconcileRiderJobTerminal` itself
unchanged).

## Ledger

- `docs/KNOWN_BUGS.md`: LC-C07 marked **FIXED** (2026-08-03f).
- `docs/plans/2026-08-01-low-connectivity-program.md` §5 Lane C: C-O5 ticked, marked **DONE
  (2026-08-03f)**.

Lane C's next unchecked optimization item is C-O6 (LC-C08, `order/[id].tsx`'s `selectM` 409-error
copy) — left for the next firing, per the one-increment-per-run discipline.
