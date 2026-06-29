# Lynia docs

**Start here → [`PILOT-READINESS.md`](./PILOT-READINESS.md)** for current status and the remaining gates.

**Status (2026-06-29):** the API is **live and CI-deployed on GCP** at
**[`https://lyniago.lyniafinance.com`](https://lyniago.lyniafinance.com)** (`{"status":"ok","db":true,"redis":true}`).
The Ship stage's hard gate — GCP provisioning — is **closed** (project `lynia-500911`, Terraform-applied).
What remains is **founder/vendor wiring** (WhatsApp BSP, Didit KYC, Firebase) and a **dev build** — see
[`FOUNDER-RUNBOOK.md`](./FOUNDER-RUNBOOK.md). The full flow is testable today vendor-free via
[`QA-TESTING.md`](./QA-TESTING.md).

Two kinds of doc live here: **living** docs are kept current; **historical** docs are dated point-in-time
snapshots, preserved for decision history (each carries a banner pointing to the current state).

| Doc | Kind | Purpose |
|-----|------|---------|
| [`PILOT-READINESS.md`](./PILOT-READINESS.md) | 🟢 Living (current) | Where the build actually stands: T0–T13 scorecard and the gates. Cloud is now **provisioned + deployed**; what's left is founder/vendor wiring + a dev build. **The source of truth for status.** |
| [`FOUNDER-RUNBOOK.md`](./FOUNDER-RUNBOOK.md) | 🟢 Living (current) | Post-launch founder action list: the **create account → set secret → flip flag** wiring for the live service (WhatsApp BSP OTP, Didit KYC, Firebase/FCM, OTEL). **The source of truth for what the founder does next.** |
| [`QA-TESTING.md`](./QA-TESTING.md) | 🟢 Living (current) | How to exercise the **entire** flow end-to-end on real devices against the live API **without** the WhatsApp/Didit vendors (opt-in, fail-safe QA mode), plus the flip-to-launch checklist. |
| [`NEXT-STAGE.md`](./NEXT-STAGE.md) | 🟢 Living | The **Ship** stage plan: founder-side GCP provisioning runbook (Track F — now executed), code-side ship-prep (Track A — done), and the buildable-now hardening pass (Track B). Sequencing + exit criteria. |
| [`CONCEPT.md`](./CONCEPT.md) | 🟢 Living | Product concept & one-month plan — the north star. inDrive-style customer-priced courier; matchmaker, not a payment processor. Forward-looking sections annotated with build status. |
| [`DESIGN.md`](./DESIGN.md) | 🟢 Living | Design system + UX spec (tokens, components, §5c journey, the full two-sided IA) and the `DT1`–`DT13` build-task status table. |
| [`design/`](./design/) | 🟢 Living | Mockups + assets — all-flows PNG boards + HTML + tokens. See [`design/README.md`](./design/README.md). |
| [`REFERENCE-ARCHITECTURES.md`](./REFERENCE-ARCHITECTURES.md) | 🟢 Living | How inDrive/Gojek/Grab/Chowdeck build the same primitives, and the Lynia scale-up ladder. |
| [`BACKLOG.md`](./BACKLOG.md) | 🟢 Living | Deferred work, each with its trigger. Items move out as they ship. |
| [`G-BRAIN-STRATEGY.md`](./G-BRAIN-STRATEGY.md) | 🟢 Living | How to use the "G Brain" (Google AI / Gemini on Vertex AI) — addressing, trust/safety, support, pricing — additively on the existing GCP spine; phased behind the cloud work. |
| [`CEO-REVIEW.md`](./CEO-REVIEW.md) | 🟠 Historical (plan stage) | Strategy/economics pressure-test of the concept, pre-build. |
| [`ENG-REVIEW.md`](./ENG-REVIEW.md) | 🟠 Historical (plan stage) | Engineering architecture review — offer-loop concurrency, realtime, auth — pre-build. |
| [`CEO-REVIEW-CHECKPOINT.md`](./CEO-REVIEW-CHECKPOINT.md) | 🟠 Historical (build checkpoint) | A mid-build CEO review; **superseded by `PILOT-READINESS.md`**. |
| [`REVIEW-GCP-PROVISIONING.md`](./REVIEW-GCP-PROVISIONING.md) | 🟠 Historical (ship stage) | Engineering/cloud review of the Terraform provisioning (`infra/terraform/`), pre- and post-apply. |
| [`REVIEW-SHIP-PREP.md`](./REVIEW-SHIP-PREP.md) | 🟠 Historical (ship stage) | Eng + design review of the ship-prep increment (release workflow, GCS V4 signing, x-user-id gate, skeletons). |
| [`REVIEW-SHIP-FOLLOWUPS.md`](./REVIEW-SHIP-FOLLOWUPS.md) | 🟠 Historical (ship stage) | Three-lens triage of post-launch follow-ups (mobile cutover executed; the rest founder/vendor-gated or deferred). |

## Reading order

- **Just want the status?** → `PILOT-READINESS.md`.
- **What does the founder do next?** → `FOUNDER-RUNBOOK.md`. **Want to test the live flow now?** → `QA-TESTING.md`.
- **New to the project?** → `CONCEPT.md` (what & why) → `DESIGN.md` + `design/` (how it looks) →
  `PILOT-READINESS.md` (where it stands).
- **Decision history / rationale?** → the 🟠 historical reviews.

> Methodology: built with the gstack sprint flow (Think → Plan → Design → Build → Review → Test → Ship);
> see the repo root `CLAUDE.md`.
