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

---

# Pass 2 — Re-audit at HEAD 6578eab (2026-07-12)

_Second discovery pass over all 66 journeys (incl. the PR #190 delta: OTP grace window, proof-of-
pickup photo, background-GPS-through-nav-handoff, fare-adjustment provenance, tracking re-render
isolation). All journeys 1–61 re-traced; 62–66 (the #190 surfaces) audited fresh. Findings below
are **new** in this pass (F-11…F-19); none duplicate F-01…F-10._

**Status of Pass-1 findings (F-01…F-10):** re-verified against HEAD — **all 10 remain open**. PR
#190/#191 fixed none of them; several citations drifted (code moved, behaviour identical):
- **F-01** create-gate → `orders.service.ts:106-107`; `holdCustomer` filter `admin-customers.service.ts:134`.
- **F-02** API fallback → `orders.service.ts:581-589`; mobile staleness moved to
  `src/ui/order/LiveTrackingCard.tsx:65-76` + `src/logic/order-labels.ts:47` (still keys off snapshot `rider.updatedAt`).
- **F-03** `rotateDeliveryCode` → `order-lifecycle.service.ts:668-683` (reset at :680); no `@Throttle` on the rotate route.
- **F-04** the `rider-bid-draft.ts` half is actually **new in #190** (persisted bid draft didn't exist at 3dc606b);
  `clearDeviceState` (`session.ts:197-224`) still wipes neither `JOB_KEY` nor `RIDER_BID_DRAFT_KEY`. No *other* #190-added key leaks
  (pickup-photo/background-task/checklist persist nothing locally).
- **F-07** note form → `orders/[id]/page.tsx:300-303`. · **F-09** set → `enums.ts:115-120`. F-05, F-06, F-08, F-10a–e unchanged.

**Headline (Pass 2):** the concurrency/crypto/state-machine core remains sound, but this pass found
a **stored XSS in the privileged ops console** reachable by any marketplace user (F-11, CRITICAL)
and a **fleet-wide crash vector** in the fire-and-forget reconcilers/rebroadcast (F-12, HIGH) — both
higher-severity than anything in Pass 1. The rest are a two-sided break in the KYC attempt counter
(F-13/F-14) and five defense-in-depth / degraded-mode gaps (F-15…F-19).

---

## F-11 · Stored XSS in the ops console via a party-submitted dispute description (`dangerouslySetInnerHTML`)
- **Journey:** 50 (also 48, 52) · **Severity:** CRITICAL (privileged-console script execution → refunds/bans/KYC as the operator + PII exfiltration)
- **Files:** `apps/admin/app/issues/[id]/page.tsx:71` (`<div … dangerouslySetInnerHTML={{ __html: i.facts }} />`);
  `apps/api/src/issues/issues.service.ts:170` (detail returns `facts: issue.description` raw);
  `apps/api/src/issues/issues.service.ts:56-64` (`raise` stores `description` verbatim);
  `packages/shared/src/contracts.ts:168-172` (`description: z.string().min(1).max(1000)` — length only, no HTML stripping);
  `apps/api/src/issues/issues.controller.ts` (any authenticated party on the order can raise). Latent sibling sink:
  `apps/admin/app/customers/[id]/page.tsx:76` (`__html: c.warn`), currently unreachable (`getCustomerDetail` hard-codes `warn: undefined`).
- **What:** The dispute-detail screen renders the opener's free-text statement (`i.facts` = the raw
  `issue.description` a customer or rider typed) through `dangerouslySetInnerHTML` with **no
  sanitization anywhere on the path**. `RaiseIssueRequest.description` is validated only for length,
  so an authenticated party can POST `orders/:orderId/issues` with `<img src=x onerror="…">`. When an
  ops operator opens that dispute, the script executes in the **admin console's origin** — which holds
  the operator's session and drives privileged server actions (KYC approve, rider ban, refund, fare
  adjust, order cancel) and renders revealed counterparty phone numbers. So a marketplace user (a
  phone-OTP away) can run script as the operator: invoke privileged mutations and/or exfiltrate PII.
  The adjacent statements list (`:110-114`) renders `{s.text}` through normal React escaping — safe;
  only the `facts` block is the unsafe sink.
- **Reproduction:** A rider or customer on any order they were party to calls `POST
  /orders/<orderId>/issues` with `description` = an HTML/JS payload. An ops agent opens the disputes
  queue and clicks into that issue → the payload runs in the console with the operator's privileges.
