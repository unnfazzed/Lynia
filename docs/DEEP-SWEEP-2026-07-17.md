# Deep bug sweep — 2026-07-17

Orthogonal backend-correctness sweep run against latest `main`, inheriting the full history consolidated
in `docs/KNOWN_BUGS.md`. **Phase-0 spot-check re-verified 6/6 sampled prior fixes still intact in code** —
F-06 (spoofable admin-actor header stripped, `apps/admin/middleware.ts`), DS15-01 (baseline `error`
listener on every `createRedisClient()`, `apps/api/src/common/redis.ts`), DS15-02 (self-erase standing
gate, `privacy.service.ts` `eraseAccount`), DS15-06 (KYC vendor-webhook mutation + audit share one
`$transaction`, `rider.service.ts` `applyKycResult`), DS-03/DS13-04 (admin standing/order-mutation CAS
`updateMany` guards, `admin-orders.service.ts` / `admin-riders.service.ts`), and DS16-01 (the
`RESERVED_AUDIT_ACTIONS` write-side guard that closed the audit-forgery path, `admin-audit.service.ts`).
**0/6 regressed.**

This sweep ran the standard orthogonal passes, all cross-checked against `docs/KNOWN_BUGS.md` first:

1. **Phase 0 — spot-check of prior fixes.** Sampled 6 representative fixes across the auth, Redis,
   privacy/erasure, KYC-audit, admin-CAS, and admin-audit-forgery areas — all still intact, no regressions.
2. **Phase 0.5 — cluster-claim re-verification.** Re-verified three rotating "→ FIXED" cluster headers
   against current code (Auth/identity, Data-integrity, Money-fraud) — all INTACT (see the dedicated
   subsection below).
3. **Phase 1 — timer/boundary + supply-plane invariant sweep.** Walked the offer-window/expiry timing
   boundaries and the standing-demotion supply-plane invariant. Surfaced **DS17-01** (MEDIUM, a push-TTL
   boundary that outlives its own auction window) and **DS17-03** (MEDIUM, an automated KYC-expiry reset
   that wipes an admin lock).
4. **Phase 1.5 — cross-lane seam pass (deep sweep owns it).** Traced the seam "a single DB column with
   two (or more) independent writers" across the Rider/Order columns. `Rider.isOnline`'s writer set was
   the seam that surfaced **DS17-02** (see the dedicated subsection below).
5. **Phase 3 — adversarial API pass.** Re-attacked IDOR/party-gate, fare/bid manipulation, webhook
   forge/replay, KYC/standing-gate bypass, admin-only mutation authz, and PII leak surfaces. **Zero new
   gaps** — every vector traced to an existing, correctly-applied control already in the ledger.

Severity legend: CRITICAL / HIGH / MEDIUM / LOW. Confidence: high / medium / low.

**Zero new CRITICAL/HIGH findings this run; three MEDIUM findings surfaced (DS17-01/02/03), all fixed
with regression tests — not padding with LOW-severity noise beyond these three.** Phase 0, the Phase-0.5
cluster re-verification, and the Phase-3 adversarial pass all came back clean with no regressions.

---

## New findings

### DS17-01 — Widening-broadcast push TTL is computed from send time, not order age, so it can outlive the order's own 90s auction window · MEDIUM · confidence high

**Where:** `apps/api/src/notifications/notifications.service.ts` (`notifyNewBroadcast`,
`notifyRidersAvailable`), `apps/api/src/matching/matching.service.ts` (`expandBroadcast`).

**What:** `BROADCAST_PUSH_TTL_SECONDS` (`= ceil(OFFER_WINDOW_MS/1000)` ≈ 90s) is passed as a flat
FCM/APNs TTL computed from SEND time. That is correct for the create-time broadcast (sent at t≈0), but
`MatchingService.expandBroadcast` — fired as widening ticks by `OfferExpiryService` at t≈30s/60s —
called `notifyNewBroadcast` with the SAME flat 90s TTL even though it had already fetched
`order.createdAt`. A push sent at t=60s with a 90s TTL stays valid in the push provider until t=150s, 60s
after the order's real 90s window closed at t=90s. The identical root cause affected
`notifyRidersAvailable`'s live-order branch: it already resolves which referenced orders are still
`open_for_offers` in one batched query, but didn't know how much of THAT order's own 90s window remained,
so it also sent a flat 90s TTL regardless of the order's actual remaining life.

