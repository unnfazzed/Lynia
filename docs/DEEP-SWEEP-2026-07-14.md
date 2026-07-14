# Deep bug sweep — 2026-07-14

Orthogonal sweep run against latest `main` (post the just-merged 07-14 UX commit `96a953c`,
"fix(ux): daily UX/usability review — 20 fixes"), inheriting the full history consolidated in
`docs/KNOWN_BUGS.md` and the prior orthogonal pass `docs/DEEP-SWEEP-2026-07-13.md` (DS13-01…DS13-07 +
RH-01, all remediated). **Phase-0 re-verification confirmed 8/8 sampled prior fixes are still intact in
code** — F-06 (spoofable admin actor header, `apps/admin/middleware.ts:47-48`), F-11 (stored XSS, zero
`dangerouslySetInnerHTML` in `apps/admin`), F-13 (KYC auto-decline attempt counting,
`rider.service.ts:326`), DS-01 (erasure/retention `SosEvent` GPS scrub,
`privacy.service.ts:127-130,173-176`), DS-03 (admin cancel/adjustFare CAS,
`admin-orders.service.ts:100-111,171-177`), DS13-02 (disconnect no longer evicts geo index,
`tracking.service.ts:351-356`), DS13-04 (admin standing-mutation CAS,
`admin-riders.service.ts:193-200,243-262,336-338`), RH-01 (persisted `heldReason` sticky velocity hold,
`reliability.ts:38-41`, `order-lifecycle.service.ts:406-419`) — plus a spot-check that BR-01's 120s
heartbeat cutoff is still intact. No regressions. The open ledger items KB-NOTIFY-ORDERID and
KB-FEED-SYNTH were reconfirmed still open, unchanged, and are not re-reported here.

The just-merged 07-14 UX commit (`96a953c`) was scrutinized for regressions since it is brand-new code.
Everything checked clean **except one incomplete fix** (the commit's own message claimed a client-side
half it never actually wired — closed here as DS14-01) and **one narrow LOW race** noted but not fixed
(push-token rotation, logged as KB-PUSH-TOKEN-RACE).

This sweep ran three orthogonal Fable hunting passes plus an adversarial pass:
1. **Never-audited-area deep read** — uploads/signed-URLs, health, observability,
   `common`/throttle/zod/trust-proxy, phone-backfill, admin-audit internals, and `tracking.service`
   internals. **Zero new findings** — this ground is already well-hardened by prior sweeps.
2. **Pattern propagation** — grep every sibling of an already-fixed pattern (CAS guards, BullMQ `error`
   listeners, heartbeat cutoffs, throttle decorators, persisted-reason-before-clearing). The BullMQ
   error-listener and persisted-reason patterns are **fully propagated** (clean); the CAS and
   heartbeat-cutoff patterns were **not** fully propagated — DS14-02…DS14-07.
3. **Cross-cutting mechanism audit** — 10 mechanisms (transactions/rollback, socket handlers on stale
   records, BullMQ idempotency, timer/expiry boundaries, client/server divergence, exactly-one-row
   Prisma, swallowed catches, silent notification failures, money handling, object-authz/KYC-bypass).
   Mechanisms 1, 3, 6, 7, 9, 10 came back clean; mechanisms 2, 4, 5, 8 produced findings (DS14-05,
   DS14-08, DS14-09, and the OPEN items).
4. **Adversarial API pass** (Phase 3, below) — malicious authenticated user with direct curl access.

Severity legend: CRITICAL / HIGH / MEDIUM / LOW. Confidence: high / medium / low.

---

## New findings

### DS14-01 — the 07-14 UX commit added `hadOffers` server-side but never wired it into the mobile client, so the cold-start expired-auction terminal is still dishonest ("no riders were available" when riders actually bid)  ·  MEDIUM  ·  confidence high

**Where:** `apps/mobile/src/api/orders.ts` (`OrderSnapshot` type had no `hadOffers` field),
`apps/mobile/src/logic/order-tracking.ts` (no terminal-kind derivation), and
`apps/mobile/app/order/[id].tsx` (the expired-terminal branch still keyed off the old no-supply
assumption). Server side, `96a953c` already persists and returns `hadOffers`.

**What:** commit `96a953c`'s own message claimed the expiry-honesty fix covered "both the push/feed copy
at expiry time and the client's cold-start terminal," but only the push and feed halves were actually
wired. The client `OrderSnapshot` type never gained the `hadOffers` field and the expired-terminal
branch was never touched, so a customer who cold-starts onto an already-expired auction that *did*
receive bids is still told "no riders were available."

