# LC-D report — 2026-08-03c (journey & soundness sweep)

Eighth LC-D firing. D-T1 (admin console journey sweep) is checked, so per §5 Lane D's mode-select
rule this firing sweeps the next unchecked audit territory, **D-T2: merchant app journey sweep**
(`apps/merchant` — login → shift → intake loop, through the tablet lens).

## Tooling note: the `lane-bug-hunt` custom-lane misfire recurred

Invoked the `lane-bug-hunt` skill with a custom D-T2 lane (four lenses: login-auth,
shift-reachability, order-intake, recovery-resilience) the same way `LC-B-SIB-1..4` and D-T1's own
first attempt were produced. It again silently ran the hardcoded **wallet** lane instead of the
custom one — the `Skill` → `Workflow` handoff re-serializes `args` as a JSON **string** by the time
it reaches the generated script, and that particular script's `resolveLane()` only special-cased a
live object, so the string fell through to `LANES.wallet`. (D-T1's report already patched
`resolveLane()` once for its own regenerated script instance; each `lane-bug-hunt` invocation
persists a fresh script file, so the fix doesn't carry forward between runs — a real gap in the
skill itself, not something a single LC-D firing can close for good.)

Rather than re-run/patch the workflow again, swept D-T2 directly with four parallel `Explore`
agents (one per lens, each told what's already fixed in this lane so they wouldn't re-flag it),
then personally verified every candidate against the live code before fixing anything.

The misfired wallet-lane run still produced 4 adversarially-verified (3/3 REAL-high each) findings
in `apps/api`'s admin-riders/admin-customers/food-debt services and a mobile-client `isError`-drop
pattern — all genuine, all outside D-T2's merchant-journey mandate and touching sensitive money/
trust-lane code (admin punitive actions, cash-handshake reconciliation) that shouldn't ship
unreviewed from an off-mandate tooling misfire. Ledgered as `LC-D-SIB-1..4`, **OPEN**, flagged for
the wallet & data-lifecycle audit routine — same treatment `LC-B-SIB-1..4` got, not fixed here.

## D-T2 sweep: 7 CONFIRMED defects, all fixed this run

### LC-D11 (HIGH): mutation catches never signed out on a dead session

Hours/Shop/Menu's mutation handlers (`onSave`, `onToggleBusy`, `withSheet`, `onCreateStarterCategory`,
`onClearOos`) only ever set an inline error message on failure — none of them checked for a
dead-session 401 and called `signOut()`, unlike their own initial-load effects (which already did)
and the queue screen's dedicated `useEffect` listener. A mutation hitting a dead session (a real
scenario over a long low-connectivity shift) left the merchant staring at "Your session expired —
sign in again." with no button anywhere on the page to act on it. Retrying made it worse, not
better: the second attempt hit `authedFetch`'s early `if (!session) throw new ApiError(401, "Not
signed in.")` guard (the cookie was now cleared client-side too), so the merchant saw a *different*,
more confusing message with no visible state change.

**Fix.** Added a shared `isSessionExpiredError(err)` helper to `api-client.ts` (any 401 → treat as
"go sign in again," mirroring the pattern every initial load already used) and wired it into all 7
mutation catches across the three pages, so this can't drift per call site again the way it did
here. Regression tests: two new cases in `hours/page.test.tsx`, two in the new `shop/page.test.tsx`,
one new case in `menu/page.test.tsx` (covering `withSheet` via category delete, plus the two
already-tested call sites).

### LC-D12 (HIGH, CRITICAL on Queue): no retry affordance on any initial load

