# Deep sweep 2026-07-21 (deep-sweep routine)

Fresh session, branch `claude/deep-sweep-2026-07-21` based on latest `main`. This run's two real findings
come from Phase 1 (`lane-bug-hunt` agentic loop) and Phase 1.5 (the deep-sweep-owned cross-lane seams
pass): DS21-01 (MEDIUM) from the concurrency-idempotency lens, and DS21-02 (LOW) surfaced by the Phase-1.5
"a value threaded through a notification/feed/push or an admin action — every id/status it carries must
re-assert its trust boundary at each hop" seam. DS21-01 was confirmed REAL by a 3-skeptic adversarial panel
(3/3, high). Phase 3 (adversarial raw-API pass) came back clean. Both fixed same-run with regression tests.

## Phase 0 — inherit history

`docs/KNOWN_BUGS.md` read in full. **Zero open `claude/*` sibling PRs at session start** — nothing in
flight to dedupe against beyond the ledger itself.

## Phase 0.5 — cluster-claim re-verification

Rotated to the three "→ FIXED" cluster headers least-recently re-checked — **Auth/identity**,
**Notifications/FCM**, and **Edge/abuse** (last done by the UX 2026-07-20 daytime run; the other six were
re-checked by the two most recent deep-sweep/bug-hunt runs). **All 3 INTACT, 0 stale claims:**

- **Auth/identity** — JWT `HS256` algorithm pin re-verified (`token.service.ts:50` sign / `:53` verify both
  pin the alg, so a `none`/alg-swap forgery is rejected); the OTP-verify TOCTOU is still serialized under a
  transactional attempt gate (`auth.service.ts:281-286`). **INTACT.**
- **Notifications/FCM** — dead-token pruning still fires on `messaging/registration-token-not-registered`
  (`notifications.service.ts:389-391` + `fcm.push.ts:102,137`); the multicast send is still batched at
  `sendEach ≤ 500` per call (`fcm.push.ts:14,128-129`). **INTACT.**
- **Edge/abuse** — the global `ThrottleGuard` is still module-wide (`app.module.ts:87` +
  `common/throttle.guard.ts:52`); every outbound vendor fetch still carries a timeout (`didti-kyc-vendor.ts:37`;
  `otp-sender.ts:18,78,158,221`). **INTACT.**

**0 stale claims, 0 fresh findings from Phase 0.5.**

## Phase 1 — orthogonal sweep (`lane-bug-hunt`, deep-sweep lane)

5 finder lenses fanned out over the deep-sweep lane (tx-rollback, concurrency-idempotency, authz-IDOR,
timer-expiry, adversarial-API). **1 candidate**, confirmed REAL by a 3-skeptic adversarial panel (3/3 REAL,
high confidence) — this IS **DS21-01** below (the concurrent-double-attach GCS orphan).

## Phase 1.5 — cross-lane seams pass (deep-sweep-owned)

**Seam picked (never-before-used rotation):** "a value threaded through a notification/feed/push or an admin
action — every id/status it carries must re-assert its trust boundary at each hop" (the
audit-forgery / notify-me-orderId class). Traced the `AuditLog.action` write→feed-read seam across all
**6 writer/reader pairs** the feed synthesizer trusts:

| Feed-read action | Writer (owner) | Reserved in `RESERVED_AUDIT_ACTIONS`? | Disposition |
|---|---|---|---|
| `order.riders_available_notify` | `notifyRidersAvailable` (system) | **NO** | **STALE → DS21-02 (fixed)** |
| `customer.riders_available_notify` | `notifyRidersAvailable` (system) | **NO** | **STALE → DS21-02 (fixed)** |
| `order.fare_adjust` | `adjustFare` (admin, transactional) | yes | SOUND |
| `order.rider_standing_notice` / `_resolved` | `notifyCustomersOfRiderStandingChange` | yes | SOUND |
| `rider.kyc_approve` / `wallet.credit` (+ the rest of `ACCOUNT_FEED_ACTIONS`) | KYC decision / manual credit (transactional) | yes | SOUND |
| `order.adjudicate_delivered` | `adjudicateDelivered` (admin, transactional) | yes | SOUND |

