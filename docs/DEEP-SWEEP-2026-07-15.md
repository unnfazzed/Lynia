# Deep bug sweep — 2026-07-15

Orthogonal sweep run against latest `main` (post `#248`, "fix(bughunt): remediate 2026-07-14 night
bug-hunt findings BH-03..BH-06"), inheriting the full history consolidated in `docs/KNOWN_BUGS.md`.
**Phase-0 re-verification confirmed 8/8 sampled prior fixes are still intact in code** — F-06
(spoofable admin actor header, `apps/admin/middleware.ts:47-48`), DS13-02 (disconnect no longer evicts
geo index, `tracking.service.ts:356-361`), DS13-04 (admin standing-mutation CAS,
`admin-riders.service.ts:229,284,329,373`, `admin-customers.service.ts:138-161`), DS14-08 (refresh-token
lost-response grace, `auth.service.ts:308-410`), RH-01 (persisted `heldReason` sticky velocity hold,
`reliability.ts:27-44`), DS-11/DS14-03 (KYC verified-ID freeze CAS, `auth.service.ts:166-172`,
`rider.service.ts:87-96`), BH-05 (rider's own sent-offer card built from mutation variables, not live
state, `apps/mobile/app/rider/index.tsx:432-465`, `rider-bid-draft.ts:87-90`), and BR-01 (120s heartbeat
cutoff on both `nearbyRiders` legs, `tracking.service.ts:418-449`). No regressions.

**Model note:** per this routine's Fable-plans/Opus-executes split, all six Phase 0/1/3 discovery
subagents were dispatched with `model: fable`, but every one hit the session's Fable-5 rate limit and
terminated before doing any work. Per the routine's own fallback instructions ("if the Agent/Task tool
or a model override is unavailable, proceed on the session model and note it in the report — never
abort"), all six were re-dispatched immediately on the session's default model and completed normally.
All five Phase 2 fix agents ran on `model: opus` as specified, without issue.

This sweep ran four orthogonal discovery passes plus an adversarial pass, all cross-checked against
`docs/KNOWN_BUGS.md` first:
1. **Transactions/rollback + exactly-one-row Prisma + swallowed catches** — one new LOW finding
   (DS15-10); everything else in this mechanism class (order-lifecycle, matching, offers, admin CAS
   guards, KYC replay guards) re-verified clean, consistent with how mature this discipline already is
   in this codebase.
2. **Socket handlers / BullMQ idempotency / timer-expiry boundaries** — one new CRITICAL finding
   (DS15-01): the BullMQ `error`-listener pattern (DS-02) and the health-service Redis fix (DS-04) were
   both scoped to specific instances and never propagated to three OTHER raw `ioredis` clients.
3. **Never-audited areas + money/pricing** — five new findings (DS15-03 through DS15-08), all in the
   ledger's own flagged "lightly/never audited" ground (`privacy`, `uploads`→storage, `health`,
   adapters, `tracking.service` Redis internals). Money/pricing came back clean — decimal-scale fare
   columns, bounded zod DTOs, dormant 0% commission.
4. **Object-authorization + KYC-gating** — one new LOW-MEDIUM finding (DS15-09); every controller was
   walked systematically and the rest of the standing-gate/CAS/ownership hardening re-verified intact.
5. **Adversarial API pass** (Phase 3) — one new CRITICAL finding (DS15-02), a self-service erasure path
   that bypassed every other standing control in the codebase; every other attack vector (price
   manipulation, bid-shading, IDOR, replay) traced to an existing, correctly-applied control.

Severity legend: CRITICAL / HIGH / MEDIUM / LOW. Confidence: high / medium / low.

**Two CRITICAL findings this sweep** — the stopping rule does not apply. All ten findings below were
fixed in this same run, each with a regression test; no deferrals.

---

## New findings

### DS15-01 — three raw `ioredis` clients have no `error` listener → a transient Redis blip crashes the whole API instance  ·  CRITICAL  ·  confidence high