- **Confidence:** confirmed-by-reading-code (full chain read: contract → store → detail map → sink).

## F-12 · Fire-and-forget reconcilers + post-commit rebroadcast have no catch → a transient DB error crashes the whole API process
- **Journey:** 53, 54 (and the 15/38 rebroadcast tail) · **Severity:** HIGH (fleet-wide availability)
- **Files:** `apps/api/src/matching/offer-expiry.service.ts:87-88` (boot + 2-min interval `void this.reconcileStaleOffers()`),
  `:117-121` (`prisma.order.findMany` OUTSIDE the try/catch — only the per-order `expireOrder` loop at :124-128 is wrapped);
  `apps/api/src/orders/order-lifecycle.service.ts:123-141` (identical pattern in `reconcileStaleDeliveries`);
  `apps/api/src/orders/order-lifecycle.service.ts:570` (`void this.orders.announceOpenOrder(rebroadcastId)`) +
  `apps/api/src/orders/orders.service.ts:308-323` (`findUnique` + `await this.expiry.schedule(...)` un-caught inside `announceOpenOrder`);
  `apps/api/src/main.ts` (no `process.on("unhandledRejection")` handler anywhere — grep-confirmed; `void bootstrap()` at EOF);
  contrast `apps/api/src/tracking/tracking.gateway.ts:180-185` which attaches an explicit `.catch` to `flushToPg`
  citing *exactly* "an unhandledRejection … crashes under [Node's default]".
- **What:** Every other `void`-called helper self-wraps in try/catch; these three don't. If the
  reconciler's `findMany` rejects (DB failover, Prisma pool-timeout P2024 under load, or boot before
  the DB is reachable — `reconcileStaleOffers` runs unconditionally at `onModuleInit`), the promise
  rejects unhandled, and on Node 22 (`node dist/main.js`, no handler) an unhandled rejection is
  **fatal** — the process exits, dropping every live tracking/board WebSocket and all in-flight
  requests. Because every instance runs the same 2-minute interval, a DB blip becomes a *synchronized*
  crash-loop — defeating the very reconciler meant to survive infra blips. The same applies
  post-commit on a rider cancel: a DB blip inside `announceOpenOrder` crashes the instance *after* the
  cancel already committed. The codebase demonstrably knows this failure mode (the gateway comment) —
  these call sites were simply missed.
- **Reproduction:** Pause Postgres ~10 s (or exhaust the Prisma pool) so a 2-minute reconciler tick's
  `findMany` rejects → the process logs `ERR_UNHANDLED_REJECTION` and exits; all sockets drop. Or:
  rider cancels a job while the DB blips right after commit → `announceOpenOrder` rejects → instance dies.
- **Confidence:** confirmed-by-reading-code (crash mechanism verified; trigger is environmental but routine).

## F-13 · KYC resubmit cap (A-02) is unreachable in auto/Didit mode → unlimited retries + unbounded paid vendor sessions
- **Journey:** 27 (also 26) · **Severity:** MEDIUM (anti-abuse/ban-evasion cap defeated; liveness brute-force; vendor cost)
- **Files:** `apps/api/src/riders/rider.service.ts:162-193` (`retryKyc` — cap check `kycAttempts >= 2` at :172-174,
  update at :188-191 makes **no** `kycAttempts` change); `apps/api/src/riders/rider.service.ts:263-277` (`applyKycResult`,
  the vendor-webhook decline path, comment at :269-271 "NOT a kycAttempts change"); `rider.service.ts:326-341`
  (only `adminSetKyc(failed)` — manual decline — increments the counter); `apps/api/src/riders/riders.controller.ts:43-46`
  (`POST /riders/kyc/retry` carries **no `@Throttle`**); consumer `apps/mobile/src/logic/gates.ts:111-113` (`isKycLocked` keys off `>= 2`).
- **What:** The A-02 rule ("one resubmit → then support") is enforced solely via `kycAttempts >= 2`,
  but `kycAttempts` is incremented in **exactly one place** — an *admin manual* decline. The
  production Didit auto-decline arrives via the signed webhook (`applyKycResult`), which deliberately
  does **not** touch `kycAttempts`. So in auto/Didit mode the counter stays `0` no matter how many
  times a rider fails: (a) `retryKyc`'s guard never trips → unlimited `POST /riders/kyc/retry`, each
  invoking `vendor.submit()` to mint a fresh **paid** Didit session; (b) no `@Throttle` → no rate
  limit either; (c) the "locked → contact support" dead-end (`isKycLocked`) is never shown. Defeats
  the ban-evasion cap and lets a rider brute-force the face-match/liveness threshold indefinitely.
