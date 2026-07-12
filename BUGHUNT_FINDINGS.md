# Lynia — Bug-Hunt Findings

_Discovery pass (no fixes). Findings appended as found, keyed to journeys in
`BUGHUNT_JOURNEYS.md`. Severity: **CRITICAL** (data loss / money / security) · **HIGH** (broken
journey) · **MEDIUM** (degraded UX / integrity edge) · **LOW** (polish / defense-in-depth)._

**Headline:** the money/concurrency/crypto/auth core is genuinely hardened — guarded compare-and-swap
on every order transition, `FOR UPDATE` on the delivery-OTP gate, atomic refresh-token rotation,
CSPRNG OTPs compared with `timingSafeEqual` and stored HMAC-hashed, a hardened Didit webhook
(canonical-body HMAC + timestamp replay window + fail-closed + monotonic apply), parameterized raw
SQL, production boot-guards on every secret, and IDOR gating on every PII-bearing read. Prior hunts
(`docs/BUG-HUNT.md`, `docs/JOURNEY-BUGS.md`) closed the obvious P0/P1s. **No CRITICAL was found in
this pass.** The remaining defects live in moderation-lever gaps, degraded-mode correctness, and a
few edge behaviours around the hardened core.

---

## F-01 · Banned/suspended rider retains full customer-side access; ops has no lever to stop it
- **Journey:** 46, 47, 5–7 · **Severity:** MEDIUM (trust & safety / moderation gap)
- **Files:** `apps/api/src/orders/orders.service.ts:92-99` (create gates only on `profile.onHold`);
  `apps/api/src/admin/admin-customers.service.ts:132-143` (`holdCustomer` filters `role: "customer"`);
  `apps/api/src/admin/admin-customers.service.ts:19-24` (`listCustomers` filters `role: "customer"`).
- **What:** `Role` is a single enum; becoming a rider flips `role` → `rider`. Order creation has **no
  role gate** — any authenticated profile can broadcast a delivery. But the only moderation lever that
  blocks broadcasting is `profile.onHold`, and the admin console can only set it via `holdCustomer`,
  which 404s on any profile whose `role !== "customer"`. A rider-role user also never appears in the
  customer directory (same filter). Rider suspend/ban set `accountStatus`/`isOnline` but **not**
  `profile.onHold`, and `OrdersService.create` never inspects rider standing.
- **Reproduction:** A rider is banned for fraud (`accountStatus = banned`). They open the app and
  broadcast a normal delivery as the customer/sender. It succeeds — banning only blocked their
  *riding*. Ops cannot find them in the customers list and `POST /admin/customers/:id/hold` returns
  404 because they are role `rider`. The abusive account keeps consuming the marketplace with no
  console action available to stop it.
- **Confidence:** confirmed-by-reading-code.

## F-02 · Stale rider GPS can render as "live" when the Redis live-position is unavailable
- **Journey:** 12, 42, 60 · **Severity:** MEDIUM (degraded-mode correctness / safety-relevant UX)
- **Files:** `apps/api/src/orders/orders.service.ts:567-580` (snapshot falls back to
  `order.rider.updatedAt` on a Redis miss); `apps/api/src/tracking/tracking.service.ts:181-187`
  (`touchRiderHeartbeat` bumps `updated_at`); schema `riders.updatedAt` is Prisma `@updatedAt`
  (bumped by *every* rider-row write); consumed at `apps/mobile/app/order/[id].tsx:485-501`
  (`riderStale` / ETA computed from `order.rider.updatedAt`).
- **What:** The tracker's C4 "is the GPS fresh?" check keys off the snapshot's `rider.updatedAt`. When
  the Redis live-position key is present, the snapshot returns the true fix time (`live.at`) — correct.
  On a Redis miss (Redis outage, or the 120 s position TTL lapsed after a disconnect) it falls back to
  `order.rider.updatedAt`. That column is `@updatedAt`, refreshed by *any* rider write — a reliability
  delta, an online/offline toggle, an admin suspend/ban, or the presence watchdog's
  `touchRiderHeartbeat` — none of which move the rider. So a genuinely stale `currentLat/currentLng`
  (minutes old) can be paired with a just-now `updatedAt`, making `riderStale` false: the customer
  sees an old pin advertised as "updates live" with a fresh ETA.
