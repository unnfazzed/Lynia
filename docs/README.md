# Lynia docs

**Start here → [`PILOT-READINESS.md`](./PILOT-READINESS.md)** for current status and the remaining gates.

Two kinds of doc live here: **living** docs are kept current; **historical** docs are dated point-in-time
snapshots, preserved for decision history (each carries a banner pointing to the current state).

| Doc | Kind | Purpose |
|-----|------|---------|
| [`PILOT-READINESS.md`](./PILOT-READINESS.md) | 🟢 Living (current) | Where the build actually stands (2026-06-27): T0–T13 scorecard, the external gates (cloud + revenue §6 now decided; **dev build** remains), and a ship/cloud-provisioning checklist. **The source of truth for status.** |
| [`CONCEPT.md`](./CONCEPT.md) | 🟢 Living | Product concept & one-month plan — the north star. inDrive-style customer-priced courier; matchmaker, not a payment processor. Forward-looking sections annotated with build status. |
| [`DESIGN.md`](./DESIGN.md) | 🟢 Living | Design system + UX spec (tokens, components, §5c journey, the full two-sided IA) and the `DT1`–`DT13` build-task status table. |
| [`design/`](./design/) | 🟢 Living | Mockups + assets — all-flows PNG boards + HTML + tokens. See [`design/README.md`](./design/README.md). |
| [`BACKLOG.md`](./BACKLOG.md) | 🟢 Living | Deferred work, each with its trigger. Items move out as they ship. |
| [`CEO-REVIEW.md`](./CEO-REVIEW.md) | 🟠 Historical (plan stage) | Strategy/economics pressure-test of the concept, pre-build. |
| [`ENG-REVIEW.md`](./ENG-REVIEW.md) | 🟠 Historical (plan stage) | Engineering architecture review — offer-loop concurrency, realtime, auth — pre-build. |
| [`CEO-REVIEW-CHECKPOINT.md`](./CEO-REVIEW-CHECKPOINT.md) | 🟠 Historical (build checkpoint) | A mid-build CEO review; **superseded by `PILOT-READINESS.md`**. |

## Reading order

- **Just want the status?** → `PILOT-READINESS.md`.
- **New to the project?** → `CONCEPT.md` (what & why) → `DESIGN.md` + `design/` (how it looks) →
  `PILOT-READINESS.md` (where it stands).
- **Decision history / rationale?** → the 🟠 historical reviews.

> Methodology: built with the gstack sprint flow (Think → Plan → Design → Build → Review → Test → Ship);
> see the repo root `CLAUDE.md`.