- **Reproduction:** `KYC_PROVIDER=didit`, `KYC_MODE=auto`. Rider fails face-match → webhook sets
  `kycStatus=failed`, `kycAttempts=0`. Rider taps "Try again" (or scripts the endpoint) repeatedly →
  each returns a new `verificationUrl`, no cap, no throttle; `isKycLocked` never becomes true.
- **Confidence:** confirmed-by-reading-code.

## F-14 · KYC manual-decline increment is non-idempotent → a retried decline (lost response) prematurely locks the rider
- **Journey:** 45 · **Severity:** MEDIUM (broken guarantee: rider loses their one entitled resubmit)
- **Files:** `apps/api/src/riders/rider.service.ts:323-341` (`adminSetKyc` decline branch: unconditional
  `kycAttempts: { increment: 1 }`, **no** guard that `kycStatus` is still `pending`, no idempotency key);
  `apps/admin/app/riders/actions.ts:26-38` (`decideKyc` throws on a failed `adminPost`);
  `apps/admin/app/components/ConfirmModal.tsx:118-133` (a thrown action keeps the modal open with an error → operator retries);
  contrast the guarded siblings `apps/api/src/issues/issues.service.ts:203-213` (CAS `where status not resolved`)
  and `apps/api/src/admin/admin-orders.service.ts:87-89` (terminal-state guard on cancel).
- **What:** The decline path bumps `kycAttempts` every time it runs, with no state/idempotency guard.
  The A-02 lock trips at `>= 2` (rider is entitled to one resubmit). If the first decline commits
  server-side but the response is lost (network drop / timed-out `AbortSignal`), the ConfirmModal
  stays open and the operator clicks Confirm again — the second call increments 1→2 and **locks** the
  application after what was logically a single decline. Unlike `issues.resolve` (CAS) and
  `cancelOrder` (terminal guard), this sensitive counter mutation has no such protection. (This is the
  other face of the F-13 root cause: `kycAttempts` is only ever mutated by this one non-idempotent
  path — never incremented in auto mode, over-incremented on manual-retry.)
- **Reproduction:** Operator declines a rider's first KYC attempt; the write commits but the HTTP
  response is lost. Modal shows "Failed to record…". Operator retries → `kycAttempts=2` → rider locked,
  routed to support, despite only one real decline.
- **Confidence:** confirmed-by-reading-code.