**Where:** `apps/api/src/auth/auth.module.ts` (`RedisOtpStore`'s client, backing OTP send/verify + rate
limits), `apps/api/src/tracking/tracking.service.ts` (`getRedis()`, backing live-position GEO/SET writes
and `nearbyRiders`), `apps/api/src/tracking/tracking.gateway.ts` (`afterInit`'s `pub`/`sub` clients
handed to `@socket.io/redis-adapter`).

**What:** `ioredis` clients are plain Node `EventEmitter`s. Any connection error with no `error` listener
(timeout, ECONNRESET, a Memorystore failover) throws synchronously, becoming an `uncaughtException` that
`main.ts`'s own handler logs and then `process.exit(1)`s — turning a routine transient Redis blip into a
fleet-wide crash-restart, even though every call site already wraps individual Redis *commands* in
try/catch expecting graceful degradation. `REDIS_URL` is boot-required in production, so all three
clients are live on every instance; a shared-Redis hiccup hits every instance near-simultaneously.

**Repro:** any transient network error on the OTP-store, tracking-service, or Socket.IO-adapter Redis
connection crashes the whole instance via `uncaughtException`, even though the surrounding command-level
try/catch blocks were designed to degrade gracefully.

**Why past sweeps missed it:** DS-02 and DS-04 both fixed this exact failure class, but scoped to the
specific instances they were auditing (the two BullMQ `Queue`/`Worker` pairs, and `health.service.ts`'s
own client) rather than the pattern. The ledger's own coverage map explicitly flagged `tracking.service`
Redis internals as never independently audited, and the OTP-store's client was never covered by any
prior sweep at all.

**Fix:** `createRedisClient()` (`apps/api/src/common/redis.ts`) now attaches a baseline `error` listener
(log via `Logger`, never rethrow) to every client it returns — a single-point net covering all current
and future callers, since `EventEmitter` supports multiple listeners per event. Each of the three call
sites also gets a contextual listener layered on top (the gateway's `sub` client is a fresh
`pub.duplicate()` that does not inherit the factory's listener, so it needed its own). Regression tests:
`apps/api/src/common/redis.spec.ts` (new).

---

### DS15-02 — self-erasure (`DELETE /auth/me`) bypassed every ban/suspend/hold/cooldown/KYC-lock control and destroyed duplicate-ID detection  ·  CRITICAL  ·  confidence high

**Where:** `apps/api/src/privacy/privacy.service.ts` (`eraseAccount`).

**What:** `eraseAccount` checked only for an active ride before anonymizing — never `accountStatus`
(banned/suspended), `onHold`/the RH-01 sticky velocity hold, `cooldownUntil` (cancel-strike cooldown), or
`kycAttempts` (the A-02 two-decline lock). It also nulled `idNumberHash` during anonymization, destroying
the one signal (`duplicateIdAccountCount`) that would otherwise flag a ban-evader re-registering with the
same national ID.

**Repro:** admin bans a rider → the rider's still-valid session calls `DELETE /auth/me` (succeeds, no
standing check blocks it) → old phone tombstoned, `idNumberHash` nulled → the same phone re-verifies via
OTP, creating a brand-new profile with zero collision history → `PATCH /auth/me` + `POST /riders/become`
with the same ID document → `becomeRider`'s duplicate-ID check finds nothing (the old hash was nulled) →
the rider is back online, fully clean. Identical exploit for a suspended/velocity-held/cooldown/
KYC-locked rider or an on-hold customer.

**Why past sweeps missed it:** the ledger's DS-01/DS-10 erasure hardening covered `SosEvent` GPS
scrubbing and an active-ride TOCTOU — neither touched account standing. Every ban/suspend/hold/KYC-lock
mechanism was hardened and re-verified against every OTHER route in the API, but none of those passes
considered that the erasure endpoint both bypasses the check entirely and destroys the flag's own input
data.