**Repro:** a rider in a dead zone is offline while an order's widening tick fires at t=60s (or a
"notify-me" customer's live order is pinged late in its window). The push is stamped with a 90s TTL from
send time, so the provider holds it until t=150s. The rider reconnects at t=120s, receives "New delivery
nearby — tap to bid before it's taken," taps it, and lands on an auction that expired/assigned at t=90s —
a dead-auction dead end.

**Fix (conservative — TTL computation only, no change to what is delivered or when):**
`notifyNewBroadcast` gained an optional 4th `ttlSeconds` parameter defaulting to
`BROADCAST_PUSH_TTL_SECONDS`, so every OTHER caller (the create-time broadcast) is unaffected.
`expandBroadcast` computes the order's actual remaining window
(`remainingMs = order.createdAt.getTime() + OFFER_WINDOW_MS − Date.now()`), returns early with NO push
when `remainingMs ≤ 0` (the window has already elapsed; the reconciler/expiry job owns closing it out),
and otherwise passes `Math.max(1, Math.ceil(remainingMs / 1000))`. `notifyRidersAvailable` now selects
`createdAt` on its still-open-orders query, builds an id→createdAt map, and applies the same
remaining-life pattern per live-order waiter, skipping any waiter whose window has elapsed rather than
pushing a dead reference. The generic no-orderId `notifyRidersAvailable` branch keeps the flat default
deliberately (it has no specific order to compute remaining life against — out of scope, same-pattern).

**Why past sweeps missed it:** "Fix 5" (`docs` KB) introduced the flat TTL to solve the
push-lands-hours-later problem for the create-time broadcast and *reused the same constant* on the
widening rebroadcast and the riders-available fan-out, which is correct for the t≈0 sender but silently
wrong for a mid-window sender. No prior sweep re-derived the TTL against *order age* rather than *send
time*; the boundary only bites for a push emitted late in the window to a rider who reconnects after it
closes — a compound timing scenario.

---

### DS17-02 — Two standing-demotion paths write `isOnline:false` but never evict the rider from the live-supply Redis/board planes (funnel bypass) · MEDIUM · confidence high

