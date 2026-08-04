# LC loop D report — 2026-08-04d

**Increment:** D-O4 (`LC-B-SIB-2`) — rider Money-tab wallet ledger pagination.

## Phase 0 orientation

- `docs/plans/2026-08-01-low-connectivity-program.md` exists on `main`; read in full.
- No open `claude/lc-d*` PR — nothing to babysit.
- Read `docs/KNOWN_BUGS.md`. Every Lane D checklist section (Day-0 defects D-D0a–f, audit
  territories D-T1–T5, optimization items D-O1–O3) was already checked `[x]` — Lane D's §5
  checklist was, on its face, exhausted.
- Before treating that as a self-disable condition, swept `docs/KNOWN_BUGS.md` for OPEN rows
  explicitly flagged to Lane D that hadn't yet been folded into the checklist (the dedup protocol's
  sibling-sweep read). Found `LC-B-SIB-2`, found incidentally by Lane B's 2026-08-03 tooling
  misfire and explicitly tagged `OPEN — flagged for Lane D (extends LC-D07's scope to the mobile
  client) or the wallet & data-lifecycle audit routine`. The other three off-lane siblings from that
  same sweep (`LC-D-SIB-2/3/4`) are explicitly flagged to the wallet & data-lifecycle audit routine
  instead (sensitive money-mutation paths needing the 4-question treatment), and `LC-D-SIB-1` is
  flagged to the bug-hunt/UX routines — none of those are this lane's to pick up. `LC-B-SIB-2` is a
  pure client-side read/display gap (no money mutation), squarely inside Lane D's "journey blockers
  across mobile + admin + merchant" mandate, and directly extends the already-Lane-D-owned `LC-D07`
  pattern (admin rider wallet ledger pagination) to the mobile rider wallet ledger. Claimed it as
  this run's increment rather than self-disabling with known Lane D work still outstanding.

## The defect

`useWalletLedger()` (`apps/mobile/src/query/use-wallet.ts`) always called `getWalletLedger()` with
no cursor. `WalletService.getLedger` (API) caps every response at `LEDGER_PAGE_SIZE = 25` and
returns a `nextCursor`, but nothing in the mobile app ever read it — the rider Money tab
(`apps/mobile/app/rider/(tabs)/money.tsx`) rendered `page.entries` directly with no "load
more"/`onEndReached`. A rider with more than 25 lifetime wallet events (one commission debit per
job plus every top-up — plausible for any active rider) permanently lost visibility into older
deductions, with zero on-screen signal anything was missing — directly contradicting the screen's
own copy ("every deduction shows up here next to the delivery it came from"). The admin-side
sibling of this exact shape was already fixed as `LC-D07` (`apps/admin/app/riders/[id]/page.tsx`,
cursor pagination + "Load older"/"↺ Back to latest" links).

## The fix

- `apps/mobile/src/query/use-wallet.ts`: `useWalletLedger()` now uses `useInfiniteQuery` (TanStack
  Query v5, already a project dependency, not previously used anywhere in this codebase) instead of
  `useQuery`. It accumulates every fetched page's entries into a flat `entries: WalletEntry[]`, and
  exposes `hasMore` (from `hasNextPage`), `isLoadingMore` (from `isFetchingNextPage`), and
  `loadMore()` (wraps `fetchNextPage()`). `getNextPageParam` reads `lastPage.nextCursor` — when the
  server stops returning one, `hasMore` goes false and there is nothing left to page into.
- `apps/mobile/app/rider/(tabs)/money.tsx`: consumes the new hook shape (`entries` replaces the old
  `page?.entries ?? []` derivation) and renders a "Load older" `Button` (`variant="ghost"`, matching
  the app's existing secondary-action convention) beneath the ledger `Card` whenever `hasMore` is
  true and the initial load has finished. Tapping it calls `loadMore()`; the button shows its own
  `loading` state via `isLoadingMore` without disturbing the rest of the screen (balance, cash-held
  strip, filter chips all keep working independently).
- No API or contract change needed — `getWalletLedger(cursor?: string)` and
  `WalletLedgerPage.nextCursor` already existed and were already correctly wired server-side; this
  was purely a client-side "the capability existed but nothing called it" gap.
- Chose accumulate-and-append (an infinite-scroll-shaped "Load older" button) over the admin
  console's swap-pages-via-URL-cursor pattern deliberately: the admin fix is a Next.js
  server-rendered page where a `?cursor=` query param is the natural unit of state; the mobile
  Money tab is a client-side scrolling list where a rider expects everything they've already seen
  to stay visible as they page back further, not to be replaced page-by-page.

## Tests

New `apps/mobile/src/query/__tests__/use-wallet.test.tsx` (3 tests, all pass):
1. The first page loads with `getWalletLedger(undefined)` and `hasMore` is `true` when the server
   returns a `nextCursor`.
2. `loadMore()` calls `getWalletLedger("cursor-1")` (the first page's own cursor) and the resulting
   `entries` contain BOTH pages' rows in order — a prior page is never discarded or replaced.
   `hasMore` goes `false` once the second page's response carries no further cursor.
3. `hasMore` is `false` from the very first page when that page alone already has no `nextCursor`
   (the common case for most riders today, who have well under 25 lifetime entries).

Followed this codebase's established hook-test convention (no `@testing-library/react-native` in
this repo — hooks are exercised via a small `Harness` component rendered with
`react-test-renderer`'s `create`/`act`, wrapped in a real `QueryClientProvider`). TanStack Query's
observer notifications are scheduled through `setTimeout(0)` (`notifyManager`), not a microtask —
matched the existing `flushNotifications` pattern from
`src/ui/order/__tests__/live-tracking-isolation.test.tsx` rather than `await Promise.resolve()`,
which was tried first and proved unreliable (timing-dependent failures on the very first query of
the test file).

## Verification

Full monorepo, from a clean environment bootstrap (`pnpm install`, then `apps/api`'s
`pnpm prisma:generate` — the fresh checkout's Prisma client wasn't generated yet, an environment
setup step, not a regression; confirmed by reproducing the resulting `PrismaService` typecheck
errors, running `prisma:generate`, and re-running clean):

- `pnpm typecheck` — clean, 6/6 packages.
- `pnpm lint` — clean (one pre-existing, unrelated `no-shadow` warning in
  `apps/api/src/admin/admin-orders.service.spec.ts`, untouched by this change).
- `pnpm test` — 6/6 packages green: `@lynia/shared` 9 files, `@lynia/admin` 11 files,
  `@lynia/merchant` 26 files, `@lynia/mobile` 113 suites / 797 tests (including the 3 new ones),
  `@lynia/api` 97 files / 1540 tests. No other suite touched or regressed.

## Ledger

`docs/KNOWN_BUGS.md`: `LC-B-SIB-2` row updated from OPEN to FIXED, citing this report.
`docs/plans/2026-08-01-low-connectivity-program.md` §5 Lane D: new `D-O4` entry appended to the
optimization checklist, ticked, citing `LC-B-SIB-2` and this report.
