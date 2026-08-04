# LC-A report — 2026-08-04c (size & data diet)

Lane A is in OPTIMIZE MODE (since `A-T5`, 2026-08-03b). This firing takes the first unchecked
optimization item, **A-O15** — Home tab's active-order poll duplicates `useBootstrap`'s seed with
unconditional focus/foreground invalidation (`LC-A08`), ranked #8 by the 2026-08-03 A-T4 wire-bytes
evidence.

## What shipped

`apps/mobile/app/(tabs)/home.tsx` (and the identically-shaped `apps/mobile/app/send.tsx`, which
carries the same code on the same `["activeCustomerOrder"]` cache key per its own "mirrors
home.tsx" comment) both:

- poll `/orders/mine/active-order` every 30s via `refetchInterval` while the screen is focused
  (unchanged by this fix), **and**
- unconditionally call `qc.invalidateQueries({ queryKey: ["activeCustomerOrder"] })` on every
  `useFocusEffect` focus AND every `useForegroundRefetch` app-foreground event.

The second part is the defect: `invalidateQueries` bypasses `staleTime` entirely, so a customer
flicking between tabs, or an app that briefly loses/regains foreground focus (screen lock, a
notification-shade pull), forces a full round trip even when the cached entry — often just seeded
fresh by `useBootstrap` at cold start (`use-bootstrap.ts:17`, `qc.setQueryData(["activeCustomerOrder"],
...)`) or by the last interval poll — is still well within its staleness window.

New helper in `apps/mobile/src/query/client.ts`:

```ts
export const DEFAULT_STALE_TIME_MS = 30_000; // now the single source both the global staleTime
                                              // and invalidateIfStale's default read from

export function invalidateIfStale(qc: QueryClient, key: QueryKey, staleMs = DEFAULT_STALE_TIME_MS): void {
  const updatedAt = qc.getQueryState(key)?.dataUpdatedAt ?? 0;
  if (Date.now() - updatedAt >= staleMs) void qc.invalidateQueries({ queryKey: key });
}
```

`home.tsx`'s and `send.tsx`'s focus-effect and foreground-refetch callbacks now call
`invalidateIfStale(qc, ACTIVE_ORDER_KEY)` instead of the raw `invalidateQueries` call. A genuinely
stale entry (never fetched, or older than 30s — e.g. the app was actually backgrounded for a while)
still triggers an immediate refetch, unchanged from before — this only skips the redundant case
where the cache is demonstrably still fresh. `invalidateCustomerOrderHistory(qc)` (a different
cache key, `useHistoryFeed`'s own) is untouched — out of this item's scope.

## What was deliberately left alone

- **The 30s `refetchInterval` poll itself** — unchanged. This fix only removes the *extra* forced
  fetches layered on top of it, not the baseline poll cadence (a separate, already-audited
  tradeoff from PERF20-01).
- **The `homeFocused`-gated socket write-back guard** (LC-B05's fix) — untouched; `invalidateIfStale`
  only changes *whether* a fetch fires, not what happens once one resolves.
- **`send.tsx`'s idempotent-draft-flush logic** — unrelated code path in the same file, not touched.

## Evidence

Real byte-level payload measurement doesn't apply here — this isn't a response-shape change (unlike
A-O14/A-O6), it's a *request-count* change, the same category as A-O1/A-O10's own framing ("N extra
round trips/minute"). Modeled a 5-minute Home dwell (the ticket's own "customer lingers on Home
before deciding to order" scenario) with the real 30s `refetchInterval` plus a modeled
focus/foreground cadence of once per 20s (tab switches, notification-shade pulls, brief
backgrounding — matching this item's own "2+ extra round trips/minute" framing), counting actual
network round trips under the OLD (unconditional `invalidateQueries`) vs NEW (`invalidateIfStale`)
rule. Concurrent triggers landing in the same instant dedupe to one round trip, modeling TanStack
Query's real in-flight-promise sharing (a `fetchQuery` call while one is already in flight joins it
rather than issuing a second HTTP request).

| | Round trips over 5-minute dwell |
|---|---|
| Before (unconditional invalidate on every focus/foreground) | 21 |
| After (`invalidateIfStale`, 30s window) | 11 |
| Saved | **10 (−47.6%)**, ≈2 avoided round trips/minute |

At A-T4's already-measured response size for this exact endpoint family (`getSnapshot`, ≈1,079 B
for the equivalent parcel snapshot, cited in the 2026-08-03 wire-bytes trace for `trackQ`), 10
avoided round trips ≈**10.8 KB saved per 5-minute Home dwell** — plus the avoided per-request
connection overhead a byte count alone doesn't capture on a metered 2G/3G link (each round trip
also costs a TLS/HTTP handshake reuse check, not just body bytes).

No JS bundle-size impact: this is logic-only (no new dependencies, no new assets, same import graph
shape) — `size-budget.json` is untouched.

## Verification

- **New unit tests** — `apps/mobile/src/query/__tests__/client.test.tsx`, 3 cases for
  `invalidateIfStale`: skips invalidation when the cached entry is younger than `staleMs`;
  invalidates immediately when the entry predates the staleness window; invalidates immediately
  when the key has never been fetched (`dataUpdatedAt` defaults to 0).
- **New integration tests** — `app/(tabs)/__tests__/home.test.tsx`, 2 cases driving the real
  `useFocusEffect` callback through a mocked `expo-router` (extended with a `refocusHome` trigger
  to simulate a subsequent focus without a remount): a quick re-focus does NOT re-fetch while the
  cache is fresh; a re-focus after the cache ages past 30s (`Date.now` mocked forward) DOES
  refetch.
- Full monorepo `pnpm typecheck && pnpm lint && pnpm test`: all green.
  - `@lynia/api` typecheck clean (after `prisma generate` — a fresh checkout's generated client
    wasn't present yet, unrelated to this change, same note as prior reports); `@lynia/api` test:
    **97 files / 1,540 tests** pass, unaffected by this mobile-only change.
  - `@lynia/mobile` typecheck clean; `@lynia/mobile` test: **112 suites / 789 tests** pass (109 +
    the 3 new `invalidateIfStale` cases + the 2 new `home.test.tsx` integration cases).
  - `@lynia/admin`/`@lynia/merchant`/`@lynia/shared` typecheck/lint/test: unaffected, all green.
  - `oxlint` (root config): clean on `@lynia/mobile` (one pre-existing unrelated `no-shadow`
    warning in `apps/api/src/admin/admin-orders.service.spec.ts`, not touched by this PR).

## Budgets and doctrine

No JS/bundle-size change — `size-budget.json` untouched. Fully OTA-able (JS-only client change, no
native/config change, no server change).

**Sensitive-lane doctrine:** the diff touches only `apps/mobile/app/(tabs)/home.tsx`,
`apps/mobile/app/send.tsx`, `apps/mobile/src/query/client.ts`, and their test files — none of it is
in `apps/api/src/{wallet,settlements,offers,orders,matching,kyc,riders}/` or
`packages/shared/src/{policy,pricing,money}.ts`, so the four doctrine questions don't apply. The
data being polled (`activeForCustomer`/`getSnapshot`) is order-state, but this change touches
**only when a client-side read-cache invalidation fires**, never the response shape, the write
path, or any money/assignment/auth logic.

## Checklist status

Ticked `A-O15` in `docs/plans/2026-08-01-low-connectivity-program.md` §5 (Lane A optimization
checklist). Lane A's next unchecked item is `A-O4` (rider-offline 8s `activeJob` poll cadence, S).
Lane A does not self-disable this run — the checklist still has open items.