None of Queue/Menu/Shop/Hours/Statement's initial-load error states had a retry button, and nothing
re-triggered the load on reconnect — the only way out of a failed load was navigating to a
different tab and back, which remounts the page and re-fires the effect. Worst on Queue:
`useQueuePoll(state.status === "ready")` gates the entire order poll + alarm loop behind that
one-time `getMyMerchant()` call succeeding. A single dropped request at mount (a tablet reboot
reconnecting in a dead zone, or the merchant walking to a bad-signal corner of the kitchen)
permanently killed the alarm — no orders ever populate, no alarm ever arms — even once the network
fully recovered, since nothing re-fetches on reconnect. This is the same failure class `LC-C04`/
`LC-D02` were rated CRITICAL for ("the board freezes/goes dead with no recovery"), just moved one
level up the mount chain instead of inside the poll itself.

**Fix.** All five pages get a manual "Retry" button in their error render, calling the same loader
the initial effect uses (extracted to a stable `useCallback` where it wasn't already one). Queue
additionally gets an automatic retry the instant `ReachabilityStore` reports reachable again while
still stuck on the error screen (keyed on `reachability.reachable` alone, not `state.status`, so it
fires once on the recovery transition rather than looping) — it's the alarm loop itself, so it can't
wait on the merchant noticing a button. Regression tests: new `queue/page.test.tsx` (manual retry +
auto-retry-on-reconnect), new `shop/page.test.tsx` and `statement/page.test.tsx` (manual retry), a
new case each in `hours/page.test.tsx` and `menu/page.test.tsx`.

### LC-D13 (HIGH): a reachability race could permanently strand the store unreachable

`ReachabilityStore.scheduleActiveProbe()`'s success branch called a bare `scheduleActiveProbe()`
instead of the full `reportReachable()` path. If a concurrent `reportUnreachable()` (a failed app
request) flipped `state.reachable` to false while an active probe was already in flight,
`scheduleProbe()` (called by that `reportUnreachable()`) bailed out because `probing` was still
true; when the in-flight probe then resolved `ok`, the bare rescheduling call's own
`!state.reachable` guard rejected it too. Net result: no timer of any kind ever got armed again —
the store stayed permanently stuck reporting unreachable, freezing every mutating control app-wide
(`actionsDisabled`) with a header that kept claiming "reconnecting automatically (attempt N)" while
`attempt` sat frozen and nothing was actually retrying.

**Fix.** The success branch now calls `this.reportReachable()`, which always reschedules from the
current state instead of relying on a guard that can be stale by the time it runs. Regression test
in `reachability.test.ts` constructs the exact race (active probe in flight, concurrent
`reportUnreachable()`, probe resolves `ok`) and asserts the store still recovers on its own clock
afterward — confirmed it hangs forever against the pre-fix code.

### LC-D14 (MEDIUM): a network throw during `/auth/refresh` was never reported into reachability

`doRefresh`'s "transient" outcome collapsed a genuine network-level throw (the server was NOT
reached) and a live 5xx response (the server WAS reached) into one value, so `authedFetch` had no
way to tell them apart and never reported the network-throw case into `ReachabilityStore` at all —
the call site's own comment claimed the function's other request attempts would catch it, which is
false for a throw inside a third, separate request `doRefresh` makes itself. The header could keep
showing "Connected" for up to the 20s active-probe interval while the link was actually down, on any
page with no poller of its own (Hours/Shop/Menu/Statement).

**Fix.** `RefreshOutcome`'s `transient` variant now carries `networkError: boolean`, set at both
`doRefresh` return sites; `authedFetch` reports `reportUnreachable()`/`reportReachable()`
accordingly. Regression tests in `api-client.test.ts`: one asserting `reportUnreachable` on a
network throw during refresh, one asserting `reportReachable` (not `reportUnreachable`) on a live
5xx during refresh.

### LC-D15 (LOW): the photo-upload PUT was a reachability blind spot

