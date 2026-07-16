# KNOWN_BUGS.md — consolidated bug-sweep ledger

**Purpose.** A single deduplicated register of every distinct finding raised by every past bug
sweep, bug hunt, fraud/security review, UX/usability review, engineering review, and
launch/pilot-readiness audit in this repo. Future sweeps read this first so they don't
rediscover known bugs. Status is verified against the code at the time noted, not trusted from
the source report.

**Last consolidated:** 2026-07-15 night (bug-hunt routine — mobile-journey/contract-seam lane; see the
dedicated section near the bottom for this run's seven findings, BH-07…BH-12, all LOW–MEDIUM, six fixed
same-run with regression tests, one recorded as a design observation rather than a defect). Prior
consolidation: 2026-07-15 (wallet & data-lifecycle audit routine — first run of the `WD-` lane;
see the dedicated section near the bottom for this run's eleven findings, WD-001…WD-011, one CRITICAL
(WD-001, a schema invariant — fare-adjust ledger reconciliation — that was documented but never
implemented), all fixed same-run). Prior consolidation: 2026-07-15 (deep-sweep routine — orthogonal hunt
over never-audited internals, cross-cutting mechanisms, and an adversarial API pass; see the dedicated
section near the bottom for that sweep's ten findings, DS15-01…DS15-10, two of them CRITICAL, all fixed
same-run). Prior
consolidation: 2026-07-14 (deep-sweep routine — orthogonal Fable hunt over never-audited internals,
pattern propagation, cross-cutting mechanisms, and an adversarial API pass). Prior fixes:
PR #192 (F-01…F-10), PR #193 (F-11…F-19). Prior sweeps' remediation, all merged: **#195** (DS-01…DS-11
+ FRAUD P1-5), **#196** (F-09), **#197** (F-18 durability), **#198** (FRAUD P0-3 velocity), **#199**
(F-N3 + DS-11 verified-ID freeze), **#204** (BH-01, BH-02), **#210** (BR-01…BR-03 — broadcast ghost-rider
filter, widening radius, radius-config consolidation; see the broadcast-review section below), **#209**
(DS13-01…DS13-07) + **#221** (RH-01, persisted `heldReason` — Option A). The prior deep sweep
(`docs/DEEP-SWEEP-2026-07-13.md`) found 8 items (DS13-01…DS13-07 + RH-01), all remediated. **This deep
sweep (`docs/DEEP-SWEEP-2026-07-14.md`) found 9 new items** — DS14-01…DS14-09, all MEDIUM or lower (no
CRITICAL, no HIGH; the stopping rule fired with zero new CRITICAL/HIGH from the Phase-1 + Phase-3 passes)
— **all 9 fixed this sweep (PR pending merge)**, each with a regression test (`pnpm typecheck` + 787 API
tests + 321 mobile tests + build all green); details in that report and the section at the bottom of this
ledger. The sweep also logged 6 lower-priority/client-only items as deferred OPEN items (KB-BOARD-REVOKE,
KB-HEARTBEAT-MARGIN, KB-OTP-COUNT-SYNC, KB-CONFIRMITEMS-RETRY, KB-PUSH-TOKEN-RACE,
KB-DELIVERY-CODE-ROTATION-SIGNAL) — **all 6 were subsequently executed the same day** (DS14-10…DS14-15,
same PR, each with a regression test; `pnpm typecheck` + 796 API tests + 335 mobile tests green), so
**all 15 findings from this sweep are now fixed, zero left open**. Phase-0 re-verified 8/8 sampled prior
fixes still intact — F-06, F-11, F-13, DS-01, DS-03, DS13-02, DS13-04, RH-01, plus a BR-01 spot-check (no
regressions). The just-merged 07-14 UX commit `96a953c` was scrutinized for regressions and came back
clean except DS14-01 (an incomplete client half of its own expiry-honesty fix, since fixed) and the
push-token-race note (DS14-13, since fixed). Infra hardening flags are wired with an ordered rollout
runbook at `docs/INFRA-HARDENING-ROLLOUT.md`.

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
| `docs/UX-USABILITY-REVIEW-2026-07-15.md` | 16 | UX pass; 15 ✅ (rider delivered/undelivered terminal durability, zod-validation error honesty app-wide, `account`-push orderId routing, `LiveTrackingCard` rider-viewer gating gap, issue-resolution notification, brand/actor-naming copy, admin ban-copy honesty, `cancelM`/`undeliverM` reconciliation, history pagination, board-poll gating, delivery-complete push routing, admin truncation disclosure, admin KYC pending guard). 1 left as a documented low-confidence observation (UX15-16, confirmed-idempotent server registration) |
| `docs/plans/BUGFIX-EXECUTION.md` | 24 | Execution plan for BUG-HUNT items — all landed |
| `docs/plans/LAUNCH-FIX-ROUND1.md` | 13 | Round-1 authz/abuse fixes — all landed |
| `docs/plans/TAIL-HARDENING-PLAN.md` | 6 | R8 handback + SEC dev-fallback + map leak — all ✅ |
| `docs/LAUNCH-READINESS.md` | 21 gates + 3 | Gate scorecard; code gates mostly closed, infra/ops founder-gated |
| `docs/PILOT-READINESS.md` | T0–T13 + gates | Pilot scorecard; build tasks ✅, vendor/device tasks founder-gated |

Raw findings across reports: ~250 line-items. After dedup: ~90 distinct issues. High cross-sweep
duplication (see clusters below).

---

## OPEN (present in code today)

The infra/founder-gated items below remain open; the two 2026-07-14 UX-pass code items (KB-NOTIFY-ORDERID,
KB-FEED-SYNTH) are now FIXED — see "Recently closed" below. The 2026-07-14 deep sweep's six
lower-priority/client-only follow-up items (KB-BOARD-REVOKE, KB-HEARTBEAT-MARGIN, KB-OTP-COUNT-SYNC,
KB-CONFIRMITEMS-RETRY, KB-PUSH-TOKEN-RACE, KB-DELIVERY-CODE-ROTATION-SIGNAL) were all fixed the same day
(DS14-10…DS14-15 in the sweep section below) and are no longer open. Everything else remains FIXED or MOOT.

