# P0 Execution Report — Merchant Verticals (2026-07-27)

**Status:** P0 engineering COMPLETE. `main` green. Design track handed to the founder.
**Governing plan:** `docs/plans/2026-07-26-merchant-verticals-plan.md` (§0a office-hours
decisions, §0b eng-review decisions, §0c points here).
**Method:** every PR went through plan → independent-model plan review → implementation →
two adversarial review agents on the diff → fix → merge on green. Express untouched and
green throughout.

---

## 1. What shipped (all merged to `main`)

### PR-A — #402: audit + instrumentation
- **`docs/plans/2026-07-27-status-keyed-query-audit.md`** — every status-keyed Order query
  classified (file:line evidence): **11 class-(a) sites** that must gain `orderType`
  filters/branches before the first merchant order row (each a named P1/P2 task), the
  shared-safe (b) list, the unreachable (c) list, and a count reconciliation.
- Closed the three P0 unknowns: the delivery-OTP verify path is reusable unmodified (its
  auto-close chain is task A-5); **Restaurants tabs AND prescription capture are OTA-able**
  (fingerprint runtimeVersion is the real gate — supersedes the plan's "camera forces a
  binary"); FloatLedger shape was closed at eng review (§0b.2/§0b.5).
- `scripts/utilization-metric.sql` — the §0a Sept-15 tripwire (orders/active-rider/day),
  rebuilt on `order_events` after review caught the first version undercounting in exactly
  the direction that masks the tripwire.
- `scripts/seed-synthetic-orders.sql` — ~100k-row staging dataset for migration-lock
  rehearsal (staging allow-list guarded; includes a 500-row active cohort so
  `one_active_ride` carries weight).

### PR-B — #403: flag layer + golden matrix
- Env kill switches (`RESTAURANTS_ENABLED`, `MERCHANT_DISPATCH_AUTO_ENABLED`,
  `MERCHANT_WALLET_ENABLED`), fail-safe OFF, mirrored in `@lynia/shared`.
- **Public `GET /app/feature-flags`** (version-gate precedent, `public, max-age=60`) —
  the mobile app's remote config; Restaurants tabs ship dark and light up server-side.
- Golden matrix (§0b.4): both PostGIS integration proofs run the flags-present-and-off leg;
  `merchant-routes-dead.e2e.spec.ts` walks the real `AppModule` metadata asserting no
  merchant controller registers while dormant — gating every PR from day one (§0b.8 early).
- `express-no-merchant-coupling` dependency-cruiser rule (probe-tested).

### PR-C — #404: `apps/merchant` scaffold
- Next.js shell mirroring `apps/admin` (standalone output, zero-env build, force-dynamic),
  inside typecheck/lint/build/depcruise from day one. Auth deliberately absent until the
  first authenticated surface (P3). *(Its review agent died on a usage limit — post-merge
  review recorded as follow-up; lowest-risk PR of the three.)*

### #408: main restored to green + flag wiring hardened
`main` went red via dependabot auto-merges (#405/#407). Three breaks, one systemic finding:
- `lucide-react-native` 1.27.0 dropped the `history` icon file → 9 mobile suites failed to
  load. Fixed (`rotate-ccw-clock`, same glyph).
- `find-my-way` CVSS 7.5 advisory → pinned `>=9.7.0` via `pnpm.overrides` (dev-only
  transitive; nothing shipped was exposed).
- **`@sentry/react-native` 6.10 → 8.20 added ~720 KB to the Hermes bundle** (measured by
  controlled A/B: 6.84 MB vs 6.12 MB) — hidden because the icon break killed the size job
  at the export step. Pinned back to ~6.10; `dependabot.yml` now ignores its majors
  (the "coupled migrations, not routine bumps" list). Sentry 8 adoption = its own PR with
  a bundle measurement.
- Deploy env now passes the merchant flags from repo Variables (prod) / `STAGING_*`
  Variables (staging), `env:`-passed and whitelist-validated to `true|false` — **launch is
  a variable flip, never a workflow edit.**

### #411 + #413: gated `terraform apply` from CI (dormant)
`workflow_dispatch`-only apply path behind the `infra` GitHub Environment, so infra changes
stop requiring a founder laptop. Rebuilt once after an adversarial security review (11
findings, 5×P1: shell injection in the unapproved plan job, fail-open tfvars = destructive
apply, non-binding approval, branch-editable controls, auto-created unprotected
environment), then re-attacked (15 findings incl. 1 new P1: the tfplan artifact embeds
unredacted state secrets) and corrected in #413: no plan artifact (the gated job re-plans
and applies in one workspace), WIF ref-pin scoped to the `infra` environment (break-glass
`rollback.yml` branch dispatch preserved), `iam.roleAdmin` added, destroy-visibility
annotations, composite `repo_env` principalSet. Custom IAM roles keep secret payloads and
bucket objects out of casual reach; the residual escalation path is documented plainly in
`provisioner.tf` (treat the ability to run the workflow as project ownership).
**Dormant until armed** (`ci_provisioner_enabled` / `GCP_PROVISIONER_ENABLED`).

## 2. Verification state
- api 1247 · mobile 530 · shared 120 tests green; merchant scaffold in every typecheck/
  lint/build; depcruise 0 errors incl. the new boundary rule; contract snapshot additive.
- Golden matrix + merchant-routes-dead tripwire gate every PR from now on.

## 3. Open items — the step list

### A. Founder — P0 exit gate (staging rehearsal; P1 migrations do NOT ship before it)
1. Arm staging: runbook §8e (`staging_enabled = true`, `terraform apply`, DNS — note the
   staging A record is Terraform-managed when `cloudflare_dns_enabled`; then the repo
   Variables/secret from the outputs; first Deploy Staging run).
2. Seed: `[ "$APP_ENV" = "staging" ] && psql "$DATABASE_URL" -f scripts/seed-synthetic-orders.sql`.
3. Rehearse: apply + revert the no-op expand/contract rehearsal migration (built as the
   first P1 task) on the seeded clone; assert no long `AccessExclusiveLock` on `orders`.

### B. Founder — optional: arm the gated apply (any time, ordered)
Header of `.github/workflows/terraform-apply.yml`: (1) bootstrap the SA out of band;
(2) create the `infra` Environment with required reviewers AND a main-only deployment
branch policy; (3) set `GCP_PROVISIONER_ENABLED`, `GCP_PROVISIONER_SERVICE_ACCOUNT`,
`TF_PROD_TFVARS`. Consider the org-level deny policy noted in `provisioner.tf`.

### C. Design track (in flight — founder in Claude Design Lab)
The full design brief (all three actor journeys end-to-end with edge cases, token values
inline, deliverables list) is preserved at
`docs/plans/2026-07-27-merchant-design-brief.md`. On return: outputs are RECONCILED against
`packages/design` (Design Lab is input to the design system, never a bypass), then
`/design-html` produces the production spec. Design gates P3 (dashboard) and P4 (app tabs).

### D. P1 — ready to start (engineering, parallel-safe with C)
Rehearsal migration (feeds gate A3) → schema PR: `merchantPhase` column,
`FloatLedgerEntry` (derived, `UNIQUE(order_id, type, rider_id)`, rider-row `FOR UPDATE`
reserve), `Merchant.pilotEnabled`, seeded-cohort golden-matrix leg → audit fixes A-1/A-2/A-3
(reconciler sweep, `makeOffer` guards, bid boards) + A-8/A-9 (admin funnel + fare KPIs).
Merchant suites are already required CI checks (§0b.8 satisfied early).

### E. Founder — launch track (unchanged)
Play approval → 100 riders launch weekend → 500 by end-August → 5+ named CBD merchants by
Sep 15 (§0a cut line triggers stand) → utilization tripwire watched via
`scripts/utilization-metric.sql`.
