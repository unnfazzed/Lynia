# KNOWN_BUGS.md — consolidated bug-sweep ledger

**Purpose.** A single deduplicated register of every distinct finding raised by every past bug
sweep, bug hunt, fraud/security review, UX/usability review, engineering review, and
launch/pilot-readiness audit in this repo. Future sweeps read this first so they don't
rediscover known bugs. Status is verified against the code at the time noted, not trusted from
the source report.

**Last consolidated:** 2026-07-13 (deep-sweep routine — orthogonal Fable hunt over never-audited
internals, pattern propagation, cross-cutting mechanisms, and an adversarial API pass). Prior fixes:
PR #192 (F-01…F-10), PR #193 (F-11…F-19). Prior sweep's remediation, all merged: **#195** (DS-01…DS-11
+ FRAUD P1-5), **#196** (F-09), **#197** (F-18 durability), **#198** (FRAUD P0-3 velocity), **#199**
(F-N3 + DS-11 verified-ID freeze), **#204** (BH-01, BH-02), **#210** (BR-01…BR-03 — broadcast ghost-rider
filter, widening radius, radius-config consolidation; see the broadcast-review section below). **This deep
sweep (`docs/DEEP-SWEEP-2026-07-13.md`)
found 8 new items** — DS13-01…DS13-07 + RH-01 (details in that report and the section at the bottom of
this ledger). **DS13-01…DS13-07 fixed and merged in PR #209** (`fix(deep-sweep): remediate DS13-01..07`),
each with a regression test; **RH-01 fixed in PR #221** (persisted `heldReason` — Option A), which also
lands the DS13-05 admin-web SOS panel follow-up. Phase-0 re-verified 8/8 sampled prior fixes still intact
(no regressions). Infra hardening flags are wired with
an ordered rollout runbook at `docs/INFRA-HARDENING-ROLLOUT.md`.

## Source reports folded in

