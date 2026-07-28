# LyniaGo — Payments & trust review (low-trust cash market)

> **Addendum (28 Jul 2026):** after this review, the founder revised the cash model to
> **collect-and-return** (rider fronts nothing; collects at the door; dual in-app confirmation
> unlocks the delivery code; rider returns the food cash to the merchant immediately). See
> `RESTAURANTS-DECISIONS.md` §7. That resolves **B-03** (the handshake now gates the code), retires
> **B-06** (the cash cap is dropped), and shifts the default risk in §2/§3 from rider float to
> merchant exposure. **Revision 3** removed all payment windows/auto-cancel in favour of a
> call-to-confirm step — retiring **B-08** (no window to expire) and **B-10** (the call replaces the
> auto-prompt). B-01, B-02, B-04, B-05, B-07 still stand.

Requested review, July 2026. Scope: the **customer flow** in `explorations/restaurants/Restaurants Vertical.html`
(checkout → pay → track → hand-off, files `r-customer-a.jsx` / `r-customer-b.jsx`), the payment logic in
`RESTAURANTS-DECISIONS.md`, benchmarked against **Glovo's cash-market operations**, patterns from
**Uber Eats / DoorDash / Grab / Gojek / Chowdeck**, and a competitive read of **SadieXpress** (Harare).
Numbered findings: **B-** = break in the shipped flow · **L-** = lesson to adopt · severity as in past reviews
(P0 loses orders/trust, P1 felt gap, P2 polish).

---

## 1 · Verdict

The payment spine is unusually honest for this category — pay-after-accept, no platform escrow, manual USSD
rail, references as evidence, rider float arithmetic. Nothing here needs to be torn up. But the flow still
designs the *rails* better than the *disputes*: the states where money is sent and can't be found, where cash
at the door comes up short, and where a refund SLA is breached are thin or missing — and in a low-trust
market those are the states people tell their friends about. Glovo's Africa ops lead names exactly this:
cash preference (especially first orders) creates fraud risk, failed deliveries, and reconciliation
friction — the cost centre is the exception, not the happy path.

---

## 2 · Breaks in the current customer flow

**B-01 · P0 — Currency/wallet ambiguity on every money screen.** Everything reads `$15.50`, but EcoCash
customers hold **USD and ZiG wallets**, and paying from the wrong one (or converting at a street rate) is
the classic Harare dispute. The pay screen, manual-rail card and merchant confirm never say *which wallet*.
*Fix:* stamp "USD wallet" on the PAY EXACTLY card, the manual-rail rows, and the reference form; design a
"wrong-currency payment" state (merchant sees a ZiG amount that doesn't match → names the gap, refund path).

**B-02 · P0 — "Merchant can't find your payment" is undesigned.** `pay_confirmed` promises "if they can't
find it we refund and cancel" — but if the customer mistyped the merchant number, the money went to a
stranger and **the merchant has nothing to refund**. There is no payment-not-found screen, no
wrong-number recovery guidance, no support hand-off with the reference attached. This is the single worst
outcome in the whole flow and it currently resolves to silence.
*Fix:* a designed `payment_not_found` state: what the merchant checked, the reference, "the money did not
reach Sadza Republic", and two paths — re-check the number you paid / start a trace with your rail (EcoCash
reversal request), with LyniaGo support looped in. Never promise a refund LyniaGo can't force.

**B-03 · P0 — Short payment at the door (CASH) is undesigned on the customer side.** The merchant has a
short-payment blocked screen at pickup; the door has nothing. The code is the only proof of delivery, and
the copy tells the customer to give it "when you have the food in your hands" — so a customer can take the
food, read the code, and hand over $12 of $15.50. The rider's only tool is refusing to enter the code while
holding nothing.
*Fix:* sequence the hand-off in the rider app — **cash counted → confirm amount → code field unlocks** (the
mirror of the merchant pickup confirm, D-07 grammar); a rider "customer paid short" state that logs the gap
and holds the order open; customer copy that says the rider confirms the cash *before* the code works.

**B-04 · P1 — The no-show delivery fee on CASH is uncollectable as designed.** `failed_noshow` says "only
the $2.50 delivery fee stands", and N-11 says the rider keeps the fee — but on a cash order the customer
has paid nothing and is unreachable. Who pays the rider tonight, and how is $2.50 ever collected?
*Fix:* decide and state it: LyniaGo fronts the rider's fee, and the $2.50 becomes a **debt on the customer's
account** — named on their next checkout ("$2.50 from order LG-4471 is added"), cash disabled until cleared.
That is also the missing enforcement tooth behind the no-show window.

**B-05 · P1 — Refund SLA breach has no screen.** `rejected` shows "Refund due by Today, 12:00"; nothing is
designed for 12:01. The doc says "escalated to support and flagged on the statement" — the merchant feels
that, the customer sees nothing.
*Fix:* an overdue state: "Sadza Republic is late — we've escalated and paused their new orders until it's
paid" (if that's the policy — a merchant who owes refunds and keeps selling is the trust leak), plus a
support thread with the reference pre-attached.