The first two are STALE (feed-read but unreserved) = **DS21-02**; the other four are sound. Other hops on the
same seam were traced and found sound: push `data.orderId` deep-link → party-gated re-fetch on open;
notify-me `orderId` Redis association still ownership-checked (`orders.service.ts:325-343`, DS15-09); WS
`board:new-order` still `.strict()`-rejects PII; WS presence role still server-derived; SOS/issue push
counterparty still server-derived. So the one gap is DS21-02, not a systemic seam failure.

## Phase 3 — adversarial API pass

Acted as an authenticated attacker with raw API access across
wallet/orders/offers/issues/sos/privacy/uploads/admin, checking six attack classes: **IDOR /
identity-cross-check** (every id-scoped read/write re-checks caller ownership server-side), **CAS / row-lock
discipline** (lifecycle transitions hold FOR UPDATE + CAS), **idempotency** (idempotency-key + CAS on money
paths), **KYC / standing gates** (offers.service gate intact), **fare manipulation** (server-recomputed
basis), **wallet abuse** (prepaid-per-ride only, no post-paid sink). **Zero new gaps** — every candidate
traced to an existing control. `KB-HOLD-SESSION-SCOPE` re-confirmed unchanged / already-OPEN (not new).

## Findings — this sweep

| ID | Description | Area | Sev | Confidence | Why past sweeps missed it |
|---|---|---|---|---|---|
| DS21-01 | `attachPickupPhoto` (`order-lifecycle.service.ts:242-276`) and `attachDeliveryProof` (`:287-324`) each ran a `findUnique`-of-the-photo-key-column → CAS `updateMany`-on-`status` → conditional delete-of-the-pre-write-snapshot's-key, none wrapped in a transaction or row lock. Two near-simultaneous calls for the SAME order (e.g. a client retry duplicating an in-flight request) both read the same pre-existing key (e.g. null) before either write committed. Both CAS writes succeed (they guard only `status`, which neither call changes), so the second silently clobbers the first in the DB — but each request's cleanup compares only against its OWN stale pre-write read, so NEITHER detects or deletes the OTHER's just-persisted key. The loser's uploaded GCS object is left with zero DB pointer anywhere, permanently unreachable by `privacy.service.ts`'s `eraseAccount` PII purge (which only knows the CURRENT `pickupPhotoKey`/`deliveryProofKey` column value) — the exact right-to-erasure orphan class DS15-03/DS18-01/DS18-03 closed for the sequential case, reopened via a race. | `apps/api/src/orders/order-lifecycle.service.ts` (`attachPickupPhoto`, `attachDeliveryProof`) | MEDIUM | High | DS18-01/DS18-03 fixed the SEQUENTIAL orphan — a single caller's normal retake — but never modeled a CONCURRENT double-request race, since a photo attach is neither money- nor status-critical enough to have drawn a concurrency-focused lens before (unlike `confirmDelivery`/`rate`/`cancel`, which already hold FOR UPDATE). The cleanup's compare-against-own-pre-read looked locally correct for one caller. |
| DS21-02 | The feed synthesizer `notifications-feed.service.ts` reads back two `AuditLog.action` strings — `order.riders_available_notify` (order-scoped, `:271`) and `customer.riders_available_notify` (account-scoped via `ACCOUNT_FEED_ACTIONS`, `:97-103,174`) — to render an "A rider's online near you" feed row. Their only legitimate writer is `notifyRidersAvailable` (actor `system:notify-riders-available`, `notifications.service.ts:241-244`). Neither was in `admin-audit.service.ts`'s `RESERVED_AUDIT_ACTIONS` — the only guard on the free-text `POST /admin/audit-actions` (`admin.controller.ts:196-202`). An admin-scoped-JWT holder could `POST {action:"customer.riders_available_notify", target:"<any profileId>"}` (or the order variant) and it passed the denylist, forging a compliance-audit row indistinguishable from a real system-generated one AND causing the victim's next feed load to render a fake notification with no underlying state change. | `apps/api/src/admin/admin-audit.service.ts`, `apps/api/src/notifications/notifications-feed.service.ts` | LOW | High | WD-023 fixed this class ONCE for three KYC strings, but nothing enforced the invariant going forward, so a later addition (UX21-02, which added the two `riders_available_notify` feed-read actions) silently reopened the same drift. It's invisible to any single-lane hunt — it only appears when you trace the audit-write→feed-read seam across every writer/reader pair, which is exactly the Phase-1.5 seam this run picked. LOW because the copy is benign (unlike ban/KYC-decision forgery) and it's admin-token-gated. |