**Repro:** post an order that draws at least one offer, background the app, let the auction expire, then
cold-start straight onto `order/[id]`. The terminal copy reads "no riders were available" despite riders
having bid.

**Why past sweeps missed it:** the commit message asserted the client half was done, so a diff-trust
reader would not re-check it; catching it required reading the client type/branch against the server
contract rather than trusting the message.

**Fix:** add `hadOffers?: boolean | null` to `OrderSnapshot`; add a pure `expiredTerminalKind` function
in `order-tracking.ts`; switch the expired-terminal branch in `order/[id].tsx` to use it. Regression
test: `apps/mobile/src/logic/__tests__/order-tracking.test.ts` (4 new cases incl. the exact cold-start
repro).

---

### DS14-02 — `retryKyc` does a non-CAS blind update → can bypass the two-attempt lock or clobber a concurrent admin KYC decision  ·  MEDIUM-LOW  ·  confidence high

**Where:** `apps/api/src/riders/rider.service.ts` (`retryKyc`) — `findUnique` then an unguarded
`update`.

**What:** the read-then-write is not atomic. Two parallel retries (or a retry racing an admin KYC
decision landing in the same window) both read the pre-write `{kycStatus, kycAttempts}` and both write,
bypassing the two-attempt lock or clobbering the admin decision.

**Why past sweeps missed it:** prior sweeps CAS'd the *admin-side* KYC/standing mutations (DS-03,
DS13-04); this rider-self-service KYC mutation was never checked for the same gap.

**Fix:** CAS `updateMany` guarded on the observed `{kycStatus, kycAttempts}`, `ConflictException` on 0
rows. Regression test in `rider.service.spec.ts`.

---

### DS14-03 — KYC verified-ID freeze is check-then-write in both ID-writing routes → a webhook-verify landing between the check and the write still gets the ID change through  ·  LOW-MED  ·  confidence high

**Where:** `apps/api/src/riders/rider.service.ts` (`completeProfile`) and
`apps/api/src/auth/auth.service.ts` (`updateProfile`).

**What:** the DS-11/#199 fix that blocks a verified rider from swapping their national ID reads
`kycStatus`, then (separately) writes the new ID. A webhook-verify committing in the gap between the read
and the write lands after the check passed but before the write, so the write goes through against a now-
verified rider.

**Why past sweeps missed it:** DS-11/#199 fixed the *check*; nobody re-examined whether the *write* could
race past a check that had already passed.

**Fix:** make the ID write itself a CAS `updateMany` that re-asserts the freeze condition atomically in
the WHERE clause. Regression tests in both services' specs simulate the webhook committing verified
mid-write.

---

### DS14-04 — `adminSetKyc`'s repeat-decline guard reads the row unlocked inside its transaction → a concurrent vendor-webhook decline can double-count one logical decline  ·  LOW  ·  confidence high

**Where:** `apps/api/src/riders/rider.service.ts` (`adminSetKyc`, `isRepeatOfSameDecline` from F-14) —
plain `findUnique` (no lock) inside the transaction.

**What:** the F-14 idempotency guard depends on the row it reads. Under READ COMMITTED an unlocked
in-transaction read serializes nothing, so a vendor-webhook decline committing in the same window is
invisible to the guard and one logical decline is counted twice.

**Why past sweeps missed it:** F-14 fixed the counting *logic*; nobody checked that the read the logic
depends on was concurrency-safe.

**Fix:** add a `FOR UPDATE` row lock before the read, inside the same transaction, matching the pattern
`order-lifecycle.service.ts` already uses for its own row locking. Regression test asserts
lock-before-read-before-write ordering.

---

### DS14-05 — supply/broadcast honesty gap: an on_hold or suspended rider stays in the live-supply plane (three parts, one root cause)  ·  MEDIUM-LOW  ·  confidence high

*(Independently flagged by two separate hunting passes — pattern-propagation and mechanism-audit — which
is why confidence is high.)*

**Where:** (a) `apps/api/src/tracking/tracking.service.ts` (`nearbyRiders`); (b)
`apps/api/src/orders/order-lifecycle.service.ts` (`markUndelivered` velocity/reliability hold); (c)
`apps/api/src/admin/admin.service.ts` (admin dashboard online-rider count).

**What:**
1. `nearbyRiders` filtered only on `is_online` + heartbeat freshness, with **no standing predicate** —
   an on_hold rider who keeps heartbeating still padded `ridersNearby` counts and received broadcast
   pushes despite being unable to bid.
