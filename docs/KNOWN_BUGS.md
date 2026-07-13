# KNOWN_BUGS.md — consolidated bug-sweep ledger

**Purpose.** A single deduplicated register of every distinct finding raised by every past bug
sweep, bug hunt, fraud/security review, UX/usability review, engineering review, and
launch/pilot-readiness audit in this repo. Future sweeps read this first so they don't
rediscover known bugs. Status is verified against the code at the time noted, not trusted from
the source report.

**Last consolidated:** 2026-07-13 (bug-hunt routine, journeys + bidding concurrency + KYC/contract
re-audit). Prior fixes: PR #192 (F-01…F-10), PR #193 (F-11…F-19). Prior sweep's remediation, all
merged: **#195** (DS-01…DS-11 + FRAUD P1-5), **#196** (F-09), **#197** (F-18 durability), **#198**
(FRAUD P0-3 velocity), **#199** (F-N3 + DS-11 verified-ID freeze). This sweep's remediation, merged:
**#204** (BH-01, BH-02 — see below). Infra hardening flags are wired with an ordered rollout runbook
at `docs/INFRA-HARDENING-ROLLOUT.md`. As of this update, no open **code** defect remains — only
founder-gated infra apply, mobile cert pinning, and ops-readiness items.

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
| `docs/UX-USABILITY-REVIEW-2026-07-12.md` | 16 | UX pass; all ✅ (idle-rider position, viewer-role snapshot, delivered-terminal dead code, SOS honesty, +12 more) |
| `docs/plans/BUGFIX-EXECUTION.md` | 24 | Execution plan for BUG-HUNT items — all landed |
| `docs/plans/LAUNCH-FIX-ROUND1.md` | 13 | Round-1 authz/abuse fixes — all landed |
| `docs/plans/TAIL-HARDENING-PLAN.md` | 6 | R8 handback + SEC dev-fallback + map leak — all ✅ |
| `docs/LAUNCH-READINESS.md` | 21 gates + 3 | Gate scorecard; code gates mostly closed, infra/ops founder-gated |
| `docs/PILOT-READINESS.md` | T0–T13 + gates | Pilot scorecard; build tasks ✅, vendor/device tasks founder-gated |

Raw findings across reports: ~250 line-items. After dedup: ~90 distinct issues. High cross-sweep
duplication (see clusters below).

---

## OPEN (present in code today)

Only non-code / founder-gated items remain open. Every code defect from every report — including the
whole Phase-1 set below — is now FIXED or MOOT.

| ID | Description | Area | Sev | Sweeps | Notes |
|---|---|---|---|---|---|
| KB-SEC-INFRA | Deferred infra hardening: Cloud SQL public IP, Redis in-transit TLS, GCS CORS, WAF/Cloud Armor enforce, KYC bucket CMEK/retention, Redis/SQL HA | `infra/terraform/*` | MED-LOW | 3 | Flags all landed + wired; **rollout runbook now written: `docs/INFRA-HARDENING-ROLLOUT.md`** (ordered apply/verify/rollback per item). One reliability fix landed (CMEK bucket `depends_on` the KMS IAM grant). Remaining work is `terraform apply` in a window — founder-gated, not a code bug. |
| KB-MOBILE-PIN | Mobile certificate pinning for the API + WS host (SECURITY §P3-1) | `apps/mobile/plugins/with-certificate-pinning.js` | LOW | 1 | **Code landed** — gated config plugin merged and wired (`app.config.ts`), inert until `LYNIA_TLS_PINS` is set. Remaining work is founder-executed arming + on-device validation (`docs/MOBILE-CERT-PINNING.md`); out of scope of the terraform runbook. |
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