- **Reproduction:** Redis is down (or the rider dropped connectivity > 120 s). `currentLat/lng` is 5
  min stale. Any unrelated write bumps `riders.updated_at` to now (e.g. an admin action, or the
  watchdog touching the heartbeat). The customer's tracker shows the 5-minute-old position as live and
  computes an ETA off it — the exact "stale shown as live" failure C4 was meant to prevent.
- **Confidence:** confirmed-by-reading-code (bounded to the no-live-position fallback path; in the
  happy path Redis supplies the true `at`).

## F-03 · `confirmDelivery` lockout is trivially resettable by the customer (no rotate rate-limit)
- **Journey:** 13, 36 · **Severity:** LOW (defense-in-depth; not a cross-actor exploit)
- **Files:** `apps/api/src/orders/order-lifecycle.service.ts:626-641` (`rotateDeliveryCode` resets
  `deliveryOtpAttempts` to 0 with no throttle); controller `orders/:orderId/delivery-code/rotate`
  carries no `@Throttle`.
- **What:** The 5-attempt delivery-OTP cap (correctly enforced under a row lock in `confirmDelivery`)
  is reset to 0 every time the customer rotates the code, and rotation is unthrottled. This is not a
  cross-actor bypass (only the order's own customer can rotate, and the rider still needs the new code
  the customer holds), but the attempt cap is only as strong as "the customer never colludes / never
  hands the rotate action to the rider." Compared with the OTP-request path (per-phone/IP/global
  limits) and `order-create`/`refresh` (throttled), rotate is the one sensitive mutation with no cap.
- **Confidence:** confirmed-by-reading-code.

## F-04 · Shared-device cross-account leak: rider's last-active job + bid draft survive sign-out
- **Journey:** 20, 42, 57 (shared device) · **Severity:** MEDIUM (S1 privacy leak between accounts)
- **Files:** `apps/mobile/src/auth/session.ts:197-224` (`clearDeviceState` — wipe list); missing keys
  `apps/mobile/src/net/last-active-store.ts:46` (`JOB_KEY = "lynia.lastActiveJob"`, fixed key, read
  unconditionally by `loadLastActiveJob()` at `:49`) and `apps/mobile/src/logic/rider-bid-draft.ts:19`
  (`RIDER_BID_DRAFT_KEY = "lynia.riderBidDraft"`, restored on `app/rider/index.tsx` mount); also the
  per-order `lynia.lastActive.<orderId>` keys.
- **What:** `clearDeviceState` deliberately wipes the S1-sensitive per-device slots on sign-out (order
  draft, saved places/recipients, KYC draft, history snapshot, chosen-rider identity, delivery codes)
  — but three persisted slots were missed. `JOB_KEY` and `RIDER_BID_DRAFT_KEY` are **fixed** keys
  (not namespaced by profile) and are read unconditionally on the next rider's cold start.
- **Reproduction:** Rider A signs in, has an active job (or a half-typed bid), signs out on a shared
  device. Rider B signs in → B's cold start paints A's last job card (pickup/drop-off landmarks, fare,
  last rider GPS pin via `LastActive`) and/or A's in-progress bid draft (redacted order + typed
  fare/ETA). This is the exact "next user must not rehydrate the previous user's data" rule the module
  already enforces for the other keys; these two were overlooked when the wipe list was extended.
- **Confidence:** confirmed-by-reading-code.

## F-05 · Recent-recipient dedupe fails across local vs international phone format
- **Journey:** 5 (compose, recipient chips) · **Severity:** LOW
- **Files:** `apps/mobile/src/logic/saved-recipients.ts:40` (`normalizePhone` only strips non-digits);
  `rememberRecipient` at `:88-99`.
- **What:** The module's own doc claims `"+263 77 123 4567"` and `"0771234567"` dedupe to one
  recipient, but stripping non-digits yields `"263771234567"` vs `"0771234567"` — different keys, so
  the leading-`0` ↔ `263` country-code equivalence isn't handled. The same Zimbabwe recipient entered
  once in local and once in international form persists as two chips, and a re-send in the other format
  won't float-to-top / refresh the saved name. Documented invariant violated (cosmetic, no data loss).