**B-06 · P1 — The cash cap is discovered too late.** A first-timer builds an $18 cart and only learns at
checkout that cash is locked. That's an abandoned cart, and it steers the *lowest-trust* user (Glovo: cash
preference is strongest on first orders) into prepaying a stranger.
*Fix:* surface the cap at the **cart** the moment a first-timer's goods pass $15 ("Keep it under $15 to pay
cash at the door") — the cart already re-totals honestly for OOS items, same banner grammar.

**B-07 · P1 — No change-making design on cash.** $15.50 due, the customer holds a $20 — small USD notes are
scarce in Harare and "no change" is a doorstep standoff. Glovo's rider guidance is literally "keep small
change"; Uber's cash markets ask the note at checkout.
*Fix:* an optional "Paying with" note picker at CASH checkout ($20 / exact / other) so the offer card warns
the rider to carry $4.50 change; a stated fallback when change fails (round down in customer's favour, or
change as a credit on their next order — pick one and print it).

**B-08 · P1 — The confirm window on manual payments is an undefined number.** `pay_confirmed` shows a ring
("1:50 to confirm") but no N-number defines how long a merchant has to match a reference, or what happens
when the 10:00 payment window expires *after* money has left the customer. Money-gone-order-dead must be
impossible: a submitted reference should **freeze the expiry clock**.
*Fix:* add N-19 (merchant confirm window, suggest 5:00, alarm-grade on the tablet) and the rule "a submitted
reference stops the order from expiring".

**B-09 · P2 — Mock bug: `pay_wait` timer reads "0:64".** 64 seconds rendered as `0:64` instead of `1:04`
(Ring label, R5·4). Trivially wrong, but it's a *money screen* — fix before anyone screenshots it.

**B-10 · P2 — Prompt could fire automatically on accept.** Pay-after-accept stacks 3:00 accept + push +
app-open + 90s prompt before cooking. Offer a checkout toggle: "Send the EcoCash prompt automatically when
they accept" — one less app visit, same trust model, and the 10-minute window starts working for the
customer instead of against them.

---

## 3 · Payment logic — what holds, what to add

**Holds under attack** (keep, and say so in the pitch):
- **Pay-after-accept with no escrow.** Slower than card checkouts, but correct where LyniaGo can't hold
  funds; nobody prepays a kitchen that hasn't said yes.
- **Merchant settled at hand-off.** The rider paying the merchant on collection is *instant settlement* —
  faster than Chowdeck's fast-settlement engine, which is credited as a core growth lever in Nigeria. This
  is a merchant-acquisition weapon; market it as one.
- **References as evidence, statements as truth.** "Trust your own statement, never a screen on someone
  else's phone" is the right doctrine for this market.
- **Rider headroom arithmetic** (declared float − cash tied up) shown on blocked offers.

**Add:**
- **Trust tiers instead of one binary cap (L-01).** Cash-market fraud practice (ex-Glovo/Foodpanda ops):
  blanket COD restrictions shrink supply and hurt growth; *dynamic* cash limits and trust tiers work
  better. Graduate the cap — $15 first order → $25 after 1 → $40 after 5 — and show the customer their own
  ladder ("2 more orders unlocks $40 cash"). Same for riders: headroom ceiling grows with completed volume.
- **Name the merchant on the prompt (L-02).** The EcoCash prompt shows a registered merchant name; tell the
  customer what name to expect ("The prompt will say *Sadza Republic t/a Chikwanha Foods*") — it's the one
  free anti-wrong-number check, and it converts the scary prepay moment into a verification ritual.
- **Rider cash-carry ceiling (L-03, from Glovo).** Glovo's rider wallet warns when cash-on-hand is too high
  and forces a deposit. Lynia's model is rider-owned cash so there's nothing to deposit — but the *safety*
  logic still applies: a rider carrying $80 of collected cash at 21:00 is a robbery target. A soft
  "you're carrying a lot — consider banking via EcoCash" nudge in the rider wallet is cheap.
- **Doorstep collusion awareness (L-04).** COD's long doorstep interaction is where courier–customer
  collusion grows. Lynia's rider-owned-float model already removes most platform loss, but the audit trail
  (logged calls, code timestamps, cash-confirm-before-code from B-03) is the evidence layer — keep it
  server-side and immutable.

---

## 4 · What Glovo does in cash environments (and what maps)

- **A cash ledger, not a vibe.** Glovo's rider Wallet tracks every movement: *payment* (paid at pickup),
  *collection* (taken at drop-off), *cash-out* (deposit), *payout* (auto adjustment) — so "who owes who"
  is always a number. Maps directly: Lynia's rider wallet should show the same four verbs for food orders,
  even though the float is the rider's own money.
- **Threshold-triggered cash-outs.** Too much cash on hand → forced deposit reminder. Maps as L-03 above.
- **Riders keep change; cash orders are flagged on the offer.** Both already partially present (CASH badge
  on offers); change is B-07.
- **Rider economics are watched per hour** and benchmarked against taxi/fast-food work — Lynia's rider
  earnings screen showing $/hour (P1-25 fix) is the same instinct; keep it.
