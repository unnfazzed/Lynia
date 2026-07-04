# LyniaGo — Backlog Execution Plan

**Scope:** everything left open after the 4 Jul seam resolutions — the remaining findings from `CUSTOMER-JOURNEY-AUDIT.md`, `RIDER-JOURNEY-AUDIT.md`, and the shared items in `INTERFACE-AUDIT.md`, sequenced for execution.
**Date:** 4 Jul 2026 · **Owner key:** **D** design (screens land on the journey maps) · **E** engineering · **D+E** both.
**Sizing:** **S** ≤1 day · **M** 2–3 days · **L** a week+ (design effort; eng sized separately).

**Sequencing principles**
1. **Pairs stay pairs.** Anything touching both roles (SOS, support, share-trip, PoD) is designed once, landed on both maps in the same wave — the interface audit showed what happens otherwise.
2. **Logic before polish.** Server-side auction integrity and the reliability score gate everything trust-related; they go first even though most are E-only.
3. **Decisions unblock waves.** Four product decisions (below) block specific waves — make each decision before its wave starts, not before the whole plan starts.
4. **Definition of done per item:** screens on the relevant journey map(s) + annotation, edge(s) drawn, audit finding marked resolved. E-items: contract written into `HANDOFF.md`.

---

## ⚠️ Blocking decisions (make before the wave that needs them)

| # | Decision | Blocks | Needed by |
|---|---|---|---|
| Q1 | **Service corridor** — the actual coverage boundary for launch | A1-1, R2-2 | Wave 3 |
| Q2 | **Reliability score maths** — what counts, what's shown, what threshold trips `on_hold` | R-01, R6-1 | Wave 1 |
| Q3 | **SOS behaviour** — what the button *does* (call 999, Lynia safety line, WhatsApp escalation?) | F-13, R-10 | Wave 1 |
| Q4 | **Localization scope** — Shona/Ndebele: launch, fast-follow, or later | X-4 | Wave 7 |

---

## Wave 1 — Trust & safety core *(the P0/P1 concentration)*

The three items every audit flagged as the concentrated risk, plus the score that gates rider accounts.

| Item | IDs | Type | Size | Notes |
|---|---|---|---|---|
| Reliability score + `on_hold` threshold | R-01, Q2 | E (+D copy) | M | Pure logic; `job_bail` warning and `on_hold` copy already exist — wire real numbers into them. |
| SOS on live trip — **both roles** | F-13 / R-10 (R-16), Q3 | D+E | L | One control, two placements: customer `track_active`, rider all Act-4 screens. Highest-risk moment is the cash hand-off. |
| Report / block after a trip — **both roles** | F-15 / R-11 | D+E | M | Rider side seeded by rate-the-sender (done); add report reasons + block-rematch. Customer mirror on `delivered_rate`/history. |
| Order-level support | X-1 (both) | D+E | M | "Get help with this trip" from any order/job screen → WhatsApp with order context attached. Kills the generic-help dead end. |

**Exit:** the two highest-severity map gap-flags (Rider SOS P1, reliability P2) close on both maps.

## Wave 2 — Auction & job integrity *(mostly E; makes Wave-1 trust real)*

| Item | IDs | Type | Size |
|---|---|---|---|
| Auction resumption (app closed / reconnect mid-window) | F-10 | E | M |
| Double-broadcast idempotency + guard state | F-11 | E | S |
| Pick/cancel race plumbing (both `select_race` + `job_cancelled` already designed) | F-12 / R-08 | E | S |
| Board freshness — assigned cards drop proactively | R2-4 | E | S |
| Deliberate go-offline / app-close with an active job → blocked with warning | R-05 | D+E | S |
| Offer withdraw before pick (light penalty; cleaner than post-win bail) | R-09 | D | S |
| Cancellation-reason → fault attribution feed (into Q2 score) | F-06 | E | S |

## Wave 3 — Compose guardrails *(customer Act 1; needs Q1)*

