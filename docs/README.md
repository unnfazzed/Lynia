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
| [`INDRIVE-UX-REVIEW.md`](./INDRIVE-UX-REVIEW.md) | 📋 Review (UX/latency) | Perceived-speed & responsiveness audit vs inDrive: the auction/tracking are polled not pushed, no optimistic UI, marker teleport + camera-fight, plus architecture/scale smells — with a P0→P2 fix roadmap mapped to inDrive parity. Complements the visual `DESIGN-REVIEW.md` and the architecture `COMPETITOR-REVIEW.md`. |
| [`COMPETITOR-REVIEW.md`](./COMPETITOR-REVIEW.md) | 📋 Review (architecture) | Architecture/competitor benchmarking: `ARCHITECTURE.md` weighed against inDrive, Gojek, Grab, and Chowdeck — engineering decisions ranked in fair weight classes, drawn from public sources. Complements the UX `INDRIVE-UX-REVIEW.md`. |
| [`DESIGN.md`](./DESIGN.md) | 🟢 Living (spec) | Design system + UX spec (tokens, components, §5c journey, the full two-sided IA) and the `DT1`–`DT13` build-task status table. The baseline every design review calibrates against. |
| [`DESIGN-SYSTEM.md`](./DESIGN-SYSTEM.md) | 🟢 Living | Design-system adoption record: how the LyniaGo system in `packages/design/` was vendored, the token reconciliation into `packages/shared`, what is wired into the apps, and the device/build follow-ups. |
| [`OBSERVABILITY.md`](./OBSERVABILITY.md) | 🟢 Living (spec) | Observability spec: latency SLOs, the metric vocabulary (fixed-cardinality labels), and the OTLP-push collector runbook (`OTEL_EXPORTER_OTLP_ENDPOINT`). |
| [`PILOT-READINESS.md`](./PILOT-READINESS.md) | 🟢 Living (current) | Where the build actually stands: T0–T13 scorecard and the remaining gates, plus the **founder action runbook** (WhatsApp BSP / Didit / FCM wiring) and the **vendor-free QA-testing** guide. **The single source of truth for status.** |
| [`LAUNCH-READINESS.md`](./LAUNCH-READINESS.md) | 🟢 Living (campaign) | The pilot-ready → **launch-ready review strategy**: three tracks (Engineering hardening · Performance proof · UI/device QA) as the stable `LR1`–`LR21` gates with machine-checkable exit tests, the parallel agentic (Claude/gstack) execution model, and the final go/no-go checklist. |

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