## Sibling-sweep

**DS21-01** — the defect shape is: `findUnique` a photo-key column → CAS `updateMany` on `status` →
conditional delete of the PRE-WRITE snapshot's key, with no transaction/row lock. Two greps enumerate every
candidate:

```
$ grep -rn 'findUnique' apps/api/src | grep -i 'key: true'
(no hits — the findUnique call and its `select: { … key: true }` sit on separate lines; the manual
 enumeration below is authoritative)

$ grep -rn 'pickupPhotoKey: true\|deliveryProofKey: true' apps/api/src --include=*.ts | grep -v spec
apps/api/src/admin/admin-orders.service.ts:459  deliveryProofKey: true      → admin read-only (order detail); no CAS, no delete
apps/api/src/orders/orders.service.ts:718       pickupPhotoKey: true        → getSnapshot read-only; no CAS, no delete
apps/api/src/orders/order-lifecycle.service.ts:249  pickupPhotoKey: true    → attachPickupPhoto  (FIXED this run)
apps/api/src/orders/order-lifecycle.service.ts:296  deliveryProofKey: true  → attachDeliveryProof (FIXED this run)
apps/api/src/privacy/privacy.service.ts:285     deliveryProofKey/pickupPhotoKey: true → erasure purge read; no CAS, no delete

$ grep -rln 'updateMany({\s*where: {.*status' apps/api/src
apps/api/src/matching/matching.service.ts        → offer-select CAS (no photo-key column, no superseded delete)
apps/api/src/admin/admin-orders.service.ts       → admin status CAS (no photo-key column, no superseded delete)
apps/api/src/orders/order-lifecycle.service.ts   → the two attach methods (FIXED) + sibling lifecycle CASes with no delete
```

Disposition: the read-key-column → CAS-on-status → delete-pre-write-snapshot pattern exists in **exactly 2
call sites, both fixed this run** (`attachPickupPhoto`, `attachDeliveryProof`). The other `*Key: true`
occurrences are plain reads (admin detail, `getSnapshot`, the erasure purge) with no CAS + no superseded
delete, so they carry no orphan-on-race; the other `updateMany`-on-status sites write no photo-key column
and do no best-effort object delete. **No third untouched sibling.**

**DS21-02** — enumerate every action-string literal the feed synthesizer reads, and diff against
`RESERVED_AUDIT_ACTIONS`:

```
$ grep -n 'action:' apps/api/src/notifications/notifications-feed.service.ts
174:  where: { target: userId, action: { in: ACCOUNT_FEED_ACTIONS } }
226:  where: { target: { in: orderIds }, action: "order.adjudicate_delivered" }
247:  where: { target: { in: customerViewOrderIds }, action: "order.rider_standing_notice" }
254:  where: { target: { in: customerViewOrderIds }, action: "order.rider_standing_resolved" }
262:  where: { target: { in: orderIds }, action: "order.fare_adjust" }
271:  where: { target: { in: customerViewOrderIds }, action: "order.riders_available_notify" }
```

