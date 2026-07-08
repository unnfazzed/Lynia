# LyniaGo — Customer Journey: Gap & Edge-Case Audit

**Scope:** Customer journey only (the 34 screens on *LyniaGo Customer Journey Map*).
**Method:** Screen-by-screen design + engineering review against the offer-loop model, walking the happy path, every branch, and the failure/interruption states each screen can hit.
**Date:** 4 Jul 2026 · **Reviewer:** Design systems
**Confirmed constraints (this review respects these):**
- Payment is **cash on delivery only**, and **Lynia is not a party to it** — once customer and rider agree a price in-app, cash is settled directly between the two. **Lynia is not involved in payment and does not handle payment disputes.**
- **Lynia is not liable for non-delivery** — sending is **at the customer's own risk**. This is made explicit via a **liability disclaimer shown before the customer confirms Broadcast**.
- Riders can **accept _or_ counter** a price.
- **The customer can cancel as in the current design** (cancel-with-reason → cancelled). Cancelling after pickup is allowed; since sending is at the customer's own risk and payment is off-platform, any parcel already collected is settled between customer and rider.

> ℹ️ There was no "G Stacks" rubric supplied, so this uses a standard severity-scored audit. If you share the G Stacks template I'll re-cut the findings into it.

---

## Severity legend

| Tag | Meaning | Bar |
|---|---|---|
| **P0** | Launch-blocker | A real user hits this in a normal week and the journey breaks or money/trust is lost. |
| **P1** | High | Common edge case with an ugly or dead-end outcome. |
| **P2** | Medium | Real but less frequent; workaround exists. |
| **P3** | Later | Growth / polish / nice-to-have. |

**Type:** **D** = design/UX gap · **E** = engineering/logic gap · **D+E** = both.

---

## Coverage scorecard

| Act | Happy path | Branches | Failure/edge | Verdict |
|---|---|---|---|---|
| 0 · First run / auth | ✅ solid | ⚠️ partial | ❌ thin | OTP & permission-denied recovery missing |
| 1 · Compose | ✅ solid (post-redesign) | ⚠️ partial | ❌ thin | No validation/limit states, no "out of area" |
| 2 · Auction | ✅ offers-only | ⚠️ **counter-offer missing** | ⚠️ partial | Negotiation loop absent though it's a core mechanic |
| 3 · Track | ✅ solid | ⚠️ partial | ❌ **thin** | Rider bail & undeliverable are unhandled |
| 4 · Close | ⚠️ minimal | ❌ none | ❌ none | Payment out of scope (settled off-platform); rating depth + PoD absent |
| Cross-cutting | — | — | ❌ | Safety/SOS, liability disclaimer, order-level support |

**Headline:** the happy path is in good shape. The risk is concentrated in **Act 3 failure states** (rider bail, undeliverable) and the **missing auction counter-offer loop** — both reachable in an ordinary delivery. Payment is now cleanly **off-platform**, so the remaining money-side work is a single **pre-broadcast liability disclaimer**, not a payment surface.

---

## 🎯 Priority clusters (you flagged these three)

### A. Cancellation & failure states