## F-15 · Post-verify OTP grace window is an unthrottled, uncapped code-guess path
- **Journey:** 2, 62 · **Severity:** LOW (defense-in-depth regression of journey-2's attempt-cap; low, timing-bound exploit probability)
- **Files:** `apps/api/src/auth/auth.service.ts:186-199` (grace branch entered whenever the live OTP record is absent);
  `apps/api/src/auth/auth.service.ts:307-324` (`verifyViaGrace` — no attempt counter, by design);
  `apps/api/src/auth/auth.controller.ts:26-29` (`POST /auth/otp/verify` carries **no `@Throttle`** and never calls `enforceRate`).
- **What:** Journey-2's brute-force protection is the 5-guess counter embedded in the *live* OTP
  record (`incrAttempts` deletes it at the cap), and `/auth/otp/verify` has no per-endpoint throttle —
  so the cap is the only guard. The PR #190 grace record deliberately carries no attempt counter
  ("the TTL is the rate limit") and is served precisely when the live record is gone. So for the 60 s
  after any successful verify, the correct 6-digit code for that phone is guessable through an endpoint
  with neither an attempt cap nor a throttle — breaking the invariant "a code gets at most 5 guesses."
  The design comment's claim that hammering yields nothing beyond the "expired" error is weaker than
  the live path it replaces: a correct guess in the window mints a full session. Bounded to LOW because
  the window opens only on a *legitimate* success (an attacker can't open it for a victim) and requires
  ~500k requests within the 60 s coinciding with a real login. Fix direction: add a per-phone throttle
  (or attempt counter) to the grace path, or `@Throttle` the verify route.
- **Reproduction:** Victim signs in successfully (grace written, live OTP deleted). Within 60 s an
  attacker floods `POST /auth/otp/verify {phone, code}` cycling codes — neither rate-limited nor
  counted — and a correct guess mints a session for the victim's phone.
- **Confidence:** confirmed-by-reading-code (two independent traces converged; exploit is narrow/timing-dependent).

## F-16 · Rider-role accounts acting as senders never get customer-presence watchdog coverage
- **Journey:** 12, 42, 55 · **Severity:** LOW
- **Files:** `apps/api/src/tracking/tracking.gateway.ts:201` (`if (user.role === "customer") this.markCustomerPresent(...)`),
  `:207-225` (`markCustomerPresent`), `:519-569` (`scanCustomerPresence`); mint site `apps/api/src/auth/token.service.ts`
  (`signAccess(profileId, role)` pins the account's single global `role`).
- **What:** The C5 customer-side presence watchdog keys entirely off the JWT `role`: `subscribeOrder`
  calls `markCustomerPresent` only when `user.role === "customer"`. But `Role` is one global enum per
  account (same root as F-01) — once a user becomes a rider, every token they mint is `"rider"`,
  including when they place a delivery as the *sender*. For any order whose customer is a rider-role
  account, `customerPresence` is never populated, so `scanCustomerPresence` never escalates
  `presence:stale` to the assigned rider when that sender goes dark. The in-code justification ("a
  rider-role subscriber's liveness is the DB heartbeat via `findStaleRiderPresence`") doesn't apply —
  that path only matches the order's *assigned rider* (`riderId`), never the customer. A pure
  customer-role sender in the identical situation correctly triggers the escalation.
- **Reproduction:** A user who completed rider onboarding sends a parcel; a rider is assigned; the
  sender backgrounds/kills the app → the rider's app shows the customer as present indefinitely (no
  `presence:stale`), whereas a customer-role sender would trigger it.
- **Confidence:** confirmed-by-reading-code.

## F-17 · `queue.add` awaited in the request path after commit → Redis outage hangs the response and the idempotent replay skips the rider fan-out
- **Journey:** 53, 54, 6 · **Severity:** LOW
- **Files:** `apps/api/src/orders/orders.service.ts:177` (`await this.expiry.schedule(order.id)` after the order committed,
  *before* `broadcastToNearbyRiders`), `:114-120` (idempotency replay returns the existing order and re-attempts neither
  schedule nor fan-out); `apps/api/src/orders/order-lifecycle.service.ts:315` + `:685-692` (`confirmDelivery` awaits
  `scheduleAutoClose` after the `delivered` commit); `apps/api/src/matching/offer-expiry.service.ts:47` +
  `order-lifecycle.service.ts:78` (`maxRetriesPerRequest: null` → ioredis buffers commands during an outage, so `add()` never settles).
- **What:** With Redis down/partitioned, `Queue.add` neither resolves nor rejects (offline queue +
  `maxRetriesPerRequest: null`), so (a) the customer's `create` hangs indefinitely after the order is
  already live in the DB, and (b) `confirmDelivery` hangs after `delivered` committed (a retry then
  409s "not ready for delivery"). Worse on the create path: the hang sits *before* the push/WS fan-out,
  so when the client times out and retries with the same idempotency key, the replay returns the
  existing order and **skips `broadcastToNearbyRiders`** — the auction runs its full window with zero
  rider push and zero board emit (riders can only find it by organically opening the REST board).
  Expiry is backstopped by the DB reconciler and auto-close by its reconciler; nothing backstops the
  lost broadcast.
- **Reproduction:** Stop Redis. Customer broadcasts → DB row commits, the request hangs at
  `expiry.schedule`, client times out and retries, gets the order back — no nearby rider is ever
  pushed/board-notified for that auction.
- **Confidence:** confirmed-by-reading-code.

## F-18 · "Notify me" drain removes waiters before the push is attempted (at-most-once) and is non-atomic across instances (double-ping)
- **Journey:** 58 · **Severity:** LOW
- **Files:** `apps/api/src/tracking/tracking.service.ts:462-487` (`drainNotifyNear`: GEOSEARCH → `ZREM` from both
  structures → *then* returns ids); `apps/api/src/riders/rider.service.ts:241-248` (push happens only after the drain,
  inside a swallow-all catch); `apps/api/src/notifications/notifications.service.ts:262-271` (`send` silently no-ops when
  the profile has no device token).
- **What:** The drain deletes the waiter's registration from Redis *before* any notification is
  attempted, so the pipeline is strictly at-most-once: if the FCM batch fails transiently, or the
  customer simply has no registered device token (push permission denied → `send` returns early), the
  registration the customer was told was `queued: true` is silently consumed and they are never pinged,
  with no retry path. Separately, the GEOSEARCH→ZREM pair isn't atomic (no Lua/MULTI): two riders
  coming online near the same waiter on different instances can both read the member before either
  removes it → double-ping, contradicting the code's own "pinged exactly once" invariant
  (`tracking.service.ts:480`).
- **Reproduction:** Customer taps "notify me" with push permission revoked (no token) → `queued: true`.
  A rider comes online nearby → drain removes the entry, `send` no-ops → the customer is dropped from
  the list having received nothing, and later riders won't ping them either.
- **Confidence:** confirmed-by-reading-code.

## F-19 · `/client-metrics` is the only authenticated write with no rate limit → any account can poison the RUM/SLO histograms
- **Journey:** 61 · **Severity:** LOW (observability integrity only — no user-facing behaviour keys off these instruments)
- **Files:** `apps/api/src/observability/client-metrics.controller.ts:17-36` (no `@Throttle`);
  `apps/api/src/app.module.ts:76-78` (global ThrottleGuard no-ops without `@Throttle` metadata);
  `packages/shared/src/contracts.ts:392-399` (per-request bounds only: 20 samples, `dropped ≤ 10000`);
  `apps/api/src/observability/metrics.service.ts:171-180` (every sample recorded verbatim into the SLO histograms).
- **What:** Every other spammable mutation carries `@Throttle` (order-create 20/min, offer-make
  60/min, even notify-me 10/min), but metrics ingest has none and the schema bounds only a *single*
  request. The controller's doc treats auth as the anti-poisoning guard, yet any self-service customer
  account (a phone OTP away) can loop 20 max-value samples per request at line rate. Label cardinality
  is capped (16 version buckets + fixed enums) so the time-series budget survives, but the *values*
  aren't — an attacker can drive `client_position_glass_latency_ms` p95 to 60 s (false SLO alarms) or
  flood 1 ms samples to mask a real regression, and inflate `client_samples_dropped_total` by 10,000
  per request.
- **Reproduction:** Sign up a throwaway customer; loop `POST /client-metrics` with 20×`{event:"position_glass", ms:60000}`
  samples → the glass-to-glass p95 dashboards and any alerts on them are poisoned; nothing rate-limits or attributes the flood.
- **Confidence:** confirmed-by-reading-code.

---

## Pass-2 verified-sound (re-checked, no new defect)
- **KYC webhook** (`apps/api/src/kyc/**`) — byte-identical to Pass-1 base; fail-closed / canonical-HMAC / 300 s replay / monotonic-apply analysis holds.
- **FCM push fan-out** — positional `sendEach` result mapping, prune only on the two permanently-dead codes, whole-batch throw never mass-prunes; token re-homing is an authenticated atomic upsert; unregister is profile-scoped.
- **Retention purge** — scheduler path requires Google-verified OIDC (exact SA email, `email_verified`, audience pinned to the route); sweep is idempotent and only touches rows past positive-int-guarded windows / sessions expired ≥30 days.
- **Presence watchdog** — candidates refuted against cluster-wide room membership before escalating; one-shot dedup via `SET NX` + explicit release with TTL backstop; customer mirror prunes ended rides and cross-instance false-darks. (Gap is F-16, the role-gated *entry* to it.)
- **Live-position pipeline** — Redis-leading read + PG fallback, unthrottled heartbeat vs throttled flush, disconnect flush + geo-index eviction with the PG `is_online` join as authority. (F-02 unchanged.)
- **Pickup-photo attach** (#190) — assigned-rider guard, `pickup/<riderId>/` key-namespace check, CAS on the attach-window statuses, idempotent replace; never gates the collect.
- **Background-GPS task** (#190) — forwarder registered only during an active job and nulled in the same teardown; `wantRunning` last-write-wins converges to "stopped" (privacy-safe) on every start/stop race; persists nothing locally.

_Pass-2 status: all 66 journeys audited. 9 new findings (F-11…F-19); F-01…F-10 all still open._



