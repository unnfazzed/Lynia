# Plan: Paynow top-ups for the biker wallet — UI flow first

Status: **DRAFT — waiting on the owner's calls in § 6**
Date: 2026-10-12
Scope: the biker's commission-wallet top-up (`app/wallet/top-up.tsx`, `src/ui/rider/TopUpFlow.tsx`, the
Money tab's pending notices). This plan covers the **UI flow**. Backend work is listed only where the UI depends on it.

> **This reverses an earlier owner call.** `docs/plans/2026-rider-wallet-design.md` Premise 4 / D2 said
> "No Paynow / aggregator", and the plan was to integrate EcoCash directly. Choosing Paynow now removes the Econet merchant
> onboarding, which was that build's critical path. Record the reversal there when this plan is approved.

---

## 1. What Paynow gives us (from developers.paynow.co.zw)

Paynow has two ways to take a payment. Only one of them fits a phone app with no browser step.

| Mode | Endpoint | How the payer approves | Fit |
|---|---|---|---|
| **Express checkout** (server-to-server) | `POST /interface/remotetransaction` with `method` + `phone` | It depends on the method (below). The payer never leaves our app, apart from InnBucks | ✅ **Primary** |
| Web checkout (hosted page) | `POST /interface/initiatetransaction` → `browserurl` | The payer is sent to Paynow's own page | Fallback only. The page is off-brand and isn't in any mock |

Express checkout `method` values: `ecocash`, `onemoney`, `innbucks`, `omari`, `vmc` (Visa/Mastercard token), `zimswitch` (token).
Each method has to be enabled on the integration ID. **USD and ZWG are separate integrations.** The wallet is USD-only
(Premise 2), so we use one USD integration.

**What the payer does differs by method. This drives the whole UI plan:**

| Method | What Paynow returns | What the biker does | Fits the drawn T4? |
|---|---|---|---|
| **EcoCash** | `status=Ok`, `pollurl`, `instructions` | A USSD prompt appears on their handset and they enter their PIN | ✅ Yes, exactly as drawn |
| OneMoney | Same as EcoCash | Same as EcoCash | ✅ Yes, but it isn't drawn on T1 |
| **InnBucks** | `authorizationcode`, `authorizationexpires` (`d-MMM-yyyy HH:mm`) | They open the InnBucks app with the code (deep link `com.innbucks.customer://purchase?paymentToken=<code>`), or scan it as a QR code, then approve there | ❌ Needs a new T4 state |
| **O'mari** | `otpreference`, `remoteotpurl` | They get an OTP by SMS and type it **into our app**. We post it to `remoteotpurl`. After 5 wrong OTPs the transaction is cancelled | ❌ Needs a new T4 state |
| Card (`vmc`/`zimswitch`) | Express checkout needs a saved token. The first payment has to go through the hosted page with `tokenize=true` | Card details on Paynow's page | ❌ Not drawn. Skip it |

The result arrives in two ways, and we use both:

1. Paynow POSTs status changes to our **`resulturl`** and retries up to 10 times. Each message carries a SHA512 hash that we must
   validate: the field values concatenated in order, plus the integration key, as uppercase hex.
2. We POST to the **`pollurl`** to confirm. If we never got a `pollurl` (for example after a timeout), we query
   `/interface/trace` with our `merchanttrace` instead.

Paynow statuses map onto our existing `TopupStatus` like this:

| Paynow `status` | Our `TopupStatus` | Biker sees |
|---|---|---|
| `Created`, `Sent` | `pending` | T4 Approve |
| `Paid`, `Awaiting Delivery`, `Delivered` | `succeeded` (via `creditFromTopup`) | T5 Done |
| `Cancelled`, `Failed`, an immediate `Error` (e.g. "Insufficient balance"), 5 bad O'mari OTPs | `declined` | T6 Failed |
| No answer before our window closes | `expired` | T6 Failed. A late `Paid` still credits exactly once, because `expired` can still be confirmed |
| `Refunded`, `Disputed` | Handled by ops in admin; no biker UI | — |

