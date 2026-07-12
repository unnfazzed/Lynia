# KNOWN_BUGS.md — consolidated bug-sweep ledger

**Purpose.** A single deduplicated register of every distinct finding raised by every past bug
sweep, bug hunt, fraud/security review, UX/usability review, engineering review, and
launch/pilot-readiness audit in this repo. Future sweeps read this first so they don't
rediscover known bugs. Status is verified against the code at the time noted, not trusted from
the source report.

**Last consolidated:** 2026-07-12 (deep-bug-sweep). Code verified at branch
`claude/deep-bug-sweep-w4we48` (tip includes PR #192 `3f15c42` F-01…F-10 fixes and PR #193
`f9c2a12` F-11…F-19 fixes).

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
| `docs/plans/BUGFIX-EXECUTION.md` | 24 | Execution plan for BUG-HUNT items — all landed |
| `docs/plans/LAUNCH-FIX-ROUND1.md` | 13 | Round-1 authz/abuse fixes — all landed |
| `docs/plans/TAIL-HARDENING-PLAN.md` | 6 | R8 handback + SEC dev-fallback + map leak — all ✅ |
| `docs/LAUNCH-READINESS.md` | 21 gates + 3 | Gate scorecard; code gates mostly closed, infra/ops founder-gated |
| `docs/PILOT-READINESS.md` | T0–T13 + gates | Pilot scorecard; build tasks ✅, vendor/device tasks founder-gated |

Raw findings across reports: ~250 line-items. After dedup: ~90 distinct issues. High cross-sweep
duplication (see clusters below).

---

## OPEN (present in code today)

| ID | Description | Area | Sev | Sweeps | Notes |
|---|---|---|---|---|---|
| KB-F09 | Counterparty phone stays revealed on DELIVERED/COMPLETED (`PHONE_REVEAL_STATUSES` includes terminals) so phones remain visible in history forever | `packages/shared/src/enums.ts` → `orders.service.getSnapshot` | LOW-MED | 1 | **Intentionally deferred** — F-01…F-10 fix commit skipped F-09 pending a product decision (history usability vs. privacy). Track, don't auto-fix. |
| KB-F18b | "Notify me when a rider is online" drain is at-most-once: a waiter is claimed then lost if no device token / push fails; no durable re-queue | `tracking.service.drainNotifyNear`, `notifications.service` | LOW | 1 | Cross-instance **double-ping** half fixed (single Lua claim). Durable re-queue explicitly deferred as a follow-up in `f9c2a12`. |
| KB-SEC-INFRA | Deferred infra hardening: Cloud SQL public IP, Redis in-transit TLS, GCS CORS wildcard, WAF/Cloud Armor tuning, mobile cert pinning, KYC bucket CMEK/retention | `infra/terraform/*` | MED-LOW | 3 | Code/flags landed; gated on `terraform apply` + founder rollout. Not a code bug. |
| KB-OPS-GATE | Founder/ops launch gates: WhatsApp BSP + SMS gateway wiring, real ZIM-ID Didit run, live FCM, on-device QA, chaos/load drills, crash telemetry rollout, admin per-operator SSO/MFA | ops/founder | — | 3 | Not code defects — external readiness items from LAUNCH/PILOT readiness. |

Everything else from every report is FIXED or MOOT (below). Newly discovered defects from this
sweep are appended in the **Phase-1 new findings** section at the bottom and in
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

| ID | Description | Area | Sev | Conf | Status |
|---|---|---|---|---|---|
| DS-01 | Right-to-erasure (`eraseAccount`) and retention purge both miss `SosEvent` → emergency-time precise GPS + profile linkage retained indefinitely | `privacy.service.ts:63-151`, `schema.prisma:450` | HIGH | high | OPEN |
| DS-02 | BullMQ `Queue`/`Worker` have only `.on("failed")`, no `.on("error")` → Redis connection error → EventEmitter throw → `uncaughtException` → `process.exit(1)` crashes the instance | `offer-expiry.service.ts:69-77`, `order-lifecycle.service.ts:108-114`, `main.ts:38` | HIGH | med-high | OPEN |
| DS-03 | Admin `cancelOrder`/`adjustFare` use non-CAS check-then-act update; a concurrent `confirmDelivery` (delivered) gets clobbered to cancelled | `admin-orders.service.ts:80-149` | MEDIUM | med | OPEN |
| DS-04 | `/healthz` unauthenticated + unthrottled, opens a fresh Redis connection (+ DB ping) per request → connection-churn DoS amplification | `health.service.ts:30-42`, `health.controller.ts` | MEDIUM | med | OPEN |
| DS-05 | `POST /orders/:id/sos` unthrottled + no dedup → ops alert + counterparty push flood | `sos.controller.ts`, `sos.service.ts:74` | LOW-MED | high | OPEN |
| DS-06 | `scheduleAutoClose` job has no `attempts`/`backoff` (1 try), inconsistent with offer-expiry; reconciler backstops (≤15min late) | `order-lifecycle.service.ts:709` | LOW | high | OPEN |
| DS-07 | `/uploads/kyc-photo` + `/uploads/pickup-photo` unthrottled → shared IAM `signBlob` quota exhaustion | `uploads.controller.ts:26` | LOW | med | OPEN |
| DS-08 | `POST /notifications/device-token` unthrottled (idempotent upsert, no fan-out) | `notifications.controller.ts:26` | LOW | high | OPEN |
| DS-09 | Trailing `setTimeout` in position coalescer is an unguarded sync callback (`emit` throw → uncaughtException) | `tracking.gateway.ts:321-343` | LOW | low-med | OPEN |
| DS-10 | `eraseAccount` active-ride guard read outside the erase transaction (minor TOCTOU) | `privacy.service.ts:49-58` | LOW | med | OPEN |
| DS-11 | `idNumber` mutable via `PATCH /auth/me` with no A-04 duplicate-ID recompute → ban-evasion signal bypassable | `auth.service.ts:126-138`, `rider.service.ts:66-110` | LOW-MED | med | OPEN |

**Confirmed still-open from prior sweeps (re-surfaced, NOT new):**
- **FRAUD P1-5** — issue-raise ops-DoS: the reports side got a compound-unique dedup, but
  `issues.service.raise` still has no per-order dedup/cap, no status gate, and no `@Throttle`, and
  fans `notifyOps` out to every admin device. Same class as DS-05.
- **FRAUD P0-3** — `markUndelivered(refused|wrong_address)` is penalty-free, self-attested, no
  OTP/photo/counterparty confirmation, rider keeps the parcel. Commission-exclusion angle mooted by
  settlement rewrite; the reliability/no-evidence angle remains open.
- **BUG-HUNT p3-kyc-callback-unsigned-stub** — `/kyc/callback` unauthenticated when
  `DIDIT_WEBHOOK_SECRET` unset & provider≠didit (prod-guarded; stub/misconfig-only).
- **device-token rehoming** (overlaps F-04) — `registerToken` upsert rehomes any token to caller.
