# LC loop C — offline & 2G resilience — 2026-08-04c

**Mode:** OPTIMIZE (all 5 audit territories C-T1…C-T5 already checked; every Day-0 defect
C-D0a…C-D0e already fixed; C-O5, C-O6, C-O7, C-O8 already done). First unchecked checklist item:
**C-O9** (`LC-C13`).

## What shipped

`NewOrderTakeover` (`apps/merchant/app/components/queue/NewOrderTakeover.tsx`) is the merchant
tablet's full-viewport NEW ORDER alarm — Accept/Reject a fresh order within its 3-minute accept
deadline. Its `submitAccept`/`submitReject` handlers each `await` the mutation, and on success
simply re-enable the buttons (`QueueBoard`'s `withRefetch` wrapper already awaits the follow-up
queue refetch end-to-end before `onAccept`/`onReject` resolves, so by the time the success branch
runs, the board has already re-derived `active` from a fresh snapshot).

The catch branch had no equivalent. A 409 — the order auto-expired, or a lost-then-landed prior
request already accepted/rejected it server-side — set a local error string and re-enabled the
buttons immediately, with **no refetch**. The stale, already-resolved order's Accept/Reject
buttons stayed tappable on a visually-unchanged screen until the next ambient queue poll (≤5s,
`POLL_INTERVAL_MS`) or a `visibilitychange` refetch happened to clear it — self-healing (the
server's per-order CAS turns a mistaken retry into a harmless second 409, never a double-apply),
but a real, reproducible "nothing happened, tap again" confusion window on a slow reconnect —
exactly the class of gap C-T4's audit was scoped to find.

### Fix

Aligned the error path with the rider-side reconcile pattern already established for this exact
problem shape (`apps/mobile/app/rider/job.tsx:283`, and mirrored server-side by `QueueBoard`'s own
`withRefetch`):

- `NewOrderTakeover` now takes a `refetch: () => Promise<void>` prop.
- `QueueBoard` passes its own `refetch` (the same function every `withRefetch`-wrapped handler
  already awaits) straight through at the one call site that renders `NewOrderTakeover`.
- Both `submitAccept`'s and `submitReject`'s catch blocks now `await refetch()` — after setting the
  error string, before re-enabling `submitting` (and, for reject, before dismissing the reject
  sheet). A stale, already-resolved order now clears itself as soon as the error-path refetch
  lands: `QueueBoard` re-derives `active` from `groups.awaitingAccept` on the fresh snapshot, the
  resolved order drops out of it, and `NewOrderTakeover` unmounts — instead of sitting there with a
  live error banner and re-enabled buttons until the ambient poll happens to catch up.
- If the failure is a genuine, still-open error (network blip, real validation failure), the
  refetch is a no-op: the same order comes back in `awaitingAccept`, the error banner and
  re-enabled buttons stay exactly as before — no regression to the ordinary retry path.

### Why this is safe

- No new mutation, no new idempotency surface — `refetch()` is the same read-only GET every other
  handler in `QueueBoard` already calls after every mutation, success or failure now alike.
- `submitting` still gates both buttons for the full duration of the catch block (error → refetch →
  re-enable), so the confusion window this closes can't be reopened by a fast double-tap racing the
  refetch itself.
- Prop is required, not optional — the only render site (`QueueBoard.tsx`) was updated in the same
  change, so there's no silently-undefined-refetch path to fall through.

## Regression tests

New `describe` block in `apps/merchant/app/components/queue/QueueBoard.test.tsx`
("QueueBoard NEW ORDER takeover refetches on a failed accept/reject too — C-O9 (LC-C13)"):

1. **Refetches after a failed accept** — `acceptOrder` rejects once; asserts `refetch` was called
   exactly once.
2. **Clears a stale takeover once the post-error refetch shows the order already resolved** — uses
   the existing `Harness` (whose `refetch` drops the order that was `awaiting_accept`, standing in
   for a 409 where the order had in fact already resolved server-side); asserts the takeover's
   order label is gone after the failed accept, rather than sitting stuck.
3. **Refetches after a failed reject** — drives the real `RejectSheet` UI (open → pick a reason →
   confirm), `rejectOrder` rejects once; asserts `refetch` was called exactly once.

Confirmed all three fail against the pre-fix code (verified via a local `git stash` of just the
`NewOrderTakeover.tsx`/`QueueBoard.tsx` changes, tests re-run, then restored) — the two `refetch`
call-count assertions time out because `refetch` is never called, and the stale-clears assertion
times out because the resolved order's `#FIRST` label never disappears.

`pnpm --filter merchant test` — 26 files / 183 tests green (was 25 files / 179 tests before the 3
new cases + 1 shared import addition). Full monorepo `pnpm typecheck && pnpm lint && pnpm test`
green.

## Ledger

- `docs/KNOWN_BUGS.md`: `LC-C13` row updated OPEN → **FIXED** (2026-08-04c, C-O9).
- `docs/plans/2026-08-01-low-connectivity-program.md` §5 Lane C: `C-O9` ticked done.

## Next Lane C checklist item

`C-O1` (ALR-09 offline mutation UX — explicit queued/failed/retry states) is next in the
optimization queue, followed by `C-O2` (central network policy), `C-O4` (MicroCache serve-stale
mode), `C-O10` (mobile socket auth-callback pattern).