**Where:** `apps/api/src/orders/order-lifecycle.service.ts` (`cancel`'s `CANCEL_STRIKE_LIMIT` branch),
`apps/api/src/issues/issues.service.ts` (`resolve`'s `rider_strike`→`RIDER_STRIKE_LIMIT` branch),
`apps/api/src/issues/issues.module.ts`.

**What:** the repo's documented invariant is that every standing-demotion path must route through
`TrackingGateway.evictRiderFromSupply(riderId)` (wraps `kickRiderFromBoard` + `evictRiderFromGeo`)
post-commit, so a demoted rider stops receiving board pushes and stops appearing in `nearbyRiders`
GEOSEARCH results. Confirmed callers already doing this correctly: `rider.service.ts` (KYC-lapse webhook
+ `adminSetKyc`), `admin-riders.service.ts` (suspend + ban), and `order-lifecycle.service.ts`'s own
`markUndelivered` auto-hold (which does the two halves directly). **Two demotion paths bypassed it:**

- **Bug 1 (`order-lifecycle.service.ts` `cancel`):** the rider-cancel 3rd-strike branch set
  `cancelStrikes:0, cooldownUntil, isOnline:false` in the transaction, but nothing post-commit evicted
  the rider from the supply planes. They kept their board-room subscription and their `rider:geo` entry
  for up to the whole 2h cooldown — still receiving `board:new_order` pushes for jobs they're blocked
  from bidding on, and a ghost in the nearby-riders GEOSEARCH radius.
- **Bug 2 (`issues.service.ts` `resolve`):** the `rider_strike`→limit branch set
  `disputeStrikes:0, cooldownUntil, isOnline:false`, but `IssuesService` had NO `TrackingGateway`
  dependency at all — the eviction never happened for the dispute-strike path either.

**Repro:** an online, board-subscribed rider hits their 3rd pre-pickup cancel (Bug 1) or accrues a
`RIDER_STRIKE_LIMIT`-th dispute strike via the ops disputes console (Bug 2). Postgres records
`isOnline:false` + cooldown, but the rider keeps their board room + geo entry, so a customer nearby still
sees them counted in supply and the rider keeps getting board pushes until they disconnect or the Redis
key TTLs.

**Fix (conservative — mirrors the existing funnel calls exactly):**

- Bug 1: `cancel` captures the strike-limit rider id in-tx via a `let strikeLimitRiderId` (the same
  technique `markUndelivered`'s `newlyHeldRiderId` uses a few methods above), then post-commit calls
  `void this.gateway.evictRiderFromSupply(strikeLimitRiderId).catch(...)`, best-effort, mirroring the
  auto-hold eviction's logging/catch style.
- Bug 2: `IssuesModule` now imports `TrackingModule`; `IssuesService` injects `TrackingGateway` (and gains
  a `Logger`), captures the strike-limit rider id in-tx, and evicts post-commit best-effort. Every
  existing `new IssuesService(...)` call site in the spec was updated for the new constructor arg.

**Why past sweeps missed it:** this is the exact recurring class the standing-demotion funnel
(`IR16-03`/`DS15-05`) was built to retire — "harden one plane, forget the other." The funnel was
propagated to the admin (suspend/ban), webhook (KYC-lapse), and auto-hold paths, but the two *strike-limit*
paths (cancel-strike in the order lifecycle, dispute-strike in issues) were never enumerated as siblings —
they force offline as a side effect of a *counter* reaching a limit, not as a first-class "demote this
rider" action, so a plane-by-plane scan that looked for admin/webhook demotions skipped them. The
cross-lane seam pass (below), which enumerated *every* writer of `Rider.isOnline` regardless of lane, is
what surfaced them.

---

### DS17-03 — Automated KYC-expiry webhook can silently wipe the two-decline lock an admin already applied · MEDIUM · confidence high

**Where:** `apps/api/src/riders/rider.service.ts` (`applyKycResult`).

**What:** `applyKycResult` (the automated vendor-webhook KYC decision handler) reset `kycAttempts:0`
unconditionally whenever the vendor reported `status === "expired"`, with NO check on the rider's current
lock state. The A-02 lock (`retryKyc`: `if (rider.kycAttempts >= 2) throw ForbiddenException`) is meant
to be permanent until support intervenes once a rider has been declined twice. The only write-guard on
this path was the monotonic `kycRef` + `kycResolvedAt < eventAt` check — which does NOT check whether the
rider is currently locked.

**Repro:** rider submits KYC (session A) → admin declines via `adminSetKyc` (`kycAttempts`→1) → rider
`retryKyc`s (mints session B, resets `kycResolvedAt:null`, keeps `kycAttempts=1`) → admin declines AGAIN
via `adminSetKyc` (genuinely increments to `kycAttempts=2`, locked, and stamps `kycResolvedAt` = the
admin's decline time). Session B (still open on the vendor side) later times out and the vendor fires an
`expired` webhook for `kycRef=sessionB` with an `eventAt` AFTER the admin's second decline. The monotonic
guard's `kycResolvedAt < eventAt` matches (the admin's stamp is older than this late webhook), the update
applies, and `kycAttempts:0` silently wipes the two-decline lock — the rider can now call `retryKyc`
again for a third attempt, bypassing the intended permanent lock.

**Fix (conservative, minimal):** the code already conditionally fetched `flagged` (via
`tx.rider.findFirst({ where: { kycRef }, ... })`) only for `status === "verified"`. That read now runs
unconditionally for every status, renamed `current` and selecting
`{ duplicateIdFlag: true, kycAttempts: true }`. The expired reset changed from
`...(status === "expired" ? { kycAttempts: 0 } : {})` to
`...(status === "expired" && (current?.kycAttempts ?? 0) < 2 ? { kycAttempts: 0 } : {})`, so it still
recovers an ancient never-locked decline (the original intent) but preserves an admin-established lock.
`holdForReview` reads `current?.duplicateIdFlag`; the `verified`/`failed` paths are unchanged (the added
always-fetch is a no-op for them beyond reading the extra unused field, which is necessary because the
query must now run unconditionally). The **manual** `adminSetKyc` expired-reset — a deliberate human ops
decision to reset the lock — is untouched.

**Why past sweeps missed it:** the automated-webhook expiry-reset (`applyKycResult`) and the admin-lock
write (`adminSetKyc` decline) live in the same file but were audited as independent single-writer paths.
The lock invariant is a seam between the *automated* KYC lifecycle and the *manual* admin decision — the
`kycAttempts` column has three writers (webhook decline increment, webhook expiry reset, admin decline
increment / admin expiry reset), and no prior sweep enumerated them together to notice the automated
expiry-reset could stomp the admin increment via the monotonic-but-not-lock-aware guard. The seam pass's
column-by-writer enumeration is what flagged it.

---

## Sibling-sweep

Per the mandatory evidenced sibling-sweep rule, each finding's pattern signature was grepped across the
repo and every hit's disposition recorded.

### DS17-01 — flat broadcast-push TTL

```
$ grep -rn "ttlSeconds" apps/api/src --include=*.ts | grep -v ".spec.ts"   # 17 hits
$ grep -rn "BROADCAST_PUSH_TTL_SECONDS" apps/api/src --include=*.ts | grep -v ".spec.ts"   # 4 hits
```

Disposition of the `BROADCAST_PUSH_TTL_SECONDS` hits:
- `notifications.service.ts:12` — the constant definition. N/A.
- `notifications.service.ts` `notifyNewBroadcast` default param — **kept as the default**: the create-time
  broadcast fires at t≈0, so a full-window TTL from send time is correct for it. The widening rebroadcast
  now overrides it with the order's remaining life (**fixed** via the new 4th arg).
- `notifications.service.ts` `notifyRidersAvailable` live-order branch — **fixed**: now sized to the
  order's remaining window per waiter (skips a waiter whose window elapsed).
- `notifications.service.ts` `notifyRidersAvailable` generic (no-orderId) branch — **kept flat
  deliberately**: it has no specific order to compute remaining life against (already confirmed by prior
  analysis as same-pattern-out-of-scope, not a separate defect).

The remaining `ttlSeconds` hits are the adapter plumbing that carries the value through
(`push.interface.ts`, `fcm.push.ts` android `ttl` + apns `apns-expiration`) and an unrelated
`tracking.service.ts` presence-escalation Redis `EX` TTL — none is a broadcast-TTL sibling.

### DS17-02 — standing write missing an eviction (`isOnline: false` without `evictRiderFromSupply`)

```
$ grep -rn "isOnline: false" apps/api/src --include=*.ts | grep -v ".spec.ts"   # 10 hits
```

- `admin-riders.service.ts:257` (suspend), `:364` (ban) — already call `evictRiderFromSupply` (`:284`,
  `:378`). **Already guarded.**
- `order-lifecycle.service.ts:481` (`markUndelivered` auto-hold) — does the two halves directly
  (`evictRiderFromGeo` + `kickRiderFromBoard`), functionally equivalent. **Already guarded.**
- `order-lifecycle.service.ts:747` (`cancel` 3rd-strike) — **FIXED this run (DS17-02 Bug 1).**
- `rider.service.ts:329` (self-service `setOnline(false)`) — **not a demotion**: a voluntary go-offline;
  the surrounding code already calls `this.tracking.evictFromGeo(profileId)` as part of normal go-offline
  handling, so going offline via that path *is* the "leave the plane" action itself. Not a gap.
- `rider.service.ts:457` (KYC-lapse webhook), `:597` (`adminSetKyc` decline), `:620` (`adminSetKyc`
  non-verified) — all call `evictRiderFromSupply` post-commit. **Already guarded.**
- `issues.service.ts:270` (dispute-strike limit) — **FIXED this run (DS17-02 Bug 2).**
- `privacy.service.ts:220` (erasure) — evicts from supply/geo per DS15-05. **Already guarded.**

### DS17-03 — `kycAttempts` writers

```
$ grep -rn "kycAttempts" apps/api/src --include=*.ts | grep -v ".spec.ts"
```

The value-*writers* (as opposed to reads/selects/where-clauses) are:
- `rider.service.ts:442` — `applyKycResult` `failed` branch increment (F-13). **Unaffected** (the fix is
  on the `expired` branch, not `failed`).
- `rider.service.ts:450` — `applyKycResult` `expired` reset — **FIXED this run (now lock-guarded).**
- `rider.service.ts:589` — `adminSetKyc` decline increment (guarded by `isRepeatOfSameDecline`). Other axis.
- `rider.service.ts:616` — `adminSetKyc` manual `expired` reset — **deliberate human ops action, left
  untouched** (an admin choosing to reset a lock is different from an automated webhook doing it by accident).
- `rider.service.ts:242` — `retryKyc` CAS `where` (matches on the observed value; not a value write).
- `rider.service.ts:216` — `retryKyc` lock check (a read).

No other sibling gap: the only place an *automated* path could wipe the lock was the `applyKycResult`
expired reset, now closed.

## Phase-0.5 cluster-claim re-verification

Re-verified three rotating "→ FIXED / MOOT" cluster headers against current code (open ≥2 named members,
grep for the claimed guard):

- **Auth/identity → FIXED — INTACT.** JWT HS256 algorithm pin present (`token.service.ts:35,50,53`), the
  JWT default-secret boot-guard present (`env.ts:214-224`), and the launch-mode boot guards present
  (`env.ts:242-263`). All members' guards found in code.
- **Data-integrity → FIXED — INTACT.** The reports unique-index migration (0014), the check constraints +
  rating discriminator migration (0015), the national-ID AES-GCM migration (0017) + its crypto
  (`pii-crypto.service.ts:40-57`), and the `rankOffers` NaN guard (`offer-ranking.ts:67-79`) all present.
- **Money-fraud → FIXED — INTACT (claim not stale).** Confirmed `recordPayment`/auto-pause are genuinely
  absent from the code (not silently reintroduced), and `settlements.service.ts` is still read-only per its
  own docstring. The "no payment pipeline yet" claim reflects reality.

None of the three summaries was overstated this run — no member's guard was missing from code (contrast
with the 2026-07-16 interactive review, where `IR16-01`/`02` were live under an "Auth/identity → FIXED"
header). The two headers that produced this run's findings (the supply-plane demotion invariant and the
KYC-lock invariant) were re-verified via the seam pass rather than as cluster summaries.

## Phase-1.5 — cross-lane seam pass

Seam traced this run: **"a single DB column with two (or more) independent writers"** — the `IR16-02`
class. Full column-by-writer enumeration across `Rider`/`Order`:

- **`Rider.isOnline`** — ~10 writer call-sites across `rider.service.ts` (self-service setOnline, KYC-lapse
  webhook, adminSetKyc), `admin-riders.service.ts` (suspend/ban), `order-lifecycle.service.ts` (auto-hold,
  **cancel-strike**), `issues.service.ts` (**dispute-strike**), `privacy.service.ts` (erasure). The
  invariant is "any writer setting it false as a demotion must also evict from the geo + board supply
  planes." The cancel-strike and dispute-strike writers violated it → **DS17-02** (both now
  funnel-consistent).
