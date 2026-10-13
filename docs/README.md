# Lynia docs

This folder is the project's **review record + product spec + operational runbooks**. Living specs
and runbooks stay; point-in-time reports are pruned once absorbed (see "Routine ledgers, plans & archive"
below) — `git log --follow docs/<file>` recovers anything retired.

**Status (2026-10-12):** the API runs on **Azure Container Apps** at
[`https://api.lyniago.com`](https://api.lyniago.com), deployed by `release-azure.yml` on every merge
to `main`. The GCP project was suspended on 2026-09-17; the GCP workflows and `infra/terraform/` are
left over from it ([`plans/2026-09-24-gcp-to-azure-migration.md`](./plans/2026-09-24-gcp-to-azure-migration.md)).
The Android app is on Google Play's **Closed testing** track (v0.51.0, versionCode 45, 2026-10-06; see
[`PLAY-STORE-SUBMISSION.md`](./PLAY-STORE-SUBMISSION.md) §8) and is not public. iPhone users use the
customer web app at app.lyniago.com ([`CUSTOMER-WEB.md`](./CUSTOMER-WEB.md)); merchants use
merchant.lyniago.com ([`MERCHANT-WEB.md`](./MERCHANT-WEB.md)). Several docs below still describe the
GCP setup and are being rewritten.

## Core specs

| Doc | Kind | Purpose |
|-----|------|---------|
| [`CONCEPT.md`](./CONCEPT.md) | 🟢 Living | Product concept & one-month plan — the north star. inDrive-style customer-priced courier; matchmaker, not a payment processor. Forward-looking sections annotated with build status. |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | 🟢 Living (spec) | The engineering map: system context, monorepo layout, GCP deployment, API module map, data model (ERD), and sequence/state diagrams for the offer loop, lifecycle, auth, KYC, and tracking. |
| [`PRICING.md`](./PRICING.md) | 🟢 Living (spec) | The two shared pure modules that shape the negotiation: the **suggested-fare anchor** (`quoteFare`) and the blended **best-match offer ranking** (`rankOffers`) — formulas, weights, edge cases, worked examples. |
| [`DESIGN.md`](./DESIGN.md) | 🟢 Living (spec) | Design system + UX spec: core tokens, responsive & accessibility rules, screen classes, and which `packages/design/handoff/*` owns each screen. |
| [`DESIGN-SYSTEM.md`](./DESIGN-SYSTEM.md) | 🟢 Living | Where the design system lives, the CSS↔TS token naming map (enforced by `design-tokens.drift.spec.ts`) for mobile, admin and merchant, and error surfaces. |

## Security & compliance

| Doc | Kind | Purpose |
|-----|------|---------|
| [`SECURITY.md`](./SECURITY.md) | 🟢 Living (spec) | Security plan & threat model: data classification, STRIDE attack-surface map, posture scorecard, P0→P3 roadmap with implementation status. Companion to the root [`../SECURITY.md`](../SECURITY.md) disclosure policy. |
| [`SECURITY-OPS.md`](./SECURITY-OPS.md) | 🟢 Living (runbook) | The platform/console steps behind the plan — admin Entra sign-in + MFA, Maps key restriction, certificate pinning (inert), edge WAF (none yet), Azure data-tier hardening, pentest cadence. |
| [`SECRET-ROTATION.md`](./SECRET-ROTATION.md) | 🟢 Living (runbook) | How to rotate every secret safely: dual-secret JWT flow, DB/Redis/vendor keys, schedule, post-rotation checklist. |
| [`IR-RUNBOOK.md`](./IR-RUNBOOK.md) | 🟢 Living (runbook) | Incident response: severity triage, containment, eradicate/recover, breach notification, blameless post-mortem. |
| [`DATA-RETENTION.md`](./DATA-RETENTION.md) | 🟢 Living (spec) | PII retention schedule + erasure mechanism under Zimbabwe's CDPA — machine-enforced by the PII-manifest test. |

## Operations, performance & infrastructure

| Doc | Kind | Purpose |
|-----|------|---------|
| [`OBSERVABILITY.md`](./OBSERVABILITY.md) | 🟢 Living (spec) | Latency SLOs, the metric vocabulary (fixed-cardinality labels), and the OTLP collector runbook. |
| [`DEPLOYMENT-AUTOHEAL.md`](./DEPLOYMENT-AUTOHEAL.md) | 🟢 Living (runbook) | The merge → staging → production pipeline and its self-healing layers (canary rollback, auto-retry, `deploy-failure` escalation, startup watchdog). |
| [`RESTORE-DRILL.md`](./RESTORE-DRILL.md) | 🟢 Living (runbook) | Prove Cloud SQL backups restore: PITR/backup drill + `scripts/restore-drill-verify.sh`, RTO record. |
| [`PERFORMANCE.md`](./PERFORMANCE.md) | 🟢 Living (spec) | Mobile speed/latency/cost strategy: micro-cache, bootstrap endpoint, verification status, ranked backlog. |
| [`APP-SIZE.md`](./APP-SIZE.md) | 🟢 Living (guardrail) | Download/OTA size playbook + the CI-enforced per-PR bundle-size budget and its audit trail. |
| [`../apps/api/load/README.md`](../apps/api/load/README.md) | 🟢 Living (plan) | The k6 load harness, the launch load envelope (1×/×5) and the SLO thresholds it asserts. |
| [`CLOUDFLARE.md`](./CLOUDFLARE.md) | 🟢 Living | Why DNS is grey-cloud/DNS-only (TLS issuance, cert pinning, `trust proxy`), plus the Cloudflare MCP wiring for agent sessions. |
| [`BIRD-SETUP.md`](./BIRD-SETUP.md) | 🟢 Living (runbook) | OTP channel arming: Bird SMS (priority channel, verified to Econet) + the WhatsApp Cloud API fallback section. |