- **Confidence:** confirmed-by-reading-code.

## F-06 · Admin audit-actor (`x-lynia-operator`) is not stripped from inbound requests → spoofable attribution
- **Journey:** 44, 45, 46, 49, 50, 52 · **Severity:** MEDIUM (audit-trail integrity; HIGH in the
  auth-disabled-but-connected config the middleware itself documents)
- **Files:** `apps/admin/middleware.ts:42-44` (copies all inbound headers, only *conditionally* sets
  the operator — never deletes an inbound one); `apps/admin/app/lib/api.ts:32-42` (forwards
  `x-lynia-operator` → `X-Operator`); `apps/api/src/common/admin-actor.decorator.ts:24-28` (backend
  trusts `x-operator` as the audit actor); `apps/admin/app/lib/console-auth.ts:47-51` (empty-normalize
  edge).
- **What:** The console middleware's purpose is to make the audit actor a *trusted* proxy-asserted
  identity. But it does `new Headers(req.headers)` (copying any client-supplied `x-lynia-operator`)
  and then only `requestHeaders.set(...)` when `decision.operator` is truthy — it never *deletes* the
  inbound header first. Whenever `decision.operator` is falsy, an attacker-supplied `x-lynia-operator`
  survives untouched into the server action, which forwards it as `X-Operator`, and the API attributes
  the audit row (KYC approve, ban, refund, fare adjust, cancel) to that forged human.
- **`decision.operator` is falsy — so the spoof lands — when:** (1) `ADMIN_CONSOLE_REQUIRE_AUTH=false`
  while `API_BASE_URL` points at a live API (exactly the "local use" mode the middleware's own 401
  message advertises) — any anonymous caller then forges the actor on every privileged action; or
  (2) an identity that normalizes to `""` (e.g. `"issuer:"`) passes the non-empty check but yields
  `operator: ""`, letting an inbound header through.
- **Reproduction:** Deploy the console with `ADMIN_CONSOLE_REQUIRE_AUTH=false` and a live
  `API_BASE_URL`; POST a server-action request with header `x-lynia-operator: victim@corp.com`; the
  resulting ban/refund/KYC audit rows name `victim@corp.com` as the actor.
- **Fix direction:** unconditionally `requestHeaders.delete("x-lynia-operator")` before the conditional
  `.set()`, so the proxy-asserted identity is the only possible source.
- **Confidence:** confirmed-by-reading-code.

## F-07 · Admin "log a follow-up note" form has tamperable hidden fields → audit-log forgery
- **Journey:** 48, 52 · **Severity:** LOW
- **Files:** `apps/admin/app/orders/[id]/page.tsx:274-285` (plain `<form action={submitAdminAction}>`
  with client-visible hidden `action`/`target`/`path` inputs, unconstrained).
- **What:** Unlike the `ConfirmModal` path, this control posts hidden inputs that the operator can
  rewrite before submitting (e.g. change `action=order.nudge_rider` to `action=rider.ban`, any
  `target`). It writes only an audit-log row (no domain mutation) and the actor is still attributed,
  so the impact is audit-log pollution/forgery, not a state change. Compounds F-06 when attribution is
  also spoofable.
- **Confidence:** confirmed-by-reading-code.

## F-08 · On-hold rider cannot self-recover; the on-hold message instructs an impossible action
- **Journey:** 40, 43, 46 · **Severity:** MEDIUM (broken self-service recovery + misleading dead-end copy)
- **Files:** `apps/api/src/riders/reliability.ts:18-24` (recovery only via `RECOVER_PER_COMPLETION`);
  `apps/api/src/riders/online-gate.ts:39` + `apps/api/src/offers/offers.service.ts:71` +
  `apps/api/src/tracking/tracking.service.ts:213-219` (on_hold blocks online / offers / board);
  `packages/shared/src/policy.ts:31-35` (`ON_HOLD_BELOW=60`, `ON_HOLD_CLEAR_AT=70`,
  `RECOVER_PER_COMPLETION=2`). **Escape hatch that does exist:** admin
  `apps/api/src/admin/admin-riders.service.ts:273-294` (`clearHold`) and lift raise the score to
  `ON_HOLD_CLEAR_AT` and clear the flag.
