# Lynia — Architecture & Engineering Hardening Roadmap (2026-07-20)

**Status:** IN EXECUTION. Phases 1–2 shipped in PR #360 (merged). The deferred items (3.1, the 3.4/3.5
decompositions, and the Phase-4 remainder) are shipping in a follow-up PR. **22 of 24 items are done or
meaningfully started**; only 4.3 (placebo CI) and 4.4 (structural a11y) remain deferred, with reasons.
The plan below is preserved as authored; this section tracks what has shipped.

## Execution status (2026-07-20)

| Item | Status | Notes |
|---|---|---|
| **1.1** Crash reporting | ✅ **done (API)** | `@sentry/node` env-gated init + exception-filter capture, inert without DSN. Mobile/admin stay on the LR20 device runbook (bundle-size/native gates) — founder step. |
| **1.2** shared money tests | ✅ **done** | 97 tests pinning pricing/policy/ranking/geo, incl. the float-rounding quirks 2.1 preserves. |
| **1.3** ledger integrity job | ✅ **done** | `WalletIntegrityService` + scheduler-guarded endpoint + nightly Terraform job + drift metric; corrected the stale `TODOS.md` claim. Terraform apply = founder. |
| **1.4** retry taxonomy | ✅ **done** | `ApiError.retryable` + explicit non-retryable mutations + retry-ownership table (ARCHITECTURE §14). |
| **1.5** business alerts | ✅ **done** | 5 business alert policies extend `monitoring.tf` + runbooks. Apply + notification channel = founder. |
| **1.6** admin money tests | ✅ **done** | 24 tests; surfaced AH20-01/02 (now resolved in 2.2). |
| **1.7** restore drill | ✅ **done** | `docs/RESTORE-DRILL.md` + verifier script. Running the drill = founder. |
| **2.1** decimal-safe money | ✅ **done** | `@lynia/shared/money.ts` (integer-cents) + migrated wallet/settlements/admin-orders; behaviour-preserving. |
| **2.2** idempotency | ✅ **done** | AH20-01 fare-adjust replay guard fixed + tested; AH20-02 verified safe (issue-resolve CAS); inventory table (ARCHITECTURE §13). |
| **2.3** fault pack | ✅ **done** | 5 top-up fault-injection tests (double webhook, late/declined, mid-write crash, float-exact). |
| **2.4** transition table | ✅ **done** | `order-lifecycle.transitions.ts` + 15-test spec + §7 note (recorded the `requested`-state divergence). |
| **2.5** PaymentRail seam | ✅ **done** | `adapters/payments/` interface + inert stub, mirroring the KycVendor seam. |
| **3.2** import-boundary CI | ✅ **done** | dependency-cruiser + baseline (`--ignore-known`): fails only on NEW cycles / ui→api couplings. |
| **3.3** admin contract dedup | ✅ **assessed** | Determined NOT a mechanical dedup (admin types are a distinct privileged surface); recorded in the file header; real fix needs an admin-contracts design decision (deferred). |
| **3.6** RF-05 design pass | ✅ **done** | `docs/RF-05-WS-GATEWAY-STATE.md` classifies the 5 gateway maps; RF-05 → SCOPED. |
| **4.5** review doctrine | ✅ **done** | Path-scoped sensitive-lane review doctrine in `docs/ROUTINES.md`. |
| **3.1** kill switches | ✅ **done** (follow-up PR) | `NOTIFICATIONS_FEED_ENABLED` fail-soft kill switch + core/non-core map (ARCHITECTURE §Core vs non-core); 2 tests. |
| **3.4** god-service decomposition | ◑ **started** (follow-up PR) | First behaviour-preserving seam: lifecycle policy constants → `order-lifecycle.constants.ts` (1084→1041 lines); 181 orders tests green + a constants spec. Further seams remain (per the one-per-PR discipline). |
| **3.5** mobile screen decomposition | ◑ **started** (follow-up PR) | First extraction: offer-ordering logic → `src/logic/order-offers.ts`, unit-tested (6 tests); OTA-safe. More sections + the 14 ui→api couplings (3.2 baseline) remain, per-screen with device QA. |
| **4.1** fixtures | ✅ **done** (follow-up PR) | Contract-validated fixture factories in `@lynia/shared` (self-tested); one API test migrated. |
| **4.2** contract gate | ✅ **done** (follow-up PR) | 46-contract JSON-Schema snapshot + CI back-compat gate with `contract-change` label bypass (no new dep). |
| **4.6** semantic tokens | ✅ **done** (follow-up PR) | Additive `semantic` role layer over the raw `color` scale; 2 tests. Adopting roles in `ui/` + linting raw imports is a follow-on. |
| **4.3** placebo reruns · **4.4** structural a11y | ⏳ **deferred** | 4.3 needs failure-triggered CI scripting unverifiable without breaking CI. 4.4's safe form needs either breaking required-props across 14+ call sites or non-trivial a11y-lint/axe infra (oxlint has no jsx-a11y) — bigger than a safe additive slice; mobile already carries ~140 a11y props. |