| ID | Description | Area | Sev | Sweeps | Notes |
|---|---|---|---|---|---|
| KB-SEC-INFRA | Deferred infra hardening: Cloud SQL public IP, Redis in-transit TLS, GCS CORS, WAF/Cloud Armor enforce, KYC bucket CMEK/retention, Redis/SQL HA | `infra/terraform/*` | MED-LOW | 3 | Flags all landed + wired; **rollout runbook now written: `docs/INFRA-HARDENING-ROLLOUT.md`** (ordered apply/verify/rollback per item). One reliability fix landed (CMEK bucket `depends_on` the KMS IAM grant). Remaining work is `terraform apply` in a window — founder-gated, not a code bug. |
| KB-MOBILE-PIN | Mobile certificate pinning for the API + WS host (SECURITY §P3-1) | `apps/mobile/plugins/with-certificate-pinning.js` | LOW | 1 | **Code landed** — gated config plugin merged and wired (`app.config.ts`), inert until `LYNIA_TLS_PINS` is set. **Arming helper added (#224):** `apps/mobile/scripts/compute-tls-pins.sh` computes the SPKI pins one-command. Remaining work is founder-executed **arming** (set real pins + `LYNIA_TLS_PIN_EXPIRATION`, native build) + **on-device validation** (`docs/MOBILE-CERT-PINNING.md`) — needs production cert material + a device, not automatable. |
| KB-OPS-GATE | Founder/ops launch gates: WhatsApp BSP + SMS gateway wiring, real ZIM-ID Didit run, live FCM, on-device QA, chaos/load drills, crash telemetry rollout, admin per-operator SSO/MFA | ops/founder | — | 3 | Not code defects — external readiness items from LAUNCH/PILOT readiness. |
| KB-PROD-DEPLOY-GATE | `release.yml`'s `build · migrate · deploy` job (`environment: production`) requires a manual reviewer approval on every run — GitHub Environment protection, not something the routine can click through. Recurs across reports (first surfaced 2026-07-14 06:20, wedged the queue 4+ hours; recurring again as of 2026-07-15 00:15 on commit `8d6703a`, `waiting` since 23:38 UTC 2026-07-14). A wedged `waiting` run is invisible to `deploy-autoheal.yml`, which only reacts to `completed` runs. | `.github/workflows/release.yml`, GitHub Environments settings | MED (delays prod, not a correctness bug) | 3 | Not autofixable — the PR-health watchdog has no environment-approval permission by design. Either accept the manual click as steady-state, or remove the required-reviewer rule on `production` (Settings → Environments) if unattended releases are desired. Logged here so routines stop re-diagnosing the same root cause each run. |

### Recently closed (this session's remediation PRs)

| Was | Now | PR |
|---|---|---|
| KB-CI-AUDIT-410 — `security` job hard-failed on every PR/push because npmjs.org retired both `pnpm audit` endpoints (410, `ERR_PNPM_AUDIT_BAD_RESPONSE`), unrelated to any real advisory; blocked auto-merge repo-wide since 2026-07-15 00:15, and four consecutive routine runs had a narrowly-scoped patch withheld by their own safety classifier since it touched a security gate unattended | **FIXED (human-approved)** — replaced `pnpm audit` entirely with `osv-scanner` (queries the OSV.dev vulnerability database directly, no dependency on the retired npm endpoint), fetched as a checked binary (verified against its published `SHA256SUMS`) pinned to `v2.4.0`, scanning `pnpm-lock.yaml` with `--min-severity=7` to reproduce the old `audit-level high` threshold (CVSS 7.0+ = High/Critical). Landed with explicit human sign-off in an interactive session after the classifier required it for this security-gate change. | #(this PR) |
| KB-F09 — counterparty phone revealed on terminal statuses forever | **FIXED** — `PHONE_REVEAL_STATUSES` drops `completed`; added `DISPUTE_PHONE_REVEAL_STATUSES` for ops | #196 |
| KB-F18b — notify-me at-most-once (waiter dropped on push failure) | **FIXED** — claim-lock + delivery-set clear only delivered → at-least-once, still de-duped | #197 |
| FRAUD P1-5 — issue-raise ops-DoS (no throttle) | **FIXED** — `@Throttle` on issue-raise | #195 |
| FRAUD P0-3 — penalty-free undelivered abandonment | **MITIGATED (velocity)** — auto-`on_hold` on abnormal undelivered rate (`UNDELIVERED_ABUSE`) | #198 |
| F-N3 — `/kyc/callback` unsigned in prod stub+manual | **FIXED** — fail-closed whenever prod or provider=didit | #199 |
| DS-11 (residual) — verified rider could swap their national ID | **FIXED** — ID-change blocked once KYC-verified | #199 |
| UX-0712 #6/#11 feed residue — in-app feed still showed generic "Order cancelled" for a rider-bail (live rebroadcast running) and "raise your price" for a no-supply expiry; #202 fixed push only | **FIXED** — feed rewrites the rider-bail row to the honest copy and routes its tap to the live clone (in-window derivation, zero extra queries); `expiry_no_supply` flag persisted at expiry (migration 0023) drives honest copy in feed + expired snapshot/terminal; feed also suppresses the canceller's own "cancelled" row, mirroring the push's actor exclusion | #206 |
| UX-0711 deferred — OTP-verify idempotency after a lost response | **FIXED earlier than the ledger knew** — 60s hash-only grace window (`139c99a`) + verify-route throttle (`f9c2a12`), both on main since 07-12; a dedicated 07-13 security audit (replay, brute-force, multi-device, refresh-rotation) confirmed the shipped design with no residual gaps. #206 corrected the stale "still open" doc claim | #206 (docs) |
| KB-NOTIFY-ORDERID — "notify me" waiter carried no orderId, so its fulfillment push/feed gave generic "send again" advice and routed to `/home` even when the original auction was still open | **FIXED (07-14 follow-up)** — orderId threaded through the whole pipeline (contract → mobile client → controller/service → `addNotifyRequest`). No migration: a companion Redis HASH `notify:order` (`HSET`/`HDEL` per profile id, pruned/cleared alongside the geo/zset siblings) stores the association; `claimNotifyWaitersNear` returns `{profileId, orderId?}` (follow-up HMGET after the atomic claim); `notifyRidersAvailable` batch-checks which orders are still `open_for_offers` and sends honest "riders are being pinged on your live request" copy + `data.orderId` for those (generic copy otherwise); `pushDestination` routes `riders_available` with an orderId to `/order/:id`, else `/home` | 07-14 follow-up |
| KB-FEED-SYNTH — in-app feed showed only order-status events; "New offer" + account-status (KYC/standing) pushes produced no feed row | **FIXED (07-14 follow-up)** — no new table/migration: `feedForUser` now synthesizes "New offer" rows from the durable `Offer` rows on the caller's own customer-view orders (one batched query) and account-status rows from the existing `AuditLog` (`target=profileId`, actions `rider.kyc_approve/decline`, `rider.suspend/lift/ban/clear_hold`), copy mirroring each actual push; `NotificationRow.orderId` made nullable (account rows have none → the mobile screen routes them to `/rider`); `applyKycResult`'s automated vendor-webhook path now also writes an `AuditLog` row (system actor `system:kyc-webhook`) so the feed picks up automated KYC decisions uniformly; empty-state copy restored to "Offers, delivery updates and account news will show up here." | 07-14 follow-up |

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

**Now covered (2026-07-15, wallet & data-lifecycle audit — first run of the `WD-` lane):** the prepaid
commission wallet end to end — `wallet.controller`/`wallet.service` (top-up lifecycle, the credit
primitive, the per-ride debit), the admin financial surfaces (`admin-orders.service.adjustFare`,
`wallet.service.creditManual`, `settlements.service.commissionOverview`), and the rider-facing earnings
tab. See the dedicated section below for findings WD-001…WD-011.

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

---

## Deep sweep 2026-07-14 (deep-sweep routine) — `docs/DEEP-SWEEP-2026-07-14.md`

Orthogonal Fable hunt (never-audited internals second pass, pattern propagation, cross-cutting
mechanisms) + adversarial API pass, all cross-checked against this ledger first, run against `main` after
the just-merged 07-14 UX commit `96a953c`. Phase-0 re-verified 8/8 sampled prior fixes intact (F-06,
F-11, F-13, DS-01, DS-03, DS13-02, DS13-04, RH-01) plus a BR-01 spot-check — no regressions. The Phase-1
never-audited-area read and the Phase-3 adversarial pass both returned **zero** new findings (every attack
traced to an existing control); the **stopping rule fired — zero new CRITICAL/HIGH from Phase 1 + Phase
3.** Nine new findings, all MEDIUM or lower (no CRITICAL, no HIGH), all **fixed this sweep (PR pending
merge)**, each with a regression test; `pnpm typecheck` + 787 API tests + 321 mobile tests + build green.
DS14-08 (refresh-token lost-response grace) is the highest-risk fix — it touches session/auth issuance,
though not bid acceptance / order assignment / agreed-price / KYC gating. Six lower-priority/client-only
follow-up items were initially logged OPEN — KB-BOARD-REVOKE, KB-HEARTBEAT-MARGIN, KB-OTP-COUNT-SYNC,
KB-CONFIRMITEMS-RETRY, KB-PUSH-TOKEN-RACE, KB-DELIVERY-CODE-ROTATION-SIGNAL — then **executed the same
day** as DS14-10…DS14-15 below (same PR, same test-green bar: `pnpm typecheck` + 796 API tests + 335
mobile tests), so no OPEN items remain from this sweep.

| ID | Description | Area | Sev | Status |
|---|---|---|---|---|
| DS14-01 | `hadOffers` added server-side in `96a953c` but never wired into the mobile client — the cold-start expired-auction terminal still says "no riders were available" when riders actually bid; the commit message claimed the client half was done but only the push/feed halves were wired | `apps/mobile/src/api/orders.ts`, `apps/mobile/src/logic/order-tracking.ts`, `apps/mobile/app/order/[id].tsx` | MEDIUM | **FIXED (this sweep, PR pending merge)** — add `hadOffers?: boolean\|null` to `OrderSnapshot`; new pure `expiredTerminalKind`; expired-terminal branch switched to use it. 4 new cases in `order-tracking.test.ts` incl. exact cold-start repro |
| DS14-02 | `retryKyc` does a non-CAS blind update (`findUnique` then unguarded `update`) → can bypass the two-attempt lock or clobber a concurrent admin KYC decision landing in the same window | `apps/api/src/riders/rider.service.ts` `retryKyc` | MEDIUM-LOW | **FIXED (this sweep, PR pending merge)** — CAS `updateMany` guarded on observed `{kycStatus, kycAttempts}`, `ConflictException` on 0 rows; regression test in `rider.service.spec.ts` |
| DS14-03 | KYC verified-ID freeze (DS-11/#199) is check-then-write in both ID-writing routes → a webhook-verify landing between the read of `kycStatus` and the ID write still gets the change through | `apps/api/src/riders/rider.service.ts` `completeProfile`, `apps/api/src/auth/auth.service.ts` `updateProfile` | LOW-MED | **FIXED (this sweep, PR pending merge)** — the ID write is now a CAS `updateMany` re-asserting the freeze in the WHERE clause; regression tests in both specs simulate the webhook committing verified mid-write |
| DS14-04 | `adminSetKyc`'s repeat-decline guard (`isRepeatOfSameDecline`, F-14) reads the row with a plain unlocked `findUnique` inside its transaction → a concurrent vendor-webhook decline can double-count one logical decline | `apps/api/src/riders/rider.service.ts` `adminSetKyc` | LOW | **FIXED (this sweep, PR pending merge)** — `FOR UPDATE` row lock before the read inside the same transaction (matching `order-lifecycle.service.ts`); test asserts lock-before-read-before-write ordering |
| DS14-05 | Supply/broadcast honesty gap (three parts, one root cause — an on_hold/suspended rider stays in the live-supply plane): (a) `nearbyRiders` had no standing predicate so an on_hold rider padded counts and got broadcast pushes; (b) an automated velocity hold set `onHold` but never flipped `isOnline:false` or evicted from geo (unlike admin suspend/ban); (c) admin dashboard online count lacked BR-01's heartbeat cutoff | `apps/api/src/tracking/tracking.service.ts` `nearbyRiders`, `apps/api/src/orders/order-lifecycle.service.ts` `markUndelivered`, `apps/api/src/admin/admin.service.ts` | MEDIUM-LOW | **FIXED (this sweep, PR pending merge)** — `account_status='active' AND on_hold=false` on both `nearbyRiders` legs; automated holds now set `isOnline:false` + evict via new `TrackingGateway.evictRiderFromGeo`; admin count uses the same heartbeat cutoff. Independently flagged by two passes. Tests in `tracking.service.spec.ts` + `order-lifecycle.service.spec.ts` |
| DS14-06 | `setOnline(true)` is gate-then-blind-write (standing read via `findUnique`, then unguarded `isOnline:true`) → a concurrent admin suspend can be raced past, putting a just-suspended rider back online | `apps/api/src/riders/rider.service.ts` `setOnline` | LOW | **FIXED (this sweep, PR pending merge)** — CAS `updateMany` guarded on `accountStatus:"active", onHold:false`; on 0 rows re-reads and throws the precise `onlineRefusalReason` refusal; test simulates a suspend landing between gate and write |
| DS14-07 | `/orders/:orderId/report` has no rate limit, unlike its throttled sibling issue-raise endpoint (FRAUD P1-5) | `apps/api/src/reports/reports.controller.ts` | LOW | **FIXED (this sweep, PR pending merge)** — `@Throttle({limit:10, windowSec:60, keyPrefix:"order-report"})` matching the issue-raise cap; new `reports.controller.spec.ts` |
| DS14-08 | Refresh-token rotation had no lost-response grace: a dropped rotate response makes the client's next refresh present the rotated-away token and get a hard 401, forcing a full re-OTP mid-session — the failure mode OTP-verify already got a 60s grace for (UX-0711), never mirrored onto refresh | `apps/api/src/auth/auth.service.ts`; migration `0025_session_rotation_link` (nullable `Session.rotatedToId`, no backfill) | MEDIUM | **FIXED (this sweep, PR pending merge)** — a rotation links revoked→successor; a retry of a just-rotated token re-issues a fresh independent session ONLY when revoked-by-rotation + successor un-consumed + within 60s (reuse detection intact; logout-revoke, wrong secret, plain expiry stay hard rejects). **Highest-risk fix — session/auth issuance; flag for careful review** (does not touch bid acceptance/order assignment/agreed-price/KYC gating). 5 new cases in `auth.service.spec.ts` |
| DS14-09 | A stale delivery code can survive an app-kill mid-rotation: rider hits OTP lockout, customer re-issues, server rotates the hash + zeroes attempts, but if the app is killed before the response lands the client's local storage still holds the OLD code and never re-prompts → customer relays a dead code, burning attempts toward a fresh lockout | `apps/mobile/src/auth/session.ts`, `apps/mobile/src/logic/order-tracking.ts`, `apps/mobile/app/order/[id].tsx` | MEDIUM | **FIXED (this sweep, PR pending merge)** — companion `deliveryCodeAttempts.<orderId>` high-water-mark key; new pure `reconcileDeliveryCode` detects a drop in the server's `deliveryOtpAttempts` below the local mark as a rotation signal; client invalidates the code + routes to the existing re-issue prompt. 6 new cases in `order-tracking.test.ts` incl. lockout→reissue→kill repro + backward-compat guards. **Known limitation → KB-DELIVERY-CODE-ROTATION-SIGNAL** (needs a `codeRotatedAt` snapshot timestamp for full robustness) |

### Deferred items executed same day (DS14-10…DS14-15)

The six lower-priority/client-only items above were initially deferred as OPEN, then executed the same
day at the user's request, each with a regression test.

| ID | Description | Area | Sev | Status |
|---|---|---|---|---|
| DS14-10 (was KB-BOARD-REVOKE) | Board eligibility (`isBoardEligible`) was checked only at WS subscribe time and never re-checked/revoked mid-session; a rider suspended or auto-held while already subscribed kept receiving `board:new_order`/`bid:expired` events until disconnect (not a bypass — every bid path re-gates — but an info-drip/confusing-UX) | `apps/api/src/tracking/tracking.gateway.ts` `boardSubscribe`/`isBoardEligible` | LOW | **FIXED** — new `kickRiderFromBoard(riderId)` on `TrackingGateway`, mirroring the `evictRiderFromGeo` plumbing; uses the cluster-wide `server.fetchSockets()` registry to find the rider's socket(s) on any instance and makes each leave `BOARD_ROOM` + every `board:geo:*` room (order rooms untouched). Wired post-commit into `admin-riders.service.ts` `suspendRider`/`banRider` and into `order-lifecycle.service.ts`'s automated-hold path in `markUndelivered`. Tests cover the gateway kick behavior and the suspend/ban/auto-hold wiring (incl. the CAS-0 no-kick case) |
| DS14-11 (was KB-HEARTBEAT-MARGIN) | The 30s offer-selection staleness TTL had only a ~10s margin over the mobile app's 20s heartbeat cadence + 15s request timeout, and heartbeat writers mixed JS `Date.now()` vs DB `now()` clock domains, further eating the margin — a delayed/dropped heartbeat could make a customer's "select this rider" hit a spurious "rider just became unavailable" for a rider who was actually live | `apps/api/src/matching/matching.service.ts` `HEARTBEAT_TTL_MS`, `apps/api/src/riders/rider.service.ts` `setOnline` | LOW | **FIXED** — `HEARTBEAT_TTL_MS` widened 30s→60s (kept explicitly distinct from BR-01's separate, untouched 120s ghost-supply-count cutoff); `setOnline`'s heartbeat stamp converted to `$executeRaw` writing DB `now()` (matching `recordFix`/`touchRiderHeartbeat`), unifying the clock domain. Tests cover 45s-fresh/90s-stale selection-moment liveness |
| DS14-12 (was KB-OTP-COUNT-SYNC) | A rider's locally-shown delivery-OTP attempt count only reconciled *downward* against the server after a lost response, so a dropped `confirmDelivery` response could show more attempts remaining than actually available until a 403 snapped it to the true max | `apps/mobile/app/rider/job.tsx`, `apps/mobile/src/logic/rider-job.ts` | LOW | **FIXED** — new pure `reconcileOtpAttempts` converges the local count to the server's committed value in BOTH directions; the sync effect stays keyed only on the fetched `deliveryOtpAttempts` value (never the local counter) so an in-flight optimistic post-401 increment can't be stomped by a stale-lower cached value before its refetch lands. 3 new cases in `rider-job.test.ts` |
| DS14-13 (was KB-PUSH-TOKEN-RACE) | A narrow race in push-token registration: if FCM rotated the token while the initial registration POST was still in flight, the client could end up tracking the superseded token, so sign-out cleanup unregistered the wrong (dead) token, leaving the rotated token bound server-side until rehoming/pruning caught it | `apps/mobile/src/push/use-push-registration.ts` | LOW | **FIXED** — the rotation listener now records the newest desired token synchronously (`rotatedTo`) before its own async register; the initial-registration `.then` only commits `registered` if no rotation superseded it mid-flight, otherwise it drops the stale token server-side so cleanup targets the live rotated one. New race regression test using a deferred initial-registration promise |
| DS14-14 (was KB-CONFIRMITEMS-RETRY) | `confirmItems` (rider marks pickup items confirmed) was fire-and-forget; an app kill or lost response right as the rider advanced to `picked_up` left the order permanently missing its confirmed-items record with no foreground/reconnect retry | `apps/mobile/app/rider/job.tsx`, `apps/mobile/src/auth/session.ts`, `apps/mobile/src/logic/rider-job.ts` | LOW | **FIXED** — a durable `confirmItemsPending` marker (order id + collected indexes) is persisted in `session.ts` before firing and cleared on confirmed success; new pure `reconcileConfirmItemsPending` re-sends it on any snapshot refresh (incl. warm foreground) while the order is still at `en_route_pickup` with no server record (the sole window the API accepts it), retiring the marker once recorded or the order is gone; wiped on sign-out. `itemsCollected` added to the mobile `OrderSnapshot`. 6 new cases in `rider-job.test.ts` |
| DS14-15 (was KB-DELIVERY-CODE-ROTATION-SIGNAL) | DS14-09's rotation detection relied solely on an attempts-counter high-water mark, which only works if the client observed the elevated count before an app-kill | API: `apps/api/src/orders/order-lifecycle.service.ts` `rotateDeliveryCode`, `apps/api/prisma/schema.prisma` (`Order.deliveryCodeRotatedAt`), migration `0026_delivery_code_rotated_at`; mobile: `apps/mobile/src/api/orders.ts`, `src/logic/order-tracking.ts`, `src/auth/session.ts`, `app/order/[id].tsx` | LOW | **FIXED (both halves)** — additive nullable `Order.deliveryCodeRotatedAt`, stamped via DB `now()` on every rotate and on first code assignment (never null once a code exists), exposed in the snapshot as `codeRotatedAt` (ISO string or null, same party-gating as `deliveryOtpAttempts`). Mobile `reconcileDeliveryCode` extended (not replaced) to treat a `codeRotatedAt` that moved past the locally-confirmed baseline as the PRIMARY, always-reliable rotation signal, adopting the baseline on first sighting; the attempts high-water heuristic remains as defense-in-depth when the field is null/absent. Baseline persisted beside the code in `session.ts`, cleared on fresh issue/`clearDeliveryCode`/sign-out. Tests: snapshot exposure (API) + 5 new cases in `order-tracking.test.ts` (mobile) |

---

## Bug hunt 2026-07-14 night (bug-hunt routine) — `docs/BUG-HUNT-2026-07-14.md`

Full-journey re-audit (customer/rider onboarding + KYC capture, order creation, bidding/negotiation,
tracking, completion) plus an app↔API contract-seam pass, each run as an independent research agent
against current code and cross-checked against this ledger first (Phase 0). All three baseline suites
green before hunting (833 API + 351 mobile tests, `pnpm typecheck` clean, once `prisma generate` was run
— the fresh container had no generated Prisma client, an environment-setup gap, not a code regression).

Most of the ledger's already-documented mobile-journey and contract-seam fixes were spot-checked
against current code and confirmed intact (bidding/negotiation concurrency, KYC gating, WS reconnect
recovery, delivery-code/confirmItems/OTP-count/push-token durability, expired-auction honesty, rating
CAS-guard, history dedup). **Four new findings, all LOW–MEDIUM, all fixed this sweep with regression
tests** — `pnpm typecheck` + 835 API tests (+2) + 366 mobile tests (+15), all green.

| ID | Description | Area | Sev | Status |
|---|---|---|---|---|
| BH-03 | `KYC_MODE=manual` (a documented production fallback — manual ops review, no vendor session) was invisible to the mobile client: `becomeRider`'s response already carried `mode`, but `become.tsx` never read it, so a manual-mode rider was told "Verification started. Finish it in the browser…" for a browser step that never opens. Worse, `retryKyc` in manual mode returns 200 with no `verificationUrl` — `resolveKycRetryFeedback` treated a missing URL as unconditional failure, so every "Continue verification" tap on a manual-mode pending screen showed a false "Couldn't start verification — try again in a moment." error, forever, with no way to make it stop | `apps/api/src/riders/rider.service.ts` `retryKyc`, `apps/api/src/auth/auth.service.ts` `getProfile`, `apps/mobile/src/logic/gates.ts` `resolveKycRetryFeedback`, `apps/mobile/app/rider/become.tsx`, `apps/mobile/app/rider/index.tsx` | MEDIUM | **FIXED** — `retryKyc` now returns `mode` on both branches (was only on the vendor-submit path); `getProfile` surfaces the deploy-wide `KYC_MODE` as `rider.kycMode` (a global config value, not a per-rider column) so the static pending screen can read it without a mutation; `resolveKycRetryFeedback` takes `mode` and returns a calm `info` line (not `error`) when a missing URL is the *expected* shape of a manual-mode success; `become.tsx` and the pending `EmptyState` both branch on mode with honest copy ("under review… no action needed") and drop the dead "Continue verification" button in manual mode. Tests: `rider.service.spec.ts` (mode on both retryKyc branches), `auth.service.spec.ts` (kycMode propagation), `gates.test.tsx` (4 new cases incl. manual-mode info-not-error) |
| BH-04 | A lost-response retry on rider signup (`becomeRider` succeeds server-side, the response is dropped/timed out) hit the server's existing 409 "Already registered as a rider" on the rider's next tap of Submit — but `become.tsx` surfaced that as a plain, unrecoverable error with no way off the dead form, even though the rider's account was actually already fully set up | `apps/api/src/riders/rider.service.ts` `becomeRider`, `apps/mobile/app/rider/become.tsx` | LOW-MEDIUM | **FIXED** — the 409 now carries a structured `reason: "already_rider"` (mirroring the existing `ForbiddenException({reason, message})` convention used for online-gate refusals) instead of a bare message string; `become.tsx` special-cases that reason to clear the stale KYC draft and `router.replace("/rider")`, landing the rider on their real (already-registered) status screen instead of a dead end. Test: `rider.service.spec.ts` asserts the structured reason on the exception body |
| BH-05 | A rider's own "your offer is in" card could show the WRONG price after a lost-response retry: send fare=$10 → response dropped → form re-enables on error → rider edits to $12 → retaps Send → hits the server's "already responded" 409 (the $10 landed) → the client's own lost-response recovery (`recordSentOffer`) read the CURRENT `fare`/`etaNum` component state instead of what was actually sent, so the rider's own UI showed $12 as their bid while the server and the customer both have $10 on record | `apps/mobile/app/rider/index.tsx` `recordSentOffer`/`offerM`, `apps/mobile/src/logic/rider-bid-draft.ts` | LOW-MEDIUM | **FIXED** — `offerM`'s mutation now carries `{fare, fareNum, etaNum}` as explicit variables (react-query hands the same variables to both `onSuccess` and `onError`); `recordSentOffer` takes the sent fare/eta as params instead of closing over live state. Card construction pulled into a new pure `buildSentOfferEntry(order, sentFare, sentEtaNum)` in `rider-bid-draft.ts` so the invariant (params win, not ambient form state) is unit-testable without mounting the screen. 4 new cases in `rider-bid-draft.test.ts` |
| BH-06 | `RatingCard`'s rating-on-tap arms a 4s undo window and flushes an armed rating on React **unmount** (leaving the screen) — correctly handling "customer navigates away mid-window". It does NOT handle an OS-level app kill in that same window: a bare `setTimeout` + `useRef` closure is destroyed outright with no unmount effect, so a customer who taps a star, sees "Submitting N★…", and swipe-kills the app loses the rating silently, though the order self-heals (re-prompts) next time they reopen it — a real trust gap against the codebase's own established pattern of persisting every other completion-journey in-flight action (delivery-code rotation, confirmItems, push-token) against exactly this failure mode | `apps/mobile/src/ui/order/RatingCard.tsx`, `apps/mobile/src/auth/session.ts`, `apps/mobile/src/logic/order-tracking.ts`, `apps/mobile/app/order/[id].tsx` | LOW-MEDIUM | **FIXED** — `RatingCard` gains `onArm`/`onUndo` callbacks fired synchronously (before/independent of the undo timer); `order/[id].tsx` persists a durable `pendingRating` marker (`session.ts`, mirroring `confirmItemsPending`) the instant a star is armed and clears it on Undo or confirmed success; a new pure `reconcilePendingRating` (mirroring `reconcileConfirmItemsPending`) re-sends a still-pending rating against the live snapshot on every refresh (cold start, foreground) while the order is still `delivered` (ratable) with no rating recorded yet (the order's own `status: "completed"` transition on `rateOrder` success IS the "already rated" signal — the live snapshot carries no separate rating field). Wired into `clearDeviceState` so the marker never survives a shared-device sign-out. 3 new cases in `rating-card.test.tsx` + 6 in `order-tracking.test.ts` |

---

## UX review 2026-07-15 (UX-improvements routine) — `docs/UX-USABILITY-REVIEW-2026-07-15.md`

Four parallel journey/lens audits (customer, rider, cross-cutting resilience/data-frugality,
copy/notification-coherence) against current code, each cross-checked against this ledger + the 07-14
UX and bug-hunt reports first (Phase 0) so nothing already fixed was re-flagged. The initial Fable-5
launch of all four hit a session rate limit before doing any work; per the routine's own model-fallback
instruction all four were relaunched on the session model, and the whole run (research + fixes) proceeded
on that model throughout. Two findings (UX15-01/rider-journey and UX15-02/cross-cutting) independently
converged on the same root cause. **15 of 16 findings fixed this sweep**, each with a regression test
where testable; `pnpm typecheck` + `pnpm lint` + 841 API tests (+6) + 375 mobile tests (+9), all green.
One finding (UX15-16) is a documented low-confidence observation, not a code fix — see the report §4.

| ID | Description | Area | Sev | Status |
|---|---|---|---|---|
| UX15-01 | Rider `delivered`/`undelivered` frozen terminals (`deliveredDone`/`undeliveredDone`) were plain component state; an app kill between the deliver/undeliver mutation's success and the rider viewing the terminal permanently lost the acknowledgement (and, for delivered, the "rate the sender" affordance) — `delivered`/`undelivered` aren't in `ACTIVE_RIDE_STATUSES` so the order has already left `activeForRider` by the time of relaunch. Found independently by the rider-journey AND cross-cutting-resilience audits | `apps/mobile/app/rider/job.tsx`, `apps/mobile/src/auth/session.ts`, `apps/mobile/src/logic/rider-job.ts` | MEDIUM (convergent) | **FIXED** — durable `RiderJobTerminal` marker (`saveRiderJobTerminal`/`loadRiderJobTerminal`/`clearRiderJobTerminal` in `session.ts`, mirroring BH-06's `pendingRating`), promoted into live state via a new pure `reconcileRiderJobTerminal`; cleared on "Back to board" and on sign-out (`clearDeviceState`). 6 new cases in `rider-job.test.ts` |
| UX15-02 | Every zod-validated request rejection (~40 routes) was misreported as a network failure: `ZodBody` threw `BadRequestException(result.error.flatten())`, whose plain-object body carries no top-level `message` (confirmed against the installed `@nestjs/common` `HttpException.createBody` source) — the mobile client's `friendlyMessage()` only reads `message`, so it fell back to "Couldn't reach LyniaGo. Check your connection and try again." for a fixable content rejection (e.g. a rider ETA over the 180-min contract cap) | `apps/api/src/common/zod.pipe.ts` | HIGH (breadth) | **FIXED** — `ZodBody` now includes a field-qualified top-level `message` alongside the full `flatten()` shape. New `zod.pipe.spec.ts` (3 cases) |
| UX15-03 | An `"account"`-kind push carrying an `orderId` (sent to a CUSTOMER whose assigned rider was just suspended/banned mid-delivery, by `notifyCustomersOfRiderStandingChange`) routed unconditionally to `/rider`, landing a non-rider customer on "Set up as a rider" instead of their order — the same bug class F-16/DS13-01 fixed server-side, reproduced in client routing, and now live on `main` (07-14's report flagged it inside then-unmerged PR #231) | `apps/mobile/src/push/push.ts` `pushDestination` | HIGH | **FIXED** — `kind==="account"` now routes to `/order/:id` when an orderId is present, `/rider` only when absent (the rider's own KYC/standing case). 2 new cases in `push.test.ts` |
| UX15-04 | `LiveTrackingCard`'s own "Re-issue delivery code" button and its `Stepper` copy were a second, missed instance of 07-14 Fix #1's rider-viewer gating (that fix covered the order screen's TOP-level card and Cancel/rebroadcast/report, not this separately-extracted card) — a rider viewing their own job could tap a 403-only reissue button and saw customer-voiced stepper milestones about their own trip | `apps/mobile/src/ui/order/LiveTrackingCard.tsx` | MEDIUM | **FIXED** — reissue button gated on `!isRiderViewer`; `Stepper` now receives `view={isRiderViewer ? "rider" : "customer"}` |
| UX15-05 | `IssuesService.resolve` wrote the resolution + refund/strike side-effect + audit row in one transaction but never told the opener — no push, no feed row, no status endpoint — so a real reported problem could resolve with zero signal back to the customer/rider who raised it | `apps/api/src/issues/issues.service.ts` `resolve`, `apps/api/src/notifications/notifications.service.ts` | MEDIUM | **FIXED** — post-commit best-effort `NotificationsService.notifyIssueResolved(openerId, orderId, resolution)`, mirroring `raise()`'s ops-escalation shape. 3 new cases in `issues.service.spec.ts` |
| UX15-06 | Stray "Lynia" (not "LyniaGo") in the rider's admin-cancel terminal — a 4th instance the 07-14 brand sweep missed (that sweep covered `notifications.service.ts`/`sos.service.ts`/`receipt.ts`, not this file); compounded by a notification-story mismatch where the shared order screen showed a generic, un-branded "This order is cancelled." for the SAME admin-cancel event | `apps/mobile/src/ui/rider/terminals.tsx:42`, `apps/mobile/app/order/[id].tsx` | MEDIUM | **FIXED** — brand corrected to "LyniaGo cancelled this delivery"; the shared screen's blame line now says the same for a null/admin `cancelledBy`, on both viewer roles |
| UX15-07 | Admin "Ban customer" consequence copy claimed real enforcement ("They can no longer send parcels. Their phone number is blocked from re-registering") that doesn't exist — traced to `ConfirmModal`'s default (`submitAdminAction`-only, no `onConfirm`/`auditInEndpoint`) path vs. the real customer-hold and rider-ban actions, which both wire a genuine mutation. An operator could believe a customer was already blocked when only an audit-log row was written | `apps/admin/app/customers/[id]/page.tsx` | MEDIUM (ops-facing) | **FIXED** — consequence copy corrected to state this logs a decision for the record and does not automatically enforce anything yet; points to the real Hold action or a database admin |
| UX15-08 | Rider `cancelM` (bail-cancel) was the one mutation of four siblings whose `onError` never called `refresh()` — a timed-out cancel that actually committed server-side left the rider stuck on a `BailSheet` whose retry could now only 409 | `apps/mobile/app/rider/job.tsx` | MEDIUM | **FIXED** — `cancelM.onError` now also calls `refresh()` |
| UX15-09 | `undeliverM` had no 409 reconciliation, unlike `deliverM`'s explicit check — a timeout/retry landing after the server already committed the undelivered CAS showed a scary generic conflict and dropped to "No active job", though the action had actually succeeded | `apps/mobile/app/rider/job.tsx` | MEDIUM | **FIXED** — mirrors `deliverM`: on a 409, re-fetches the order and treats an already-`undelivered` status as success |
| UX15-10 | `/orders/history` (feeds both Trip History and Earnings) fetched up to 100 full trip rows on every open, on a metered-data mobile market | `apps/api/src/orders/orders.service.ts` `historyForUser` | MEDIUM (data frugality) | **FIXED** — capped at 50 (was 100), same shape, no contract change. 1 new case in `orders.service.spec.ts` |
| UX15-11 | Rider board's `openOrders` REST poll ran unconditionally every 15s even while the board WebSocket already pushes every relevant lifecycle event into the exact same cache key, unlike its sibling `activeQ` query in the same file | `apps/mobile/app/rider/index.tsx` | LOW-MEDIUM | **FIXED** — gated `refetchInterval` on `board.connected`, mirroring `activeQ` |
| UX15-12 | "Delivery complete" push ("you're free for the next job") routed to `/rider/job`, but `completed` isn't in `ACTIVE_RIDE_STATUSES` — that screen renders a bare "No active job" by the time the push can arrive | `apps/mobile/src/push/push.ts` | LOW | **FIXED** — routes `completed` to `/rider` (the board) instead. 1 new case in `push.test.ts` |
| UX15-13 | Admin customers (cap 100) and issues (cap 200) queues had no truncation disclosure, unlike orders/riders pages which both already carry "Showing the latest N — older records aren't listed" | `apps/admin/app/customers/page.tsx`, `apps/admin/app/issues/page.tsx` | LOW | **FIXED** — added the matching disclosure to both pages, gated on hitting the cap |
| UX15-14 | Admin rider KYC quick-approve button (`<form action={setKyc}>`) had no pending/disabled guard, unlike every `ConfirmModal`-based admin action, inviting a double-submit tap | `apps/admin/app/riders/page.tsx` `KycButton` | LOW | **FIXED** — new `KycSubmitButton` client component (`useFormStatus`) disables + shows "Working…" while in flight |
| UX15-16 | "Notify me when a rider's online" confirmation (`notifyM.isSuccess`) is `useMutation`-local state — navigating away and back re-shows the plain button even though the server registration is still active | `apps/mobile/app/order/[id].tsx` | LOW | **Not fixed — documented low-confidence observation.** Flagged by its own author with explicit caveats; this pass confirmed `TrackingService.addNotifyRequest` is idempotent (`tracking.service.ts:535-537`), so only the visual confirmation is lost, not the registration. See report §4 |

---

## Deep sweep 2026-07-15 (deep-sweep routine) — `docs/DEEP-SWEEP-2026-07-15.md`

Orthogonal hunt (never-audited internals, cross-cutting mechanisms — transactions/rollback, socket
handlers, BullMQ idempotency, timer/expiry boundaries, exactly-one-row Prisma, swallowed catches, money
handling, object-authz/KYC-bypass) plus an adversarial API pass, all cross-checked against this ledger
first. Phase-0 re-verified 8/8 sampled prior fixes intact (F-06, DS13-02, DS13-04, DS14-08, RH-01,
DS-11/DS14-03, BH-05, BR-01) — no regressions. **Two new CRITICAL findings this run — the stopping rule
does not apply.** Ten new findings total, all fixed same-run with a regression test each; `pnpm
typecheck` + full API suite (866 tests) green. All six Phase 0/1/3 discovery agents were dispatched on
`model: fable` per the routine spec, hit the session's Fable-5 rate limit, and were re-dispatched on the
session's default model per the routine's own fallback instructions; all five Phase 2 fix agents ran on
`model: opus` without issue.

| ID | Description | Area | Sev | Status |
|---|---|---|---|---|
| DS15-01 | Three raw `ioredis` clients (OTP store, `tracking.service.ts`'s `getRedis()`, `tracking.gateway.ts`'s Socket.IO-adapter `pub`/`sub` pair) had no `error` listener — any transient Redis connection error becomes an `uncaughtException` and crashes the whole API instance via `main.ts`'s `process.exit(1)` handler, turning a routine Redis blip into a fleet-wide crash-restart. The DS-02/DS-04 `.on("error")` pattern was fixed for the two BullMQ pairs and `health.service.ts`'s own client, but never propagated to these three | `apps/api/src/auth/auth.module.ts`, `apps/api/src/tracking/tracking.service.ts`, `apps/api/src/tracking/tracking.gateway.ts`, `apps/api/src/common/redis.ts` | CRITICAL | **FIXED** — `createRedisClient()` now attaches a baseline logging `error` listener to every client it returns (a single-point net for all current/future callers); each of the three call sites also layers a contextual listener on top (the gateway's `sub` client is a fresh `duplicate()` that inherits nothing). Tests in `common/redis.spec.ts` |
| DS15-02 | `DELETE /auth/me` (`eraseAccount`) checked only for an active ride before anonymising — never `accountStatus` (banned/suspended), `onHold` (incl. the RH-01 sticky velocity hold), `cooldownUntil`, or the A-02 KYC two-decline lock. It also nulled `idNumberHash`, destroying `duplicateIdAccountCount`'s ban-evasion detection. A banned/suspended/held/cooldown/KYC-locked rider (or on-hold customer) could self-erase and re-register clean with the same phone + same ID document, evading every standing control in the codebase | `apps/api/src/privacy/privacy.service.ts` | CRITICAL | **FIXED** — `eraseAccount` now rejects (structured 409) while any standing restriction is live, checked pre-flight and re-asserted inside the transaction (TOCTOU-safe, mirroring the DS-10 active-ride re-check); `idNumberHash` survives anonymisation. Session/JWT revocation on ban is out of scope (separate effort) — the standing gate closes the actual exploit path. Tests in `privacy.service.spec.ts` |
| DS15-03 | Right-to-erasure nulled `photoUrl`/`kycRef` in Postgres but `StorageAdapter` had no delete method — the underlying GCS KYC selfie/ID-document objects (the most sensitive PII in the system) sat in the bucket forever, cleanup gated only on a default-off, age-based lifecycle rule unrelated to the erasure event | `apps/api/src/privacy/privacy.service.ts`, `apps/api/src/adapters/storage/storage.interface.ts`, `apps/api/src/adapters/storage/gcs.storage.ts` | HIGH | **FIXED** — `StorageAdapter` gains `deleteObject(key)`, implemented via GCS `.delete({ignoreNotFound:true})` (best-effort, swallows errors); `eraseAccount` purges the erased profile's/rider's photo objects post-commit. Tests in `storage.spec.ts`, `privacy.service.spec.ts` |
| DS15-04 | FCM push adapter's lazy `messaging()` init cached a REJECTED promise as if initialized (still truthy) — one transient ADC/network hiccup on the first push after a cold start silently and permanently killed all push notifications (SOS ack, KYC decisions, order status) for that instance's lifetime, no retry, no crash, just a warn log | `apps/api/src/adapters/push/fcm.push.ts` | MEDIUM-HIGH | **FIXED** — a rejection now clears the cached promise so the next call re-attempts init; a successful init still caches normally. New `fcm.push.spec.ts` (adapter had zero prior unit tests) |
| DS15-05 | `suspendRider`/`banRider` already call `kickRiderFromBoard` (DS14-10) and flip `isOnline:false`, but never evicted the rider from the TTL-less `rider:geo` Redis sorted set — same gap in `eraseAccount`. `GEO_SEARCH_COUNT=100` caps GEOSEARCH candidates BEFORE the PG filter, so accumulated ghosts from routine admin actions can crowd real riders out of the nearest-100 window, plus an unbounded Redis memory leak | `apps/api/src/admin/admin-riders.service.ts`, `apps/api/src/privacy/privacy.service.ts` | MEDIUM-HIGH | **FIXED** — `evictRiderFromGeo` added post-commit alongside the existing `kickRiderFromBoard` calls in `suspendRider`/`banRider`, and wired into `eraseAccount`. Tests in `admin-riders.service.spec.ts`, `privacy.service.spec.ts` |
| DS15-06 | KYC vendor-webhook path (`applyKycResult`) committed its CAS status mutation, then wrote the `AuditLog` row afterward in a separate warn-only try/catch — unlike every other domain-mutation-plus-audit pair in the codebase (admin suspend/lift/ban, cancel/fare), which share one `$transaction`. A failed audit insert would let an automated KYC decision commit with zero audit trail, silently dropping the KB-FEED-SYNTH account-status feed row too | `apps/api/src/riders/rider.service.ts` `applyKycResult` | MEDIUM | **FIXED** — the mutation and its `AuditLog.create` now share one `$transaction`, matching the established pattern; the F-13/DS14-04 CAS and replay-safe guards are unchanged. Test in `rider.service.spec.ts` forces the audit write to fail and asserts the mutation rolls back with it |
| DS15-07 | `Order.note` (customer-entered delivery instructions, e.g. "call 077... if the gate's locked" — the same class of dialable/address PII as waypoint `contactPhone`) was never scrubbed on erasure, despite orders being retained forever as the ledger | `apps/api/src/privacy/privacy.service.ts` | MEDIUM | **FIXED** — `note` is nulled alongside the existing waypoint-phone strip on the erasing customer's own placed orders. Test in `privacy.service.spec.ts` |
| DS15-08 | `/healthz`'s `prisma.ping()` drew from the same bounded (`max:10`) Postgres pool used by real traffic — DS-04 fixed the Redis half of this same health check but not the DB half; a probe flood or incident-time spike could queue on connection acquisition and starve real requests, hanging instead of failing fast | `apps/api/src/health/health.service.ts` | MEDIUM | **FIXED** — new `pingDb()` races the ping against a 2s timeout (mirroring the DS-04 Redis-ping pattern), so a saturated pool now fails the probe fast instead of hanging. New `health.service.spec.ts` (none existed before) |
| DS15-09 | `POST /orders/notify-me`'s optional `orderId` (added in the 07-14 KB-NOTIFY-ORDERID follow-up) was forwarded to the Redis waiter registration with no check that the order belongs to the calling customer — any authenticated profile (e.g. a rider enumerating live ids via `GET /orders/open`) could register a notify-me tied to a victim's order, later receiving a push implying it was their own live request. Bounded: order content stays 403'd behind the party-gated `getSnapshot` | `apps/api/src/orders/orders.controller.ts`, `apps/api/src/orders/orders.service.ts` | LOW-MEDIUM | **FIXED** — `requestNotifyWhenAvailable` now checks the order's `customerId` against the caller and silently drops a foreign/non-existent `orderId` to a generic notify-me. Tests in `orders.service.spec.ts` |
| DS15-10 | FCM `sendEach`'s chunking loop (batches of ≤500) wrapped the WHOLE loop in one try/catch — a chunk-2 failure after a chunk-1 success discarded the already-succeeded chunk-1 results and reported every message across every chunk as failed, wrongly excluding chunk-1-delivered profiles from `notifications.service.ts`'s `delivered` set (fail-safe direction only, since the notify-me design already re-pings via the next rider) | `apps/api/src/adapters/push/fcm.push.ts` | LOW | **FIXED** — the try/catch moved inside the loop so each chunk's failure is isolated; previously-succeeded chunks keep their real results. Tests in `fcm.push.spec.ts` |

---

## Wallet & data-lifecycle audit 2026-07-15 (wallet & data-lifecycle audit routine) — `docs/WALLET-DATA-AUDIT-2026-07-15.md`

First run of this routine (lane `WD-`). Four independent passes audited the full money + reporting path:
the rider wallet top-up journey, the per-ride commission debit, the rider earnings tab, and the admin
dashboard's financial/reporting surface. Passes B (commission debit) and D (admin dashboard) independently
converged on the same two root causes (WD-001, WD-002/WD-003) from different angles — cross-confirmation,
not duplication. **Eleven findings — one CRITICAL, three HIGH, three MEDIUM, four LOW — all fixed this run**,
each with a regression test; `pnpm typecheck` + `pnpm lint` + 909 API tests (+16) + 383 mobile tests (+13) +
`apps/api` build all green. Two forward-looking, currently-dormant observations (a net-earnings UI line the
Earnings screen's copy promises but doesn't build yet, and wallet-screen pull-to-refresh — an app-wide gap,
not wallet-specific) are recorded as Suggestions in the report, not findings, since there's no live bug to
fix while commission stays at the 0% launch rate.

| ID | Description | Area | Sev | Status |
|---|---|---|---|---|
| WD-001 | `AdminOrdersService.adjustFare` never wrote a compensating `adjustment` ledger row when correcting the fare on an already-`completed` order — the schema's own design comment ("fare-adjust deltas append here at the ride's original rate") was documented but unimplemented; `creditAccount` (the only method that could write `adjustment`) had zero callers anywhere | `apps/api/src/admin/admin-orders.service.ts` `adjustFare` | CRITICAL | **FIXED** — new `WalletService.adjustCommissionInTx` writes the correction in the SAME transaction as the fare change, computed at the rate the ride was actually charged (not the current live rate); `orderId` left NULL on the row (Postgres treats each NULL as distinct in the `(riderId, orderId, type)` unique index) so N corrections on one order never collide, without a schema migration. Tests in `wallet.service.spec.ts` + `admin-orders.service.spec.ts` (3 cases) |
| WD-002 | Admin manual wallet-credit (`POST /admin/riders/:id/wallet-credit` → `WalletService.creditManual`) wrote no `AuditLog` row anywhere — the one money-movement admin action in the codebase with zero audit trail, unlike every sibling mutation (cancel/fare-adjust/standing changes), which all audit inside their own transaction | `apps/api/src/wallet/wallet.service.ts` `creditManual` | HIGH | **FIXED** — rewritten as one atomic transaction: TopUp create (pre-confirmed) → ledger row → balance update → `AuditLog.create`, all in the same `$transaction`. Test in `wallet.service.spec.ts` |
| WD-003 | `creditManual`'s idempotency pre-check read `CommissionLedger.idemKey`, a column this path never wrote (dead code) — a genuine retry with the same `idempotencyKey` hit an uncaught Prisma `P2002` on the real de-dup mechanism (`TopUp.providerRef @unique`), surfacing as a generic 500 instead of the documented "structurally harmless" idempotent no-op | `apps/api/src/wallet/wallet.service.ts` `creditManual` | HIGH | **FIXED** — `P2002` on `providerRef` is now caught and returns the current (already-credited) balance. Test in `wallet.service.spec.ts` |
| WD-004 | The rider Earnings tab's total/trip-count summed the client-side `/orders/history` page, capped at 50 rows across both roles — a rider with more than 50 lifetime orders saw a silently truncated "what I earned" figure with no indication anything was omitted | `apps/mobile/app/earnings/index.tsx`, `apps/api/src/orders/orders.service.ts` | HIGH | **FIXED** — new server-side aggregate `OrdersService.earningsSummary` (`GET /orders/earnings/summary`, unbounded `_sum`/`_count`) feeds the total/count; the recent-trips list stays the capped page. Tests in `orders.service.spec.ts` (3 cases) |
| WD-005 | `OrderLifecycleService.rate()` read `agreedFare` BEFORE its CAS lock and reused that pre-lock snapshot in the commission-debit call — a concurrent admin fare-adjust landing in the gap could charge commission on a fare the order no longer had. Its sibling completion path, `completeOrder()`, already re-read after the CAS for exactly this reason | `apps/api/src/orders/order-lifecycle.service.ts` `rate` | MEDIUM | **FIXED** — `rate()` now re-reads `agreedFare` immediately after its CAS succeeds, mirroring `completeOrder()`. Test in `order-lifecycle.service.spec.ts` |
| WD-006 | Admin `cash/settlements`'s "Commission accrued" KPI recomputed `fare × CURRENT live rate` per order in the 7-day window instead of reading what was actually charged — a mid-window rate change (or a WD-001 fare correction) would silently re-price older orders and never reconcile with the ledger | `apps/api/src/settlements/settlements.service.ts` `commissionOverview` | MEDIUM | **FIXED** — now sums actual `CommissionLedger` rows (`ride_commission` + `adjustment`) per order when present, falling back to the projection only for orders with no ledger row (the 0% launch period — unchanged behavior today). Tests in `settlements.service.spec.ts` (3 cases) |
| WD-007 | `WalletService.getTopup` fell through to a stale, pre-confirm in-memory snapshot when its own expiry CAS lost a race to a concurrent confirm (0 rows updated) — a rider polling right at the expiry boundary briefly saw `pending` even though the credit had already landed (self-healed on the next poll, no fund loss) | `apps/api/src/wallet/wallet.service.ts` `getTopup` | LOW-MEDIUM | **FIXED** — re-reads the row from the DB on a 0-row CAS instead of returning the stale snapshot. Tests in `wallet.service.spec.ts` |
| WD-008 | The wallet screen's hero balance rendered a malformed `"$-5.00"` for a negative (owed) balance instead of `"-$5.00"` — `formatMoney` had no sign handling, unlike the ledger rows on the same screen which already wrap in `Math.abs` + a sign prefix | `apps/mobile/app/wallet/index.tsx`, `apps/mobile/src/logic/money.ts` | LOW | **FIXED** — `formatMoney` now renders sign-first with a rounds-to-zero guard. Tests in `money.test.tsx` |
| WD-009 | The top-up screen validated against the bundled `COMMISSION` constant instead of the server-authoritative `/wallet/config` (every other wallet surface reads the server value), and displayed the rider's locally-typed amount instead of the server-confirmed `topup.amount` on the wait/success screens | `apps/mobile/app/wallet/top-up.tsx` | LOW | **FIXED** — bounds sourced from `useWalletConfig()` (bundled constant only as the pre-load fallback); wait/success screens show `topup?.amount ?? amountNum`. Validation factored into a testable pure `validateTopupAmount`. Tests in `topup.test.tsx` (6 cases) |
| WD-010 | `resolveCommissionRatePct` had no decimal-place limit on the `COMMISSION_RATE_PCT` env override, while `CommissionLedger.ratePct` is `Decimal(5,2)` — an over-precise ops value would be served to clients at full precision then silently truncate on write to each ride's receipt row | `packages/shared/src/policy.ts` `resolveCommissionRatePct` | LOW | **FIXED** — rounds the resolved rate to 2dp. Tests in `wallet.service.spec.ts` (3 cases) |
| WD-011 | The Earnings screen's cumulative total folded `proposedFare` (the never-agreed ask) into the sum for any completed/delivered order with a null `agreedFare` (a documented completion anomaly `chargeCommission` already tolerates) — a price that was never agreed shouldn't inflate a "what I earned" total | `apps/mobile/app/earnings/index.tsx` | LOW | **FIXED** — the local fallback sum (used only until the WD-004 server aggregate loads) now excludes null-`agreedFare` rows; the server aggregate's SQL `SUM` already excludes them by construction |

---

## Bug hunt 2026-07-15 night (bug-hunt routine) — `docs/BUG-HUNT-2026-07-15.md`

Full-journey re-audit (customer/rider onboarding + KYC capture, order creation, bidding/negotiation,
tracking, completion) plus an app↔API contract-seam pass, each run as an independent research agent
against current code and cross-checked against this ledger first (Phase 0) — including the same-day
deep sweep (DS15-01…DS15-10), UX pass (UX15-01…UX15-16), and wallet & data-lifecycle audit
(WD-001…WD-011), all already merged. Baseline: `pnpm typecheck` clean, 909 API + 383 mobile tests green
(matching the ledger's last-recorded count). **Seven new findings, all LOW–MEDIUM — six fixed this sweep
with regression tests; one recorded as a design observation, not a defect** (see report §"Not
independently fixed"); `pnpm typecheck` + `pnpm lint` + 913 API tests (+4) + 396 mobile tests (+13), all
green.

| ID | Description | Area | Sev | Status |
|---|---|---|---|---|
| BH-07 | Rider's optional "rate the sender" star tap (`senderRateM.mutate`) had no durable marker — an app kill before the POST resolved silently dropped the rating, and a lost-*response* retry hitting the server's 409 "Order already rated" was shown as a scary generic error (rolling back the star) instead of the confirmation it actually was | `apps/mobile/app/rider/job.tsx`, `apps/mobile/src/auth/session.ts`, `apps/mobile/src/logic/rider-job.ts` | MEDIUM | **FIXED** — durable `pendingSenderRating` marker (mirrors BH-06's `pendingRating`/UX15-01's `RiderJobTerminal`), persisted on tap; new pure `reconcilePendingSenderRating` retries it gated on matching the terminal on screen; a 409 on either the live mutation or the retry is now treated as confirmation. 5 new cases in `rider-job.test.ts` |
| BH-08 | Rider's "customer may be offline" warning (`customerStale`) was a one-way sticky flag cleared only on the order's next status change — for a delivery leg sitting at one status for a while, a customer who reconnected left the rider staring at a stale warning for the rest of that leg with no self-correction | `apps/mobile/app/rider/job.tsx`, `apps/mobile/src/realtime/use-rider-job-socket.ts`, `apps/api/src/tracking/tracking.gateway.ts` | LOW-MEDIUM | **FIXED** — new additive `presence:recovered` WS event (`packages/shared/src/contracts.ts`), emitted from `markCustomerPresent` only on a genuine prior escalation; `useRiderJobSocket` gains `onCustomerRecovered`, wired to clear `customerStale` immediately. Tests in `tracking.gateway.spec.ts` + `use-rider-job-socket.test.tsx` (3 new cases) |
| BH-09 | `POST /wallet/topups` had no idempotency key, unlike `CreateOrderRequest` and every admin wallet mutation — a client-side timeout+retry (the same documented scenario those paths guard against) created a second, distinct pending `TopUp` row for one attempt; bounded today (no live rail-confirmation poller yet) but a real double-credit vector the moment that follow-on ships | `apps/api/src/wallet/wallet.service.ts` `createTopup`, `packages/shared/src/contracts.ts` `CreateTopupRequest`, `apps/mobile/app/wallet/top-up.tsx` | MEDIUM (LOW today) | **FIXED** — optional `idempotencyKey` added to the contract; `TopUp.idempotencyKey` + partial unique `(rider_id, idempotency_key)` index (migrations 0028/0029, mirroring the order-create idempotency migrations 0020/0021); `createTopup` dedupes pre-check + P2002 fallback; mobile generates one key per top-up attempt, rotated only in `reset()`. 3 new cases in `wallet.service.spec.ts` |
| BH-10 | "Raise price & send again" — offered while the auction is STILL `open_for_offers` (the last-20s urgent nudge and the "no riders online" empty state) — only ever navigated to compose a fresh order, never cancelled the original; submitting the prefilled form left the customer with TWO simultaneously live orders for the same parcel (risking two riders dispatched for one physical trip) | `apps/mobile/app/order/[id].tsx` `rebroadcast`, `apps/mobile/src/logic/order-tracking.ts` | MEDIUM-HIGH | **FIXED** — new pure `shouldCancelBeforeRebroadcast(status)` (true only for `open_for_offers`); `rebroadcast()` cancels the current order first (best-effort) before navigating, gated on the helper so the five already-terminal call sites are unaffected; a loading state guards the two live-state buttons against a double-tap. 2 new cases in `order-tracking.test.ts` |
| BH-11 | KYC photo capture (`become.tsx` `pickFrom`) showed only a plain error string on a denied camera/gallery permission, with no "Open settings" affordance — unlike the location-permission gate elsewhere in the app. Once the OS stops re-prompting (`canAskAgain: false`), a rider who denies both is permanently blocked from onboarding, since the mandatory KYC photo can never be captured | `apps/mobile/app/rider/become.tsx`, `apps/mobile/src/logic/gates.ts` | MEDIUM | **FIXED** — new pure `shouldOfferPermissionSettings(perm)`; an "Open settings" button (`Linking.openSettings()`) appears alongside the capture buttons on a `canAskAgain:false` denial, mirroring the location gate. 3 new cases in `gates.test.tsx` |
| BH-12 | Rider bidding compose card's "Cancel" button had no pending guard, unlike its sibling dismiss controls (`BailSheet`, `UndeliveredSheet`), which both `disabled={pending}` — tapping Cancel mid-send didn't abort the in-flight `makeOffer`: on success the offer still landed and reappeared unannounced as a "Your offers" card for a bid the rider believed cancelled; on failure the error rendered on an already-dismissed screen | `apps/mobile/app/rider/index.tsx` | LOW-MEDIUM | **FIXED** — `disabled={offerM.isPending}` added to the Cancel button, matching the sibling sheets. Trivial prop wiring; no dedicated regression test, consistent with precedent for similarly-shaped fixes (UX15-08, UX15-11) |

**Not a new defect (design observation only):** `OrdersService.activeForCustomer`'s `findFirst` returns
only the single most-recently-updated live order (an existing code comment already acknowledges "(rarely)
more than one is live"). With BH-10 closed, the one path that could silently create an unintended second
live order is fixed; a customer deliberately sending two separate parcels back-to-back is intentional
multi-order use, and the older order stays reachable via Trip History even though it drops off the home
screen's one proactive recovery banner. Left undocumented as an OPEN item (it's not a defect, just a
UI-scope observation) — see the report for detail.