- **What:** Reliability only climbs on a *completed delivery* (`+2`). Once the score drops below 60,
  `onHold` trips and the online-gate refuses online, offers, and board eligibility — so the rider can
  never take, and therefore never complete, a delivery. There is no time-based decay and no
  self-service path back: from a just-tripped 59 the rider would need 6 clean completions to reach 70,
  but is structurally blocked from earning any. The on-hold copy — *"You're on hold — complete
  deliveries to raise your reliability score"* — tells the rider to do the one thing the gate prevents.
  Recovery is possible **only** via an admin `clear-hold`/`lift`, which the rider-facing message never
  mentions.
- **Reproduction:** A rider at 68 gets one low-rated (`≤3`) delivery (`−10` lowRating) → 58 → on_hold.
  Every subsequent go-online / accept-offer is refused with the "complete deliveries" copy they cannot
  act on. They remain locked out until ops manually clears the hold.
- **Confidence:** confirmed-by-reading-code (with the admin-`clearHold` caveat — this is a self-service
  deadlock + misleading copy, not a permanent lockout).

## F-09 · Counterparty phone stays revealed forever on terminal `completed`/`delivered` orders
- **Journey:** 16, 22 · **Severity:** LOW–MEDIUM (privacy / CDPA-LR8; possibly by design — confirm)
- **Files:** `packages/shared/src/enums.ts:113-120` (`PHONE_REVEAL_STATUSES` includes `DELIVERED`,
  `COMPLETED`, `UNDELIVERED`); consumed by `orders.service.getSnapshot` (reveal window).
- **What:** §5d frames phone reveal as a bounded *live-trip* window, and the code comment only
  justifies including `undelivered` (the "call the rider" terminal affordance). But `completed` and
  `delivered` are also in the set, so for every normal finished trip both parties' real numbers stay
  revealed indefinitely whenever either re-opens the order snapshot from history. Notably the admin
  services deliberately use `ACTIVE_RIDE_STATUSES` (not this set) *specifically* to avoid leaving
  finished orders unmasked forever (`admin-orders.service.ts:133-137`), which suggests the terminal
  inclusion here is broader than intended for the party-facing path too.
- **Confidence:** confirmed-by-reading-code (behaviour); suspected as a defect vs. an intentional
  post-trip "call them" affordance — worth an explicit product decision.