**Test mode** (every new integration starts here, and go-live needs at least one successful test):
`0771111111` succeeds in 5 s, `0772222222` succeeds in 30 s, `0773333333` is cancelled after 30 s, and `0774444444` fails at once
with insufficient balance. Together they cover T4 → T5, a slow T4 → T5, T4 → T6, and T3 → T6, so QA can drive every state in this plan.

---

## 2. What already exists, and why most of it doesn't change

The repo was built for a live payment rail to drop in later:

- **UI:** Rider v2 **T1–T6** (`handoff/rider-v2/`, ledger D-54) is fully built in `TopUpFlow.tsx`: Provider → Amount →
  Phone → Approve, then Done or Failed. The Money tab shows **M10–M12** pending notices when the app closed during T4.
  The **"Top up to keep riding" gate** (G14) leads into T1. Since 2026-10-12 (#1154) it no longer fires on a balance floor
  (`COMMISSION.lowBalanceBlockBelow` is 0). It fires when the server refuses a job with `commission_low_balance`, because
  the job's commission is more than the biker's balance. That check runs on a bid, on the customer's pick and on a dispatch
  accept, and is skipped during the biker's first 10 jobs. **Settings › Top-up number** prefills T1 and T3.
- **Data:** `useTopUp` already opens the intent, polls `GET /wallet/topups/:id` every 2.5 s, keeps a durable
  recovery marker, and renders a success **only when the server says `succeeded`**.
- **Backend seam:** `PaymentRail` (`apps/api/src/adapters/payments/payment-rail.interface.ts`) is bound to an inert
  `StubPaymentRail`. `WalletService.creditFromTopup` is the exactly-once credit path, and nothing calls it yet. That is why
  every top-up today runs down its 90 s and comes back `expired`.

So **for EcoCash, the approval flow itself needs no UI change.** The only UI change is the fee lines from the owner's decision that the biker pays the fee (§ 3). A `PaynowRail` behind the seam, plus a `resulturl`
handler that calls `creditFromTopup`, makes T4 → T5 work as drawn. InnBucks and O'mari are the only parts that need new UI.

---

## 3. The UI flow, screen by screen

```
Money tab ──"+ Top up"──┐
G14 gate ──"Top up now"─┤   (G14 = a job was refused with commission_low_balance)
                        ▼
   T1 Provider ─► T2 Amount ─► T3 Phone ─"Request $5.00"─► POST /wallet/topups
                                                                 │
                       ┌─────────────────────────────────────────┼──────────────────────────┐
                       ▼                                         ▼                          ▼
              T4  EcoCash (drawn)                  T4b InnBucks (NEW)          T4c O'mari (NEW)
              "Approve $5.00 on your phone"        code + "Open InnBucks"      OTP boxes + "Confirm"
              90 s countdown                       countdown to code expiry    90 s countdown
                       │                                         │                          │
                       └──────────────► server status ◄──────────┴──────────────────────────┘
                                         │            │
                                   succeeded     declined / expired
                                         ▼            ▼
                                     T5 Done      T6 Failed
                                         │            │
                                   Back to Money   Try again → T1 · Call support

App closed during T4/T4b/T4c → next open, Money shows M10 (went through) / M11 (waiting) / M12 (didn't go through)
```

### T1 Provider: no change
Three drawn radio cards: EcoCash, InnBucks, O'mari, each with the sub-line "Approve on your phone". The default comes from Settings.
- Paynow also supports **OneMoney** and **cards**, but neither is drawn. Not drawn ⇒ not rendered. Adding them needs a
  design export (see § 6, Q3).
- The sub-line "Approve on your phone" is accurate for EcoCash. For InnBucks it's roughly true: you approve in the InnBucks app. For O'mari it's
  wrong, because you type a code into Lynia. If T4c ships, ask design for a per-provider sub-line.

### The biker pays the 2.5% transaction fee (owner decision, 2026-10-12)
The owner decided the biker absorbs Paynow's fee, and the copy says so. The rules every screen below follows:
- **The amount the biker types is what reaches their balance.** `minTopUp` $5 and `maxTopUp` $50 still bound that amount.
- **The fee is 2.5% of that amount, rounded up to the cent:** $5 → $0.13, $10 → $0.25, $20 → $0.50, $50 → $1.25.
- **The amount charged is the amount plus the fee:** $5.13 … $51.25. Our server sends that amount to Paynow, so it is the amount on the EcoCash prompt.
- **The rate is served by the server, never hardcoded.** Add `topupFeePct` to `GET /wallet/config` (`CommissionConfig`), the same way
  `ratePct` is served, and make it per rail, since InnBucks and O'mari rates aren't published yet. One shared helper,
  `topupFee(amount, pct)` in `@lynia/shared`, is used by the app to preview the fee and by the server to set the charge.
  The `TopUp` record stores `amount` (credited), `fee` and `charged`.
- **Paynow's own "add fees on top" setting stays OFF**, so the integration is set to merchant-pays. Otherwise Paynow would add its
  2.5% on top of our already-grossed-up amount and charge the biker twice. Because Paynow takes its 2.5% from the $5.13, Lynia
  nets about 0.06% less than the credit, about $0.03 on a $50 top-up. That is the price of the copy reading exactly "2.5%".
  Grossing up to a true net, $5 → $5.13 but $50 → $51.29, would make the shown fee 2.56% and contradict the copy.
- When Paynow confirms a payment, the server checks that the paid amount equals `charged`, then credits `amount`.

None of these lines is drawn in the rider-v2 handoff. Per the pixel-parity rules they need a **`docs/DESIGN-DEVIATIONS.md` entry
(D-102)** recording this owner decision and the exact copy, landed with the build PR. The proposed copy is below.

### T2 Amount: one new line
The big amount stays the amount **to the balance**. Under the quick chips, above the existing `amountHint`, one muted 13/18 line:
> **"Transaction fee 2.5%: $0.13. You pay $5.13."**

It updates live as the amount changes, and is hidden while the amount is invalid, just like the chips' selected state.

### T3 Phone: the CTA shows what will be charged
- The CTA becomes **"Request $5.13"** (`requestCta(charged)`): the amount the EcoCash prompt is about to show.
- The existing `phoneHint` stays. Above the field, one muted line repeats the split, so the biker sees it at the moment they commit:
  > **"$5.00 to your balance + $0.13 transaction fee (2.5%)."**

Paynow requires `phone` for every mobile-money method, InnBucks included, so the step stays for all three.
The server normalises `077…` to the format Paynow expects. The biker never types `+263`.
**Paynow's `authemail` is required for express checkout, but it is not a field the biker fills in.** Bikers sign up with a phone,
not an email. The server sends the merchant account's email, as Paynow's test mode requires. **No email field gets added to the UI.**

### T4 Approve, EcoCash: as drawn, now actually works
- Title `waitT(charged)`: **"Approve $5.13 on your phone"**. It must equal what the EcoCash prompt shows, or the biker will think
  they're being overcharged. Body `waitB` ("Check for the EcoCash prompt or SMS on 077… and enter your PIN").
- A 90 s `Countdown` and progress bar. EcoCash's USSD prompt times out within that window, and Paynow's slow test case
  succeeds at 30 s.
- If the call fails immediately (insufficient balance, an invalid number), the flow goes **straight to T6** and never shows T4. The server marks the intent
  `declined` on Paynow's `status=Error`, and the existing poll picks that up on its first read.

### T4b Approve, InnBucks: **NEW, not drawn yet**
InnBucks doesn't push a prompt. Paynow returns an **authorisation code**, and the biker approves it inside the InnBucks app.
The proposed state, inside the same `CentreState` frame as T4 so it reads as the same step:
- Title "Approve $5.00 in InnBucks".
- The **code**, large and grouped. Reuse the existing CodeCard / `CodeBoxes` look from order-flow-v2 rather than inventing one.
- A primary button **"Open InnBucks"** that deep-links with `com.innbucks.customer://purchase?paymentToken=<code>`. If the app isn't installed, a
  secondary line says "Or enter this code in InnBucks".
- Optional: the code as a **QR** for the "scan" path. Paynow suggests it, but it only helps if the biker is paying from a second
  phone, so it's low value.
- The countdown follows **`authorizationexpires`**, not the 90 s window. InnBucks codes last minutes, not seconds. This
  changes the server: the intent's `expiresAt` is set from Paynow's expiry for this rail.
- Leaving for InnBucks backgrounds our app. That's fine: the durable marker plus the poll on return (and M10–M12 if the OS
  killed us) already cover it.