2. an automated velocity/reliability hold (`markUndelivered`) set `onHold` but **never** flipped
   `isOnline:false` or evicted the rider from the geo index — unlike the admin suspend/ban paths, which
   do both.
3. the admin dashboard's online-rider count lacked the heartbeat-freshness cutoff BR-01 gave the
   customer-facing count.

**Why past sweeps missed it:** BR-01 audited heartbeat-ghost staleness and DS13-04 CAS'd the *admin*
standing mutations; the automated (non-admin) hold path and the standing-vs-supply-count interaction were
never cross-checked together.

**Fix:** add an `account_status='active' AND on_hold=false` predicate to both `nearbyRiders` legs;
automated holds now also set `isOnline:false` and evict via a new `TrackingGateway.evictRiderFromGeo`
passthrough; the admin dashboard count now uses the same heartbeat cutoff. Regression tests in
`tracking.service.spec.ts` and `order-lifecycle.service.spec.ts`.

---

### DS14-06 — `setOnline(true)` is gate-then-blind-write → a concurrent admin suspend can be raced past, putting a just-suspended rider back online  ·  LOW  ·  confidence high

**Where:** `apps/api/src/riders/rider.service.ts` (`setOnline`) — read standing via `findUnique`, then an
unguarded `update` setting `isOnline:true`.

**What:** an admin suspend landing between the standing read and the online write is invisible to the
gate, so the write puts a just-suspended rider back online.

**Why past sweeps missed it:** same as DS14-02 — the admin-side CAS work was never mirrored onto this
rider-self-service sibling.

**Fix:** CAS `updateMany` guarded on `accountStatus:"active", onHold:false`; on 0 rows, re-read and throw
the precise existing `onlineRefusalReason` refusal. Regression test simulates a concurrent suspend landing
between gate and write.

---

### DS14-07 — `/orders/:orderId/report` has no rate limit, unlike its throttled sibling issue-raise endpoint  ·  LOW  ·  confidence high

**Where:** `apps/api/src/reports/reports.controller.ts` — no `@Throttle`. Contrast the issue-raise
endpoint throttled under FRAUD P1-5.

**What:** the order-report route is an unthrottled ops-DoS/spam surface, exactly the class FRAUD P1-5
closed on its sibling.

**Why past sweeps missed it:** FRAUD P1-5's throttle was applied endpoint-by-endpoint over time and this
sibling route was never revisited.

**Fix:** add `@Throttle({limit:10, windowSec:60, keyPrefix:"order-report"})` matching the issue-raise
cap. New test: `apps/api/src/reports/reports.controller.spec.ts`.

---

### DS14-08 — refresh-token rotation has no lost-response grace → a dropped rotate response forces a hard 401 and full re-OTP mid-session  ·  MEDIUM  ·  confidence high

**Where:** `apps/api/src/auth/auth.service.ts`; additive migration
`apps/api/prisma/migrations/0025_session_rotation_link` (nullable `Session.rotatedToId`, no backfill, no
default, existing rows unaffected).

**What:** if a rotate response is dropped in flight, the client's next refresh presents the now-revoked
(rotated-away) token and gets a hard 401, forcing a full re-OTP mid-session — possibly mid-delivery. This
is the same failure mode OTP-verify already got a 60s grace window for (ledger UX-0711), never mirrored
onto refresh.

**Why past sweeps missed it:** the 07-13 refresh-token security audit checked the *replay/reuse*
direction thoroughly but never checked the *lost-response availability* direction; this was found by the
mechanism-audit agent by cross-referencing the OTP grace-window precedent.

