# Lynia docs

This folder is the project's **review record + product spec**, kept deliberately lean: the four core
documents (CONCEPT + the three per-discipline review logs) plus the design spec and the status board.

**Status (2026-06-29):** the API is **live and CI-deployed on GCP** at
**[`https://lyniago.lyniafinance.com`](https://lyniago.lyniafinance.com)** (`{"status":"ok","db":true,"redis":true}`).
The Ship stage's hard gate — GCP provisioning — is **closed** (project `lynia-500911`, Terraform-applied).
What remains is **founder/vendor wiring** (WhatsApp BSP, Didit KYC, Firebase) and a **dev build** — tracked
in **[`PILOT-READINESS.md`](./PILOT-READINESS.md)**, the source of truth for status.

The three **review logs** are living per-discipline records (CEO/product · engineering · design), each
organised by sprint stage (Plan → Build → Ship) and preserved for decision history. Status is **not**
duplicated across them — `PILOT-READINESS.md` holds it once.

| Doc | Kind | Purpose |
|-----|------|---------|
| [`CONCEPT.md`](./CONCEPT.md) | 🟢 Living | Product concept & one-month plan — the north star. inDrive-style customer-priced courier; matchmaker, not a payment processor. Forward-looking sections annotated with build status. |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | 🟢 Living (spec) | The engineering map: system context, monorepo layout, GCP deployment, API module map, data model (ERD), and sequence/state diagrams for the offer loop, lifecycle, auth, KYC, and tracking. **How the system is wired** (15 Mermaid diagrams). |
| [`CEO-REVIEW.md`](./CEO-REVIEW.md) | 📋 Review log (CEO/product) | Strategy/economics/investor reviews across **Plan → Build checkpoint → Ship**. Decision history; status lives in `PILOT-READINESS.md`. |
| [`ENG-REVIEW.md`](./ENG-REVIEW.md) | 📋 Review log (engineering) | Architecture + correctness reviews across **Plan → Build → Ship** (offer-loop concurrency, the P0 audits, GCP provisioning). Defines the stable `ET1`–`ET10` IDs. |
| [`DESIGN-REVIEW.md`](./DESIGN-REVIEW.md) | 📋 Review log (design) | Design/UX reviews across **Plan → Build → Ship** (system lock, two-sided consultation, ship-prep visual QA). Calibrates against `DESIGN.md`. |
| [`DESIGN.md`](./DESIGN.md) | 🟢 Living (spec) | Design system + UX spec (tokens, components, §5c journey, the full two-sided IA) and the `DT1`–`DT13` build-task status table. The baseline every design review calibrates against. |
| [`PILOT-READINESS.md`](./PILOT-READINESS.md) | 🟢 Living (current) | Where the build actually stands: T0–T13 scorecard and the remaining gates, plus the **founder action runbook** (WhatsApp BSP / Didit / FCM wiring) and the **vendor-free QA-testing** guide. **The single source of truth for status.** |

## Reading order

- **Just want the status?** → `PILOT-READINESS.md`.
- **New to the project?** → `CONCEPT.md` (what & why) → `DESIGN.md` (how it looks) →
  `PILOT-READINESS.md` (where it stands).
- **How is it built?** → `ARCHITECTURE.md` (system diagrams, data model, the offer-loop flow).
- **Decision history / rationale?** → the 📋 review logs — one per discipline, each running
  Plan → Build → Ship: `CEO-REVIEW.md` (product/strategy) · `ENG-REVIEW.md` (engineering) ·
  `DESIGN-REVIEW.md` (design).

> Methodology: built with the gstack sprint flow (Think → Plan → Design → Build → Review → Test → Ship);
> see the repo root `CLAUDE.md`.