- **`Rider.cancelStrikes` / `Rider.disputeStrikes`** — single-writer each since `IR16-02` split the two
  offence axes into separate columns. No collision.
- **`Rider.kycAttempts`** — three writers (webhook decline increment, webhook expiry reset, admin
  decline/expiry). The automated expiry-reset writer collided with the admin lock-increment writer via a
  monotonic-but-not-lock-aware guard → **DS17-03** (now lock-guarded).
- **`Order.status` / `Rider.accountStatus` / `Rider.reliabilityScore`** — all CAS-guarded `updateMany`
  (first-writer-wins) or written under a `SELECT … FOR UPDATE` row lock. No unguarded collision found.

## Phase 3 — adversarial pass

Clean — **zero new CRITICAL/HIGH/MEDIUM/LOW.** Every attack path traced to an existing control already in
the ledger. A representative sample of what was checked:

- **IDOR / object-authz sweep** across all admin + party-facing controllers — party-gates
  (`order.customerId`/`order.riderId`), `AdminGuard` on the admin surface, and the party-gated
  `getSnapshot` all correctly applied.
- **Fare / bid manipulation** — the bid-acceptance CAS, the `agreedFare` re-read-after-CAS (WD-005), and
  the commission-basis floor all intact.
- **Webhook forge / replay** on `/kyc/callback` and `/webhooks/whatsapp` — signature + monotonic-`eventAt`
  guards intact (and DS17-03 hardened the one lock-state gap the monotonic guard didn't cover).
- **KYC / standing-gate bypass** — `onlineRefusalReason` gates online/bid/select on
  kyc+standing+hold+cooldown; the supply-plane funnel (now complete after DS17-02) keeps a demoted rider
  out of all four planes.
- **Admin-only mutation authz** — every mutating admin action is `AdminGuard`-gated and writes its audit
  row in the same `$transaction` as the mutation.
- **PII leak surfaces** — phone reveal windows (`PHONE_REVEAL_STATUSES` / `DISPUTE_PHONE_REVEAL_STATUSES`)
  and the `pii-manifest.ts` coverage test intact.

Per the stopping rule: zero new CRITICAL/HIGH findings this run; three MEDIUM findings surfaced
(DS17-01/02/03), all fixed with regression tests — not padding with LOW-severity noise beyond these three.

---

## Verification

`pnpm typecheck` + the full `apps/api` test suite green (1010 tests, including the new regression tests
across `matching.service.spec.ts`, `notifications.service.spec.ts`, `order-lifecycle.service.spec.ts`,
`issues.service.spec.ts`, and `rider.service.spec.ts`), and the `@lynia/api` build green — see the
shipping PR for the final combined run across the whole monorepo.