**Fix:** `eraseAccount` now rejects (structured 409, house `{reason, message}` style) while any standing
restriction is live — `accountStatus` banned/suspended, `onHold` set (rider or customer), an active
cooldown, or the KYC two-decline lock. Checked pre-flight AND re-asserted inside the transaction
(TOCTOU-safe, mirroring the existing DS-10 active-ride re-check — a concurrent admin ban landing mid-
erasure can't race past it). `idNumberHash` is no longer nulled during anonymization (it's a one-way
hash, not raw PII), so duplicate-ID detection keeps working. **Scope decision:** JWT/refresh-session
revocation on ban/suspend was deliberately left out of this fix — it's a separate, larger effort, and the
standing gate above closes the actual reported exploit path (self-erase-then-reregister). Regression
tests: `apps/api/src/privacy/privacy.service.spec.ts`.

---

### DS15-03 — right-to-erasure never deleted the underlying GCS objects  ·  HIGH  ·  confidence high

**Where:** `apps/api/src/privacy/privacy.service.ts` (`eraseAccount`), `apps/api/src/adapters/storage/`.

**What:** `eraseAccount` nulled `profile.photoUrl`/`rider.photoUrl`/`rider.kycRef` in Postgres, but
`StorageAdapter` exposed only `createUploadUrl`/`createReadUrl` — no delete method existed anywhere, and
`GcsStorage` never called `.delete()`. A rider's KYC ID-photo/selfie — the most sensitive PII in the
system — sat in the bucket forever after "erasure," with cleanup gated only on an age-based, default-off
lifecycle rule, not tied to the erasure event at all.

**Why past sweeps missed it:** DS-01 only traced Postgres columns (`SosEvent` GPS); nobody had followed
`photoUrl`/`kycRef` out to the storage layer they point at.

**Fix:** `StorageAdapter` gains `deleteObject(key): Promise<void>`, implemented in `GcsStorage` via the
GCS SDK's `.delete({ ignoreNotFound: true })` (missing object = success; other errors logged and
swallowed so a storage hiccup can't hard-fail an already-committed erasure). `eraseAccount` calls it
post-commit for the erased profile's photo and rider's photo. Regression tests:
`apps/api/src/adapters/storage/storage.spec.ts`, `privacy.service.spec.ts`.

---

### DS15-04 — FCM push adapter permanently cached a rejected init promise  ·  MEDIUM-HIGH  ·  confidence high

**Where:** `apps/api/src/adapters/push/fcm.push.ts` (`messaging()`).

**What:** the lazy-init guard (`if (!this.messagingPromise) ...`) treated a REJECTED promise as
"already initialized" (a rejected promise is still truthy), so one transient ADC/network hiccup on the
first push after a cold start silently and permanently killed all push notifications — SOS ack, KYC
decisions, order status — for that instance's entire lifetime, with no retry and no crash, just a warn
log.

**Why past sweeps missed it:** the FCM *pipeline* (dead-token pruning, batching) was heavily audited;
this adapter had no unit tests at all before this sweep, and the bug only manifests on the specific
init-fails-once-then-network-recovers timeline.

**Fix:** a rejection now clears `this.messagingPromise` back to `undefined` (guarded against clobbering
a concurrent caller's fresh attempt), so the next call re-attempts init instead of reusing the dead
rejection. No background retry loop — plain "try again next call," matching the existing lazy style.
Regression tests: `apps/api/src/adapters/push/fcm.push.spec.ts` (new file — none existed before).

---

### DS15-05 — the `rider:geo` Redis index was never evicted on suspend/ban/erasure  ·  MEDIUM-HIGH  ·  confidence high

**Where:** `apps/api/src/admin/admin-riders.service.ts` (`suspendRider`/`banRider`),
`apps/api/src/privacy/privacy.service.ts` (`eraseAccount`).

**What:** `evictFromGeo` is the only removal path for the TTL-less `rider:geo` sorted set, called from
the rider's own explicit go-offline and the DS14-05 automated-hold path — but `suspendRider`/`banRider`
already call `kickRiderFromBoard` and flip `isOnline:false` in Postgres without ever calling
`evictRiderFromGeo`, and `eraseAccount` didn't either. Postgres stays the correctness authority (no
inflated broadcast counts), but `GEO_SEARCH_COUNT=100` caps GEOSEARCH candidates BEFORE the PG filter, so
ghosts accumulated from routine admin actions can eventually crowd real riders out of the nearest-100
window at busy pickup points — plus an unbounded Redis memory leak.

