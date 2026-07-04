# LyniaGo — Rider Journey: Gap & Edge-Case Audit

**Scope:** Rider journey only (the 41 screens on *LyniaGo Rider Journey Map*).
**Method:** Screen-by-screen design + engineering review against the offer-loop model and the repo
contracts, walking the happy path (install → sign in → KYC → online → offer → job → hand-off →
earnings) and every branch, failure and interruption each screen can hit. Companion to
`CUSTOMER-JOURNEY-AUDIT.md`.
**Date:** 4 Jul 2026 · **Reviewer:** Design systems

**Confirmed constraints (this review respects these):**
- **One phone-first account, two roles.** A rider signs in exactly like a customer (phone + WhatsApp OTP), then becomes a rider via KYC. No separate app.
- **KYC is the gate.** A rider cannot go online until a national ID + bike are verified (partner: **Didit**, selfie liveness). Consent is recorded at submit.
- **Payment is cash, off-platform.** Riders keep the full agreed fare during the launch period (no commission); Lynia is **not** a party to payment. Earnings is a *record of work*, not a wallet or payout balance.
- **Riders can accept _or_ counter** the customer's price (fare + ETA), one offer per order.
- **Non-delivery is the customer's own risk.** A parcel that can't be delivered stays with the rider and is settled off-platform; the app still needs a terminal state to close the machine.

---

## Severity legend

| Tag | Meaning | Bar |
|---|---|---|
| **P0** | Launch-blocker | A rider hits this in a normal week and the journey breaks or trust/safety is lost. |
| **P1** | High | Common edge case with an ugly or dead-end outcome. |
| **P2** | Medium | Real but less frequent; workaround exists. |
| **P3** | Later | Growth / polish / roadmap. |

**Type:** **D** = design/UX gap · **E** = engineering/logic gap · **D+E** = both.

---

## Coverage scorecard

| Act | Happy path | Branches | Failure/edge | Verdict |
|---|---|---|---|---|
| 0 · First run / sign in | ✅ solid | ⚠️ partial | ❌ thin | Shares customer OTP gaps (resend, session) |
| 1 · Become a rider (KYC) | ✅ solid | ✅ failed + expired | ⚠️ partial | Re-verify path good; document-refresh reminders missing |
| 2 · Go online / board | ✅ solid | ✅ empty + missed | ⚠️ partial | No demand hint; no "why am I not getting orders" |
| 3 · Make an offer | ✅ accept + counter | ✅ not-chosen | ⚠️ partial | Counter re-counter loop & bid-expiry undefined |
| 4 · Active job | ✅ solid | ✅ wrong-code, undeliverable, bail, offline | ⚠️ partial | SOS absent; no ETA-slip / running-late |
| 5 · Earnings | ✅ lean (by decision) | ✅ new-rider empty | ✅ | Intentionally minimal — cash off-platform |
| 6 · Account | ✅ solid | — | ⚠️ | Delete-account & edit-bike route to support only |
| Cross-cutting | — | — | ❌ | SOS/report, order-level support, low-bandwidth queue |

**Headline:** the happy path and the four core Act-4 failure states (wrong code, undeliverable,
bail, mid-job connection loss) are all **designed on the map**. The concentrated risk now is
**safety (no rider SOS/report)** and **the counter-offer negotiation loop's undefined rules** —
both reachable in an ordinary shift.

---

## 🎯 Priority clusters

### A. Job failure & interruption states  *(all designed on the map — these are the follow-ups)*

| ID | Finding | Type | Sev |
|---|---|---|---|
| **R-01** | **Rider bail after accepting.** *Designed* (`job_bail` → re-broadcast at same price + reliability-score warning). **Follow-up:** define the actual score maths and the threshold that trips a hold (see R-13), and whether a bail *after pickup* differs from before pickup (parcel is now on the bike). | D+E | **P0** |
| **R-02** | **Undeliverable terminal.** *Designed* (`undelivered`, reason recorded: unreachable / refused / wrong address; parcel stays with rider, off-platform). **Follow-up:** does recording "wrong address" feed back to the customer or fault-attribution? Is there a max-hold time before the parcel is deemed abandoned? | D+E | **P1** |
| **R-03** | **Wrong / missing hand-off OTP.** *Designed* (`handoff_wrong`, inline error + attempts-left, 5-attempt lockout, customer re-issues). **Follow-up:** what does the rider *do* while locked out — can they request the customer re-issue from inside the job, or only wait? Needs a "ask customer to re-send" affordance. | D+E | **P1** |
| **R-04** | **Connection lost mid-job.** *Designed* (`job_offline`, muted "live paused", job persisted locally, syncs on reconnect). **Follow-up:** escalation if dark for minutes (mirror the customer F-04) — the rider should know "still saved" vs "something's wrong," and the customer's tracking should reflect it. | D+E | **P1** |
| **R-05** | **Going offline *deliberately* mid-job.** Distinct from a dropped socket: what if the rider taps "Go offline" or closes the app while holding a parcel? Should be blocked or warned ("you have an active job"), not silently allowed. | D+E | **P1** |

