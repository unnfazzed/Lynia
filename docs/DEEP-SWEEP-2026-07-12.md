# Deep bug sweep — 2026-07-12

Orthogonal sweep run after consolidating all prior sweep history into `docs/KNOWN_BUGS.md`.
The prior sweeps (F-01…F-19 plus the FRAUD/SECURITY/UX/ENG reviews) were exhaustive on the
heavily-trafficked flows — auth, orders/lifecycle, offers/matching, settlements, KYC, tracking
gateway, admin, notifications. **All of F-01…F-19 are already remediated in code** (PR #192/#193);
the on-disk `BUGHUNT_FINDINGS.md` marking them OPEN is stale.

This sweep therefore targeted (1) modules no prior sweep audited — `sos`, `privacy`, `health`,
`uploads`, `observability`, adapters; and (2) propagation of the two structural patterns behind the
most recent OPEN findings — F-12 (fire-and-forget / process-crash surface) and F-17 (BullMQ
enqueue/retry) — into sibling code the fixes never touched.

Severity legend: CRITICAL / HIGH / MEDIUM / LOW. Confidence: high / medium / low.

---

## New findings

### DS-01 — Right-to-erasure and retention purge both miss the `SosEvent` table → emergency-time precise location retained indefinitely  ·  HIGH  ·  confidence high

**Where:** `apps/api/src/privacy/privacy.service.ts:63-127` (`eraseAccount`) and `:134-151`
(`purgeExpiredData`); table `apps/api/prisma/schema.prisma:450-463` (`model SosEvent`).

**What:** `SosEvent` stores precise `lat`/`lng` plus `raisedByProfileId` (and `orderId`) for every
SOS raised on a live trip. `eraseAccount` scrubs `Profile`, `Rider`, `Address`, `DeviceToken`,
`Session`, `OrderEvent.lat/lng`, and the pickup/dropoff JSON contact phones — but **never touches
`SosEvent`**. The daily `purgeExpiredData` retention sweep scrubs `OrderEvent` GPS after
`GPS_RETENTION_DAYS` but **never `SosEvent`** either.

**Repro:** User raises SOS during a trip (writes a `sos_events` row with exact coordinates). Later
they exercise right-to-erasure (`DELETE /auth/me` → `eraseAccount`). Their profile is anonymised in
place ("Deleted User", tombstoned phone) but the profile id survives, and `SosEvent.raisedByProfileId`
still points to it alongside the precise emergency location — retained forever, and never dropped by
the retention window either.

**Why this matters:** The product's docs (`docs/DATA-RETENTION.md`, LR8/CDPA) claim right-to-erasure
and a GPS retention window. `eraseAccount` deliberately scrubs `OrderEvent.lat/lng` for exactly this
reason, so leaving the SOS location trail behind is an inconsistency, not intended retention. It is
the most sensitive location data in the system (emergency moments).

**Why past sweeps missed it:** `SosEvent` is a new table; `eraseAccount`/`purgeExpiredData` predate
it and were never updated. No prior sweep audited `privacy` or `sos`. (Lesser same-root-cause note:
free-text authored by the erasing user in `Report.note` / `Rating.comment` / `Issue.description` is
also never scrubbed — mention only, lower priority.)

**Fix:** In `eraseAccount`'s transaction, `tx.sosEvent.updateMany({ where: { raisedByProfileId:
profileId }, data: { lat: null, lng: null } })`; add the same to `purgeExpiredData` keyed on
`createdAt < gpsCutoff`.

---

### DS-02 — BullMQ `Queue`/`Worker` have no `error` listener → a Redis blip crashes the whole API instance  ·  HIGH  ·  confidence medium-high

**Where:** `apps/api/src/matching/offer-expiry.service.ts:69-77` and
`apps/api/src/orders/order-lifecycle.service.ts:108-114` (both `new Queue(...)` + `new Worker(...)`
with only `.on("failed", …)`); crash routed via `apps/api/src/main.ts:38-41`.

**What:** Both services attach only a `.on("failed")` listener (job-level failures). BullMQ 5
(`^5.80.1`) re-emits its underlying ioredis connection errors as an **`error` event on the
Queue/Worker EventEmitter**. With no `error` listener, Node's EventEmitter throws
`Unhandled 'error' event` **synchronously** from inside the redis event callback → this surfaces as
an `uncaughtException` → the F-12 backstop in `main.ts` runs and calls `process.exit(1)`.

**Repro:** Redis failover / Memorystore maintenance / a transient network hiccup while a worker or
queue is live → the entire API instance exits, dropping every in-flight HTTP request and every
tracking socket, fleet-wide as instances hit the same blip.

**Why past sweeps missed it:** F-12 hardened *promise* rejections (`void`/reconciler `findMany`) and
added the `unhandledRejection` backstop that deliberately **keeps serving**. But an EventEmitter
`error` event is not a promise rejection — it routes to `uncaughtException`, which the very same F-12
handler **deliberately exits on**. The existing `.on("failed")` listener looks like error handling
but does not cover the `error` event. (Verified that the raw ioredis clients elsewhere —
`common/redis.ts`, socket.io pub/sub — do *not* crash: ioredis 5 routes connection errors through
`silentEmit` when unlistened. BullMQ's own EventEmitter has no such guard, so it is the lone live
crash vector.)

**Fix:** Add `this.queue.on("error", …)` and `this.worker.on("error", …)` (log, do not exit) on all
four instances.

---

### DS-03 — Admin `cancelOrder` / `adjustFare` use a non-CAS check-then-act update → clobbers a concurrent lifecycle transition  ·  MEDIUM  ·  confidence medium

**Where:** `apps/api/src/admin/admin-orders.service.ts:80-115` (`cancelOrder`), `:130-149`
(`adjustFare`).

**What:** Every *user-facing* transition (`advance`, `confirmDelivery`, `markUndelivered`, `cancel`,
`selectOffer`, `expireOrder`, `resolve`) flips state with a guarded CAS —
`updateMany({ where: { id, status: expected } })` and treats `count === 0` as a conflict. The admin
`cancelOrder` path instead does `findUnique` → checks `TERMINAL_STATUSES` → `update({ where: { id } })`
with **no `status` guard**.

**Repro:** Order is `en_route_dropoff`. Admin `cancelOrder` reads it (passes the terminal check).
Concurrently the rider's `confirmDelivery` (`SELECT … FOR UPDATE`, flips to `delivered`) commits.
The admin `update` then overwrites `delivered` → `cancelled`, stamping `cancelledBy`/`cancelledAt`
and appending a `cancelled` OrderEvent after the `delivered` one. The parcel was delivered but the
order reads cancelled; the scheduled auto-close/rate CAS then no-ops. Two ops double-clicking cancel
likewise both pass the terminal check and each write a duplicate `cancelled` event + audit row.
`adjustFare` has the same shape (lower impact: last-writer-wins on the fare value + duplicate audit
rows).

**Why past sweeps missed it:** Sweeps that audited the lifecycle CAS treated admin actions as
trusted/serial and skipped them; `delivered` is deliberately non-terminal, which makes it a live
target for the admin overwrite.

**Fix:** Make the admin writes CAS too — `updateMany({ where: { id, status: { notIn:
TERMINAL_STATUSES } } })` and treat `count === 0` as a conflict (someone else moved it).

---

### DS-04 — `/healthz` is unauthenticated, unthrottled, and opens a fresh Redis connection per request  ·  MEDIUM  ·  confidence medium

**Where:** `apps/api/src/health/health.service.ts:30-42` (`pingRedis` does `new Redis(url,
{ lazyConnect })` → `connect()` → `disconnect()` every call); `health.controller.ts:14-23` (no
`@UseGuards`, no `@Throttle`).

**What:** `HealthController` carries no guard and no throttle (the global `ThrottleGuard` no-ops
without per-route metadata). Each `/healthz` hit runs `prisma.ping()` **and** constructs a brand-new
ioredis client that opens a TCP connection, pings, and tears down.

**Repro:** An unauthenticated attacker floods `/healthz`. Each request forces a fresh Redis TCP
connect (up to the connect window under a slow Redis) plus a DB round-trip — connection/fd churn,
pressure on Redis `maxclients`, and DB-pool contention that degrades real traffic. A single shared/
pooled Redis client (as used elsewhere) would remove the per-request connect.

**Why past sweeps missed it:** Health endpoints read as benign and were skimmed; no sweep looked at
`health`.

**Fix:** Reuse a shared Redis client for the ping instead of constructing one per call; add a modest
`@Throttle` on `/healthz` (or exempt it from public flooding at the LB).

---

### DS-05 — `POST /orders/:orderId/sos` is unthrottled with no dedup → ops + counterparty push flood  ·  LOW-MEDIUM  ·  confidence high

**Where:** `apps/api/src/sos/sos.controller.ts` (no `@Throttle`); `sos.service.ts:74-87`.

**What:** Any party on an order in a reveal-window status can POST `/sos` in a loop. Each call writes
a `SosEvent` and fires `notifications.notifyOps(...)` **and** a push to the counterparty, with no
per-order/per-caller rate limit and no coalescing of repeat SOS on the same order → ops-console alert
flooding + counterparty push spam / battery drain. The repo throttles other fan-out writes
(`orders` create, `notify-me`) for exactly this reason; SOS does not.

**Fix:** `@Throttle` the route and/or coalesce repeat SOS on the same (order, caller) within a short
window (still always return the static emergency contacts).

---

## Lower-severity / cluster notes

- **DS-06 (LOW):** `scheduleAutoClose` (`order-lifecycle.service.ts:709-713`) sets no
  `attempts`/`backoff`, so BullMQ defaults to 1 attempt — inconsistent with the sibling
  `OfferExpiryService.schedule` (`attempts:3` + exponential backoff). Bounded: the 15-min
  `reconcileStaleDeliveries` sweep backstops it and `completeOrder` is idempotent, so the order just
  closes ≤15 min late. Add `attempts`/`backoff` for parity.
- **DS-07 (LOW):** `POST /uploads/kyc-photo` and `/uploads/pickup-photo`
  (`uploads.controller.ts:26-72`) are unthrottled; in prod each mint is a GCP IAM `signBlob` call on
  a project-shared quota (also used by admin KYC-photo reads and pickup-photo snapshot reads), so a
  loop can exhaust signing platform-wide. Add `@Throttle`.
- **DS-08 (LOW):** `POST /notifications/device-token`
  (`notifications.controller.ts:26-32`) is unthrottled (idempotent upsert, no fan-out — low impact).
  Modest cap.
- **DS-09 (LOW, confidence low-medium):** trailing-edge `setTimeout` in the position coalescer
  (`tracking.gateway.ts:321-343`, `flushPositionEmit`) is a synchronous callback with no try/catch
  around `server.to(room).emit(...)`; a synchronous throw there is an `uncaughtException` → exit.
  socket.io `emit` rarely throws, so low. Wrap the flush.
- **DS-10 (LOW):** `privacy.eraseAccount` reads the active-ride guard *outside* the erase
  transaction (`privacy.service.ts:49-58`), a minor TOCTOU: an order could go active between the
  check and the scrub. Recoverable and narrow; fold the guard into the tx or re-check inside.

## Confirmed still-open from prior sweeps (not new)

- **FRAUD P1-5 (report/issue spam → ops DoS + manufactured strikes):** the **reports** side now has
  a compound-unique dedup (`schema.prisma:431` `@@unique([orderId, reporterProfileId,
  subjectProfileId])`), but the **issues** side (`issues.service.raise`, `issues.controller`) still
  has **no per-order dedup/cap, no order-status gate, and no `@Throttle`**, and unconditionally fans
  `notifyOps` out to every admin device token. This is the same class as DS-05 and should get a
  `@Throttle` + per-(order, opener) open-issue cap. Marked confirmed (known), not new.

---

## Adversarial (direct-API) pass

A malicious authenticated user with direct API access (curl, no app) was simulated against every
`:id`-scoped and state-changing route, guard, and the WS gateway.

**Bottom line: no new CRITICAL/HIGH object-level authz or gate bypass.** The classic surface is
genuinely closed. Re-verified as present in the service layer (not just JWT-authenticated):
party-gating on `getSnapshot` / `offers.listForOrder` / WS `subscribeOrder`+`riderLocation`
(`canAccessOrder`/`isAssignedRider`); role derived from the order relationship on every lifecycle
transition; `selectOffer` customer-gated + self-bid blocked + standing re-checked in-tx;
reports/issues/sos reject non-parties; upload keys namespaced to `${callerId}` and re-validated on
attach; logout/refresh session-scoped by `profileId` with atomic rotation; JWT HS256-pinned, no
`x-user-id` in prod; fares bounded and `accept` offers server-bound to `proposedFare` (no
free/underpriced-delivery vector).

One genuinely new finding surfaced:

### DS-11 — `idNumber` freely mutable via `PATCH /auth/me` defeats the A-04 duplicate-ID / ban-evasion signal  ·  LOW-MEDIUM  ·  confidence medium

**Where:** `apps/api/src/auth/auth.service.ts:126-138` (`updateProfile`) rewrites `idNumber` +
`idNumberHash` whenever the body supplies `idNumber`. The A-04 duplicate-account flag is computed
**only** at `completeProfile` / `becomeRider` (`rider.service.ts:66-79`, `:103-110`, via
`duplicateIdAccountCount`) and never recomputed on this mutation path.

**Repro:** A ban-evader onboards / becomes a rider with a clean national ID (no duplicate flag
raised), then `curl -X PATCH .../auth/me -d '{"firstName":"x","lastName":"y","idNumber":"<real-dup>"}'`.
The account now carries a colliding `idNumberHash` but the A-04 signal was never re-run, so the
reviewer never sees the collision. Symmetrically, a rider flagged at become-time could PATCH to a
clean ID to launder the field the reviewer would collide on.

**Why past sweeps missed it:** sweeps treated `idNumber` as an unverified free-text account field
("riders KYC separately") and never tied its mutation back to the A-04 dedup ledger signal.
Distinct from the known FRAUD P1-3 (phone-only identity / no dedup at all): here the dedup *exists*
but is silently bypassable through a mutation route.

**Fix:** recompute `duplicateIdAccountCount` (and re-raise/clear the flag + audit) inside
`updateProfile` whenever `idNumber` changes, or reject `idNumber` changes post-KYC.

### Adversarial findings that are already-known (folded, not new)

- **Rider zero-penalty self-terminate via `markUndelivered(refused|wrong_address)`** (no OTP/photo,
  keeps parcel, `undeliveredPenalty()===0`) = **FRAUD P0-3 undelivered-escape-hatch**. The
  commission-exclusion angle is mooted by the settlement rewrite; the penalty-free-abandonment +
  no-evidence angle **remains open** on the reliability side. Confirmed still-open, not new.
- **`POST /kyc/callback` unauthenticated when `DIDIT_WEBHOOK_SECRET` unset & provider≠didit** =
  **BUG-HUNT p3-kyc-callback-unsigned-stub**, adjacent to the confirmed-fixed didit fail-open.
  Prod is protected (launch guard rejects `KYC_PROVIDER=stub`), so stub/misconfig-only. Recommend
  widening the fail-closed check to "secret required whenever the route is mounted." Confirmed, not
  new.
- **`registerToken` upsert rehomes any FCM token to the caller** = **BUG-HUNT
  p3-device-token-rehoming** (overlaps F-04, intended shared-device re-login). Confirmed, not new.

---

## Summary

- **New findings:** 11 (DS-01…DS-11) — **2 HIGH** (DS-01 SosEvent erasure/retention gap; DS-02
  BullMQ missing `error` listener → instance crash on Redis blip), **2 MEDIUM** (DS-03 admin non-CAS
  cancel/adjust; DS-04 `/healthz` Redis-per-request amplification), the rest LOW / LOW-MEDIUM.
- **Confirmed still-open from prior sweeps:** FRAUD P1-5 (issue-raise ops-DoS, issues side),
  FRAUD P0-3 (undelivered penalty-free abandonment), BUG-HUNT kyc-callback-stub, device-token
  rehoming.
- **Stopping rule:** does **not** apply — Phase 1 produced new HIGH findings (DS-01, DS-02).
- **Method note:** all F-01…F-19 were verified fixed in code (the on-disk `BUGHUNT_FINDINGS.md`
  OPEN markings are stale); the two HIGH findings came from the never-audited modules (`privacy`/
  `sos`) and from propagating the F-12 crash-surface pattern into the EventEmitter-`error` axis the
  fix did not cover — exactly the untouched ground Phase 0 pointed at.