`ACCOUNT_FEED_ACTIONS` = keys of `ACCOUNT_FEED_COPY` = { `rider.kyc_approve`, `rider.kyc_decline`,
`rider.suspend`, `rider.ban`, `rider.lift`, `rider.clear_hold`, `customer.hold`, `customer.lift`,
`wallet.credit`, `customer.riders_available_notify` }. The full feed-read set (the new exported
`FEED_READ_ACTIONS`) is those ten plus the five inline literals above. Diffing against the pre-fix
`RESERVED_AUDIT_ACTIONS`, **exactly 2 were missing**: `customer.riders_available_notify` and
`order.riders_available_notify` — both added this run. Every other feed-read action was already reserved.
Post-fix, `FEED_READ_ACTIONS ⊆ RESERVED_AUDIT_ACTIONS` holds, and a new unit test asserts that subset so a
future feed-read action added without reserving it fails at test time (converting the recurring drift into a
write-time guard).

## Fixes

- **DS21-01** — both attach methods now wrap the read + party/window/namespace checks + write in a
  `$transaction` that takes a `SELECT … FOR UPDATE` row lock on the order (via `$queryRaw`, mirroring the
  same file's `confirmDelivery`), selecting `status`, `rider_id`, and `pickup_photo_key` /
  `delivery_proof_key`. Under the lock the code re-validates riderId/status/key-namespace exactly as before,
  then does a plain `tx.order.update(...)` — the row lock subsumes the old CAS (nothing can move the row
  between the locked read and the write), so a concurrent transition that would have failed the CAS instead
  moves the row to a status the locked read rejects with the same 409. The previous key is READ INSIDE the
  lock and RETURNED from the transaction; the best-effort `deleteSupersededObject` runs AFTER commit, outside
  the tx (a GCS delete must never sit inside a DB transaction). This serializes concurrent callers: the
  second's `FOR UPDATE` blocks until the first commits, then it reads the first's just-committed key and
  deletes IT as superseded — no orphan. All error types/messages, idempotent-retake semantics, key-namespace
  check, and lat/lng/`deliveryProofAt` handling are unchanged; the DS18-03 comments are extended to record
  the race-closing intent. Regression tests: the unit spec (`order-lifecycle.service.spec.ts`) was migrated to
  the new `$queryRaw`/`update` shape and gained two DS21-01 tests per method — one asserting the prior-key
  read AND the write both run inside the same `$transaction` callback and that the purge targets the key read
  UNDER THE LOCK (a value a concurrent writer committed first, not a pre-tx read), and one asserting two
  sequential attaches with different keys purge exactly the FIRST key once. The int spec
  (`order-lifecycle.int.spec.ts`, real transactional PostGIS in CI) gained a TRUE concurrent proof: two
  `Promise.allSettled` `attachPickupPhoto` calls with different keys serialize so exactly the non-persisted
  (loser) object is purged — no GCS orphan.
- **DS21-02** — added `"order.riders_available_notify"` and `"customer.riders_available_notify"` to
  `RESERVED_AUDIT_ACTIONS`, so the free-text `POST /admin/audit-actions` rejects both with the standard 400.
  To convert this recurring class into a write-time guard, exported a minimal `FEED_READ_ACTIONS` array from
  `notifications-feed.service.ts` (the union of `ACCOUNT_FEED_ACTIONS` and the inline order-scoped literals),
  and added a unit test in `admin-audit.service.spec.ts` asserting `FEED_READ_ACTIONS ⊆
  RESERVED_AUDIT_ACTIONS` — so the next feed-read action added without reserving it fails at test time. Also
  added a rejection test for the two new action strings, mirroring the WD-023 KYC-sibling test.

## Stopping rule

**Exactly 2 new findings this run — DS21-01 MEDIUM, DS21-02 LOW, zero CRITICAL/HIGH — both fixed same-run**
with regression tests, no padding. Phase 1 raised exactly 1 candidate (verified 3/3 real), Phase 1.5 surfaced
the single audit-forgery seam gap, Phase 3 was clean. Consistent with the repeatedly-hunted state of the
backend-correctness lane.

`pnpm typecheck` (5 packages) + `pnpm test` (**1169 API + 45 admin + 517 mobile** tests) + `pnpm build`
(`@lynia/api` inclusive) all green, zero regressions.