**Founder-gated to finish** (code shipped inert): Sentry account/DSN (1.1), Terraform apply + a real
notification channel (1.3/1.5), the restore drill run (1.7), and mobile/admin Sentry wiring on-device.

---

**Status (original):** PROPOSED — nothing here is executed yet. This document is the deliverable of a
planning session; each item is designed to be picked up cold by a future session (interactive
or routine) as its own PR.

**Provenance:** built from (a) a full codebase audit this session, (b) ~35 articles across the
Uber, DoorDash, and Airbnb engineering blogs, distilled and scale-flagged, and (c) two
adversarial review passes — a line-level fact-check of every claim against the code, and a
staff-engineer critique — whose corrections are incorporated. Notable corrections that shaped
the plan: Sentry is already a decided launch task (LR20) awaiting execution; the wallet
integrity job that `TODOS.md` describes as shipped was specified but **never built**; there is
**no EcoCash HTTP client yet** (the rail seam can be designed greenfield, cheaply, before
wallet PR2); the KYC vendor (Didit) is **already** behind a `KycVendor` adapter interface;
admin manual credits are **already** idempotent (WD-003); env-var kill switches already exist
(`WALLET_REVEAL`, `MICRO_CACHE_DISABLED`, …); and Terraform already defines SLO alert policies
that currently page no one (`alert_notification_channels = []`).

**Scope constraints.** The pilot is live/imminent: everything is migration-safe and
incremental. No new product features. Sensitive lanes (bid acceptance / order assignment /
agreed-price / KYC gating) are only touched behind characterization tests with a regression
test per change, per `CLAUDE.md`. Sizing is per-item (S ≈ one session, M ≈ 2–3 sessions,
L ≈ 4+), not calendar promises.

---

## Why execute this now

1. **The audit found gaps that all sit on the money path or on the ability to see it fail.**
   No crash/error reporting on any of the three apps (LR20 decided, unexecuted). The ledger
   integrity job is promised by `TODOS.md` but does not exist. Money is stored as
   `Decimal(10,2)` but computed in JS floats — including the definitional commission formula
   in `packages/shared/src/policy.ts`. `packages/shared` (fare/pricing/ranking math consumed
   by all three apps) has **zero** tests. The admin console — the daily human-in-the-loop
   money rail for InnBucks/O'mari — has 2 test files against 61 source files. 900–1,200-line
   files sit on exactly the lanes marked SENSITIVE.
2. **The Uber/DoorDash/Airbnb playbooks converge on one lesson relevant to a bids/wallet/KYC
   marketplace:** assume every step can fail or run twice, and make that safe *structurally*
   (ledger invariants, idempotency records, explicit state machines, one retry layer) rather
   than *operationally* (dashboards and heroics). Lynia already has the skeleton — 37
   transaction blocks, row locks, unique-constraint backstops, an adapter seam, token
   discipline. This plan closes the specific remaining gaps, right-sized.
3. **Pilot timing.** A live pilot with real money and a tiny team is when a silent
   missing-credit, an invisible crash loop, or an un-diagnosable stuck order costs the most
   trust per incident. Phase 1 exists to make the first bad pilot week diagnosable in minutes.

**If only 20% of this plan ever executes, execute:** 1.3 (integrity job), 1.2 (shared
money-math tests), 1.1 (crash reporting), 1.6 (admin money-action tests), 2.3 (top-up fault
pack). Five low-risk, test/visibility-only items that cover the money path end to end.

**Deliberately NOT doing** (scale-flagged in the sources themselves): microservices (Uber's
DOMA post tells startups not to), Kafka/Cadence/Temporal, self-hosted Prometheus/M3, a Pact
broker, centralized load management (DoorDash Aperture), a GraphQL migration, a design-system
rebuild, production test-tenancy (Uber SLATE). Also not repeating the shipped perf/size
program (compression, ETag/304, MicroCache, warm boot, bundle budgets, R8/icon work), and not
touching work the scheduled routines already own (see Execution rules).

---

## Phase 1 — Safety net & visibility (all low-risk, additive)

> You can't harden what you can't see failing. No behavior changes on the money path.

### 1.1 Crash & error tracking — execute LR20 (S–M)
- **What:** Execute the already-runbooked LR20: `@sentry/react-native` on mobile per the
  step-by-step wiring in `docs/QA-DEVICE-CHECKLIST.md:38-61` (DSN as EAS secret, source maps
  in the EAS/OTA pipeline), `@sentry/node` on the API alongside the existing OTEL setup,
  `@sentry/nextjs` on admin (lower priority, per `docs/LAUNCH-READINESS.md`). Code lands
  env-gated and no-ops when the DSN is unset (the existing OTEL/PostHog pattern).
- **Founder prerequisites (logged, not half-shipped):** Sentry account (free tier at pilot
  volume — verify), DSN secrets, data-residency call (GlitchTip self-host is the fallback).
