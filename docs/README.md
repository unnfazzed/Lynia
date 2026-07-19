# Lynia docs

This folder is the project's **review record + product spec**, kept deliberately lean: the four core
documents (CONCEPT + the three per-discipline review logs) plus the design spec and the status board.

**Status:** the API is **live and CI-deployed on GCP** at
**[`https://lyniago.lyniafinance.com`](https://lyniago.lyniafinance.com)** (`{"status":"ok","db":true,"redis":true}`),
the CI deploy is **armed**, and the inDrive-parity roadmap has shipped (**push, not poll**). Status is
**held once** — see **[`PILOT-READINESS.md`](./PILOT-READINESS.md)**, the single source of truth (its
**Pending tasks** section).

The three **review logs** are living per-discipline records (CEO/product · engineering · design), each
organised by sprint stage (Plan → Build → Ship) and preserved for decision history. Status is **not**
duplicated across them — `PILOT-READINESS.md` holds it once.

| Doc | Kind | Purpose |
|-----|------|---------|
| [`CONCEPT.md`](./CONCEPT.md) | 🟢 Living | Product concept & one-month plan — the north star. inDrive-style customer-priced courier; matchmaker, not a payment processor. Forward-looking sections annotated with build status. |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | 🟢 Living (spec) | The engineering map: system context, monorepo layout, GCP deployment, API module map, data model (ERD), and sequence/state diagrams for the offer loop, lifecycle, auth, KYC, and tracking. **How the system is wired** (15 Mermaid diagrams). |
| [`PRICING.md`](./PRICING.md) | 🟢 Living (spec) | Deep-dive on the two shared, pure modules that shape the negotiation: the distance-based **suggested-fare anchor** (`quoteFare`) and the blended **best-match offer ranking** (`rankOffers`) — formulas, weights, edge cases, worked examples, and the T0 tuning checklist. |
| [`CEO-REVIEW.md`](./CEO-REVIEW.md) | 📋 Review log (CEO/product) | Strategy/economics/investor reviews across **Plan → Build checkpoint → Ship**. Decision history; status lives in `PILOT-READINESS.md`. |
| [`ENG-REVIEW.md`](./ENG-REVIEW.md) | 📋 Review log (engineering) | Architecture + correctness reviews across **Plan → Build → Ship** (offer-loop concurrency, the P0 audits, GCP provisioning). Defines the stable `ET1`–`ET10` IDs. |
| [`DESIGN-REVIEW.md`](./DESIGN-REVIEW.md) | 📋 Review log (design) | Design/UX reviews across **Plan → Build → Ship** (system lock, two-sided consultation, ship-prep visual QA). Calibrates against `DESIGN.md`. |
| [`COMPETITOR-REVIEW.md`](./COMPETITOR-REVIEW.md) | 📋 Review (architecture) | Architecture/competitor benchmarking: `ARCHITECTURE.md` weighed against inDrive, Gojek, Grab, and Chowdeck — engineering decisions ranked in fair weight classes, drawn from public sources. (The companion inDrive UX/latency review shipped its whole P0–P2 roadmap and was retired to git history, 2026-07-19.) |
| [`DESIGN.md`](./DESIGN.md) | 🟢 Living (spec) | Design system + UX spec (tokens, components, §5c journey, the full two-sided IA) and the `DT1`–`DT13` build-task status table. The baseline every design review calibrates against. |
| [`DESIGN-SYSTEM.md`](./DESIGN-SYSTEM.md) | 🟢 Living | Design-system adoption record: how the LyniaGo system in `packages/design/` was vendored, the token reconciliation into `packages/shared`, what is wired into the apps, and the device/build follow-ups. |
| [`OBSERVABILITY.md`](./OBSERVABILITY.md) | 🟢 Living (spec) | Observability spec: latency SLOs, the metric vocabulary (fixed-cardinality labels), and the OTLP-push collector runbook (`OTEL_EXPORTER_OTLP_ENDPOINT`). |
| [`SECURITY.md`](./SECURITY.md) | 🟢 Living (spec) | Security plan & threat model: data classification, threat actors/trust boundaries, a STRIDE attack-surface map, an honest posture scorecard, and a prioritized P0→P3 remediation roadmap with an implementation-status table (each item grounded in real `file:line` with an acceptance test). Defense-in-depth, data-protection/privacy, and the incident-response + governance lifecycle. Companion to the root [`../SECURITY.md`](../SECURITY.md) disclosure policy. |
| [`SECURITY-OPS.md`](./SECURITY-OPS.md) | 🟢 Living (runbook) | Security operations: the platform/console steps behind the plan — admin SSO+MFA via IAP, Google Maps/Places key restriction, mobile cert-pinning guide, Cloud Armor WAF tuning, the coordinated gated-infra rollouts (private SQL · Redis TLS · bucket CMEK/retention), and pentest scope/cadence. |
| [`SECRET-ROTATION.md`](./SECRET-ROTATION.md) | 🟢 Living (runbook) | How to rotate every secret safely: the zero-downtime dual-secret JWT flow, hash-key separation, DB/Redis/vendor-key rotation, schedule, and the post-rotation checklist. |
| [`DEPLOYMENT-AUTOHEAL.md`](./DEPLOYMENT-AUTOHEAL.md) | 🟢 Living (runbook) | The merge → staging → production pipeline and its self-healing: prod promotes the **same image** a green staging run validated (`release.yml` staging-gate), failed deploy runs are auto-retried once, and persistent failures escalate as `deploy-failure` issues with logs + an @claude fix request (`deploy-autoheal.yml`). |
| [`IR-RUNBOOK.md`](./IR-RUNBOOK.md) | 🟢 Living (runbook) | Incident response: severity triage, containment moves (session revoke, secret rotation, WAF tighten, rollback), eradicate/recover, breach notification (Zimbabwe DPA), blameless post-mortem, and the detections that should page. |
| [`PILOT-READINESS.md`](./PILOT-READINESS.md) | 🟢 Living (current) | Where the build actually stands: T0–T13 scorecard and the remaining gates, plus the **founder action runbook** (WhatsApp BSP / Didit / FCM wiring) and the **vendor-free QA-testing** guide. **The single source of truth for status.** |
| [`LAUNCH-READINESS.md`](./LAUNCH-READINESS.md) | 🟢 Living (campaign) | The pilot-ready → **launch-ready review strategy**: three tracks (Engineering hardening · Performance proof · UI/device QA) as the stable `LR1`–`LR21` gates with machine-checkable exit tests, the parallel agentic (Claude/gstack) execution model, and the final go/no-go checklist. |

## Routine ledgers & reports (the other things you'll see in this folder)

The scheduled Claude routines (`ROUTINES.md` is the canonical spec, `routines/*.md` the live
trigger-prompt mirrors) keep their working state here:

- **Ledgers (living):** `KNOWN_BUGS.md` (the shared bug ledger every routine dedupes through),
  `REFACTOR-LEDGER.md` (hotspot map + debt register), `doc-sync-report.md` + `.last-doc-sync`
  (the doc-reconciliation routine's latest run, overwritten each run).
- **Dated reports (one per lane):** `BUG-HUNT-*`, `UX-USABILITY-REVIEW-*`, `DEEP-SWEEP-*`,
  `WALLET-DATA-AUDIT-*`, `REFACTOR-*`, `PR-HEALTH-REPORT-*`. **Only the most recent report per
  lane is kept on `main`** (2026-07-19 cleanup; retention rule in `ROUTINES.md`) — older runs
  live in git history, and their durable findings are already in the ledgers.
- **Plans (`plans/`):** design/arming docs that are still load-bearing (admin-console deployment
  + arming, rider-wallet design + brief, identity/POD hardening, test-APK build, DS3 plan, and
  the superseded-but-still-cited prepaid-commission note). Fully-executed plans are retired to
  git history once nothing cites them.
- **Campaign trackers still in flight:** `LAUNCH-READINESS.md` (LR gates), the GCP reviews
  (`GCP-PROVISIONING-REVIEW.md`, `GCP-PENDING-REVIEW-2026-07-13.md` — cited by CI drift/diagnose
  workflows), `INFRA-HARDENING-ROLLOUT.md` (deferred hardening flags),
  `ANDROID-LAUNCH-REVIEW-2026-07-18.md` + `ADMIN-CONSOLE-LAUNCH-SMOKE-TEST.md` (the 31 Jul
  launch pair), `FRAUD-REVIEW.md` (threat-model narrative; live status is in `KNOWN_BUGS.md`).

Everything else that was point-in-time (one-off reviews whose findings shipped, executed fix
plans, superseded snapshots) is pruned from the working tree — `git log --follow docs/<file>`
recovers any of it.

## Reading order

- **Just want the status?** → `PILOT-READINESS.md`.
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
