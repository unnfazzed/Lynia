# LC-C report — 2026-08-01 (offline & 2G resilience)

First LC-C increment, run interactively (the lane's 06:00 UTC firing would otherwise pick it up).
One confirmed Day-0 CRITICAL fixed; the rest of the lane's checklist
(`docs/plans/2026-08-01-low-connectivity-program.md` §5 Lane C) stays for the scheduled loop.

## Fixed — LC-C01 (CRITICAL): a Memorystore outage hung the live API

**Defect.** `createRedisClient` built every client with `maxRetriesPerRequest: null` (mirrored from
BullMQ) and the ioredis default `enableOfflineQueue: true`, and no `commandTimeout`. With that
combination a command issued while Redis is unreachable is pushed onto the offline queue and never
rejected, so every awaited request-path Redis call (OTP send/verify, the MicroCache-L2 single-flight
on the snapshot hot path, the tracking geo/`nearbyRiders` read reached synchronously from
`createOrder`) **pends until reconnect** — and the callers' own "best-effort / falls back" `try/catch`
never runs. On a single-node (BASIC-tier) Memorystore restart that means nobody can log in or create
an order, and each hung request holds a Cloud Run concurrency slot up to the 3600s request timeout,
so instances saturate within a minute and stay saturated after Redis recovers. Only `health.service`
worked around it, with a 2s `Promise.race`. Latent since DS15-01.

**Fix (conservative, opt-in — zero blast radius to unrelated callers).** Added an optional
`RedisClientOptions` arg to `createRedisClient` and a shared `REDIS_FAIL_FAST` profile
(`enableOfflineQueue: false` + `commandTimeout: 2_000`, matching the health probe's existing 2s cap):

- `enableOfflineQueue: false` → a command issued while disconnected rejects fast, so the caller's
  fallback fires instead of the request hanging.
- `commandTimeout: 2_000` → catches the connected-but-hung case.

Applied to the three **request-path** clients only — OTP/rate-limit (`auth.module`), MicroCache L2
(`orders.service`), tracking geo/position (`tracking.service`). The **Socket.IO pub/sub adapter**
(`tracking.gateway`) deliberately keeps the default offline-queuing (its cross-instance semantics
differ), and the default `createRedisClient()` path is byte-identical to before — so nothing else
changes. BullMQ is unaffected (it builds its own connections).

**Sensitive-lane doctrine (auth path).**
1. **Idempotency / exactly-once:** unchanged — no write semantics touched; this only bounds how long
   a Redis command may pend. OTP verify's existing idempotency (hash grace window + throttle) is
   untouched.
2. **State transition:** none — no order-lifecycle edge exercised.
3. **Money arithmetic:** none.
4. **Regression test that fails without the change:** `redis.spec.ts` asserts `REDIS_FAIL_FAST` sets
   `commandTimeout: 2000` + `enableOfflineQueue: false`, that the default profile keeps the offline
   queue and no timeout (adapter path unchanged), and that a disconnected fail-fast client **rejects**
   a command rather than pending.

**Verification:** `pnpm --filter @lynia/api typecheck` clean; `redis.spec.ts` 6/6; the auth,
tracking, and orders suites (449 tests) green.

## Not done this run (LC-C's scheduled work)

C-D0b/c/d/e (merchant fetch-timeout + latch, `/auth/refresh` logout, queue race) and the C-T*
journey audits + C-O* optimizations remain on the Lane C checklist for the 06:00 UTC loop.
