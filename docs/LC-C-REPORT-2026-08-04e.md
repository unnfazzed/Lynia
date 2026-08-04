# LC loop C — offline & 2G resilience — 2026-08-04e

**Mode:** OPTIMIZE (all 5 audit territories C-T1…C-T5 already checked; every Day-0 defect
C-D0a…C-D0e already fixed; C-O5, C-O6, C-O7, C-O8, C-O9, C-O1 already done). First unchecked
checklist item: **C-O2** — central mobile client reliability policy (DoorDash lessons 6+7).

## What was wrong

Every mobile network edge picked its own timeout constant independently, with no shared source:

| Site | Constant | Value |
|---|---|---|
| `api/client.ts` (`apiFetch`, the primary REST path) | `REQUEST_TIMEOUT_MS` | 15s |
| `api/uploads.ts` (raw-binary photo PUT, bypasses `apiFetch`) | `UPLOAD_TIMEOUT_MS` | 15s, duplicated by a "mirrors client.ts" comment rather than a shared reference |
| `api/places.ts` (Google Places autocomplete/details) | `PLACES_TIMEOUT_MS` | 8s |
| `net/use-feature-flags.ts` | default `timeoutMs` param | 10s |
| `net/use-server-version-gate.ts` | default `timeoutMs` param | 10s |
| `net/reachability.ts` (`/health` recovery probe) | hardcoded literal | 5s |

Five independently-chosen numbers for a program whose whole premise (§1) is a stated 300-600ms RTT
target — none of them derived from that number, none of them owned by one place a future call site
would naturally look for the right value. Separately, TanStack Query's `queries.retryDelay` was
left unset in `query/client.ts` — silently defaulting to the library's own un-jittered exponential
backoff (`1000 * 2^attempt`, uncapped-until-30s). That's precisely the failure mode DoorDash's
Aperture post (program doc §3, lesson 7) warns about: when a backend blip clears, every client
that started retrying at the same moment lands its next retry at the same moment too, turning a
recovery into a re-synchronized thundering herd.

Nothing here was a **defect** — every existing timeout worked as intended, nothing hung, nothing
lost data. This is C-O2, an optimization item: DoorDash lesson 6, "client reliability policy
belongs to the contract, not call sites."

## What shipped

New `apps/mobile/src/net/network-policy.ts` — the single source for both halves of the policy:

**Four named timeout tiers**, each an explicit multiple of `RTT_BUDGET_MS` (600ms, the program's
own stated floor) rather than an independently-chosen round number:

- `PROBE_TIMEOUT_MS` (5s) — the reachability `/health` probe, deliberately shortest since it's
  polled repeatedly while offline specifically to detect recovery fast.
- `FAST_TIMEOUT_MS` (8s) — a latency-sensitive third-party call the UI is actively blocking on
  (Places autocomplete/details); worth abandoning into the pin-on-map fallback quickly.
- `BACKGROUND_CHECK_TIMEOUT_MS` (10s) — best-effort pre-auth boot checks (feature flags, version
  gate) that already fail to a safe default on any timeout.
- `STANDARD_TIMEOUT_MS` (15s) — the general authenticated API path and the raw-binary photo PUT.

Every one of the six call sites above now imports its tier instead of defining its own constant.
`uploads.ts`'s duplicated-by-comment 15s and `places.ts`'s standalone 8s in particular can no longer
silently drift from the value they were meant to track.

**Jittered retry backoff**: `fullJitterBackoffMs(attempt, {baseMs, capMs}, rng)` implements AWS's
full-jitter formula (`random(0, min(capMs, baseMs·2^attempt))`), with an injectable RNG for
deterministic tests instead of asserting flaky wall-clock ranges. `queryRetryDelayMs` wraps it
(base 1200ms ≈ 2×RTT, cap 4s — `shouldRetry` only ever allows 2 attempts, so this never needs to
cover more than a brief blip) and is now wired as `query/client.ts`'s `queries.retryDelay`.

**Deliberately NOT touched**: `net/reachability.ts`'s `nextProbeDelayMs` (its own 2s/4s/8s/16s/
cap-30s backoff schedule) stays exact-value and un-jittered. It's a single device's own polling
loop, not a fleet-wide retry that can synchronize into a storm with other devices — jittering it
would only have made `reachability.test.tsx`'s exact-timing assertions flaky for no resilience
benefit. Only its per-probe fetch timeout moved to the shared `PROBE_TIMEOUT_MS` tier.

## Naming the idempotency guarantee (the second half of C-O2)

`docs/ARCHITECTURE.md` §Retry ownership gained a table naming the server-side idempotency guarantee
behind every mutation that sees a client-initiated retry today — either a genuine TanStack retry
(none currently opt in; the write path is non-retryable by default) or a reconciliation/re-tap
pattern the C-T1–C-T5 audits already found and fixed:

- Order creation — partial unique index on `(customer_id, idempotency_key)`
- Offer accept — transactional CAS (`updateMany` on `status`) + `getOrder`-reconciled 409
- Rider bid — `@@unique([orderId, riderId])` on `Offer`
- Delivery-code confirm / pickup / delivery-proof attach — `SELECT … FOR UPDATE` row lock + CAS
- `becomeRider` — 409 `already_rider` reconciled client-side into success
- KYC vendor webhook — row lock + monotonic `kycResolvedAt` CAS
- Wallet top-up — partial unique index on `(rider_id, idempotency_key)`
- Merchant dispute open — partial unique index on `(opened_by_profile_id, idempotency_key)`
- Commission/settlement ledger write — `@@unique([orderId, type])`

This gives a future retry path a concrete bar to clear instead of re-deriving the guarantee from
scratch each time.

## Verification

- New `apps/mobile/src/net/__tests__/network-policy.test.ts`: timeout-tier ordering vs the RTT
  floor, `fullJitterBackoffMs` bounds/window-growth/cap/RNG-injection, `queryRetryDelayMs` bounds.
- `apps/mobile/src/query/__tests__/client.test.tsx` gained a wiring assertion
  (`queryClient.getDefaultOptions().queries?.retryDelay === queryRetryDelayMs`).
- No existing test asserted the literal timeout values removed (`REQUEST_TIMEOUT_MS`,
  `UPLOAD_TIMEOUT_MS`, `PLACES_TIMEOUT_MS`, the 10s `use-feature-flags`/`use-server-version-gate`
  defaults) — confirmed by grep before editing.
- `reachability.test.tsx`'s exact-value `nextProbeDelayMs` assertions and its fake-timer
  `jest.advanceTimersByTimeAsync` probe-cadence tests are unaffected (that schedule was
  deliberately left untouched).
- `pnpm --filter mobile typecheck && pnpm --filter mobile lint && pnpm --filter mobile test` —
  all green (118 suites / 835 tests, full monorepo mobile package).

## Scope note

Merchant (`apps/merchant`) already has a single centralized `MERCHANT_FETCH_TIMEOUT_MS` constant
(`api-client.ts`, shipped in `LC-C02`/`C-D0c`) — one source, not scattered per-call-site defaults —
so it wasn't in scope for this consolidation. The program doc's own §3 annotation for lesson 6
frames C-O2 as "central **mobile** fetch/retry policy," matching this scope.

## Ledger

`LC-C15` added to `docs/KNOWN_BUGS.md`. `C-O2` ticked in
`docs/plans/2026-08-01-low-connectivity-program.md` §5 Lane C.
