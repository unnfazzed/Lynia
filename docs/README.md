# Lynia docs

This folder is the project's **review record + product spec + operational runbooks**. Living specs
and runbooks stay; point-in-time reports are pruned once absorbed (see "Routine ledgers & reports"
below) — `git log --follow docs/<file>` recovers anything retired.

**Status:** the API is **live and CI-deployed on GCP** at
**[`https://lyniago.lyniafinance.com`](https://lyniago.lyniafinance.com)**. Build status is
**held once** — see **[`PILOT-READINESS.md`](./PILOT-READINESS.md)** (its **Pending tasks**
section); the live GCP/vendor arming state is tracked in
[`GCP-PENDING-REVIEW-2026-07-13.md`](./GCP-PENDING-REVIEW-2026-07-13.md), which supersedes the
older parts of the status board.

## Core specs & review logs

| Doc | Kind | Purpose |
|-----|------|---------|
| [`CONCEPT.md`](./CONCEPT.md) | 🟢 Living | Product concept & one-month plan — the north star. inDrive-style customer-priced courier; matchmaker, not a payment processor. Forward-looking sections annotated with build status. |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | 🟢 Living (spec) | The engineering map: system context, monorepo layout, GCP deployment, API module map, data model (ERD), and sequence/state diagrams for the offer loop, lifecycle, auth, KYC, and tracking. |
| [`PRICING.md`](./PRICING.md) | 🟢 Living (spec) | The two shared pure modules that shape the negotiation: the **suggested-fare anchor** (`quoteFare`) and the blended **best-match offer ranking** (`rankOffers`) — formulas, weights, edge cases, worked examples. |
| [`DESIGN.md`](./DESIGN.md) | 🟢 Living (spec) | Design system + UX spec (tokens, components, §5c journey, the two-sided IA) and the `DT1`–`DT13` build-task table. Visual source of truth is `packages/design/`. |
| [`DESIGN-SYSTEM.md`](./DESIGN-SYSTEM.md) | 🟢 Living | Design-system adoption record: how `packages/design/` was vendored, the CSS↔TS token contract (machine-enforced by `design-tokens.drift.spec.ts`), and the device/build follow-ups. |
| [`CEO-REVIEW.md`](./CEO-REVIEW.md) | 📋 Review log (CEO/product) | Strategy/economics/investor reviews across **Plan → Build checkpoint → Ship**. Decision history; status lives in `PILOT-READINESS.md`. |
| [`ENG-REVIEW.md`](./ENG-REVIEW.md) | 📋 Review log (engineering) | Architecture + correctness reviews across **Plan → Build → Ship**. Defines the stable `ET1`–`ET10` IDs. |
| [`DESIGN-REVIEW.md`](./DESIGN-REVIEW.md) | 📋 Review log (design) | Design/UX reviews across **Plan → Build → Ship**. Calibrates against `DESIGN.md`. |

## Security & compliance

| Doc | Kind | Purpose |
|-----|------|---------|
| [`SECURITY.md`](./SECURITY.md) | 🟢 Living (spec) | Security plan & threat model: data classification, STRIDE attack-surface map, posture scorecard, P0→P3 roadmap with implementation status. Companion to the root [`../SECURITY.md`](../SECURITY.md) disclosure policy. |
| [`SECURITY-OPS.md`](./SECURITY-OPS.md) | 🟢 Living (runbook) | The platform/console steps behind the plan — admin IAP+MFA, Maps key restriction, Cloud Armor tuning, gated-infra rollouts, pentest cadence. |
| [`SECRET-ROTATION.md`](./SECRET-ROTATION.md) | 🟢 Living (runbook) | How to rotate every secret safely: dual-secret JWT flow, DB/Redis/vendor keys, schedule, post-rotation checklist. |
| [`IR-RUNBOOK.md`](./IR-RUNBOOK.md) | 🟢 Living (runbook) | Incident response: severity triage, containment, eradicate/recover, breach notification, blameless post-mortem. |
| [`DATA-RETENTION.md`](./DATA-RETENTION.md) | 🟢 Living (spec) | PII retention schedule + erasure mechanism under Zimbabwe's CDPA — machine-enforced by the PII-manifest test. |
| [`MOBILE-CERT-PINNING.md`](./MOBILE-CERT-PINNING.md) | 🟢 Living (runbook) | Arming runbook for the gated TLS cert-pinning config plugin (`LYNIA_TLS_PINS`). |
| [`FRAUD-REVIEW.md`](./FRAUD-REVIEW.md) | 📋 Threat-model narrative | Adversarial fraud survey of the customer + rider journeys. Per-finding statuses are stale by design — live status is in `KNOWN_BUGS.md`. |

## Operations, performance & infrastructure

| Doc | Kind | Purpose |
|-----|------|---------|
| [`OBSERVABILITY.md`](./OBSERVABILITY.md) | 🟢 Living (spec) | Latency SLOs, the metric vocabulary (fixed-cardinality labels), and the OTLP collector runbook. |
| [`DEPLOYMENT-AUTOHEAL.md`](./DEPLOYMENT-AUTOHEAL.md) | 🟢 Living (runbook) | The merge → staging → production pipeline and its self-healing layers (canary rollback, auto-retry, `deploy-failure` escalation, startup watchdog). |
| [`RESTORE-DRILL.md`](./RESTORE-DRILL.md) | 🟢 Living (runbook) | Prove Cloud SQL backups restore: PITR/backup drill + `scripts/restore-drill-verify.sh`, RTO record. |
| [`PERFORMANCE.md`](./PERFORMANCE.md) | 🟢 Living (spec) | Mobile speed/latency/cost strategy: micro-cache, bootstrap endpoint, verification status, ranked backlog. |
| [`APP-SIZE.md`](./APP-SIZE.md) | 🟢 Living (guardrail) | Download/OTA size playbook + the CI-enforced per-PR bundle-size budget and its audit trail. |
| [`LOAD-MODEL.md`](./LOAD-MODEL.md) | 🟢 Living (plan) | The launch load envelope (1×/×5) and k6 scenario plan (`apps/api/load/`); SLO assertions LR10–LR15. |
| [`CLOUDFLARE.md`](./CLOUDFLARE.md) | 🟢 Living | Why DNS is grey-cloud/DNS-only (TLS issuance, cert pinning, `trust proxy`), plus the Cloudflare MCP wiring for agent sessions. |
| [`BIRD-SETUP.md`](./BIRD-SETUP.md) | 🟢 Living (runbook) | OTP channel arming: Bird SMS (priority channel, verified to Econet) + the WhatsApp Cloud API fallback section. |
| [`INFRA-HARDENING-ROLLOUT.md`](./INFRA-HARDENING-ROLLOUT.md) | 🟢 Living (runbook) | Ordered verify-and-rollback sequence for the default-off Terraform hardening flags. |
| [`GCP-PENDING-REVIEW-2026-07-13.md`](./GCP-PENDING-REVIEW-2026-07-13.md) | 📋 Campaign tracker | Live GCP pending/drift state — cited by the CI drift/diagnose workflows; includes the provisioned-inventory appendix behind `scripts/gcp-provisioning-verify.sh`. |

## Launch

| Doc | Kind | Purpose |
|-----|------|---------|
| [`PILOT-READINESS.md`](./PILOT-READINESS.md) | 🟢 Living (status board) | Where the build stands: scorecard, remaining gates, the founder vendor-wiring runbook, and the vendor-free QA-testing guide. Header notes where it defers to the GCP pending review. |
| [`LAUNCH-READINESS.md`](./LAUNCH-READINESS.md) | 🟢 Living (campaign) | The launch-review campaign: stable `LR1`–`LR21` gates with machine-checkable exit tests and the go/no-go checklist. |
| [`LAUNCH-DEPLOYMENT-STRATEGY.md`](./LAUNCH-DEPLOYMENT-STRATEGY.md) | 🟢 Living (design) | Release-automation design rationale: OTA/staged/min-version channels, canary + rollback, environments. §-anchors are cited from ~18 code/workflow sites. |
| [`LAUNCH-EXECUTION-RUNBOOK.md`](./LAUNCH-EXECUTION-RUNBOOK.md) | 🟢 Living (runbook) | Copy-paste founder commands for every cloud-side arming step — CI error messages point here by section. |
| [`PLAY-STORE-SUBMISSION.md`](./PLAY-STORE-SUBMISSION.md) | 🟢 Living (package) | The complete Play Console submission: listing copy, data-safety table (test-guarded), declarations, founder-only open items. Shipped assets: `store-assets/google-play/`. |
| [`QA-DEVICE-CHECKLIST.md`](./QA-DEVICE-CHECKLIST.md) | 🟢 Living (checklist) | The hardware-gated device pass (LR16/LR17/LR20): on-device `/qa`, low-end Android, Sentry, background GPS. |
| [`ADMIN-CONSOLE-LAUNCH-SMOKE-TEST.md`](./ADMIN-CONSOLE-LAUNCH-SMOKE-TEST.md) | 🟢 Living (checklist) | One-sitting manual go/no-go over every admin operator journey, incl. the wallet-credit idempotency check. |

## Routine ledgers & reports

The scheduled Claude routines (`ROUTINES.md` is the canonical spec, `routines/*.md` the live
trigger-prompt mirrors) keep their working state here:

- **Ledgers (living):** `KNOWN_BUGS.md` (the shared bug ledger every routine dedupes through),
  `REFACTOR-LEDGER.md` (hotspot map + debt register), `doc-sync-report.md` + `.last-doc-sync`
  (the doc-reconciliation routine's latest run, overwritten each run).
- **Dated reports (one per lane):** `BUG-HUNT-*`, `UX-USABILITY-REVIEW-*`, `DEEP-SWEEP-*`,
  `WALLET-DATA-AUDIT-*`, `REFACTOR-*`, `PR-HEALTH-REPORT-*`. **Only the most recent report per
  lane is kept on `main`** (retention rule in `ROUTINES.md`) — older runs live in git history,
  and their durable findings are already in the ledgers.
- **Plans (`plans/`):** design/arming/roadmap docs still load-bearing or cited from code — the
  restaurants+send joint launch plan, merchant verticals plan + design brief + P0 execution
  report, rider-wallet design + brief, architecture-hardening roadmap (incl. the absorbed
  competitor-gap appendix), admin-console deployment + arming, identity/POD hardening,
  status-keyed query audit, biker prepaid commission, DS3 plan, test-APK build plan. Fully
  executed plans are retired to git history once nothing cites them.
- **Design notes:** `RF-05-WS-GATEWAY-STATE.md` (the in-flight RF-05 gateway-state extraction —
  status lives in `REFACTOR-LEDGER.md`).

Everything else that was point-in-time (one-off reviews whose findings shipped, executed fix
plans, superseded snapshots) is pruned from the working tree — `git log --follow docs/<file>`
recovers any of it.

## Reading order

- **Just want the status?** → `PILOT-READINESS.md` (+ `GCP-PENDING-REVIEW-2026-07-13.md` for live
  infra/vendor arming state).
- **What stands between the pilot and a real launch?** → `LAUNCH-READINESS.md` (the LR1–LR21 gate campaign).
- **New to the project?** → `CONCEPT.md` (what & why) → `DESIGN.md` (how it looks) →
  `PILOT-READINESS.md` (where it stands).
- **How is it built?** → `ARCHITECTURE.md` (system diagrams, data model, the offer-loop flow).
- **How does pricing / ranking work?** → `PRICING.md` (fare anchor + best-match offer ranking).
- **Want to run it / contribute?** → [`../CONTRIBUTING.md`](../CONTRIBUTING.md) (local setup + PR flow).
- **Decision history / rationale?** → the 📋 review logs — one per discipline, each running
  Plan → Build → Ship: `CEO-REVIEW.md` (product/strategy) · `ENG-REVIEW.md` (engineering) ·
  `DESIGN-REVIEW.md` (design).

> Methodology: built with the gstack sprint flow (Think → Plan → Design → Build → Review → Test → Ship);
> see the repo root `CLAUDE.md`.