**Why past sweeps missed it:** DS14-10 wired `kickRiderFromBoard` into the same two call sites for the
board-eligibility gap; the sibling geo-index gap in the exact same functions was never independently
checked.

**Fix:** `void this.gateway.evictRiderFromGeo(profileId).catch(...)` added post-commit, best-effort,
alongside the existing `kickRiderFromBoard` calls in `suspendRider`/`banRider`, and wired into
`eraseAccount` for rider profiles. Regression tests: `apps/api/src/admin/admin-riders.service.spec.ts`,
`privacy.service.spec.ts`.

---

### DS15-06 — KYC vendor-webhook mutation and its audit-log write were not atomic  ·  MEDIUM  ·  confidence high

**Where:** `apps/api/src/riders/rider.service.ts` (`applyKycResult`).

**What:** the CAS-guarded status `updateMany` committed first; the `AuditLog.create` for that decision
ran afterward in its own try/catch that only warned on failure. Every other domain-mutation-plus-audit
pair in the codebase (`admin-riders.service.ts` suspend/lift/ban, `admin-orders.service.ts` cancel/fare)
wraps both in one `$transaction`. A failed audit insert here would let an automated KYC approve/decline
commit with zero audit trail — and, per the ledger's KB-FEED-SYNTH mechanism (the feed derives
account-status rows from this exact table), the rider would silently lose that feed notification too.

**Why past sweeps missed it:** the function's monotonic/replay-safe CAS guard (F-13, DS14-04) was
audited and hardened repeatedly; the audit write living outside the transaction boundary was a separate,
narrower gap in the same function.

**Fix:** the status mutation and its `AuditLog.create` now share one `$transaction`, matching the
established `admin-riders.service.ts` pattern. The CAS semantics, the F-13 replay-safe `kycAttempts`
increment, and the expired-reset logic are unchanged — only the audit write moved inside the transaction
boundary. Regression test: `apps/api/src/riders/rider.service.spec.ts` (forces the audit write to fail
and asserts the mutation rolls back with it, rather than committing without an audit trail).

---

### DS15-07 — `Order.note` free-text field was never scrubbed on erasure  ·  MEDIUM  ·  confidence medium-high

**Where:** `apps/api/src/privacy/privacy.service.ts` (`eraseAccount`).

**What:** `stripWaypointPhone` nulled `contactPhone` embedded in pickup/dropoff JSON, but `Order.note`
(customer-entered delivery instructions, e.g. "call 077... if the gate's locked") is the same class of
dialable/address PII and was never touched — and orders are retained forever as the ledger, so an
erased customer's phone/address could remain fully readable indefinitely.

**Why past sweeps missed it:** DS-01's erasure pass focused on structured columns (`SosEvent` GPS); a
free-text field holding the same PII class in a different table wasn't traced.

**Fix:** `Order.note` is now nulled alongside the existing waypoint-phone strip, scoped to the erasing
customer's own placed orders (matching the existing convention that a rider's erasure never touches the
counterparty customer's contact data). Regression test: `privacy.service.spec.ts`.

---

### DS15-08 — `/healthz` shared the bounded Postgres connection pool  ·  MEDIUM  ·  confidence medium

**Where:** `apps/api/src/health/health.service.ts`.

**What:** the health check is deliberately unauthenticated/unthrottled for LB probing, and DS-04 already
fixed its Redis-connection-per-request leak, but `prisma.ping()` drew from the same bounded (`max:10`)
pool used by real traffic — a probe flood or an incident-time spike in health checks could queue on
connection acquisition and starve the pool real requests need, all while itself hanging instead of
failing fast.