## Launch

| Doc | Kind | Purpose |
|-----|------|---------|
| [`AZURE-OWNER-RUNBOOK.md`](./AZURE-OWNER-RUNBOOK.md) | 🟢 Living (runbook) | The founder/ops command runbook: what runs where, the Azure migration checklist, vendor secrets, Didit, push, launch-hygiene guards, force-update, vertical flips, one-off backfills. CI error messages point here by section. |
| [`LAUNCH-DEPLOYMENT-STRATEGY.md`](./LAUNCH-DEPLOYMENT-STRATEGY.md) | 🟢 Living (spec) | How releases work: mobile OTA / Play tracks / compatibility contract, the Azure API canary and rollback, the GitHub process. §-anchors are cited from code and workflows. |
| [`PLAY-STORE-SUBMISSION.md`](./PLAY-STORE-SUBMISSION.md) | 🟢 Living (package) | The complete Play Console submission: listing copy, data-safety table (test-guarded), declarations, founder-only open items. Shipped assets: `store-assets/google-play/`. |
| [`APP-STORE-SUBMISSION.md`](./APP-STORE-SUBMISSION.md) | 🟢 Living (plan + ledger) | The iOS twin of the Play package: step-by-step path to a first App Store release (Apple accounts, Xcode 26 / Expo SDK path, iOS config, APNs push, listing, review risks) and the ledger of every iOS build/submission. |
| [`QA-DEVICE-CHECKLIST.md`](./QA-DEVICE-CHECKLIST.md) | 🟢 Living (checklist) | The hardware-gated device pass (LR16/LR17/LR20): on-device `/qa`, low-end Android, Sentry, background GPS. |
| [`ADMIN-CONSOLE-LAUNCH-SMOKE-TEST.md`](./ADMIN-CONSOLE-LAUNCH-SMOKE-TEST.md) | 🟢 Living (checklist) | One-sitting manual go/no-go over every admin operator journey, incl. the wallet-credit idempotency check. |
| [`WEBSITE.md`](./WEBSITE.md) | 🟢 Living (runbook) | lyniago.com, the marketing site: the design handoff shipped as-is on Cloudflare Workers, the CI guard, one-time setup, deploy/verify/rollback. |
| [`seo/`](./seo/README.md) | 🟢 Living (plan) | Search and AI-visibility plan for lyniago.com in Harare. Phases 0–3 as checklists, the monthly AI-visibility loop, keyword map and targets, ready-to-use drafts, and the open owner decisions. |

## Routine ledgers, plans & archive

The scheduled Claude routines (`ROUTINES.md` is the canonical spec, `routines/*.md` the
trigger-prompt mirrors) keep their working state here:

- **Ledgers (living):** `KNOWN_BUGS.md` (the shared bug ledger every routine dedupes through),
  `REFACTOR-LEDGER.md` (hotspot map + debt register), `.last-doc-sync` (the doc-reconciliation
  routine's marker; its `doc-sync-report.md` is written on its next run).
- **Dated reports (one per lane):** a routine writes its dated report next to these docs and
  deletes the lane's previous one in the same PR (retention rule in `ROUTINES.md`). The July and
  August reports were removed on 2026-10-12; their durable findings are in the ledgers.
- **Plans (`plans/`):** plans still in progress or describing live behaviour: the GCP→Azure
  migration (Phase 8 open), multi-branch owners, restaurant auto-accept, the customer web app, Paynow top-ups, admin console v2 (draft).
- **Archive (`archive/`):** finished reviews, RCAs and executed plans that code or `CLAUDE.md`
  still cite for the reasoning behind a choice (tap-responsiveness and cold-start RCAs, the
  2026-08 UI-kit audits, the low-connectivity program, the restaurants+send launch plan, …).
  Frozen: not kept current, and not link-checked.

Anything that was point-in-time and cited by nothing is deleted; `git log --all -- docs/<file>`
recovers it. CI (`scripts/check-doc-links.mjs`) fails a PR that leaves a reference to a doc that no
longer exists.

## Reading order

- **Just want the status?** → the Status paragraph above, then `PENDING-WORK-2026-10-11.md`.
- **New to the project?** → `CONCEPT.md` (what & why) → `DESIGN.md` (how it looks) →
  `AZURE-OWNER-RUNBOOK.md` (how it runs).
- **How is it built?** → `ARCHITECTURE.md` (system diagrams, data model, the offer-loop flow).
- **How does pricing / ranking work?** → `PRICING.md` (fare anchor + best-match offer ranking).
- **Want to run it / contribute?** → [`../CONTRIBUTING.md`](../CONTRIBUTING.md) (local setup + PR flow).
- **Decision history / rationale?** → `DESIGN-DEVIATIONS.md` (every owner design decision) and
  `archive/` (the CEO/engineering/design review logs, past RCAs and executed plans).

> Methodology: built with the gstack sprint flow (Think → Plan → Design → Build → Review → Test → Ship);
> see the repo root `CLAUDE.md`.