| Item | IDs | Type | Size |
|---|---|---|---|
| Out-of-service-area state + rider out-of-range transparency (**pair**, one corridor definition) | A1-1 / R2-2 | D+E | M |
| Prohibited & oversized items notice + size ceiling | A1-2 | D+E | M |
| Places failure / offline / no-results → pin-on-map fallback | A1-3 | D+E | S |
| Price validation ($0 / too-low nudge) + absurd-counter guard (**pair**) | A1-4 / R3-1 | D | S |
| Declared-value cap error state | A1-5 | D | S |
| Same pickup=drop-off, same-phone checks | A1-6 | E | S |
| Swap / edit addresses affordance | A1-7 | D | S |

## Wave 4 — Auth & resilience *(one shared surface — build once, both roles inherit)*

| Item | IDs | Type | Size |
|---|---|---|---|
| OTP resend timer + expiry + lockout | A0-1 / R0-1 | D+E | M |
| Notifications-denied consequence + SMS fallback | A0-2 / R0-2 | D+E | M |
| Deep-link / cold-start into live order / live job | A0-5 / R0-3 | E | S |
| Session expiry / silent re-auth | A0-4 | E | S |
| Location-denied → manual-address tie | A0-3 | D | S |
| Low-bandwidth offline queue + retry (Zimbabwe 2G reality) | X-3 / rider X-2 | E | L |

## Wave 5 — Live-trip quality & close-loop

| Item | IDs | Type | Size |
|---|---|---|---|
| Raise price mid-auction ("nudge" before expiry, not only after) | F-08 | D | S |
| All-offers-above-ask: sort + RECOMMENDED behaviour | F-09 | D | S |
| Running-late signal (**pair**: rider sends, customer sees ETA slip) | A3-1 / R4-1 | D+E | M |
| "This isn't what was described" branch at pickup | R4-2 | D | S |
| Proof of delivery — photo + shareable receipt (**pair**) | A4-3 / R4-3 | D+E | M |
| Rating depth: quick tags + comment + skip | A4-2 | D | S |
| Post-delivery "report a problem" (non-money, trust signal) | A4-4 | D | S |
| Share-my-trip (**pair**, customer + rider) | F-14 / R-12 | D+E | M |
| Contact-recipient row at drop-off | A3-2 | D | S |

## Wave 6 — Account, KYC & compliance

| Item | IDs | Type | Size |
|---|---|---|---|
| Delete account (**pair**, compliance) | X-2 / R6-2 | D+E | M |
| Reliability & ratings dashboard (needs Q2 from Wave 1) | R6-1 / R-13 | D | M |
| Role-discovery entry point ("become a rider" in customer IA) | R0-4 | D | S |
| KYC: doc-expiry reminders, mid-flow resumption, per-field failures | R1-1 / R1-2 / R1-3 | D+E | M |
| Bike change / second bike (self-serve, not support-only) | R1-4 | D+E | S |
| Manage saved places (add/rename/delete) | gap flag | D | S |

## Wave 7 — Growth & roadmap *(post-launch; keep as flagged gaps until scheduled)*

Demand heat-map hint (R-14/R2-1) · auto-offline idle timeout (R2-3) · multi-job queue (R-15) · multi-order customer view · scheduled delivery + rider shifts (R-17) · tip / re-book a rider · promo & referral (X-5) · localization Shona/Ndebele (X-4, per Q4) · edit order in flight · **EcoCash / mobile money (R-18)** — the superapp finance spine, biggest strategic item here · incentives & bike-leasing hook (R-19) · in-app chat.

---

## Suggested cadence

- **Waves 1–2 before launch** — they're the audits' P0/P1 concentration (safety, score, auction integrity). Everything already *designed* on the maps stays shippable meanwhile.
- **Waves 3–4 as launch fast-follows** (or pull A1-2 prohibited-items into Wave 1 if legal wants it at launch — it's a liability notice, cheap).
- **Waves 5–6 in severity order** once live feedback starts landing; **Wave 7** scheduled against growth goals.

**Standing rule:** every wave ends with the journey maps updated (screens + edges + gap-flags removed) and the three audits' findings marked resolved — the maps stay the single source of truth, and `INTERFACE-AUDIT.md`'s pair-wise discipline applies to every pair item above.