**Why past sweeps missed it:** DS-04 fixed the Redis half of this exact function; the DB half of the
same health check was never independently checked.

**Fix:** a new `pingDb()` races `prisma.ping()` against a 2s timeout (`Promise.race` + `unref`, mirroring
the DS-04 Redis-ping pattern exactly), so a saturated pool now fails the probe fast — correctly marking
the instance unhealthy — instead of holding the connection-acquire wait open indefinitely. Regression
test: `apps/api/src/health/health.service.spec.ts` (new file — none existed before; covers success, a
`false` ping, and a hanging ping timing out to unhealthy).

---

### DS15-09 — `POST /orders/notify-me` accepted a foreign `orderId` with no ownership check  ·  LOW-MEDIUM  ·  confidence high

**Where:** `apps/api/src/orders/orders.controller.ts` (`notifyWhenAvailable`) →
`apps/api/src/orders/orders.service.ts` (`requestNotifyWhenAvailable`).

**What:** the optional `orderId` on this route was threaded straight through to a Redis waiter
registration keyed by the CALLER's own profile id, with no check that the order actually belongs to the
calling customer. Any authenticated profile (most easily a rider, who can enumerate live order ids via
`GET /orders/open`) could register a notify-me waiter tied to a victim's order id; when a nearby rider
later came online, the ATTACKER (not the victim) would get pushed a notification with
`data.orderId` pointing at the victim's order and copy implying it was their own live request — a
coarse, noisy "is this order still open" oracle plus a confusing/spoofed push. Bounded impact: tapping
the push still 403s at the party-gated `getSnapshot`, so no order content was ever exposed.

**Why past sweeps missed it:** `orderId` was only added to this pipeline in the 07-14 UX follow-up
(KB-NOTIFY-ORDERID) as a feature-completion fix threading the field through for honest copy — nobody
added an ownership assertion because the pre-fix endpoint carried no `orderId` at all. It's new surface
area introduced by that very fix, after the party-gate sweeps (offers `listForOrder`, order
`getSnapshot`) had already run.

**Fix:** `requestNotifyWhenAvailable` now looks up the order's `customerId` and only forwards the
`orderId` to `addNotifyRequest` if it matches the caller; a foreign or non-existent order silently drops
to a generic (order-less) notify-me instead of erroring, the safer graceful-degradation choice.
Regression tests: `apps/api/src/orders/orders.service.spec.ts`.

---

### DS15-10 — FCM `sendEach`'s multi-chunk partial failure discarded already-succeeded results  ·  LOW  ·  confidence high

**Where:** `apps/api/src/adapters/push/fcm.push.ts` (`sendEach`).

**What:** the chunking loop (batches of ≤`FCM_BATCH_LIMIT`) was wrapped in a single try/catch around the
WHOLE loop. If chunk 1 succeeded and chunk 2 threw (a transient FCM 5xx/timeout mid-loop), the catch
discarded the already-collected chunk-1 results and reported EVERY message across EVERY chunk as failed
— including the ones that genuinely succeeded. `notifications.service.ts`'s `send()` zips results
positionally to build the delivered/dead-token-prune sets, so chunk-1-succeeded profiles were wrongly
excluded from `delivered` (fail-safe direction — under-counting, not data loss, since the "notify me"
at-least-once design re-pings via the next rider — but still a real bug once a fan-out exceeds 500
tokens).

**Why past sweeps missed it:** prior reviews verified the *introduction* of chunking (replacing per-token
fan-out) and both single-chunk happy/whole-failure paths; this specific interleaving only exists once a
single call spans more than one chunk.

**Fix:** the try/catch moved inside the chunking loop so each chunk's failure is isolated — a throwing
chunk contributes failed entries only for its own messages, while previously-succeeded chunks keep their
real results. Regression tests: `apps/api/src/adapters/push/fcm.push.spec.ts`.

---

## Verification

`pnpm typecheck` and the full `apps/api` test suite green (866 tests, including all new regression
tests) — see the shipping PR for the final combined run across the whole monorepo.