### B. The offer / counter loop

| ID | Finding | Type | Sev |
|---|---|---|---|
| **R-06** | **Counter re-counter rules undefined.** The rider can counter (`offer_compose`), and the customer can accept/decline (customer F-07). But: can the customer *counter back*? Is it one round or a negotiation? The rider has no "your counter was countered" screen. Decide the round count and design the rider's side of it. | D+E | **P1** |
| **R-07** | **Bid expiry on the rider side.** The customer's auction window is 90s. What does the rider see when that window closes with their bid unpicked — does `not_chosen` cover expiry too, or is "auction expired, nobody was picked" a distinct state? Today it's implicit. | D+E | **P2** |
| **R-08** | **Customer picks you, then cancels before you confirm.** Race between `picked` and the customer bailing/cancelling. The rider could open a job that's already dead. Needs the rider-side mirror of the customer `select_race`. | E | **P2** |
| **R-09** | **Offer edit / withdraw.** Once sent (`offer_sent`), the rider is locked in — no way to withdraw a bid if they realise they can't make it, short of ignoring the win. A withdraw (with a light penalty) is cleaner than a post-win bail. | D | **P2** |

### C. Safety / SOS / report

| ID | Finding | Type | Sev |
|---|---|---|---|
| **R-10** | **No rider SOS / emergency control** on a live job. A cash, in-person hand-off with a stranger is the highest-risk moment in the product and there's no one-tap help. Table-stakes. *(Flagged as a P1 gap on the map.)* | D | **P1** |
| **R-11** | **No report / block a customer.** No way to flag a customer for abuse, a no-show at pickup, or refusing to pay the agreed cash, or to avoid re-matching. | D+E | **P2** |
| **R-12** | **No "share my trip" for the rider.** A rider can't share a live trip with family for safety on a late/remote drop. Low-cost, high-trust. | D | **P3** |

---

## By-act findings (everything else)

### Act 0 — First run & sign in
Shares the customer app's auth surface, so it inherits the same gaps:

| ID | Finding | Type | Sev |
|---|---|---|---|
| R0-1 | **OTP resend + expiry + lockout** — no resend timer / "code expired" / rate-limit UI (customer A0-1). | D+E | **P1** |
| R0-2 | **Notifications-denied consequence.** A rider who declines push won't get new-order or "you were picked" pings — the whole value prop degrades silently. Warn + offer a fallback. | D+E | **P1** |
| R0-3 | **Deep-link into a live job.** Tapping a "you were picked" push should land on the job, not splash → onboarding. | E | **P2** |
| R0-4 | **Role discovery.** Nothing on the map shows *how* a customer-first user discovers "become a rider" (the role toggle lives in the kit header). Needs a real entry point in product IA. | D | **P2** |

### Act 1 — Become a rider (KYC)