| Report | Findings | Notes |
|---|---|---|
| `BUGHUNT_FINDINGS.md` | F-01…F-19 | Latest 2-pass sweep. **On-disk report still marks these OPEN — that is stale.** All fixed in code except F-09 (deferred) and F-18 (partial). |
| `BUGHUNT_JOURNEYS.md` | journey coverage for F-01…F-19 | 66-journey audit checklist, no independent findings |
| `docs/BUG-HUNT.md` | 30 (p1×2, p2×7, p3×21) | Superseded — all fixed or folded into F-series |
| `docs/JOURNEY-BUGS.md` | 27 (rider R1–R10, customer C1–C12, +P3s) | Mobile journey dead-ends; nearly all ✅ fixed |
| `docs/FRAUD-REVIEW.md` | 24 (P0×3, P1×6, P2×8, P3×7) | Money-fraud items mooted by settlement rewrite; abuse items fixed/folded |
| `docs/SECURITY.md` | 18 (P0×3, P1×5, P2×4, P3×6) | Roadmap; most code items ✅, infra items gated on terraform apply |
| `SECURITY.md` (root) | 0 | Generic disclosure policy, no findings |
| `docs/ENG-REVIEW.md` | 27 across 7 stages | Build/ship/KYC audits; nearly all ✅ fixed |
| `docs/UX-USABILITY-REVIEW-2026-07-08.md` | 19 | UX pass; all ✅ except downscale (later fixed) |
| `docs/UX-USABILITY-REVIEW-2026-07-09.md` | 9 | UX pass; all ✅ except re-render (later fixed) |
| `docs/UX-USABILITY-REVIEW-2026-07-10.md` | 17 | UX pass; all ✅ |
| `docs/UX-USABILITY-REVIEW-2026-07-11.md` | 22+1 | UX pass; all ✅ (otp-verify grace later fixed) |
| `docs/UX-USABILITY-REVIEW-2026-07-12.md` | 16 | UX pass; all ✅ (idle-rider position, viewer-role snapshot, delivered-terminal dead code, SOS honesty, +12 more). Feed-channel residue of #6/#11 closed by #206 (07-13) |
| `docs/UX-USABILITY-REVIEW-2026-07-14.md` | 24 | UX pass; 20 ✅ (order-screen rider-viewer gating, presence-stale wiring, token-refresh failure classification, heartbeat-cutoff split for FCM audience, push `data.to` per-order routing, expiry `hadOffers` honesty, KYC ID-freeze bypass in `completeProfile`, cancel-reason remap, +12 more). 2 deferred as KB-NOTIFY-ORDERID and KB-FEED-SYNTH below; 2 explicitly out of scope (`become.tsx` redirect nice-to-have; a routing bug found inside still-unmerged PR #231, not on `main`) |
| `docs/plans/BUGFIX-EXECUTION.md` | 24 | Execution plan for BUG-HUNT items — all landed |
| `docs/plans/LAUNCH-FIX-ROUND1.md` | 13 | Round-1 authz/abuse fixes — all landed |
| `docs/plans/TAIL-HARDENING-PLAN.md` | 6 | R8 handback + SEC dev-fallback + map leak — all ✅ |
| `docs/LAUNCH-READINESS.md` | 21 gates + 3 | Gate scorecard; code gates mostly closed, infra/ops founder-gated |
| `docs/PILOT-READINESS.md` | T0–T13 + gates | Pilot scorecard; build tasks ✅, vendor/device tasks founder-gated |

Raw findings across reports: ~250 line-items. After dedup: ~90 distinct issues. High cross-sweep
duplication (see clusters below).

---

## OPEN (present in code today)

Two small, low-impact code items are open from the 2026-07-14 UX pass (deliberately deferred, not
overlooked — see that report's §4 for why each was descoped rather than rushed). Everything else remains
FIXED or MOOT, and the infra/founder-gated items below are unchanged.

| ID | Description | Area | Sev | Sweeps | Notes |
|---|---|---|---|---|---|
| KB-NOTIFY-ORDERID | The "notify me" waiting-list entry doesn't carry an `orderId`, so its fulfillment push/feed gives generic "send again" advice and routes to `/home` even when the original auction is still open | `apps/api/src/riders/rider.service.ts` `drainNotifyWaiters`, `apps/mobile/src/push/push.ts` | LOW | 1 (07-14) | Needs a 3-way client/API/push contract change for a low-impact fix; descoped in favor of higher-value items in the same pass. |
| KB-FEED-SYNTH | The in-app notifications feed is derived only from order-status lifecycle events — "New offer" and account-status (KYC/standing) pushes never produce a feed row, so a user who received those pushes finds no record of them in the feed | `apps/api/src/notifications/notifications.service.ts` `feedForUser`, `apps/mobile/app/notifications/index.tsx` | LOW-MED | 1 (07-14) | Empty-state copy corrected 07-14 to stop promising categories the feed can't show; the fuller fix (a real Notification table or server-side row synthesis) is a data-model change, out of scope for a UX pass. |
| KB-SEC-INFRA | Deferred infra hardening: Cloud SQL public IP, Redis in-transit TLS, GCS CORS, WAF/Cloud Armor enforce, KYC bucket CMEK/retention, Redis/SQL HA | `infra/terraform/*` | MED-LOW | 3 | Flags all landed + wired; **rollout runbook now written: `docs/INFRA-HARDENING-ROLLOUT.md`** (ordered apply/verify/rollback per item). One reliability fix landed (CMEK bucket `depends_on` the KMS IAM grant). Remaining work is `terraform apply` in a window — founder-gated, not a code bug. |
| KB-MOBILE-PIN | Mobile certificate pinning for the API + WS host (SECURITY §P3-1) | `apps/mobile/plugins/with-certificate-pinning.js` | LOW | 1 | **Code landed** — gated config plugin merged and wired (`app.config.ts`), inert until `LYNIA_TLS_PINS` is set. **Arming helper added (#224):** `apps/mobile/scripts/compute-tls-pins.sh` computes the SPKI pins one-command. Remaining work is founder-executed **arming** (set real pins + `LYNIA_TLS_PIN_EXPIRATION`, native build) + **on-device validation** (`docs/MOBILE-CERT-PINNING.md`) — needs production cert material + a device, not automatable. |
| KB-OPS-GATE | Founder/ops launch gates: WhatsApp BSP + SMS gateway wiring, real ZIM-ID Didit run, live FCM, on-device QA, chaos/load drills, crash telemetry rollout, admin per-operator SSO/MFA | ops/founder | — | 3 | Not code defects — external readiness items from LAUNCH/PILOT readiness. |

### Recently closed (this session's remediation PRs)

| Was | Now | PR |
|---|---|---|
| KB-F09 — counterparty phone revealed on terminal statuses forever | **FIXED** — `PHONE_REVEAL_STATUSES` drops `completed`; added `DISPUTE_PHONE_REVEAL_STATUSES` for ops | #196 |
| KB-F18b — notify-me at-most-once (waiter dropped on push failure) | **FIXED** — claim-lock + delivery-set clear only delivered → at-least-once, still de-duped | #197 |
| FRAUD P1-5 — issue-raise ops-DoS (no throttle) | **FIXED** — `@Throttle` on issue-raise | #195 |
| FRAUD P0-3 — penalty-free undelivered abandonment | **MITIGATED (velocity)** — auto-`on_hold` on abnormal undelivered rate (`UNDELIVERED_ABUSE`) | #198 |
| F-N3 — `/kyc/callback` unsigned in prod stub+manual | **FIXED** — fail-closed whenever prod or provider=didit | #199 |
| DS-11 (residual) — verified rider could swap their national ID | **FIXED** — ID-change blocked once KYC-verified | #199 |
| UX-0712 #6/#11 feed residue — in-app feed still showed generic "Order cancelled" for a rider-bail (live rebroadcast running) and "raise your price" for a no-supply expiry; #202 fixed push only | **FIXED** — feed rewrites the rider-bail row to the honest copy and routes its tap to the live clone (in-window derivation, zero extra queries); `expiry_no_supply` flag persisted at expiry (migration 0023) drives honest copy in feed + expired snapshot/terminal; feed also suppresses the canceller's own "cancelled" row, mirroring the push's actor exclusion | #206 |
| UX-0711 deferred — OTP-verify idempotency after a lost response | **FIXED earlier than the ledger knew** — 60s hash-only grace window (`139c99a`) + verify-route throttle (`f9c2a12`), both on main since 07-12; a dedicated 07-13 security audit (replay, brute-force, multi-device, refresh-rotation) confirmed the shipped design with no residual gaps. #206 corrected the stale "still open" doc claim | #206 (docs) |

Newly discovered defects from this sweep are in the **Phase-1 findings** section at the bottom and in
`docs/DEEP-SWEEP-2026-07-12.md`.

---

## FIXED — latest sweep (BUGHUNT_FINDINGS.md F-01…F-19)

Fixed by PR #192 (`3f15c42`, F-01…F-10) and PR #193 (`f9c2a12`, F-11…F-19). Verified in code.

| ID | Description | Fix (verified) |
|---|---|---|
| F-01 | Banned/suspended rider retained sender-side (customer) access | `OrdersService.create` now reads profile standing and blocks on_hold/banned senders |
| F-02 | Stale GPS shown as "live" via `@updatedAt` fallback | Added `riders.position_updated_at` (migration 0022), used for snapshot freshness |
| F-03 | Delivery-OTP lockout resettable via unthrottled rotate | `@Throttle` on `delivery-code/rotate` route |
| F-04 | Shared-device cross-account leak (JOB_KEY, RIDER_BID_DRAFT_KEY) | `session.ts` clears both keys on sign-out |
| F-05 | Recipient dedupe fails across local vs +263 formats | Dedupe via shared E.164 `normalizePhone` |
| F-06 | Spoofable admin audit actor via `x-lynia-operator` | Middleware strips inbound header before re-asserting |
| F-07 | Tamperable admin follow-up-note hidden fields | Dedicated server action, hardcoded action + server-derived target |
| F-08 | On-hold rider recovery copy impossible to follow | Copy corrected to direct to support |
| F-10 | rankOffers NaN; normalizePhone implausible ZW lengths | NaN guard + ZW national-length tightening |
| F-11 | **Stored XSS** in ops console (dispute desc via `dangerouslySetInnerHTML`) | Rendered through React escaping; no `dangerouslySetInnerHTML` remains in `apps/admin` |
| F-12 | Uncaught reconciler crash (findMany outside try/catch, no process backstop) | Reconciler bodies try/caught; fire-and-forget carries `.catch`; `main.ts` adds `unhandledRejection`+`uncaughtException` handlers |
| F-13 | KYC resubmit cap unreachable in Didit auto mode | Auto/Didit decline increments `kycAttempts` inside monotonic-apply guard (replay-safe) |
| F-14 | KYC manual-decline non-idempotent | Manual decline guarded by `isRepeatOfSameDecline` against double-count |
| F-15 | OTP verify + 60s grace window unthrottled | `@Throttle` on `/auth/otp/verify`; grace path gains per-phone attempt ceiling |
| F-16 | Rider-role sender never gets presence:stale watchdog | Watchdog keys off per-order relationship, not global JWT role |
| F-17 | queue.add awaited on hot path; replay skipped broadcast | Enqueues `void ...catch` (not awaited); broadcast not gated behind enqueue |
| F-19 | `/client-metrics` had no rate limit | `@Throttle({limit:12,windowSec:60})` |

---

## FIXED / MOOT — older reports (deduped clusters)

**Money-fraud cluster → MOOT.** `settlements.service.ts` was rewritten to a read-only prepaid
per-ride model; `recordPayment`, `adjustFare`-driven settlement, refund-netting and auto-pause
mechanics no longer exist, so these no longer apply: FRAUD P0-2 commission-no-floor,
P0-3 undelivered-excluded-from-base, P1-1 refund-nets-whole-week, P2-1 admin-adjustfare-downward,
P2-2 recordpayment-no-proof; BUG-HUNT p2-4 recordpayment-no-audit, p3 adjustfare-no-status-guard;
BUGFIX P2-4, LAUNCH-FIX recordPayment-CAS. (Prepaid wallet itself is a future build.)

**Object-authz / IDOR cluster → FIXED (verified).** self-dealing wash-trade (makeOffer rejects
`customerId===riderId`), banned-rider-bidding (onlineRefusalReason standing gate), offers
`listForOrder` ownership gate, order `getSnapshot` party gate, offer TOCTOU (FOR UPDATE tx),
logout profileId-scoping, riders/nearby role-gate, boardLeave geo-room leave. (FRAUD P0-1/P2-3,
BUG-HUNT p2-1/p2-2/p3-offers-idor/p3-logout-idor/p3-nearby-enum/p2-7, ENG B-P0-3.)

**Auth/identity cluster → FIXED (verified).** JWT default-secret prod boot-guard, JWT HS256
algorithm pin, `x-user-id` dev fallback allowlist, OTP verify TOCTOU / concurrent-refresh atomic
rotation, launch-mode boot guards (console OTP, test phones, stub KYC rejected in prod).
(BUG-HUNT p1-1/p3-xuserid/p3-jwt-alg, ENG B-P0-1/B-P0-2, SECURITY P0-1/P2-3/P2-4, FRAUD P1-4.)

**KYC cluster → FIXED.** unsigned-webhook-fail-open (503 when provider=didit & no secret),
`applyKycResult` updateMany→unique `kyc_ref` (migration 0005), replay/reorder monotonic
`kyc_resolved_at` guard, vendor-outage 503 mapping, silent-stub loud warnings, KYC retry brute
force (now capped via F-13). (ENG KYC-P0-1/P0-2/P1-1/P1-2/P2-1, FRAUD P1-2, BUG-HUNT p3-kyc-callback:
stub-mode-only, rejected in prod by launch guard.)

**Notifications/FCM cluster → FIXED.** dead-token pruning (PushResult invalidToken + deleteMany),
device-token full-logging masked, batched sendEach ≤500, rider-broadcast push on open_for_offers,
device-token rehoming guard. (ENG FCM-P1/P2-1..4, BUG-HUNT p3-device-token-rehoming.)

**Data-integrity cluster → FIXED.** reports unique NULL order_id (migration 0014), rankOffers NaN
guard, DB check constraints (migration 0015), national-ID encryption at rest AES-GCM
(migration 0017). Two-way rating unique discriminator resolved. (BUG-HUNT p3 batch, F-10.)

**Edge/abuse cluster → FIXED.** global ThrottleGuard + @Throttle, Helmet security headers, CORS
allow-list, Socket.IO CORS tightened, global exception filter, 1MB body cap, outbound fetch
timeouts (Didit/WhatsApp/admin/apiFetch). (SECURITY P1-2/P1-3, ENG SHIP/B-P1, UX 07-08 #6.)

**Mobile journey dead-ends → FIXED.** markUndelivered flow, cancel-gate, cold-start restore
(customer + rider + 24h handback), push deep-link routing, resend-OTP cooldown, rebroadcast
prefill, MapPicker denied/timeout, error-state honesty, statuspill labels, on_hold copy,
StatusPill tones, PickupChecklist dead-end, stale cold-start push replay, bid-draft persistence.
(JOURNEY-BUGS R1–R10/C1–C12/S1, UX passes 07-08…07-11, TAIL-HARDENING R8.)

**Ship/infra correctness → FIXED.** WS LB timeout 3600, Cloud Run request timeout 3600, VPC
connector to Memorystore, dedicated run SA, keyless V4 signBlob, WIF keyless deploy, release.yml
config validation. (ENG SHIP-3a/3b/3c.)

---

## Coverage map — where past sweeps concentrated

**Heavily audited (multiple sweeps, deep):**
`auth`/OTP, `orders`/`order-lifecycle`, `offers`/`matching`, `settlements`, `kyc`, `riders`
(reliability/gates), `tracking.gateway` (rooms/presence/GPS), `admin` (audit/authz/cancel/fare),
`issues` (XSS/disputes), `notifications`/FCM, `reports`/blocks, `config`/env boot guards, mobile
customer + rider journeys, infra/terraform provisioning.

**Lightly or never audited before this sweep (Phase-1 hunting ground):**
`sos`, `privacy` (erasure/retention), `uploads` + signed-URL scope, `health`, `observability`
(metrics interceptor / client-metrics / otel), adapters (`gcs.storage`, `fcm.push`, `secrets`),
`common` (throttle guard ordering, exception filter, zod pipe, trust-proxy), `phone-backfill`,
admin-audit internals, `tracking.service` geo/Redis internals beyond the gateway.

---

## Phase-1 new findings (this sweep) — `docs/DEEP-SWEEP-2026-07-12.md`

All verified against code. Areas: the never-audited `privacy`/`sos`/`health`/`uploads` modules and
propagation of the F-12 crash pattern / F-17 queue pattern into untouched siblings.

**All DS-01…DS-11 are now FIXED** (PR #195, `fix(bughunt): remediate deep-sweep findings DS-01..DS-11`;
DS-11's stricter verified-rider ID freeze added in PR #199). Verified in code.

| ID | Description | Area | Sev | Status |
|---|---|---|---|---|
| DS-01 | Erasure + retention purge missed `SosEvent` GPS | `privacy.service.ts` | HIGH | **FIXED #195** — `eraseAccount` + `purgeExpiredData` scrub `sosEvent.lat/lng` |
| DS-02 | BullMQ `Queue`/`Worker` missing `.on("error")` → instance crash on Redis blip | `offer-expiry`, `order-lifecycle` | HIGH | **FIXED #195** — `error` listeners on all four (log, keep serving) |
| DS-03 | Admin `cancelOrder`/`adjustFare` non-CAS clobber | `admin-orders.service.ts` | MEDIUM | **FIXED #195** — CAS `updateMany` on observed status/fare, conflict on 0 rows |
| DS-04 | `/healthz` opens a fresh Redis connection per request | `health.service.ts` | MEDIUM | **FIXED #195** — one reused client + ping timeout |
| DS-05 | `POST /orders/:id/sos` unthrottled push flood | `sos.controller.ts` | LOW-MED | **FIXED #195** — `@Throttle` |
| DS-06 | `scheduleAutoClose` no retry/backoff | `order-lifecycle.service.ts` | LOW | **FIXED #195** — `attempts:3` + backoff |
| DS-07 | `/uploads/*` unthrottled → signBlob quota | `uploads.controller.ts` | LOW | **FIXED #195** — `@Throttle` |
| DS-08 | `device-token` register unthrottled | `notifications.controller.ts` | LOW | **FIXED #195** — `@Throttle` |
| DS-09 | Position-coalescer timer emit unguarded | `tracking.gateway.ts` | LOW | **FIXED #195** — `flushPositionEmit` try/caught |
| DS-10 | Erase active-ride TOCTOU | `privacy.service.ts` | LOW | **FIXED #195** — guard re-checked inside the tx |
| DS-11 | `idNumber` mutable → ban-evasion signal bypass | `auth.service.ts` | LOW-MED | **FIXED #195** (A-04 flag recompute) **+ #199** (ID frozen once KYC-verified) |

**Prior-sweep items re-surfaced this sweep — status now:**
- **FRAUD P1-5** — issue-raise ops-DoS → **FIXED #195** (`@Throttle` on issue-raise).
- **FRAUD P0-3** — penalty-free undelivered abandonment → **MITIGATED #198** (velocity auto-`on_hold`
  via `UNDELIVERED_ABUSE`; first-incident theft still not prevented — the acknowledged velocity-only
  trade-off).
- **BUG-HUNT p3-kyc-callback-unsigned-stub** (= F-N3) → **FIXED #199** (fail-closed in prod / didit).
- **device-token rehoming** (overlaps F-04) → **still open, intended** — `registerToken` upsert claims
  a token for the authenticated caller by design (shared-device re-login); FCM tokens are high-entropy.
  Left as-is.

---

## Sweep 2026-07-13 (bug-hunt routine) — `apps/mobile` only

Full-journey re-audit (customer/rider onboarding, order creation, bidding/negotiation, tracking,
completion) plus a fresh backend concurrency pass and a KYC-gating/API-contract pass, each run as an
independent research agent against current code and cross-checked against this ledger first.

**Bidding/negotiation concurrency — re-verified, no new findings.** Double-tap accept, counter-offer
racing acceptance, and offer-expiry racing acceptance are all serialized by the existing
`selectOffer`/`makeOffer`/`expireOrder` CAS + `$transaction` pattern (`matching.service.ts`,
`offers.service.ts`); `offer-loop.int.spec.ts` already fires real concurrent `Promise.allSettled`
requests and asserts single-winner semantics. No rider "withdraw offer" feature exists, so that
specific race scenario doesn't apply.

**KYC API-level gating / doc-storage authz / API contract / WS reconnect — re-verified, no new
findings.** Every path a rider uses to see or act on jobs traces back to the same server-side
`onlineRefusalReason` KYC+standing gate; KYC document read-URLs are minted only in the
`AdminGuard`-gated review endpoint (no rider-facing route mints one); mobile types already treat
backend-nullable fields as optional with defaulted status lookups (no unhandled-enum crash risk);
WS `connect`/`connect_error` and `AppState` foreground both force a full snapshot refetch.

**Two new findings, both FIXED (PR #204):**

| ID | Description | Area | Sev | Status |
|---|---|---|---|---|
| BH-01 | `order/[id].tsx`'s failed-fetch branch bucketed a 403 ("not your order" — the party-only IDOR gate, e.g. a losing bidder tapping a stale broadcast push, or a stale deep link on a shared/switched-account device) with a plain transient error, showing a "Retry" that can never succeed | `apps/mobile/app/order/[id].tsx` | LOW | **FIXED #204** — `orderLoadErrorKind` (`src/logic/order-tracking.ts`) gives 403 its own terminal message, no Retry |
| BH-02 | The rider "Open job" button, a duplicate/replayed push tap, and the cold-start deep link each unconditionally `router.push("/rider/job")` with no check for the active route — a double-tap or replayed notification stacks a redundant back-stack entry | `apps/mobile/app/rider/index.tsx`, `src/push/use-push-registration.ts` | LOW | **FIXED #204** — `pushOnce` (`src/push/push.ts`) is a no-op when the target is already the active route |

---

## Review 2026-07-13 (broadcast/dispatch mechanism) — PR #210

User-prompted review of how "nearby riders" are selected when a customer broadcasts (radius semantics,
availability filtering, config hygiene), traced through `orders.service.ts` → `tracking.service.ts` →
`matching.service.ts`. One code defect, one product gap, one hygiene hazard — all resolved in **#210**
(merged 07-13). Logged here so future sweeps don't rediscover them.

| ID | Description | Area | Sev | Status |
|---|---|---|---|---|
| BR-01 | Ghost riders received broadcasts and inflated the supply count: `nearbyRiders` filtered on `is_online = true` but never on heartbeat freshness, so an app killed with `isOnline` stuck true kept getting FCM pushes at its last known position AND padded the customer-facing `ridersNearby` count — a false "riders were pinged, sit tight" signal at the most anxious moment of the journey. (Distinct from the in-TX 30 s selection gate, which only protects the assign.) | `apps/api/src/tracking/tracking.service.ts` (both `nearbyRiders` paths) | LOW-MED | **FIXED #210** — 120 s `last_heartbeat_at` cutoff (`BROADCAST.heartbeatMaxAgeMs`, env-tunable) in the Redis-confirm AND `ST_DWithin` fallback queries; PostGIS int test proves the exclusion. Safe for idle riders (20 s app heartbeat). |
| BR-02 | No radius expansion (product gap, logged for context): an order with no taker inside the fixed 5 km simply expired at 90 s even with a willing rider at 6 km — a silent fill-rate ceiling in a thin-supply pilot. Not a defect per se, but the fixed disc also made the expiry's "nobody was online" copy misleading about reach. | `orders.service.ts` / `matching.service.ts` / `offer-expiry.service.ts` | — | **SHIPPED #210** — radius widens 5→8 km (30 s)→12 km (60 s) as a pure function of order age, corridor-capped; ticks ride the offer-expiry queue; per-order Redis `SADD` sent-set dedupes so each tick pushes only the new ring; board (WS + REST) and `ridersNearby` reflect the same disc; expiry no-supply verdict judged at the final radius. |
| BR-03 | The 5 km broadcast radius was duplicated as three independent constants (`BROADCAST_RADIUS_M` in orders, `NEARBY_RADIUS_M` in matching, `NOTIFY_RADIUS_M` in riders) — a drift hazard where tuning one silently desynchronizes the push, the no-supply check, and the "rider online near you" drain | `orders.service.ts:36`, `matching.service.ts:17`, `rider.service.ts:32` (all pre-#210) | LOW | **FIXED #210** — single shared `BROADCAST` policy (`packages/shared/src/policy.ts`), env-overridable (`BROADCAST_BASE_RADIUS_M`, `BROADCAST_HEARTBEAT_MAX_AGE_MS`), validated at boot in `envSchema` |

---

## Deep sweep 2026-07-13 (deep-sweep routine) — `docs/DEEP-SWEEP-2026-07-13.md`

Orthogonal Fable hunt (never-audited internals second pass, pattern propagation, cross-cutting
mechanisms) + adversarial API pass, all cross-checked against this ledger first. Phase-0 re-verified
8/8 sampled prior fixes intact. Two agent-proposed candidates rejected on code re-read (a claimed
`markUndelivered` double-penalty — blocked by the `claimed.count===0` throw + the post-pickup gate on
retry; a claimed stale offer-expiry race — the rebroadcast clone has a new order id the stale job
can't touch). Eight new findings; **DS13-01…DS13-07 fixed and merged in PR #209**, RH-01 **FIXED in
PR #221** (see table below). #209 landed with `pnpm typecheck` + 714 API tests + API build green and
all CI checks passing; no schema migration.

| ID | Description | Area | Sev | Status |
|---|---|---|---|---|
| DS13-01 | Multi-instance customer-presence refutation `customerLiveInRoom` matches on global JWT `role`, re-introducing the F-16 dual-role-sender bug the subscribe path was hardened against → false `presence:stale` to the rider for a rider-role sender | `tracking.gateway.ts:593-601` | MEDIUM | **FIXED #209** — match the customer by order relationship (socket `sub` ≠ assigned rider via new `TrackingService.assignedRiderId`), mirroring `riderLiveInRoom` |
| DS13-02 | Every socket disconnect evicts an online rider from the Redis geo index → backgrounded-but-online riders get no new-order FCM push and are excluded from supply/no-supply counts (Redis GEOSEARCH prefilter overrides the documented `is_online` authority) | `tracking.service.ts:324-347`, `orders.service.ts:301-330` | HIGH | **FIXED #209** — `flushToPg` no longer evicts on disconnect; eviction happens only on explicit go-offline (`setOnline(false)`), so PG `is_online` stays authority |
| DS13-03 | Admin order-cancel emits WS only — no FCM to the assigned rider/customer, unlike the party-initiated cancel; rider can keep riding on a cancelled order | `admin-orders.service.ts:126-132` | MEDIUM | **FIXED #209** — inject `NotificationsService` (optional, `@Global`), fire `notifyOrderStatus` post-commit for push parity |
| DS13-04 | Admin rider/customer standing mutations (`suspendRider`/`liftRider`/`banRider`/`clearHold`, customer holds) lack the DS-03 CAS guard → a lift/clear-hold can clobber a concurrent ban or velocity auto-hold | `admin-riders.service.ts`, `admin-customers.service.ts` | MEDIUM | **FIXED #209** — CAS `updateMany` guarded on the observed `accountStatus` (+ `onHold`/`reliabilityScore` for lift/clear-hold), 409 on 0-row conflict; the `reliabilityScore` predicate serialises against a concurrent velocity auto-hold without a separate row lock |
| DS13-05 | SOS is write-only: `SosEvent` has no ops read surface and its sole escalation is an un-reconciled best-effort push to a `role=admin` device-token audience that may be empty → SOS can vanish while the counterparty is told "safety team alerted" | `sos.service.ts`, `notifications.service.ts`, `apps/admin` | HIGH | **FULLY FIXED — #209 + #221 + #224.** `AdminGuard` read-only `GET /admin/sos` (`SosService.listRecent`) + zero-recipient `notifyOps` log (#209); admin-web `/sos` list page (#221); **acknowledgement workflow — `POST /admin/sos/:id/ack` (idempotent CAS + audit) + inline Acknowledge action + pending/acknowledged status (#224)**. |
| DS13-06 | `POST /riders/become` unthrottled → a parallel burst mints N paid Didit sessions; concurrent-create P2002 leaks as a 500 | `riders.controller.ts:38`, `rider.service.ts` | LOW | **FIXED #209** — `@Throttle({limit:5,windowSec:3600,keyPrefix:"become"})` parity with `kyc/retry` + P2002→`ConflictException` mapping |
| DS13-07 | Cancelling an `open_for_offers` auction never signals the board → dead cards / live "offer sent" states linger until local countdown/409 | `order-lifecycle.service.ts:612-647`, `admin-orders.service.ts:130` | LOW | **FIXED #209** — emit the expiry path's `emitBidExpired` board-close to the pickup geo rooms on cancel-while-open |
| RH-01 | FRAUD P0-3 velocity `on_hold` self-clears on the next reliability-recovery event because the score hysteresis unconditionally un-holds at score ≥ `ON_HOLD_CLEAR_AT` | `reliability.ts:22`, `order-lifecycle.service.ts` | MEDIUM | **FIXED #221** — persisted `heldReason` (`reliability`\|`velocity`\|null; migration 0024); `applyReliabilityDelta` never clears a `velocity` hold on score recovery, only an admin clear-hold releases it |