`uploadPhotoBlob` deliberately bypasses `authedFetch` (a raw binary PUT with no bearer token) —
correctly so, but that also meant it never fed the shared `ReachabilityStore`. A network-level drop
mid-upload (PhotoPicker's own error+retry UI handled the upload failure itself fine) never flipped
the connectivity pill, the one blind spot left in the surface `LC-D04` otherwise closed.

**Fix.** `uploadPhotoBlob` now calls `reportUnreachable()`/`reportReachable()` directly, mirroring
`authedFetch`'s own wiring. Regression tests in the new `menu-api.test.ts`.

### LC-D16 (HIGH, security-relevant): `RiderSecuredTakeover` missing `key` could leak a stale pickup code onto a different order

`RiderSecuredTakeover` rendered with no `key` in `QueueBoard.tsx`, unlike its sibling takeovers
(`NewOrderTakeover key={active.id}`, `NoRiderHoldTakeover key={holdToShow.id}`). If a second order
was already rider-secured at the moment the first was dismissed — plausible any time dispatch
secures two riders back-to-back during a busy stretch, with no intervening render where
`securedToShow` was null — React reused the same component instance instead of remounting it: the
local `pickupCode` state kept the FIRST order's real code while the label switched to the SECOND
order, and stayed wrong indefinitely if the second order's own `revealPickupCode()` call errored. A
merchant handing off the second order could read the first order's real pickup code to the wrong
rider at the counter.

**Fix.** Added `key={securedToShow.id}`, forcing a full remount at the order boundary exactly like
its siblings. Regression test in `QueueBoard.test.tsx`: renders two simultaneously-secured orders,
dismisses the first with the second's own `revealPickupCode()` deliberately left pending, and
asserts the first order's real code never bleeds into the second's card.

### LC-D17 (MEDIUM): Accept/Reject buttons re-enabled before the post-mutation refetch landed

`withRefetch`'s `refetch()` call was fire-and-forget. `NewOrderTakeover.submitAccept`/`submitReject`
`await onAccept(...)`/`await onReject(...)` resolved as soon as the mutation's own HTTP round trip
finished — well before the follow-up queue GET (the thing that actually removes the order from
`awaitingAccept`) landed. The buttons re-enabled on a screen still visually showing the same,
just-handled order for however long that refetch took (plausibly 1-2+ seconds on this program's
300-600ms-RTT/dead-zone links), inviting a "nothing happened, tap again" retry that the server's
atomic per-order CAS turned into a scary but harmless 409 — plus a wasted request on a metered
link. Self-healing, not a permanent limbo, but a real, reproducible confusion defect.

**Fix.** `refetch()` is now awaited end-to-end: `useQueuePoll.fetchOnce` returns its own promise
(was previously voided at the call site), and a caller that can't acquire the in-flight latch (the
coalesced case `LC-C05` already handles) now queues a resolver that fires only once its coalesced
follow-up fetch actually completes, instead of resolving the instant `tryAcquire()` fails. This
extends the same protection to every other `withRefetch`-wrapped action (mark-ready, payment
actions, hold resume/cancel, returns), not just accept/reject, for free. Regression tests: a new
case in `QueueBoard.test.tsx` (asserts the Accept button stays disabled until a deliberately-delayed
refetch resolves) and a new case in `use-queue-poll.test.ts` (asserts an awaited coalesced `refetch()`
doesn't settle until its follow-up fetch actually lands).

## Verification

`pnpm install` (fresh checkout) + `prisma generate` (apps/api's generated client was missing after
install), `pnpm typecheck` (6/6 packages green), `pnpm lint` (5/5 — only the one pre-existing,
unrelated `admin-orders.service.spec.ts` `no-shadow` warning noted in every prior LC-D report this
program), `pnpm test` (6/6 packages green — 1516 API, 679 mobile, 165 merchant including every new
case above, admin/design/shared).

## Ledger

`docs/KNOWN_BUGS.md`: added LC-D11 through LC-D17 as FIXED rows, and LC-D-SIB-1..4 as OPEN rows
(the tooling-misfire findings, flagged for the wallet & data-lifecycle audit routine).

## Not done this run

D-T2's audit territory box is now checked. The next LC-D firing takes the next unchecked audit
territory in order: D-T3 (notification/deep-link coherence under low connectivity).