## F-10 · Minor data-integrity / robustness gaps (defense-in-depth)
- **Severity:** LOW (each unreachable via the current API paths, but latent)
- **`reports` uniqueness ignores NULL `order_id`** — `apps/api/prisma/migrations/0014_report_unique/migration.sql`:
  the unique index is `(order_id, reporter, subject)` and Postgres treats NULLs as distinct, so
  null-order reports against one subject could stack and inflate the fault count. Not reachable today
  (`ReportsService.report` always supplies the route's `orderId`), but the schema permits it.
- **`blocks` allows self-block** — `apps/api/prisma/migrations/0013_trust_safety/migration.sql`: no
  `CHECK (blocker_profile_id <> blocked_profile_id)`; a profile can insert a row blocking itself.
- **`rankOffers` has no NaN guard** — `packages/shared/src/offer-ranking.ts:66-96`: a NaN
  fare/eta/rating yields an unstable sort + wrong `recommended`. Unreachable via the offer path (DB
  CHECKs `offered_fare > 0`, `eta_minutes >= 0`), so client-side robustness only.
- **`normalizePhone` accepts implausible numbers** — `packages/shared/src/phone.ts:36-52`: a foreign
  number typed without `+` (e.g. `447700900123`) gets `263` prepended and passes as a junk ZW identity
  rather than being rejected; the `\+\d{8,15}` check also admits a too-short ZW number. Documented
  ZW-only assumption; low impact.
- **Dead settlement schema** (informational, not a runtime bug) — the `settlements` table /
  `SettlementStatus` enum (migrations 0012) and the shared `SettlementStatus` export remain after the
  switch to prepaid per-ride commission; no code reads them.
- **Confidence:** confirmed-by-reading-code.

## Verified sound (no defect) — recorded to avoid re-investigation
- Concurrency core: guarded CAS on every order transition; `one_active_ride` partial-unique index
  (all five active statuses) blocks double-booking; `offers (order_id, rider_id)` unique enforces the
  one-round rule; delivery-OTP gate under `FOR UPDATE` with a committed attempt increment.
- Crypto: `pii-crypto` uses a fresh 12-byte IV per encrypt (no reuse), HKDF-split AES/HMAC keys, GCM
  tag verified on decrypt; tokens HMAC-hashed with `timingSafeEqual`; JWT pinned HS256.
- KYC webhook: fail-closed, canonical-body HMAC (+ raw fallback), 300 s replay window, monotonic
  apply on unique `kycRef`, `needsReview` never auto-verifies.
- Config boot-guards: production rejects the insecure JWT/PII/hash defaults (< 32 chars), missing
  Redis, console/sms OTP channels, non-empty `OTP_TEST_PHONES`, and stub-KYC auto-pass; staging
  bypass is scoped to its own hardcoded service.
- Pricing/geo: `haversineKm` domain-clamped + non-finite-guarded; fare floored/clamped; `boardCell`
  and `boardCellNeighborhood` bucket consistently for negative (Harare) coordinates.
- Status sets: no terminal status appears in either cancellable set; `ACTIVE_RIDE_STATUSES` matches
  the `one_active_ride` index; `undelivered`/`expired` are terminal and not re-actionable.

---

## Phase 3 — Adversarial pass (5 most dangerous areas, "hostile user" lens)

Re-examined the highest-value targets assuming an attacker actively trying to break/exploit:

1. **Offer → assign → deliver money/state path.** Assignment is a guarded CAS on
   `status='open_for_offers'`; the `one_active_ride` partial-unique index
   (`0001_init/migration.sql:150`) blocks double-booking a rider across all five active statuses;
   `accept` fares are re-bound to `proposedFare` (rounded-cents compare) so a modified client can't
   inflate the agreed fare; self-bid and block-pair are enforced at both `makeOffer` and `selectOffer`;
   delivery-OTP is compared under `SELECT … FOR UPDATE` with a committed attempt increment and a
   5-attempt cap. **No bypass found.** (Only edge: F-03, customer-side rotate resets the cap.)
2. **Auth / OTP / tokens.** OTP attempts are consumed atomically (Redis `HINCRBY` / Lua) before the
   compare, closing the TOCTOU; codes are CSPRNG + HMAC-hashed + `timingSafeEqual`; refresh rotation is
   an atomic guarded `updateMany` (no double-mint); `logout` is profile-scoped; JWT verify pins HS256;
   the `x-user-id` dev bypass is gated on an explicit `development|test` allowlist. **No bypass found.**
3. **KYC webhook.** Fail-closed without a secret in `didit` mode; HMAC over canonical body (v2) or raw
   (v1) with `timingSafeEqual`; timestamp replay window (300 s); monotonic apply keyed on unique
   `kycRef`; score-driven `needsReview` never auto-verifies. The signed-body `timestamp` drives the
   monotonic guard, so it can't be forged. **No bypass found.**
4. **Live-tracking / PII reveal.** WS handshake verifies the JWT and drops on failure; `subscribeOrder`
   gates on `canAccessOrder`, `riderLocation` on `isAssignedRider`, board on `isBoardEligible`; every
   PII-bearing REST read (`getSnapshot`, offer list, admin details) is ownership/standing-gated and
   phone reveal is windowed. **Only issue:** F-02 (stale GPS can render live in the no-Redis fallback).
5. **Admin console + moderation.** Fail-closed IAP gate; every mutation carries an in-transaction audit
   row; refunds capped at the order fare; UUID-pipe on all ids. **Issues:** F-06 (spoofable audit
   actor), F-07 (tamperable note form), F-01 (no lever to hold a rider-role user's customer abuse).

**Net:** the security-critical core resists a hostile actor. The surviving findings are moderation
gaps (F-01), degraded-mode correctness (F-02), audit integrity/defense-in-depth (F-03, F-06, F-07),
a shared-device privacy leak (F-04), and a cosmetic dedupe bug (F-05).