- **Why:** Zero crash/error reporting exists today. PostHog captures screens only (autocapture
  off); OTEL is metrics-only with no exception events; `AllExceptionsFilter` correlation IDs
  go to server logs and nowhere else. A crash loop on the rider job screen is currently
  invisible unless a rider phones in.
- **Playbook:** DoorDash — one observability home; Airbnb — post-deploy error-rate delta as
  the rollback trigger.
- **Acceptance:** a deliberately thrown test error appears in the dashboard from each of the
  three apps, tagged with release/version.

### 1.2 Tests for `packages/shared` money/geo logic (S)
- **What:** Unit + property tests for `pricing.ts`, `policy.ts` (the definitional
  commission math — `perRideCommission`, commission basis), `offer-ranking.ts`, `geo.ts`:
  golden-file cases pinning current fare suggestions, ranking order, and commission outputs
  (especially rounding at the calibration rate), plus property tests (haversine symmetry,
  ranking stability, commission monotonicity).
- **Why:** `packages/shared` has **zero test files** while owning the purest, most
  load-bearing money math consumed by all three apps. Also the prerequisite safety net for
  2.1 and 3.4.
- **Playbook:** Uber — golden-diff testing for financial logic, scaled down to fixtures.
- **Acceptance:** `pnpm --filter @lynia/shared test` exists, runs in CI's build job, and the
  goldens pin current behavior.

### 1.3 Ledger completeness invariants job — build wallet-design step 6 (M)
- **What:** Implement the nightly integrity job that `docs/plans/2026-rider-wallet-design.md`
  specifies and `TODOS.md` (staleley) describes as already shipped. House pattern, matching
  `retention_purge`: Cloud Scheduler → `AdminOrSchedulerGuard`-protected endpoint
  (Terraform in `infra/terraform/scheduler.tf`; the apply is founder-gated). Assertions:
  (a) every `CommissionAccount.balance` equals its ledger sum and latest `balanceAfter`;
  (b) every confirmed `TopUp` has exactly one ledger credit (the unique `topUpId` prevents
  doubles; this catches the *missing*-credit direction); (c) every terminal order with a
  commission debit has consistent `ratePct`/`fare` receipt fields; (d) no orphaned ledger
  references. Emit an OTEL metric + structured log on drift. Correct the stale `TODOS.md`
  item-1 wording in the same PR.
- **Why:** Uber's accounting rule — *every event accounted for*, not just "the books
  balance" — is the cheapest money-bug detector there is, and this job is the internal half
  of the provider-statement reconciliation `TODOS.md` item 1 wants later. Arguably the
  highest-value single item in this plan: it is designed, promised, and absent.
- **Playbook:** Uber — money-movement consistency + accounting completeness invariants;
  DoorDash — the ledger-invariant monitor as the highest-value alert.
- **Acceptance:** job green nightly in production; a seeded-drift test proves each assertion
  fires; `TODOS.md` corrected.