| ID | Finding | Type | Sev |
|---|---|---|---|
| R1-1 | **Document-refresh reminders.** `kyc_expired` handles the *blocked* state, but there's no proactive "your ID expires in 30 days" nudge before it blocks a shift. | D+E | **P2** |
| R1-2 | **KYC resumption.** Rider closes the app mid-Didit-flow (it's an in-browser hand-off) — do they return to `kyc_pending` cleanly, or restart the form? | E | **P2** |
| R1-3 | **Partial / rejected fields.** Verification can fail on one field (bad ID photo but valid bike). Today `kyc_failed` is all-or-nothing; per-field guidance would cut re-submits. | D | **P3** |
| R1-4 | **Bike change / second bike.** No path to update the registered bike (bike sold, new plate) except "contact support" (noted on `bike_docs`). | D+E | **P3** |

### Act 2 — Go online & the board

| ID | Finding | Type | Sev |
|---|---|---|---|
| R2-1 | **Demand / heat-map hint.** No guidance on *where* to go for orders — riders idle-guess the busy corridors. *(P2 gap on the map.)* | D | **P2** |
| R2-2 | **"Why no orders" transparency.** `online_empty` reassures, but a rider far outside the service corridor should be told they're out of range, not just "quiet." Ties to the customer's out-of-area (A1-1). | D | **P2** |
| R2-3 | **Auto-offline / idle timeout.** Does a rider left "online" overnight stay bookable? Needs an idle-offline or heartbeat (repo ticket). | E | **P2** |
| R2-4 | **Board freshness / stale card.** `missed_order` handles the race, but a card for an order already assigned elsewhere should drop proactively, not only on tap. | E | **P2** |

### Act 3 — Make an offer
*(Core cases in cluster B.)*

| ID | Finding | Type | Sev |
|---|---|---|---|
| R3-1 | **Absurd counter guard.** No validation on a $0 / wildly-high counter fare or an impossible ETA. | D | **P3** |

### Act 4 — The active job
*(Core failures in cluster A; safety in cluster C. Additional:)*

| ID | Finding | Type | Sev |
|---|---|---|---|
| R4-1 | **ETA slippage / running late.** No way for a rider to signal a delay (traffic, breakdown) to a waiting customer. | D | **P2** |
| R4-2 | **Multi-stop / wrong-item at pickup.** If the parcel at pickup doesn't match the description, or there are extra items, there's no "this isn't what was described" branch. | D | **P3** |
| R4-3 | **Proof of delivery beyond OTP.** No photo/receipt option — the OTP is the only proof (mirrors customer A4-3). | D | **P2** |

### Act 5 — Earnings
Intentionally lean (cash off-platform). `earnings` + `earnings_new` cover the two real states. No
findings beyond the roadmap gaps below.

### Act 6 — Account & cross-cutting

| ID | Finding | Type | Sev |
|---|---|---|---|
| R6-1 | **Ratings & reliability dashboard.** The bail warning cites a reliability score the rider can never see — no acceptance rate, cancels, or rating trend. *(P2 gap on the map.)* | D+E | **P2** |
| R6-2 | **Delete account.** Compliance/privacy requirement, no screen (mirrors customer X-2). | D+E | **P2** |
| X-1 | **Order-level support.** Help routes to WhatsApp generically; a rider can't raise an issue tied to a *specific* job with its context. | D+E | **P1** |
| X-2 | **Low-bandwidth resilience.** No defined offline queue / retry for board + job sync beyond the offline banner (Zimbabwe 2G reality). | E | **P2** |
| X-3 | **Localization.** English only; Shona / Ndebele deferred. | D | **P3** |

---

## Roadmap gaps (flagged on the map, deliberately not designed)

| Gap | Sev | Note |
|---|---|---|
| **R-13 · Reliability dashboard** | P2 | The score exists in copy but has no surface — design it alongside the R-01 bail maths. |
| **R-14 · Demand / heat-map hint** | P2 | Cut idle time; show where orders are. |
| **R-15 · Multi-job queue** | P2 | Line up the next parcel while finishing the current one. |
| **R-16 · Rider SOS / report** | P1 | Safety on live cash hand-offs — highest-value gap. |
| **R-17 · Scheduled availability / shifts** | P3 | Set hours, peak reminders. |
| **R-18 · In-app payout / mobile money** | P3 | Cash-only by decision; EcoCash is the dominant rail — the finance spine of the superapp vision. |
| **R-19 · Incentives & bike-leasing hook** | P3 | Peak bonuses, streaks, and the credit / leasing upsell the long-term vision rests on. |

---

## Suggested fix roadmap

**P0 — before launch**
R-01 bail maths + reliability threshold (the score that trips a hold), plus the *after-pickup*
bail question. *(The failure UIs are designed; the missing piece is the logic behind the score.)*

**P1 — fast-follow**
R-16 rider SOS/report *(safety, highest value)* · R-06 counter re-counter rules · R-03 lockout →
ask-to-re-send · R-04 mid-job dark escalation · R-05 deliberate-offline-with-parcel guard · R0-1
OTP resend · R0-2 notif fallback · R0-4 role-discovery entry · X-1 order-level support · R2-2
out-of-range transparency.

**P2 / P3 — backlog**
Everything else above, in severity order, plus the roadmap gaps R-13…R-19.

---

## Open questions blocking design

1. **Reliability score:** what exactly counts (pre- vs post-pickup cancels, no-shows, low ratings), what's shown to the rider, and what threshold triggers `on_hold`?
2. **Counter loop:** one round or a back-and-forth? Can the customer counter the rider's counter — and if so, what's the rider's screen for it?
3. **Bail after pickup:** a parcel already on the bike — same re-broadcast flow, or a distinct "return the parcel" obligation given it's the customer's own risk?
4. **Deliberate offline with an active job:** blocked, warned, or allowed?
5. **Service corridor:** same boundary as the customer (drives R2-2 out-of-range).

**Resolved by product decisions (4 Jul):** payment → **cash, off-platform, no commission at launch** · earnings → **record of work, not a wallet** · KYC → **required gate, Didit partner, consent recorded** · non-delivery → **customer's own risk, terminal state + reason recorded** · counter-offers → **riders can accept or counter (fare + ETA)**.