| ID | Finding | Type | Sev |
|---|---|---|---|
| **F-01** | **Rider bails after assignment.** We handle *customer* cancel and the "rider just taken" race, but not a rider who accepts then cancels, or no-shows at pickup. Today the customer sits on an assigned order that will never move. **Need:** rider-cancelled state → auto re-broadcast (pre-filled, same price) → optional priority bump. | D+E | **P0** |
| **F-02** | **Undeliverable at drop-off.** Recipient unreachable, refuses, or address is wrong — parcel is physically on the rider. Liability sits with the customer (not Lynia), so no return-obligation on us — **but the order still needs a terminal "not delivered" state** to close the state machine; today it has none. | D+E | **P1** |
| ~~F-03~~ | ~~Cancel after pickup.~~ **Resolved — keep current design.** *Decision: the customer can cancel anytime, as the current cancel-with-reason → cancelled flow already does.* No locked state or return-leg logic needed; a parcel already with the rider is settled off-platform between the two parties (at the customer's own risk). | — | ✅ |
| **F-04** | **Prolonged GPS/connection loss vs. transient pause.** `track_paused` is the right muted treatment for a blip, but there's no escalation if the rider is dark for minutes — customer can't tell "reconnecting" from "something's wrong." | D+E | **P1** |
| **F-05** | **Wrong / missing hand-off OTP.** The 6-digit code is the delivery proof, but there's no "recipient doesn't have the code / entered it wrong" path, and no re-send-to-recipient beyond the customer re-issuing. | D+E | **P1** |
| **F-06** | **Cancellation reason → downstream use.** No fee logic needed (Lynia isn't in the money), but the free-text reason still has no use for **fault attribution / rider protection** (e.g. flagging riders who repeatedly cause pre-pickup cancels). Cancels before pickup are effectively free. | E | **P3** |

### B. Auction edge cases (counter-offers + price)

| ID | Finding | Type | Sev |
|---|---|---|---|
| **F-07** | **Counter-offer loop is missing entirely.** You confirmed riders can *counter*, but the auction screens only show flat offers to accept — there's no screen to review a counter (their price vs. yours), accept/decline/re-counter, or see the delta. This is a core mechanic with no UI. **Need:** counter-offer card variant + accept/decline, and a decision on whether the customer can counter back (1 round? unlimited?). | D+E | **P0** |
| **F-08** | **Raise price mid-auction.** "Nudge price" only exists *after* expiry. If no one's biting at 0:40, the customer should be able to bump the price live to attract riders instead of waiting to fail first. | D | **P1** |
| **F-09** | **All offers above your price.** If every rider counters higher, the "cheapest/best" sort and the RECOMMENDED marker need defined behaviour — is the recommended one still shown, and is the over-ask made obvious? | D | **P2** |
| **F-10** | **Auction resumption.** App closed / backgrounded / connection dropped mid-auction — does the 90s clock keep running server-side, and does the customer return to a live auction, an expired one, or a lost order? | E | **P1** |
| **F-11** | **Double-broadcast / double-submit.** Rapid taps or a retry-on-timeout could fire two orders. Needs idempotency + a guard state. — ✅ **Fixed** (PR #150): client-generated `idempotencyKey` (`app/home.tsx`, stable per compose attempt, `src/util.ts` `randomUuidV4`) + a partial unique index on `orders(customer_id, idempotency_key)`; `OrdersService.create` (`orders.service.ts`) returns the existing order on replay or on a concurrent-create race (`P2002` fallback). | E | **P2** |
| **F-12** | **Accepted rider cancels the counter before you confirm.** Race between "you accept their counter" and "they withdraw it" — related to `select_race` but for the negotiated price. | E | **P2** |

### C. Safety / SOS / report

| ID | Finding | Type | Sev |
|---|---|---|---|
| **F-13** | **No SOS / emergency action** on the live tracking screen. For an in-person courier handoff, a one-tap emergency/help control is table-stakes. | D | **P1** |
| **F-14** | **No "share my trip."** Customer can't share live status with a family member/recipient — a low-cost, high-trust safety feature. | D | **P2** |
| **F-15** | **No report-a-rider / block-a-rider.** After (or during) a trip there's no way to report misconduct or prevent re-matching with a specific rider. | D+E | **P2** |

---

## By-act findings (everything else)

### Act 0 — First run & auth

| ID | Finding | Type | Sev |
|---|---|---|---|
| A0-1 | **OTP resend + expiry.** No resend timer, no "code expired," no wrong-code lockout/rate-limit UI. WhatsApp delivery can lag — resend is essential. | D+E | **P1** |
| A0-2 | **Notifications-denied consequence.** If the user declines push, offers and arrival alerts can't reach a closed app — but nothing warns them or offers SMS fallback. | D+E | **P1** |
| A0-3 | **Location-denied recovery.** `no_gps` exists, but the tie from the permission-priming decline → manual-address path isn't drawn. | D | **P2** |
| A0-4 | **Session expiry / re-auth.** No defined behaviour when a returning user's session is invalid (silent re-login vs. OTP again). | E | **P2** |
| A0-5 | **Deep-link / cold-start into a live order.** Tapping a push while an order is mid-flight should land on tracking, not the splash→onboarding path. | E | **P2** |

### Act 1 — Compose (post address-redesign)

| ID | Finding | Type | Sev |
|---|---|---|---|
| A1-1 | **Out-of-service-area address.** No "we don't cover this area yet" state when pickup or drop-off falls outside coverage (service area not yet defined — see open question). | D+E | **P1** |
| A1-2 | **Prohibited & oversized items.** A motorbike can't carry everything. No size/weight ceiling, no banned-items notice (cash, hazardous, illegal, perishable). Liability + safety exposure. | D+E | **P1** |
| A1-3 | **Google Places failure / offline while searching.** The new search screen assumes Places responds. Needs an error/offline/no-results state and a pin-on-map fallback when search is down. | D+E | **P1** |
| A1-4 | **Price validation.** No guards for $0, below-viable, or absurdly high asking price; no "your price looks low, riders may not accept" nudge. | D | **P2** |
| A1-5 | **Declared-value over cap.** Field says max $150 but there's no error state when exceeded. | D | **P2** |
| A1-6 | **Same pickup == drop-off**, and **recipient phone == sender phone** — both should be caught before broadcast. | E | **P2** |
| A1-7 | **Edit / swap addresses.** No explicit swap-pickup-and-drop-off affordance or edit-after-set beyond re-tapping. | D | **P3** |
| **A1-8** | **Pre-broadcast liability disclaimer.** *(New — per decision.)* Before the customer confirms Broadcast, show a clear notice that sending is **at their own risk**, Lynia is **not liable for non-delivery**, and Lynia is **not involved in payment or payment disputes**. Needs an acknowledgement step (checkbox or accept-to-continue) so consent is recorded. | D+E | **P1** |

### Act 2 — Auction
*(Core edge cases covered in cluster B above.)*

### Act 3 — Track
*(Core failure states covered in cluster A above. Additional:)*

| ID | Finding | Type | Sev |
|---|---|---|---|
| A3-1 | **ETA slippage / rider delayed.** No "running late" communication when the rider stalls. | D | **P2** |
| A3-2 | **Contact the _recipient_.** Only the rider is callable; the sender may need to reach the recipient (or vice-versa) at drop-off. | D | **P3** |

### Act 4 — Close the loop

| ID | Finding | Type | Sev |
|---|---|---|---|
| ~~A4-1~~ | ~~Cash-paid confirmation.~~ **Resolved — out of scope.** Payment is strictly between customer and rider; Lynia does not confirm or reconcile it. Consent to this is handled by the pre-broadcast disclaimer (**A1-8**). | — | ✅ |
| A4-2 | **Rating is minimal.** Just a star row — no quick tags, comment, or submit/skip path. (Tip intentionally out of scope while cash-only.) | D | **P2** |
| A4-3 | **Proof of delivery / receipt.** Nothing beyond the OTP — no delivery confirmation record or shareable receipt. | D | **P2** |
| A4-4 | **Post-delivery dispute (non-money).** Money disputes are explicitly out of scope (Lynia not involved). A lightweight "report a problem" for parcel issues / rider conduct is still worth having as a trust signal — but not a resolution/refund obligation. | D | **P3** |

### Cross-cutting

| ID | Finding | Type | Sev |
|---|---|---|---|
| X-1 | **Order-level dispute/support.** Help routes to WhatsApp generically; you can't raise a dispute tied to a *specific* order with its context attached. | D+E | **P1** |
| X-2 | **Delete account.** Compliance/privacy requirement with no screen. | D+E | **P2** |
| X-3 | **Low-bandwidth resilience.** Zimbabwe network reality — no defined offline queue, retry, or degraded-map behaviour beyond the offline banner. | E | **P2** |
| X-4 | **Localization.** English only; Shona/Ndebele deferred (already flagged on map). | D | **P3** |
| X-5 | **Promo / referral codes.** No growth loop. | D | **P3** |

---

## Strategic recommendation (outside current constraints)

> **Payment scope note:** with A4-1 resolved, the entire payment / reconciliation / refund surface is **out of scope** for the customer app. The app's job ends at *price agreed*; cash and any money dispute are settled off-platform between customer and rider. Keep this boundary crisp in copy so users don't expect Lynia to mediate.

**EcoCash / mobile money.** You've set payment to cash-only, so it's out of scope for the build — but flagging clearly: in Zimbabwe, mobile money is the dominant payment rail, and cash-only will create change-making friction, dispute volume (see A4-1), and a safety concern (riders carrying cash). Worth a roadmap slot even if not v1.

---

## Suggested fix roadmap

**P0 — before launch (3 findings)**
F-01 rider bail → auto-rebroadcast · F-02 undeliverable terminal state · F-07 counter-offer loop. *(The ones a normal week will hit. A4-1 cash confirmation is resolved — payment is off-platform.)*

**P1 — fast-follow**
A1-8 pre-broadcast liability disclaimer *(quick win, high legal value)* · F-04 GPS-loss escalation · F-05 OTP failure · F-08 raise price mid-auction · F-10 auction resumption · F-13 SOS · A0-1 OTP resend · A0-2 notif fallback · A1-1 out-of-area · A1-2 prohibited items · A1-3 Places failure · X-1 order-level support.

**P2 / P3 — backlog**
Everything else above, in severity order.

---

## Open questions blocking design

1. **Counter-offers:** one round or unlimited back-and-forth? Can the *customer* counter back, or only accept/decline the rider's counter?
2. **Undeliverable:** liability is the customer's, but what does the app *show* as the terminal state, and does the rider record a reason (unreachable / refused / wrong address)? Drives F-02.
3. **Service area:** defined coverage boundary? Drives A1-1.
4. **Disclaimer:** simple accept-to-continue, or a checkbox the user must tick each time (vs. once at signup)? Drives A1-8.

**Resolved by product decisions (4 Jul):** cancellation → **customer can cancel anytime, current design kept** · cash-paid confirmation → **not needed, off-platform** · payment disputes → **not Lynia's** · non-delivery liability → **customer's own risk, disclaimed pre-broadcast**.
