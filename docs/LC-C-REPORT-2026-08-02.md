# LC-C report — 2026-08-02 (offline & 2G resilience)

Second LC-C increment. Fixed C-D0b/C-D0c together (they're the same underlying defect — no
request timeout — split into two ledger rows because the fix touches two files) plus C-D0d,
which is fixed opportunistically this run because adding C-D0c's timeout directly widens the
surface of C-D0d's already-known bug (see below). C-D0e and the C-T* journey audits stay on the
lane checklist (`docs/plans/2026-08-01-low-connectivity-program.md` §5 Lane C) for the next firing.

## Fixed — LC-C02 (HIGH) + LC-C04 (CRITICAL): no request timeout → frozen kitchen board

**Defect.** `apps/merchant/app/lib/api-client.ts` had no timeout on any of its three `fetch` call
sites (`rawFetch`, `doRefresh`, `authedFetch`'s `attempt`) — the admin client has
`ADMIN_FETCH_TIMEOUT_MS`, the mobile client aborts via `fetchWithTimeout`, but the merchant
tablet's requests could hang indefinitely. `use-queue-poll.ts`'s in-flight guard was a plain
boolean cleared only in a `finally`, so a hung request latched it forever: the 5s poll interval
kept early-returning, the board froze on its last-known order list, the new-order alarm never
rang for the rest of the 3-minute accept window, and the header kept showing "Connected" because
nothing ever called `reachability.reportUnreachable()`.

**Fix.**
1. `MERCHANT_FETCH_TIMEOUT_MS = 10_000` via `AbortSignal.timeout(...)`, added to all three
   `api-client.ts` fetch call sites (matches `apps/admin`'s `ADMIN_FETCH_TIMEOUT_MS`; comfortably
   above the lane's 2–5s degraded-link audit window so a slow-but-alive request still completes).
   A timeout now falls into the existing `catch { throw new ApiError(0, ...) }` path at every call
   site, so no caller-side branching changed.
2. New `apps/merchant/app/lib/inflight-latch.ts`: `InflightLatch`, a self-healing latch —
   `tryAcquire()` behaves like the old boolean guard, but force-clears itself if held longer than
   `staleMs` (25s, comfortably above the 10s transport timeout — the transport's own timeout
   should always clear the latch first via `finally`; this is the backstop for the case where it
   somehow doesn't). `use-queue-poll.ts` now uses it in place of the raw `useRef(false)`.
3. `apps/merchant/app/lib/reachability.ts`: `ReachabilityStore` gained an independent periodic
   `/healthz` check (`ACTIVE_PROBE_INTERVAL_MS = 20_000`) that runs continuously while
   `start()`-ed and believed-reachable, not only as the existing reactive backoff-recovery probe
   (which only ever ran once *something else* had already called `reportUnreachable()`). Before
   this, an outage with no in-flight app request that happened to fail — a stuck poll latch, a
   screen with no live poller, a backgrounded tab whose `setInterval` got throttled — went
   undetected indefinitely: the CONNECTION LOST bar never showed. The active probe now catches
   that within one interval, independent of app traffic, and hands off to the existing
   attempt-counter/backoff UI on failure.

**Verification:** `reachability.test.ts` gained 5 new tests (inert until `start()`, self-detects
an outage with zero external `reportUnreachable()` calls, reschedules on success, `stop()` cancels
it too, doesn't double-schedule on a `reportReachable()` racing with `start()`) — all 4 pre-existing
tests still pass unmodified. `inflight-latch.test.ts` is new (blocks a fresh in-flight call,
reusable after release, force-clears past `staleMs`, doesn't self-heal prematurely).

## Fixed — LC-C03 (HIGH): a blip/5xx on `/auth/refresh` signed the merchant out mid-shift

**Defect.** `doRefresh` already had the *comments* for the right behavior ("transient — leave the
session intact", "transient server error — keep the session, retry later") but the *code*
collapsed every non-2xx/network-error outcome to the same `null`, and the caller (`authedFetch`)
treated any `null` as "the refresh token is dead": it called `clearMerchantSession()` and threw
`ApiError(401, "Your session expired...")`. So a network blip or a 5xx on `/auth/refresh` — not
just a genuinely revoked token — signed the merchant tablet out mid-shift. This is a separate
ledger row (LC-C03) from C-D0b/c, but adding the C-D0c timeout to `doRefresh`'s own fetch call
would otherwise have newly exposed this exact bug via a *third* trigger (a stalled refresh now
resolves via `catch` instead of hanging forever) in addition to its two already-known ones
(network throw, 5xx) — fixing it in the same PR avoids shipping a change that widens a known bug's
blast radius.

**Fix.** `doRefresh` now returns a discriminated `RefreshOutcome` (`{ kind: "refreshed", session }`
/ `{ kind: "dead" }` / `{ kind: "transient" }`) instead of `MerchantSession | null`. `authedFetch`
clears the session and signs out **only** on `dead` (a definitive 401/403 from `/auth/refresh`
itself); `transient` fails just the one in-flight request (`ApiError(0, ...)`, the same
"couldn't reach the server" the caller already handles) and leaves the session intact for the
next poll or action to try again.

**Verification:** `api-client.test.ts` (new) covers: network error on `/auth/refresh` → session
preserved, `ApiError(0)`, `clearMerchantSession` never called; 500/502/503 on `/auth/refresh` →
same; a definitive 401 on `/auth/refresh` → session cleared, `ApiError(401, "Your session
expired...")`; a successful refresh → original request retried with the new token and resolves;
every outbound fetch (`rawFetch` via `requestOtp`, `authedFetch`) carries an `AbortSignal`; a
stalled/aborted request surfaces as `ApiError(0)` rather than hanging.

## Verification (whole repo)

- `pnpm --filter @lynia/shared build` (a stale `dist/` was blocking merchant's `@lynia/shared`
  import in tests — environment gap, unrelated to this change) + `pnpm prisma:generate` for
  `apps/api` (same: an ungenerated Prisma client was failing `apps/api` typecheck — also
  unrelated to this change, fixed so the full-repo gates could actually run clean).
- `pnpm typecheck` — clean across all workspaces.
- `pnpm lint` — clean (one pre-existing unrelated warning in
  `apps/api/src/admin/admin-orders.service.spec.ts`, untouched by this PR).
- `pnpm test` — 1500/1500 passing across all workspaces (103/103 in `@lynia/merchant`, including
  9 new `api-client.test.ts` tests, 4 new `inflight-latch.test.ts` tests, and 5 new active-probe
  tests in `reachability.test.ts`).

## Not done this run (LC-C's scheduled work)

C-D0e (dropped post-mutation refetch + out-of-order responses in `use-queue-poll.ts`) and the
C-T1..T5 journey audits + C-O1..O4 optimizations remain on the Lane C checklist for the next
firing.
