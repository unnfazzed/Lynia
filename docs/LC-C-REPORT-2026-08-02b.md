# LC-C report — 2026-08-02b (offline & 2G resilience)

Third LC-C increment. Fixes the last remaining Day-0 defect on the lane's checklist
(`docs/plans/2026-08-01-low-connectivity-program.md` §5 Lane C, C-D0e / ledger `LC-C05`) — this
run had no in-flight lane-C PR to babysit (Phase 0 check) and no Day-0 defects left unfixed after
this one, so the next firing moves into AUDIT MODE at C-T1 (customer order journey).

## Fixed — LC-C05 (MEDIUM): dropped post-mutation refetch + no response sequencing guard

**Defect.** `apps/merchant/app/lib/use-queue-poll.ts`'s `fetchOnce` used `InflightLatch.tryAcquire()`
as a plain "skip if busy" gate: `QueueBoard`'s post-accept/reject `refetch()` call (the thing that's
supposed to pull the just-answered order out of the "New" column) silently no-oped whenever it
landed while the 5s interval poll — or the `visibilitychange` refetch — happened to already be in
flight. The mutation itself succeeded server-side, but the client kept showing the pre-mutation
order in `NewOrderTakeover` until the next unlucky-timing-free interval tick, up to 5s later, looking
like the accept/reject silently failed. Separately, there was no sequencing guard on which
`listQueue()` response was newest: the only way two requests could ever be genuinely concurrent is
via the latch's own 25s stale-override backstop (a request that outlives even that window, past the
API client's 10s transport timeout — LC-C02/C04), but if that ever happened, an older response
arriving after a newer one would silently overwrite fresher state — the scenario the ledger
describes as "an answered NEW ORDER takeover resurrects and re-rings."

**Fix** (`apps/merchant/app/lib/use-queue-poll.ts`):
1. **Coalesced trailing refetch.** `fetchOnce` now sets a `pendingRef` flag instead of dropping the
   call when the latch is busy. The in-flight request's own `finally` checks that flag and, if set,
   immediately fires one more `fetchOnce()` right after releasing the latch — so a post-mutation
   refetch that lands mid-poll still gets its round trip, just deferred by however long the poll had
   left to run, never dropped.
2. **Generation sequencing.** A monotonic `generationRef` counter is bumped every time a request
   actually starts (i.e., acquires the latch). Each request's response is only applied to
   `orders`/`error` state if its generation still matches the latest — a response from a superseded,
   out-of-order request is discarded rather than clobbering newer state. Reachability reporting
   (`reportReachable`/`reportUnreachable`) still runs unconditionally per response, since even a
   stale response is still proof the network was up at some point.

Both changes are additive to the existing latch/timeout stack from LC-C02/C04 — no call-site changes
in `QueueBoard.tsx` or `orders-api.ts`.

**Verification:** new `use-queue-poll.test.ts`, two cases:
- "coalesces a refetch requested while a poll is in flight instead of dropping it" — asserts the
  second `listQueue()` call only fires after the first settles, and the resulting state reflects the
  second call's data.
- "discards a stale out-of-order response instead of clobbering fresher state" — forces the latch's
  25s stale-override via `vi.advanceTimersByTimeAsync`, resolves the newer (generation 2) response
  first, then the older (generation 1) response after, and asserts state still reflects the newer
  one.

Both were confirmed to fail against the pre-fix code (`git stash` the fix, re-run — the first
assertion in each test fails: `expected "vi.fn()" to be called 2 times, but got 1 times` and
`expected [{ id: 'stale' }] to deeply equal [{ id: 'fresh' }]` respectively) before being confirmed
passing with the fix applied.

## Verification (whole repo)

- `pnpm --filter api exec prisma generate` (an ungenerated Prisma client was failing `apps/api`
  typecheck in this environment — unrelated to this change, same environment gap noted in the prior
  LC-C report, fixed so the full-repo gates could run clean).
- `pnpm typecheck` — clean across all 6 workspaces.
- `pnpm lint` — clean in `@lynia/merchant` (0 warnings, 0 errors); one pre-existing unrelated
  `no-shadow` warning in `apps/api/src/admin/admin-orders.service.spec.ts`, untouched by this PR.
- `pnpm test` — 1500/1500 passing in `@lynia/api`, 668/668 in `@lynia/mobile`, and all of
  `@lynia/merchant`/`@lynia/admin`/`@lynia/shared` green (111/111 in `@lynia/merchant` across 16
  test files, including the 2 new `use-queue-poll.test.ts` cases).

## Not done this run (LC-C's scheduled work)

All five C-D0 Day-0 defects are now fixed. The C-T1..T5 journey audits and C-O1..O4 optimizations
remain on the Lane C checklist — the next firing starts AUDIT MODE at C-T1 (customer order journey:
create → auction → accept → tracking → delivery code).