### T4c Approve, O'mari: **NEW, not drawn yet**
O'mari sends the biker an **OTP by SMS**, and they type it **into Lynia**:
- Title "Enter the O'mari code". The body names the SMS and shows Paynow's **`otpreference`**, so the biker can match it to the right
  SMS.
- **OTP boxes**: the existing `CodeBoxes` primitive, with SMS autofill (`textContentType="oneTimeCode"` / Android SMS
  retriever) where the platform allows it.
- CTA **"Confirm"**, which calls a new `POST /wallet/topups/:id/otp`. The server posts it to `remoteotpurl` and never lets the
  client reach Paynow.
- Wrong code: an inline error under the boxes and "N tries left" (Paynow cancels after 5). The 5th wrong code goes to T6.
- A correct code goes to the spinner (T4-style "Confirming…") until the server reports `succeeded`, then T5.

### T5 Done / T6 Failed: no change
T5's `okB` keeps the **credited** amount, "$5.00 added. Your balance is $12.60.", because that is what the balance moved by. T4b's
title and T4c's amounts use `charged`, like T4.
The drawn copy already fits Paynow's outcomes. T6's `failB` ("The prompt timed out or was declined. Nothing was taken
from your EcoCash.") stays true, because Paynow only debits on approval.
For later, if design wants it: a reason-specific T6 line for "Insufficient balance". Paynow returns that reason, and
`PaymentRailResult.reason` already carries it. It isn't drawn, so it isn't in this plan.

### Money tab M10–M12, G14, Settings: no change
They read the same `pendingTopUp` and `TopupStatus`. A Paynow top-up's ledger row shows `lTop("EcoCash")` with the
Paynow reference as the receipt `meta`, so the biker can quote it to support. The row's amount is the credit (+$5.00). Its
`meta` adds **"You paid $5.13 (incl. 2.5% fee)"**, so the receipt reconciles with the biker's EcoCash statement. M10–M12 keep the
credited amount.

---

## 4. Phasing (recommended)

**Phase 1: EcoCash through Paynow. Backend, plus the fee lines on T2, T3 and T4 (§ 3).**
1. Write `PaynowRail implements PaymentRail`: `initiate` calls `remotetransaction`, `confirm`/`reconcile` POST the `pollurl` (or `trace`), and every
   outgoing and incoming message is SHA512-hashed. The raw payload is kept, as the seam requires.
2. Add `POST /webhooks/paynow/result`, which validates the hash, re-polls to confirm, then calls `creditFromTopup` (already exactly-once).
3. Add a sweep that polls still-`pending` intents in case a `resulturl` delivery is missed.
4. Add an env selector (`PAYMENT_RAIL=paynow|stub`), `PAYNOW_INTEGRATION_ID`/`KEY` (USD), and a kill-switch flag.
5. QA with the four test numbers; each one lands on its T-state. Then ask Paynow to go live.

What's still open in Phase 1 is what InnBucks and O'mari do on T1 before their T4 states exist (§ 6, Q1).

**Phase 2: InnBucks (T4b) and O'mari (T4c).** This needs a design export first.
- Get T4b and T4c drawn (and T1's per-provider sub-line), either as a rider-v2 addendum or a small `topup-paynow-v1` handoff.
  They follow that export verbatim, per the pixel-parity rules.
- Contract: `Topup` gains optional `authCode`, `authExpiresAt`, `otpReference`, `otpTriesLeft`. Add `POST /wallet/topups/:id/otp`.
- `TopUpFlow` branches T4 on `rail`. `useTopUp` gains `submitOtp`.

**Phase 3 (only if wanted): OneMoney and cards.** OneMoney reuses T4 exactly and only needs a T1 card drawn. Cards need the
hosted-page tokenise step, which is a bigger UX decision.

---

## 5. What must not change

- The success is read from the server, never guessed: T5 only on `succeeded`. Keep `useTopUp`'s contract.
- No Paynow key, hash or `pollurl` ever reaches the app (Paynow's own rule). The app only talks to `/wallet/*`.
- No in-app withdrawals or refunds (Premise 1). A Paynow `Refunded` is an admin action.
- Visible copy says "biker" (D-101). The code keeps `rider`.

---

## 6. Owner decisions needed

1. **InnBucks and O'mari in Phase 1.** Choose one:
   (a) Ship EcoCash live first. InnBucks and O'mari stay on T1, and choosing one opens a **"Coming soon, use EcoCash or call support"**
   state. That state isn't drawn, so it needs a ledger entry.
   (b) Hide them on T1 until T4b and T4c are drawn. That also needs a ledger entry, since it removes drawn elements.
   (c) Hold Phase 1 until T4b and T4c are drawn, and ship all three together. *Recommended if design can turn them around quickly;
   otherwise (a).*
2. ~~**Paynow's fee: who pays it?**~~ **DECIDED (owner, 2026-10-12): the biker pays it, and the copy states the 2.5% fee.**
   See § 3, "The biker pays the 2.5% transaction fee". Still open: confirm the InnBucks and O'mari rates with Paynow, and
   approve the proposed copy for the D-102 ledger entry.
   **The rates** (paynow.co.zw/Home/Fees, read 2026-10-12): **EcoCash 2.5%**, a flat percentage with no fixed part, the same as
   OneMoney and Telecash. Cards are 3.5% + 50c. InnBucks and O'mari aren't listed, so confirm those with Paynow. Paynow's
   page confirms the merchant can absorb the fee, add it on top, or split it.
   With no fixed part, the minimum top-up doesn't need to change. A $5 top-up costs Lynia $0.13, $10 costs $0.25, $20 costs $0.50 and $50 costs $1.25.
   Top-up money is prepaid commission, so absorbing the fee lowers Lynia's net commission revenue by 2.5% across the board.
   Against the real policy (`COMMISSION` in `packages/shared/src/policy.ts`, owner 2026-10-12: **10%** of what the biker
   earns, after their first 10 jobs, live rate from `COMMISSION_RATE_PCT`), the effective take is **~9.75%**. A $5 top-up
   (`minTopUp`) covers $50 of biker earnings. `minTopUp` $5 and `maxTopUp` $50 are code constants, and the server clamps to them.
   *(Superseded by the owner's decision above; kept for the record.)* How Lynia would have absorbed it: set the integration so the merchant pays the fee, request the biker's exact amount, credit the
   **gross** amount Paynow reports as paid (not the net settled to the bank), and book the gross-minus-net difference as a
   processing cost at reconciliation.
3. **OneMoney and cards.** Add them to T1 (needs a design export), or leave them out? *Recommended:* leave them out for now, because EcoCash
   dominates the pilot corridor.
4. **Record the reversal of D2** ("no Paynow") in `2026-rider-wallet-design.md` and the ledger.
5. **Paynow account:** a USD integration ID with EcoCash (plus InnBucks and O'mari for Phase 2) enabled, and the merchant login email for
   `authemail`. The integration keys go into the API's secret store, never into the repo.

## Sources

- Paynow Developer Hub: https://developers.paynow.co.zw/docs/paynow/quickstart/
- Initiate a transaction: https://developers.paynow.co.zw/docs/paynow/initiate_transaction/
- Express checkout: https://developers.paynow.co.zw/docs/paynow/express_checkout_transactions/
- Status update: https://developers.paynow.co.zw/docs/status_update.html
- Polling: https://developers.paynow.co.zw/docs/paynow/polling_status/
- Generating a hash: https://developers.paynow.co.zw/docs/paynow/generating_hash/
- Test mode: https://developers.paynow.co.zw/docs/paynow/test_mode/
- Fees: https://www.paynow.co.zw/Home/Fees
