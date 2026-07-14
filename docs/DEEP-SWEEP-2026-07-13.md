# Deep bug sweep — 2026-07-13

Orthogonal sweep run against latest `main` (post-#208), inheriting the full history consolidated in
`docs/KNOWN_BUGS.md` and the prior orthogonal pass `docs/DEEP-SWEEP-2026-07-12.md` (DS-01…DS-11, all
remediated). **Phase-0 re-verification confirmed 8/8 sampled prior fixes are still intact in code**
(F-01, F-12, F-15, DS-02, DS-03, DS-11, the UX-0712 feed rewrite, and BH-01/BH-02 from #204) — no
regressions.

This sweep ran four orthogonal Fable hunting passes plus an adversarial pass:
1. **Never-audited-area deep read** — a second pass over `sos`/`privacy`/`health`/`uploads`/
   `observability`/adapters/`common`/`tracking.service` internals, going past the DS-01…DS-11 surface.
2. **Pattern propagation** — for each prior fix, grep every sibling occurrence of the same mistake
   (crash-safety `.catch`, BullMQ `error` listeners, CAS/TOCTOU, swallowed catches, throttle coverage,
   notification-failure-that-a-flow-depends-on).
3. **Cross-cutting mechanism audit** — transactions/rollback, socket dup/stale handlers, BullMQ
   idempotency, timer boundaries, killed-app state divergence, exactly-one-row Prisma assumptions,
   money numerics, object-authz / KYC-gate bypass.
4. **Adversarial API pass** (Phase 3, below) — malicious authenticated user with direct curl access.

Two agent-proposed candidates were **rejected on my own code re-read** and are recorded here so the
next sweep doesn't re-derive them:
- *markUndelivered double-penalty on retry* — **not a bug.** The status CAS `updateMany` is followed
  immediately by `if (claimed.count === 0) throw` (`order-lifecycle.service.ts:378`), which aborts the
  whole `$transaction` before any penalty/velocity write. A lost-response retry re-reads
  `status:"undelivered"`, fails the `POST_PICKUP_FOR_UNDELIVERED` gate (`:361`) and throws before the
  CAS. No side effect ever double-applies.
- *stale offer-expiry job expiring a rebroadcast window* — **not a bug.** A rebroadcast creates a NEW
  order id (`cloneForRebroadcast`); the stale expiry job references the OLD order id and CAS-no-ops.

Severity legend: CRITICAL / HIGH / MEDIUM / LOW. Confidence: high / medium / low.

---

## New findings

### DS13-01 — Multi-instance customer-presence refutation matches on global JWT `role`, re-introducing the exact F-16 dual-role-sender bug the subscribe path was hardened against  ·  MEDIUM  ·  confidence high

*(Independently surfaced by two separate hunting passes.)*

**Where:** `apps/api/src/tracking/tracking.gateway.ts:593-601` (`customerLiveInRoom`, matches
`s.data.user?.role === "customer"`), called from `scanCustomerPresence` at `:567`. Contrast the
F-16-hardened, relationship-driven `subscribeOrder` (`:197-208`) and the correctly id-matched rider
mirror `riderLiveInRoom` (`:611-618`, matches on `sub`).

**What:** `Role` is one enum per account, and `becomeRider` flips it to `"rider"` permanently
(`rider.service.ts:141`). A rider-role account that places a parcel *as the customer/sender* is an
explicitly-supported case — F-16 rewrote `subscribeOrder` to track customer-side presence by the
per-order relationship (“not the assigned rider ⇒ the customer”), **not** the JWT role, for exactly
this reason. But the multi-instance false-positive guard `customerLiveInRoom` — added later for the
Redis-adapter cluster check — filters `fetchSockets()` on `role === "customer"`. A rider-role sender's
live socket carries `role:"rider"` globally, so it is invisible to the refutation.

**Repro:** Multi-instance prod (Socket.IO Redis adapter on when `REDIS_URL` is set). A rider-role user
places and tracks their own order → subscribes on instance A (correctly counted live via
`markCustomerPresent`, in-memory). Their socket migrates to instance B (reconnect / LB rebalance).
Instance A still holds `darkSince` for the order; the next `scanPresence` finds it dark past
`PRESENCE_ESCALATION_MS`, calls `customerLiveInRoom` → the sender's live socket on B is `role:"rider"`,
not matched → returns false → instance A escalates a false `presence:stale role:"customer"` to the
assigned rider ("sender's live view paused"), and the `darkSince`-clear / claim-release recovery branch
never fires for them.

**Why past sweeps missed it:** F-16 fixed and verified the *subscribe* side; the fetchSockets
refutation helper was added in later multi-instance hardening and silently reverted to role-matching
(its own docstring even mis-states that `subscribeOrder` "gates on … role"). Catching it needs
cross-method reasoning plus the knowledge that a rider account can be a sender. `riderLiveInRoom` next
to it already matches on `sub`, highlighting the asymmetry.

**Fix:** Match the customer by the order relationship, mirroring the rider twin: resolve the order's
assigned rider id and treat "any socket in the room whose `sub` is not the assigned rider" as the
customer being live (only the customer and assigned rider can join the room, per `canAccessOrder`).

---

### DS13-02 — Every socket disconnect evicts an online rider from the Redis geo index → backgrounded-but-online riders receive no new-order FCM push and are excluded from supply counts  ·  HIGH  ·  confidence medium-high

**Where:** `apps/api/src/tracking/tracking.service.ts:324-347` (`flushToPg` → `evictFromGeo` on every
disconnect) and the Redis branch of `nearbyRiders` (`:360-401`); consumers
`apps/api/src/orders/orders.service.ts:301-308` (FCM broadcast audience), `:321-330`
(`countNearbyForPickup` supply signal), and the no-supply expiry verdict
`apps/api/src/matching/matching.service.ts` (`expiryNoSupply`). Disconnect path:
`tracking.gateway.ts:183` (`flushToPg` on `handleDisconnect`).

**What:** `nearbyRiders` with Redis healthy uses `GEOSEARCH` candidates as the **primary** source and
only *filters* them against PG `is_online`; it never re-adds a rider absent from the geo set. But
`flushToPg` — fired on **every** socket disconnect — calls `evictFromGeo`, removing the rider from the
geo zset. Backgrounding/locking the phone drops the socket within seconds while PG still says
`is_online = true` with a live `geog`. The code's own comments assert "PG's `is_online` is the
authority for nearbyRiders" (`rider.service.ts:226`, `evictFromGeo` docstring), but the Redis prefilter
silently overrides that authority: the evicted rider vanishes from candidates. The FCM broadcast is
documented as the channel for exactly "riders NOT currently on the board"
(`orders.service.ts:299-300`) — the backgrounded, idle-waiting rider — yet that rider is precisely who
gets dropped.

**Repro:** Prod config (`REDIS_URL` set). Rider goes online on the board, locks phone. ~60s later the
OS suspends the socket → disconnect → `evictFromGeo`. A customer posts an order at the rider's location
→ `GEOSEARCH` misses them → no FCM push (and if no other rider is indexed, `candidates=[]`
short-circuits before the PG path entirely), the customer sees a false "no riders online"
(`countNearbyForPickup` undercount), and the auction can be persisted as `expiryNoSupply` ("nobody was
online near your pickup") while online riders sat 500 m away with pocketed phones. The PG-only path
(no Redis) would have included them — the Redis prefilter changed behavior.

**Why past sweeps missed it:** the UX-0712 "idle-rider position" fix validated the *foreground* case
(go-online `recordFix` + the 20 s heartbeat). Integration tests run without `REDIS_URL`, exercising the
PG path that *does* include these riders. And `evictFromGeo`-on-disconnect was itself a fix (stale
GEOSEARCH slots) whose interaction with the FCM channel's audience was never traced.

**Fix (conservative):** Stop evicting from the geo index on socket *disconnect* — keep eviction on
explicit go-offline (`setOnline(false)`, which also sets `is_online=false`). PG `is_online` remains the
authority and the `nearbyRiders` PG filter still drops genuinely-offline members, so a
backgrounded-but-online rider stays a valid broadcast/supply candidate (aligning geo membership with
the documented `is_online` authority). Matching/assignment is offer-based and does not consume the geo
index, so live-selection semantics are unchanged.

---

### DS13-03 — Admin order-cancel pushes WS only — no FCM to the assigned rider/customer, unlike the party-initiated cancel  ·  MEDIUM  ·  confidence high

**Where:** `apps/api/src/admin/admin-orders.service.ts:126-132` (post-commit emits only
`gateway.emitOrderStatus` + `emitJobCancelled`; the service does not even inject
`NotificationsService`). Contrast the party cancel `apps/api/src/orders/order-lifecycle.service.ts:646`
(`notifyOrderStatus(orderId, "cancelled", {}, callerId)` FCM push) and every other transition's WS+FCM
pairing via `safeEmit`.

**What:** When ops cancels a live assigned/en-route order (dispute, fraud) while the rider's app is
backgrounded or their socket is momentarily down, the WS `job:cancelled` reaches nobody and there is no
FCM fallback. The rider keeps riding toward pickup — potentially collecting a parcel on a cancelled
order — until the next foreground snapshot refetch catches up. `AdminRidersService` (suspend/lift/hold)
*does* push standing changes, so the omission is an inconsistency, not a deliberate policy.

**Why past sweeps missed it:** DS-03 audited these exact methods but only for CAS atomicity; the P2-3
fix added the WS emits, making the method *look* like it notifies. Nobody compared push parity between
the admin and party cancel paths.

**Fix:** Inject `NotificationsService` and fire the same best-effort `notifyOrderStatus(orderId,
"cancelled", {}, actor)` post-commit that the party path uses.

---

### DS13-04 — Admin rider/customer standing mutations lack the DS-03 CAS guard and the lifecycle rider-row lock → a lift/clear-hold can silently clobber a concurrent ban or velocity auto-hold  ·  MEDIUM  ·  confidence high

**Where:** `apps/api/src/admin/admin-riders.service.ts` — `suspendRider` (`:185-201`), `liftRider`
(`:216-258`), `banRider` (`:264-280`), `clearHold` (`:291-...`); and
`apps/api/src/admin/admin-customers.service.ts` `holdCustomer`/`liftCustomerHold`. Contrast the
DS-03-fixed sibling `admin-orders.service.ts:96-107` (CAS `updateMany` on observed status) and the
`lockRiderRow` discipline in `order-lifecycle.service.ts`.

**What:** each method does read → in-JS guard-check → naive `tx.rider.update`, with **no**
observed-state `updateMany` CAS and **no** `FOR UPDATE` row lock. Under READ COMMITTED the in-tx
`findUnique` serializes nothing.

**Concrete repros:**
1. **Un-ban via lift race:** op A calls `liftRider` (reads `SUSPENDED`, passes the "a banned rider
   can't be lifted" guard at `:225-227`); op B's `banRider` commits; A's unguarded update at `:234`
   then writes `accountStatus=ACTIVE, suspendReason=null`, silently reversing the ban the code
   explicitly says must require "a separate, deliberate action." Exactly the clobber shape DS-03 fixed
   one file over.
2. **Velocity-hold clobber:** `clearHold`/`liftRider` compute `reliabilityScore: Math.max(observed,
   ON_HOLD_CLEAR_AT)` from a stale read **without** `lockRiderRow`. The `markUndelivered` velocity
   auto-hold (`order-lifecycle.service.ts`, FRAUD P0-3 #198) *does* take the lock and set `onHold=true`;
   an admin clear racing it overwrites the just-committed hold, un-holding an abusive rider.

**Why past sweeps missed it:** DS-03 fixed the admin **order** mutations; the admin **standing**
mutations are a sibling family that inherited the same pre-CAS shape and were never swept together.

**Fix:** Mirror DS-03 — replace each naive `update` with a CAS `updateMany` guarded on the observed
`accountStatus`/`onHold` (conflict on 0 rows), and take `lockRiderRow` before the reliability-score
recompute in `liftRider`/`clearHold`.

---

### DS13-05 — SOS is write-only: `SosEvent` has no ops read surface and its sole escalation is an un-reconciled best-effort push to a token audience that may be empty  ·  HIGH  ·  confidence medium

**Where:** `apps/api/src/sos/sos.service.ts:55-87`; `apps/api/src/notifications/notifications.service.ts`
(`notifyOps` fan-out to `role=admin` device tokens); `apps/admin` (absence — no SOS surface). The only
readers of `SosEvent` in the entire repo are the privacy scrubbers (`privacy.service.ts`).

**What:** The only channel by which Lynia's team learns of an SOS is `notifyOps` — one un-retried FCM
fan-out to `role=admin` profiles' device tokens, which swallows all failures. But device tokens are
registered **only** by the mobile app (`POST /notifications/device-token`); the admin **web** console
contains zero FCM/device-token code. `SosEvent` rows are never read by any ops-facing surface. So if
the push fails — or, more likely, fans out to **zero** devices because no admin logged into the mobile
app — the SOS vanishes permanently, while `sos.service.ts:84` simultaneously tells the counterparty
"Lynia's safety team has been alerted." Contrast issue-raise, whose best-effort ops push is backstopped
by the durable, listable admin issues queue.

**Repro:** raise SOS on a live order in an environment where no `role=admin` profile has a `DeviceToken`
row → 200 with contacts, counterparty told the team was alerted, `notifyOps` sends to an empty token
set, and no human-facing system ever shows the event.

**Why past sweeps missed it:** UX-0712 #5 fixed the *raiser-side sheet copy*; the server-side
dead-end (write-only `SosEvent`, no admin surface, token-less ops audience) survives that fix and no
sweep audited the SOS *consumer* side.

**Fix (conservative, backend):** Add a read-only, `AdminGuard`-gated endpoint that lists recent
`SosEvent` rows (making SOS no longer write-only so ops has a durable surface independent of push
delivery), and emit a loud `logger.error` when `notifyOps` resolves to zero recipients so a token-less
audience is observable. (A full admin-web SOS panel + acknowledgement workflow was a follow-up product
item at the time this was written; both have since shipped — see the post-merge status table below.)

---

### DS13-06 — `POST /riders/become` is unthrottled → a parallel burst mints N paid Didit sessions and leaks P2002 as a 500  ·  LOW  ·  confidence medium

**Where:** `apps/api/src/riders/riders.controller.ts:38-41` (no `@Throttle`);
`apps/api/src/riders/rider.service.ts` `becomeRider` (`findUnique` pre-check → `vendor.submit()` →
`rider.create`). Contrast `kyc/retry` at `:47`, which carries `@Throttle({limit:5, windowSec:3600})`
**explicitly** for the same paid-vendor-session reason (F-13), and DS-07's throttle on uploads for
signBlob quota.

**What:** an authenticated customer fires ~50 parallel `POST /riders/become`. All pass the
existing-rider `findUnique` pre-check (no rider row yet), all reach `vendor.submit(profileId)` → up to
50 paid Didit sessions billed in one burst. One `rider.create` then wins and the rest throw P2002,
which — unlike `orders.create` and `rateSender` — is not mapped to a 409, so the losers get a raw 500.

**Why past sweeps missed it:** the throttle rollout added `@Throttle` route-by-route as each was
noticed; `become` sits next to the throttled `kyc/retry` with the same cost profile but was skipped.

**Fix:** add `@Throttle({limit:5, windowSec:3600, keyPrefix:"become"})` (parity with `kyc/retry`), and
map P2002 in `becomeRider` to a `ConflictException` instead of leaking a 500.

---

### DS13-07 — Cancelling an `open_for_offers` auction never signals the board → dead cards and live "offer sent" states linger until local countdown/409  ·  LOW  ·  confidence high

**Where:** `apps/api/src/orders/order-lifecycle.service.ts:612-647` and
`apps/api/src/admin/admin-orders.service.ts:130` — a cancel of an open order declines pending offers
in-tx and emits `order:status` to the **order room** only. `emitOrderTaken` fires on select
(`matching.service.ts`) and `bid:expired` on expiry, but a cancelled-while-open order emits nothing to
the board geo rooms; the later expiry job CAS-no-ops so `bid:expired` never fires either.

**What:** browsing riders keep the dead card (a bid returns 409), and bidders' sent-offer cards run
their countdown to zero showing "window closed" rather than anything truthful. Self-heals within the
≤90 s window and the 409 is handled cleanly client-side, hence LOW.

**Why past sweeps missed it:** sweeps verified board closure on the two common terminal paths
(taken/expired); customer-cancel-mid-auction is the rare third path and the short window keeps it
invisible in QA.

**Fix (optional):** on a cancel of an `open_for_offers` order, emit a board-close signal (reuse the
`bid:expired`/order-taken board event) to the pickup geo rooms so browsing riders and bidders see the
truthful terminal state immediately.

---

## Phase 3 — adversarial API pass

A malicious-authenticated-user pass (direct curl, no app) traced all six abuse classes: free/underpriced
deliveries, bid/fare manipulation, IDOR/object-authz, replay/forgery, KYC-/standing-gate bypass, and
privilege/standing-escalation. **The classic surface is closed** — `proposedFare` is server-validated
positive/cents/bounded; `accept`/`selectOffer` pin `agreedFare` to the bid inside the guarded CAS; every
`:id` route derives party/ownership server-side; order-create idempotency, delivery-OTP CAS, KYC-callback
HMAC (fail-closed in prod), and issue-resolve/rate/refund CAS all block replay/double-apply; every
job-visibility/action *entry* route funnels through `onlineRefusalReason`; and no writable path to
`accountStatus`/`onHold`/`role`/strikes exists for a rider or customer. One new logic gap surfaced:

### RH-01 — the FRAUD P0-3 velocity `on_hold` (#198) silently self-clears on the next reliability-recovery event  ·  MEDIUM  ·  confidence high

**Where:** `apps/api/src/orders/order-lifecycle.service.ts:405-413` (velocity hold set in
`markUndelivered`), `:459-465` (`rate` recovery) and the `completeOrder` auto-close recovery;
`apps/api/src/riders/reliability.ts:18-24` (`applyReliabilityDelta` hysteresis, clear branch at `:22`);
`packages/shared/src/policy.ts` (`ON_HOLD_BELOW:60`, `ON_HOLD_CLEAR_AT:70`, `RECOVER_PER_COMPLETION:2`).

**What:** #198 auto-holds a rider whose recent undelivered *rate* is abnormally high, **independent of
the score**, so it fires even when the penalty is 0 (`refused`/`wrong_address`). In `markUndelivered` the
hold is stamped `onHold=true` while the **score is left untouched** (~100, well above `ON_HOLD_CLEAR_AT`).
But every recovery path runs the same `applyReliabilityDelta`, whose hysteresis **unconditionally clears
`onHold` at score ≥ 70** (`reliability.ts:22`). `rate()` and `completeOrder()` both apply
`+RECOVER_PER_COMPLETION` and persist the resulting `onHold=false`. So the fraud hold evaporates on the
next completion/rating recovery — no human review — defeating the stated purpose of #198 ("auto-`on_hold`
… for a human to review"). The bypass is strongest against exactly the actor #198 targets: penalty-free
reasons keep the score high, *guaranteeing* the ≥70 auto-clear.

**Traced exploit:** rider parks one order in the 6h `delivered` rating window (excluded from
`one_active_ride`), abandons 3 jobs via `POST /orders/<id>/undelivered {"reason":"wrong_address"}` → on
the 3rd, `velocityHold` trips (`onHold=true`, score ~100); then the parked order's auto-close or a
customer rating runs `applyReliabilityDelta(+2)` → score 100 ≥ 70 → `onHold=false` persisted. Rider is
un-held with zero admin action and resumes.

**Why past sweeps missed it:** #198 added the velocity hold; the Q2 score-hysteresis predates it. No
sweep cross-checked that a score-*independent* hold rides on a score-*driven* clear. The ledger records
P0-3 as "MITIGATED #198 (velocity)" and never noted the backstop self-releases.

**Status — FIXED, PR #221.** This touched the fraud/standing-gating carve-out, so the remedy was left as
a policy/schema decision for human review rather than auto-merged; the option chosen was Option A —
represent the fraud hold with a persisted `heldReason` (`reliability`|`velocity`|null; migration 0024)
that `applyReliabilityDelta`'s score-hysteresis never clears for a `velocity` hold — only an admin
`clear-hold` releases it. A regression test asserts the hold survives a subsequent recovery event. See
the post-merge status table below.

---

## Summary

Eight new findings: **two HIGH** (DS13-02 marketplace-supply loss; DS13-05 SOS write-only dead-end),
**four MEDIUM** (DS13-01 presence refutation, DS13-03 admin-cancel push parity, DS13-04 admin standing
CAS, RH-01 velocity-hold self-clear), **two LOW** (DS13-06 become throttle, DS13-07 open-auction board
signal). No CRITICAL. **DS13-01…DS13-07 were fixed and merged in PR #209** (each with a regression test;
`pnpm typecheck` + 714 API tests + API build green, all CI checks passing, no migration); **RH-01 was
fixed in PR #221** after the fraud-hold representation was decided on human review (see the post-merge
status table below). Two agent-proposed candidates were rejected on code re-read (recorded above). All
Phase-0 sampled prior fixes remain intact.

### Post-merge status (updated after #209 landed)

| ID | Outcome |
|---|---|
| DS13-01 · DS13-02 · DS13-03 · DS13-04 · DS13-06 · DS13-07 | **FIXED — merged in #209.** |
| DS13-05 | **Backend FIXED — merged in #209** (`GET /admin/sos` read surface + zero-recipient log); **admin-web SOS list panel (`/sos`) built in #221.** Acknowledgement workflow (`POST /admin/sos/:id/ack`, `AcknowledgeButton`) shipped in **#224**. |
| RH-01 | **FIXED — PR #221** (Option A, persisted `heldReason`): the score hysteresis never clears a `velocity`/fraud hold on recovery; only an explicit admin clear-hold releases it. Migration 0024 adds the nullable `riders.held_reason` column; regression tests assert the hold survives a recovery event. |