- **What Lynia deliberately does better:** Glovo carries platform cash through riders and pays for it in
  reconciliation, fraud teams and deposit infrastructure. Lynia's rider-fronts-own-cash model externalises
  that entire cost — the trade is the float cap UX, which is why headroom/steering screens deserve the
  polish they got.

## 5 · Uber Eats / DoorDash / Grab / Gojek / Chowdeck — remaining gaps

Most of the classic gaps were closed in the last review (ETA before pay, photo-led list, plate number,
item-level accept, pickup code, kitchen board, safety row). Still worth taking:

- **L-05 (Gojek/Grab) — driver-visible payment state.** Both mark orders PAID vs COLLECT CASH in huge type
  on the rider's active job. Lynia has it on offers; keep it just as loud through every rider step (it is
  the difference between "collect $15.50" and an awkward doorstep re-negotiation).
- **L-06 (Chowdeck) — "Pay-for-me".** A second person pays the wallet leg remotely. In Zimbabwe this is a
  **diaspora order**: family in the UK pays, gogo in Harare gets dinner. Huge cultural fit, and Lynia
  Finance is the licensed entity that could eventually carry it. Park it on the roadmap as a named bet —
  don't design yet.
- **L-07 (Chowdeck) — staples-first discovery.** Chowdeck beat Jumia Food by leading with what people eat
  daily (amala/jollof), not pizza. The Sadza Republic-first content direction is right; make "local plates"
  the default sort, not a cuisine chip.
- **L-08 (Uber Eats/DoorDash) — say the ETA honestly or not at all.** Chowdeck's top Play-store complaint
  is stale ETAs. Lynia's confirmed-on-accept window is the honest version — never let growth pressure
  replace it with an optimistic constant.
- **Deliberately not copied** (restate, so nobody "fixes" them): stored-value customer wallet (Grab/Chowdeck
  hold money; Lynia can't yet — licensing), tipping, scheduled orders, in-app chat (proxied voice only).

## 6 · SadieXpress — competitive read

What's verifiable publicly: SadieXpress is a **taxi + courier + food delivery** brand in Harare — a
passenger ride app on Google Play/App Store, a vendor app, and a web ordering portal
(`delivery.sadiexpress.com`) listing Harare restaurants. Their published vendor flow is six steps, and
step 4 is telling: *"Restaurant gives a prepared dish to the courier and receives a payment"* — i.e. the
same **pay-at-handoff / courier-settles-merchant** model Lynia uses. Their pitch to vendors is generic
platform economics (reach, tracking, analytics, fleet outsourcing).

Read on their position:
- **Breadth-first, taxi-first.** One brand stretched across rides, parcels and food. The food product rides
  on a white-label-style multi-vendor web stack — functional, but nothing in it is designed for the
  exceptions this review is about (failed prompts, short cash, refund evidence, offline).
- **Where they're ahead:** live in market, both app stores, an existing driver fleet with taxi utilisation
  smoothing rider supply, and a vendor portal that already onboards restaurants.
- **Where LyniaGo wins if it ships what's designed:** (1) the *money spine* — manual rail, references,
  confirm states, refund evidence; nothing visible in SadieXpress addresses mobile-money failure at all;
  (2) 320px/2G/offline discipline; (3) designed exception states end-to-end (SadieXpress's web checkout is
  happy-path); (4) the trust copy system — naming mechanisms instead of asking for faith. The competitive
  strategy is not features, it's **being the app that never loses your money and always tells you why** —
  that reputation compounds in Harare word-of-mouth faster than a promo budget.
- **Watch:** their taxi fleet means they can subsidise delivery fees; Lynia's counter is the offer-loop
  price honesty and rider economics, not a fee war.

## 7 · Priority order

1. **B-02, B-03, B-01** — the three P0 money-dispute states (payment not found, short cash at door,
   USD/ZiG labeling). These are the review's reason to exist.
2. **B-04, B-05, B-08** — close the logic holes (no-show fee debt, refund overdue, confirm window N-19,
   reference-freezes-expiry rule).
3. **B-06, B-07, B-10** — cap at cart, change-making, auto-prompt toggle.
4. **L-01, L-02** — trust tiers + prompt-name verification (cheap, high trust yield).
5. **B-09** — fix the `0:64` timer label in `r-customer-b.jsx`.

## Sources

- TechCabal — Glovo Africa ops interview (May 2026): cash preference on first orders; fraud/reconciliation friction.
- Glovo Rider Hub (NG/KE/UG) — rider Wallet: payment/collection/cash-out/payout; high-cash-on-hand deposit reminders.
- Incognia "Fraud on the Go" (ex-Glovo/Foodpanda/Alibaba ops): dynamic cash limits, trust tiers beat blanket COD blocks; doorstep collusion.
- TechCabal / WeeTracker (Nov 2025) — Chowdeck bills/wallet super-app push; Afridigest — Chowdeck vs Jumia Food (staples-first); Medium analysis — fast vendor settlement as growth engine; Play-store reviews — ETA accuracy complaints.
- sadiexpress.com (vendor page, six-step flow), delivery.sadiexpress.com (Harare portal), Google Play — SadieXpress: Taxi & Delivery.