**Fix:** a rotation now links the revoked session to its successor (`rotatedToId`); a retry of a
just-rotated token re-issues a **fresh independent session** (not literally the same tokens — the
successor's secret is never stored, only its hash, so returning identical tokens is infeasible) ONLY when
all of: the prior session was revoked *by rotation specifically* (`rotatedToId` set — a logout-revoke has
`rotatedToId` null and never qualifies), the successor is still un-consumed (a chain that already advanced
past the successor is rejected — reuse detection intact, a genuine replayed-after-rotation token is still
hard-rejected), and it is within a 60s window. Wrong secret and plain expiry remain hard rejects
unconditionally. Regression tests (5 new cases in `auth.service.spec.ts`): legitimate lost-response heals;
logout-revoke never grace-heals; replay-after-successor-already-advanced is rejected; outside-the-window
is rejected; concurrent double-rotate heals via the same guarded path.

> **Highest-risk fix in this sweep — flag for careful review.** It touches session/auth issuance, even
> though it does not touch bid acceptance / order assignment / agreed-price / KYC gating.

---

### DS14-09 — a stale delivery code can survive an app-kill mid-rotation → the customer confidently relays a dead code, burning attempts toward a fresh lockout  ·  MEDIUM  ·  confidence high

**Where:** `apps/mobile/src/auth/session.ts`, `apps/mobile/src/logic/order-tracking.ts`,
`apps/mobile/app/order/[id].tsx`.

**What:** rider hits the OTP attempt lockout, customer taps re-issue, the server rotates the hash and
zeroes attempts server-side — but if the app is killed before the re-issue response lands, the client's
local secure storage still holds the OLD code value. Because a code is technically present locally, the
client never re-prompts for re-issue, so the customer relays a dead code and burns further attempts
toward a fresh lockout.

**Why past sweeps missed it:** prior sweeps (R9/07-11) fixed the attempt-*count* resync on this same
screen but never exercised the app-kill-during-rotation path for the code *value* itself.

**Fix:** add a companion `deliveryCodeAttempts.<orderId>` high-water-mark key in `session.ts`
(`saveDeliveryCodeAttempts`/`loadDeliveryCodeAttempts`/`clearDeliveryCode`, wired into sign-out cleanup);
a new pure `reconcileDeliveryCode` in `order-tracking.ts` detects a drop in the server's
`deliveryOtpAttempts` counter below the locally-tracked high-water mark as a rotation signal;
`order/[id].tsx` invalidates the local code and routes to the existing re-issue-prompt UI when a drop is
detected. Regression tests: 6 new cases in `order-tracking.test.ts` incl. the exact
lockout→reissue→kill repro and backward-compat guards (no false invalidation when signals are absent,
e.g. pre-fix clients).

> **Known limitation** (logged as KB-DELIVERY-CODE-ROTATION-SIGNAL): detection only works if the client
> observed the elevated attempt count before being killed. A server-side rotation timestamp in the
> snapshot would make it fully robust regardless of client observation history.

---

## Phase 3 — adversarial API pass

A malicious-authenticated-user pass (direct curl, no app) traced the standard abuse classes:
free/underpriced delivery, fare manipulation, IDOR by id-substitution (including the newly-added
pickup-photo and SOS-ack routes), replay/forge, and KYC-/standing-gate bypass via sibling endpoints.
**Zero new findings.** Every attack traced back to an existing control already in the ledger: offer
accept-binding to the server fare, CAS `selectOffer`, delivery-OTP row lock, party-gating on every `:id`
route (including the new pickup-photo and SOS-ack routes), Didit webhook HMAC + replay-window, and a
single shared `onlineRefusalReason` standing gate with no bypass path.

## Stopping rule

**Zero new CRITICAL/HIGH findings from Phase 1 + Phase 3.** Per the sweep's stopping rule, the pass halts
here — the same outcome prior sweeps recorded when the orthogonal and adversarial planes came back clean
of high-severity defects. All nine findings below are MEDIUM or lower.

---

## Summary

Nine new findings, all remediated this sweep: **five MEDIUM/MEDIUM-LOW** (DS14-01 dishonest cold-start
terminal, DS14-02 `retryKyc` CAS, DS14-05 supply/broadcast honesty, DS14-08 refresh-token lost-response
grace, DS14-09 stale delivery-code app-kill), **four LOW/LOW-MED** (DS14-03 verified-ID freeze write
race, DS14-04 repeat-decline unlocked read, DS14-06 `setOnline` gate race, DS14-07 order-report
throttle). **No CRITICAL, no HIGH.** All nine were fixed in **this sweep's PR** (each with a regression
test; `pnpm typecheck` + 787 API tests + 321 mobile tests + build all green). Phase-0 re-verified 8/8
sampled prior fixes still intact (plus a BR-01 spot-check) — no regressions. Six lower-priority/
lower-confidence or client-only follow-up items were found but not fixed and are logged to the ledger as
OPEN (KB-BOARD-REVOKE, KB-HEARTBEAT-MARGIN, KB-OTP-COUNT-SYNC, KB-CONFIRMITEMS-RETRY, KB-PUSH-TOKEN-RACE,
KB-DELIVERY-CODE-ROTATION-SIGNAL).

DS14-08 is called out as the highest-risk fix (it touches session/auth issuance) even though it does not
touch bid acceptance / order assignment / agreed-price / KYC gating.