### 1.4 Retry taxonomy + single-retry-layer audit (S)
- **What:** (a) Add an explicit `retryable: boolean` to the API error envelope (`ApiError`
  already carries machine-readable `code`s — extend, don't replace), defaulting
  **non-retryable** for unclassified errors on money endpoints. (b) Write the retry-ownership
  table covering every layer that can re-execute work: TanStack `shouldRetry` (cap 2 — this
  *is* the mobile retry layer; the API client itself only re-sends once after a 401 refresh),
  BullMQ `attempts: 3` with backoff on expiry/autoclose jobs, the two `setInterval`
  reconcilers (offer sweep ~2 min, lifecycle sweep ~15 min), socket.io client reconnection
  after deploy/restart, and any future PSP webhook redelivery. One named owner per money
  flow, backoff + jitter at that layer only.
- **Why:** Airbnb defaults payments errors to non-retryable because misclassification either
  strands or duplicates money; DoorDash's June 19th outage is the canonical stacked-retry
  self-DDoS. Lynia has at least five re-execution mechanisms and no written ownership.
- **Playbook:** Airbnb — "Avoiding Double Payments"; DoorDash — Aperture / June 19th outage.
- **Acceptance:** taxonomy field live; ownership table in `docs/ARCHITECTURE.md`; any
  behavior change is per-endpoint with a regression test.

### 1.5 Business-vital-signs alerts — extend the existing policies and connect them (S–M)
- **What:** `infra/terraform/monitoring.tf` already defines `slo_p95` policies over 6 latency
  metrics plus `match_select_error_rate`, gated on `slo_alerts_enabled` (default false, per
  LR9) — and `alert_notification_channels` defaults to `[]`, so nothing pages anyone. This
  item: add ~6 business alerts (ledger-invariant drift from 1.3, order-creation error rate,
  offer-accept failure rate, top-up confirm lag, BullMQ queue age/depth, API 5xx delta
  post-deploy), each with a one-paragraph runbook in `docs/OBSERVABILITY.md`, and flip the
  gate + configure a real notification channel as part of LR9.
- **Founder prerequisites:** notification channel (phone/email), Terraform apply.
- **Why:** Uber — alert on the *marketplace's* vital signs, not just CPU; DoorDash — alerts
  are code-reviewed config with named owners. The scaffolding exists; it pages no one.
- **Depends on:** 1.3 (drift metric).
- **Acceptance:** a test alert reached a human phone/inbox; business policies live in
  Terraform with runbooks.

### 1.6 Admin money-action tests (S–M)
- **What:** Tests for the admin server actions that move money or change order state: manual
  wallet credit (`WalletActions.tsx` → `creditManual` — already idempotent via
  `providerRef @unique`, WD-003; pin that with a test), refund resolution, fare adjust
  (including the known soft spot: a same-payload replay writes no ledger row but currently
  duplicates the `AuditLog` row), order reassignment, KYC review actions.
- **Why:** Admin has 2 test files against 61 source files and it is **in the money path
  daily** — the manual InnBucks/O'mari rail runs through it. Tests-only, zero pilot risk,
  and the single most exposed untested surface. (Moved into Phase 1 by review: nothing about
  it justifies waiting.)
- **Playbook:** DoorDash — payment-adjacent code gets stricter treatment by doctrine.
- **Acceptance:** every money-moving admin action has at least a happy-path + replay/dup +
  authz test; bugs found route through sensitive-lane rules with `docs/KNOWN_BUGS.md` rows.

### 1.7 Backup restore drill (S, founder-executed)
- **What:** `docs/LAUNCH-READINESS.md` LR7 is unchecked and PITR is enabled in
  `infra/terraform/sql.tf` but has never been exercised. Prep the runbook + a verification
  script: restore into a scratch instance, boot the API against it, run the 1.3 invariant
  checker on the restored data. Founder executes the drill; record the measured RTO.
- **Why:** "A backup that has never restored is a hope" (the repo's own words). For a
  live-money pilot this beats most structural work on value-per-risk.
- **Acceptance:** drill performed once; RTO + gotchas recorded in the runbook.

---

## Phase 2 — Money-path structural semantics

> The Uber/Airbnb/DoorDash payments playbook applied to the wallet and offer loop.
> Characterization tests precede every behavior-relevant change.

### 2.1 Decimal-safe money arithmetic (M–L)
- **What:** Introduce a small integer-cents (or `Prisma.Decimal`-ops) money module in
  `@lynia/shared` and migrate all float money math onto it — the definitional formulas in
  `packages/shared/src/policy.ts` (`perRideCommission`, basis) and `pricing.ts`, and their
  consumers `wallet.service.ts` (`round2`, `Number(...)` balance math),
  `settlements.service.ts` (float sums), `admin-orders.service.ts` (delta fare/commission).
  Sequence: characterization tests pinning current outputs (1.2's goldens) → offline replay
  of existing ledger history through old and new paths, diffing to the cent → swap.
- **Why:** Money is `Decimal(10,2)` at rest but floats in flight, including the commission
  formula itself. Consistent rounding helpers mitigate it today; the commission-rate flip
  (0% → real rate) is exactly when the float edge cases would surface.
- **Playbook:** Uber — "the system cannot create or destroy money"; Uber/DoorDash — offline
  replay-and-diff before changing financial code.
- **Depends on:** 1.2.
- **Acceptance:** no `Number()`/`round2`-style float arithmetic on money values anywhere in
  api or shared (lint-greppable); replay diff is zero cents.

### 2.2 Idempotency inventory — verify the done, close the real gaps (M)
- **What:** A verification pass, not a rebuild — most of the estate is already correct:
  top-ups (client key + partial unique, migrations 0028/0029), credit side (unique `topUpId`
  + CAS), admin manual credit (`providerRef @unique`, WD-003), per-order commission debit
  (WD-015). Produce the inventory table in `docs/ARCHITECTURE.md` covering every
  money-moving or state-changing operation, then close the actual gaps found by review:
  refunds (creation is capped by the issue-resolve CAS but the `Refund` table has no unique
  constraint — add one keyed on issue), fare adjust (CAS + zero-delta no-op exist, but a
  same-payload replay duplicates the `AuditLog` row — dedupe it), and a double-submit guard
  where any admin form can fire twice.
- **Why:** DoorDash's creation-context insight — retries are only safe when every step is
  provably idempotent; the audit could enumerate the protections but nobody had ever written
  the inventory, and the two real gaps sit on the human-operated rail.
- **Playbook:** Airbnb — client keys persisted before the call; Uber — deterministic keys
  from business facts; DoorDash — per-step completion records.
- **Deferred by review:** client-side stored-response replay (new table + mobile machinery)
  — see Deferred table.
- **Acceptance:** inventory table complete, every row marked verified-or-fixed with a
  regression test per fix.

### 2.3 Fault-injection test pack for the top-up & webhook paths (S–M)
- **What:** Vitest cases against the top-up flow *as built* (manual rails + the dormant
  `creditFromTopup` path): confirm times out mid-flight; process dies between provider
  success and DB write; confirmation delivered twice; never delivered (reconciler must
  catch); ambiguous provider outcome. Assert after each: 1.3's invariants hold, no double
  credit, no stranded `TopUp`. This pack becomes the acceptance harness for the future live
  EcoCash rail client (wallet PR2) — the rail cannot land without passing it.
- **Why:** DoorDash's stance: for a wallet, "payment succeeded but we didn't record it"
  tests are worth more than another happy-path e2e. The integration suite already proves
  offer-loop concurrency (the ET-labeled specs); the money rail deserves the same.
- **Playbook:** DoorDash — fault injection (principle, not the Filibuster tooling).
- **Acceptance:** pack green; any bug found is fixed under sensitive-lane rules with a
  `KNOWN_BUGS.md` row.

### 2.4 Order-lifecycle transition table as a verification artifact (M)
- **What:** Extract the legal state transitions currently enforced implicitly across
  `order-lifecycle.service.ts` (1,084 lines) and `orders.service.ts` (915 lines) into one
  declarative table (state × event → next state, guards, side-effect list, compensation
  note) with an exhaustive test suite: every table transition has a test; every non-table
  transition is asserted rejected. **No production code changes in this item** — the table
  *describes* current behavior and diffs against it are the review artifact; making the
  services consume the table is 3.4's job. Verify against the mermaid state machine in
  `docs/ARCHITECTURE.md` §7 and reconcile any divergence found.
- **Why:** DoorDash rebuilt checkout as an explicit persisted state machine because
  scattered status updates breed illegal-transition bugs; Uber's RIBs makes business state
  drive legality. Decomposing the god services without this table is flying blind.
- **Playbook:** DoorDash — Kotlin checkout state machine; Uber — RIBs.
- **Acceptance:** table + exhaustive spec merged; divergences (if any) triaged into
  `KNOWN_BUGS.md`.

### 2.5 `PaymentRail` seam — designed before the live rail exists (S–M)
- **What:** There is **no EcoCash HTTP client yet** (`wallet.service.ts` pushes the rail
  prompt out of band; the live client is wallet PR2). That makes this cheap: define
  `adapters/payments/` — a `PaymentRail` interface (initiate, confirm, reconcile;
  timeout policy; raw-payload retention alongside mapped domain objects) with contract
  tests wired to 2.3's fault pack — *before* the live client is built, so the rail lands
  behind a seam from day one. The house precedent already exists: `KycVendor` +
  `StubKycVendor` + Didit in `apps/api/src/kyc/` (review found the plan's original
  "add a KYC adapter" item already implemented — follow that pattern). A circuit breaker on
  live rail calls is explicitly **out of scope** here: it's a behavior change that lands
  with the rail client itself, kill-switched via the 3.1 pattern.
- **Why:** `TODOS.md` item 2 records (decision D6) that hardwiring top-ups around EcoCash
  was accepted knowingly, with a tripwire for the InnBucks/O'mari automation decision. This
  item doesn't preempt that decision — it makes whichever way it goes "write an adapter"
  instead of "operate on live money code under time pressure."
- **Playbook:** Uber — Scaling Verify (vendor-agnostic mapping layer) + the cross-cutting
  gateway habit; DoorDash — timeouts on every third-party call.
- **Depends on:** 2.3.
- **Acceptance:** interface + stub implementation + contract tests merged; wallet PR2's
  definition-of-done references them.

---

## Phase 3 — Modularity & decomposition

> Rides on Phase 1–2's nets. Coordination rule: before starting any RF-numbered item, check
> `docs/REFACTOR-LEDGER.md` status — the refactoring routine (every 2nd day) executes queued
> ledger items and may get there first. Claim items by updating the ledger in your PR.

### 3.1 Named kill switches on the existing env-var pattern (S)
- **What:** Review corrected the original version of this item (a DB flag table + admin
  toggle page) down to size: the house pattern already exists — `WALLET_REVEAL` (documented
  as a kill switch), `MICRO_CACHE_DISABLED`, `MIN_SUPPORTED_APP_VERSION`, infra gates.
  This item: write the core/non-core map (core: auth, offer loop, order lifecycle, wallet,
  tracking, SOS; non-core: notifications feed, reports surfaces, ratings-adjacent), add
  named env kill switches for each non-core surface that lacks one, and make non-core fail
  soft — a broken non-core feature must never block the money path. Cloud Run revision
  history already makes env flips logged, attributable, and revertible (Airbnb's
  config-changes-are-changes requirement, satisfied for free). The DB-backed runtime flag
  table is deferred as a feature (see Deferred table).
- **Playbook:** Uber — driver-app core/non-core with kill switches; Airbnb — config changes
  through the same guardrails as code; DoorDash — flag-gated cutovers.
- **Acceptance:** core/non-core map in `docs/ARCHITECTURE.md`; every non-core surface has a
  tested kill switch (switch off → money path still green in integration tests).

### 3.2 Import-boundary & dependency-cycle enforcement in CI (S)
- **What:** Add `dependency-cruiser` as a CI step (oxlint stays): no cross-feature-module
  deep imports in `apps/api/src` (modules talk via their public service, DOMA-style); no
  cycles anywhere; mobile layering (`ui` must not import `api`; `query` is the only consumer
  of `api`). Warn-only for one week of routine runs, then error.
- **Why:** Cycles are avoided by hand today (`mobile/src/api/client.ts:6` documents its
  hooks indirection specifically to dodge one); nothing catches the next accident. The
  feature-folder layout is already 90% DOMA-shaped — this locks it in.
- **Playbook:** Uber — DOMA layer/gateway rules; DoorDash — monolith pain from
  any-endpoint-reaches-anywhere.
- **Acceptance:** dependency-cruiser blocking in CI with zero suppressions on api and mobile.

### 3.3 Admin/shared contract dedup — constrained (S–M)
- **What:** Make `apps/admin` consume the response types that **already exist** in
  `@lynia/shared` contracts (admin already imports shared enums and tokens; the duplicated
  part is the response interfaces in `adminTypes.ts`, 303 lines). Constraint from the
  refactor ledger: promoting *new* exports into `packages/shared` is a public-surface
  design question (RF-07 precedent) — any new shared export gets its own explicitly-labeled
  PR, not smuggled in. Out of scope: the `StatusPill` copy divergence (RF-09 WONT-DO —
  deliberate per-platform copy).
- **Why:** Duplicated response shapes drift; Airbnb's schema-first lesson — a field change
  should be a compile error in every consumer, not a runtime surprise in the support console.
- **Playbook:** Airbnb — schema-first contracts.
- **Acceptance:** `adminTypes.ts` shrunk to genuinely admin-only shapes; typecheck is the
  proof.

### 3.4 Strangler decomposition of the sensitive god services (L)
- **What:** With 2.4's table + tests in place: split `order-lifecycle.service.ts` (1,084)
  and `orders.service.ts` (915) along their natural seams — assignment, OTP delivery
  lifecycle, expiry/completion workers, bid/agreed-price — one extraction per PR, each
  behavior-preserving with a regression test, services consuming the 2.4 transition table
  as they're touched. Candidate follow-ons if capacity allows (same rules):
  `rider.service.ts` (KYC lane) and `admin-orders.service.ts` (rising churn). Where future
  behavior would branch inside the money path, prefer explicit hook points (e.g. an
  `onOrderCompleted` event the notifications module subscribes to) over new if/else in core
  — Uber's logic-extension pattern, sized to 3–5 interfaces, not a plugin framework.
- **Why:** These files top the refactor ledger's hotspot ranking and sit on the SENSITIVE
  lanes — today every change there is high-risk by construction. DoorDash's monolith exit
  method: extract seams one at a time, consolidate the pattern as you go.
- **Playbook:** DoorDash — monolith→services *method* (not microservices); Uber — DOMA
  extension points.
- **Depends on:** 2.4. Never more than one extraction in flight.
- **Acceptance:** the two named services each under ~500 lines with their extracted units
  tested; ledger updated.

### 3.5 Decompose the two hot sensitive mobile screens (M, demoted to last in phase)
- **What:** Extract data-fetching + socket wiring into per-screen hook modules for
  `order/[id].tsx` (1,172 lines, ~44 hooks) and `rider/job.tsx` (931) only — both marked
  SENSITIVE (bid-acceptance UI) in the hotspot map, so sensitive-lane rules apply:
  characterization/regression test per screen, one screen per PR, verified against
  `docs/QA-DEVICE-CHECKLIST.md` + `/qa`. Review cut the original wider version:
  `rider/index.tsx` and `home.tsx` have cooled out of top-churn (refactoring cold code is
  low-yield), and the "opportunistic `StyleSheet` memoization while touching each" rider
  violated the one-concern-per-PR rule — both moved to the Deferred table.
- **Playbook:** Airbnb — one canonical data path per page; Uber — RIBs state/view
  separation.
- **Acceptance:** both screens' data/socket logic in tested hooks; render layer
  presentational; device checklist passed.

### 3.6 RF-05 design pass — WS gateway shared state (S)
- **What:** The refactor ledger says RF-05 (per-process maps `positionEmit`,
  `customerPresence`, `staleNotified` in `tracking.gateway.ts`, 784 lines) "needs a design
  pass, too large for one PR." This item is **only that design pass**: a decision doc
  classifying each map as multi-instance-correctness-relevant (→ Redis-backed via the
  existing adapter) or per-process-acceptable (→ documented as such), with the extraction
  sequenced into ledger-sized PRs for the refactoring routine to execute.
- **Why:** Latent multi-instance correctness question the Redis socket adapter only partly
  covers; doing the thinking now makes the routine's execution mechanical.
- **Acceptance:** decision doc merged; RF-05 status moves from OPEN to scoped-ready.

*(Cut by review: the original 3.7 — splitting `mobile/src/auth/session.ts` — is RF-10,
already scoped 2026-07-19 and queued "ready for next run" of the refactoring routine. The
routine owns it; duplicating it here would put two uncoordinated executors on one file.)*

---

## Phase 4 — DX, CI & design consistency (opportunistic, nothing blocks)

### 4.1 Shared typed fixtures (S–M)
- **What:** One `fixtures/` set of domain objects (orders in each lifecycle state, offers,
  ledger entries, KYC states) validated against the shared zod contracts, consumed by API
  Vitest, mobile Jest mocks, and admin tests.
- **Playbook:** Airbnb — schema-validated shared fixtures ("Building Services, Part 4").
- **Acceptance:** all three suites import from it; fixtures fail CI if they drift from
  contracts.

### 4.2 Contract breaking-change gate in CI (S)
- **What:** Snapshot the shared zod contracts (JSON-Schema export) and fail CI on a breaking
  diff (field removal/type change) without an explicit `contract-change` PR label. Mobile
  OTA + store-review lag means old clients talk to new APIs for weeks — typecheck alone
  doesn't protect *deployed* clients.
- **Playbook:** Airbnb — schema breaking-change detection; DoorDash — Pact, right-sized to
  one repo.
- **Acceptance:** a deliberate breaking change fails CI without the label; a labeled one
  passes with the diff surfaced in the PR.

### 4.3 Placebo reruns for failing tests — annotate, never unblock (S)
- **What:** On CI test failure, rerun the failing spec against `main` in the same job and
  annotate the failure "pre-existing on main" vs "introduced by this PR." Review shrank
  this from the original quarantine lane: auto-unblocking anything is in tension with the
  repo's never-merge-on-red rule (and prod deploys additionally sit behind a human
  GitHub-Environment approval — KB-PROD-DEPLOY-GATE), and there's no flake evidence in the
  PR-health reports yet. The quarantine lane is deferred with a trigger.
- **Playbook:** Uber — placebo executions from "Shifting E2E Testing Left."
- **Acceptance:** the annotation appears on a synthetic pre-existing failure.

### 4.4 Accessibility made structural (S)
- **What:** (a) Required a11y props on the shared `src/ui` form components (a `Field`
  without a label is a type error — Airbnb's trick); (b) an RN a11y lint pack in CI;
  (c) `axe-core` assertions in the admin suite. Mobile already carries ~140 a11y props —
  this locks the standard in mechanically.
- **Playbook:** Airbnb — a11y enforced in shared components + CI, so one fix propagates.
- **Acceptance:** lint/type errors on a deliberately unlabeled field; axe passes on admin's
  core pages.

### 4.5 Path-scoped review doctrine for the Claude routines (S)
- **What:** Encode per-lane review rules that `/review` + routine prompts load by path: any
  diff touching `wallet/`, `settlements/`, `offers/`, `orders/`, or KYC must state in the
  PR body — idempotency key used, state transition(s) exercised, regression test added;
  reviewers stay silent otherwise (precision bar). **Constraint:** live triggers must be
  updated per the procedure in `docs/routines/README.md` — a trigger's `session_context`
  cannot be recreated by delete+recreate.
- **Why:** Eight scheduled routines + merge-on-green means review doctrine *is* the safety
  culture here. DoorDash's AI-reviewer lesson: path-scoped doctrine + a "would this comment
  change the code?" precision bar is what made automated review trusted.
- **Acceptance:** doctrine in `docs/ROUTINES.md` + routine prompts updated in place; first
  routine PR on a sensitive lane shows the three declarations.

### 4.6 Two-layer semantic tokens — port, don't invent (S, lowest priority)
- **What:** `packages/design/tokens/colors.css` already has an explicit semantic-alias layer
  (`--surface-card`, `--action-primary`, `--state-error`, …) over the base palette; the TS
  tokens in `@lynia/shared/design-tokens.ts` are single-layer. Port the existing CSS
  semantic layer into the TS tokens so mobile and admin consume semantics, and lint the ~3
  remaining hardcoded hex values. Demoted by review: the original justification (ending
  admin/mobile status-color drift) cited a divergence the ledger marks deliberate (RF-09
  WONT-DO), and dark mode is correctly deferred — this is consistency hygiene, not pilot
  value.
- **Playbook:** DoorDash — Prism two-layer tokens; Uber — Base Web token constraints.
- **Acceptance:** TS tokens expose the semantic layer; raw-scale imports outside the token
  package fail lint.

---

## Deferred (with triggers, `TODOS.md` style)

| Item | Why deferred | Trigger to revisit |
|---|---|---|
| DB-backed runtime flag table + admin toggle page | New admin product surface — a feature; env kill switches cover pilot needs via Cloud Run revisions | Explicit user sign-off, or env-flip cadence becomes operationally painful (>~2/week) |
| Client stored-response idempotency replay (Airbnb-style) | New table + mobile machinery on every money call; server-side backstops already hold | First observed duplicate caused by a client retry |
| Flaky-test quarantine lane | No flake evidence yet; tension with never-merge-on-red | A flake blocks two consecutive routine merges |
| Run the `LOAD-MODEL` 1×/5× k6 scenarios | Harness + envelope exist (`apps/api/load/`, `docs/LOAD-MODEL.md`) but need staging + OTEL collector (founder steps) | Before the commission-rate flip, and before any deliberate rider-count scale-up |
| E2E mobile suite (Maestro/Detox) on the money path | High maintenance at pilot scale; `/qa` + device checklist cover today | First shipped regression a scripted happy-path E2E would have caught |
| Production test-tenancy (Uber SLATE-style) | Plumbing cost; staging + fault-injection suffice at one-team scale | Staging drift causes a prod-only money bug, or >1 team ships concurrently |
| Durable workflow engine (Temporal) | BullMQ + reconcilers give at-least-once + self-heal; engine is operational overhead | A money flow grows beyond ~4 compensating steps, or cross-file constant drift (DS20-01/DS20-03 class) recurs after Phase 2 |
| `rider/index.tsx` / `home.tsx` decomposition + `StyleSheet` memoization | Both screens cooled out of top-churn; memoization is a separate S item, not a rider | Screens re-enter the hotspot top-10, or a measured render-perf regression |
| Dark mode | Feature-adjacent polish | Post-pilot; 4.6 makes it a token-file change when wanted |

---

## Execution rules (plan-wide)

- One PR per item (or per extraction for 3.4/3.5), each with the regression test the
  sensitive-lane rules require, merged per repo policy (green CI; prod deploys additionally
  behind the human environment gate).
- **Routine coordination:** before starting any RF-numbered or hotspot item, check
  `docs/REFACTOR-LEDGER.md`; claim by updating status in your PR; the refactoring routine
  may execute queued items first — that's fine, skip and move on.
- **Defect protocol:** any defect found while executing an item (e.g. by 2.3's fault pack or
  2.4's divergence check) gets a `docs/KNOWN_BUGS.md` row tagged with the owning lane, per
  the dedupe protocol, and is fixed in the same run per `docs/ROUTINES.md`.
- **Founder-gated steps** (Sentry account/DSN, notification channel, Terraform applies,
  restore drill, staging for load tests) are listed in the item, logged when blocked — never
  half-shipped.
- **Dependencies:** 2.1←1.2 · 1.5←1.3 · 2.5←2.3 · 3.4←2.4 · 3.1 before any flag-gated
  cutover. Everything else reorders freely; any item can be dropped without invalidating
  the rest.

## Sequencing rationale

Phase 1 first because visibility and a test net are prerequisites for safely touching money
code at all — and its seven items are independently the highest value-per-session in the
plan. Phase 2 hardens semantics (decimal math, idempotency, the transition table, the rail
seam) so Phase 3's structural refactors become mechanical rather than judgment calls. Phase 4
interleaves freely. The plan deliberately front-loads everything that is tests-only or
additive: if execution stops early, what shipped was the safest, highest-yield slice.

## Sources

- **Codebase audit + two review passes** (2026-07-20, this session): `docs/REFACTOR-LEDGER.md`,
  `docs/KNOWN_BUGS.md`, `docs/ARCHITECTURE.md`, `docs/OBSERVABILITY.md`,
  `docs/LAUNCH-READINESS.md`, `docs/plans/2026-rider-wallet-design.md`, `TODOS.md`, plus
  direct code inspection (citations inline above).
- **Uber Engineering blog:** Domain-Oriented Microservice Architecture; driver-app RIBs;
  rider-app architecture; payments platform; money-movement strong consistency; accounting
  data testing; multi-tenancy & SLATE; shifting E2E left; flaky-tests overhaul;
  observability at scale; DynamoDB→Docstore migration; Base Web; Scaling Verify with Wallet.
- **DoorDash Engineering blog:** Cadence as fallback; Kotlin checkout state machine;
  Aperture & the June 19th outage; RabbitMQ→Kafka task processing; Pact contract testing;
  fault-injection testing; monolith→microservices & migration pain points; hot-swapping
  production tables; StatsD→Prometheus; session-management zero-downtime migration; DLS
  theming & dark mode; the AI code reviewer posts.
- **Airbnb Engineering blog:** Avoiding Double Payments (idempotency); Building Services
  parts 1 & 4 (schema-first, fixtures, breaking-change detection); ts-migrate;
  Rearchitecting the Frontend; GraphQL/Apollo; Safeguarding Changes in Production;
  Continuous Delivery; Himeji (authorization); Building a Visual Language (DLS).
