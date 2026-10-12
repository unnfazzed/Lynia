# Plan: Paynow top-ups for the biker wallet — UI flow first

Status: **APPROVED (owner, 2026-10-12)**: Paynow, the biker pays a 2.5% fee, InnBucks and O'mari "Coming soon", current design first, and the copy in § 3.
Date: 2026-10-12
Scope: the biker's commission-wallet top-up (`app/wallet/top-up.tsx`, `src/ui/rider/TopUpFlow.tsx`, the
Money tab's pending notices). This plan covers the **UI flow**. Backend work is listed only where the UI depends on it.

> **This reverses an earlier owner call.** `docs/archive/plans/2026-rider-wallet-design.md` Premise 4 / D2 said
> "No Paynow / aggregator", and the plan was to integrate EcoCash directly. Choosing Paynow now removes the Econet merchant
> onboarding, which was that build's critical path. This plan supersedes that premise. Nothing in the code depends on it
> (`PaymentRail` is provider-agnostic), so the July doc is left as the historical record.

> **Design rule for this feature (owner, 2026-10-12):** *"we are using current design and if current design is not enough we
> do new screens."* Wherever the drawn Rider v2 top-up (T1–T6) covers a state, the app uses it as drawn. Where it doesn't (the fee
> lines, "Coming soon", the InnBucks and O'mari approve states), **we build the new screen or element ourselves** from the
> existing kit (`CentreState`, `CodeBoxes`, `CtaBar`/`CtaButton`, rider-kit `Chips`, tokens). We **don't wait for a design export**.
> Each new screen or element is recorded in one `docs/DESIGN-DEVIATIONS.md` entry (**D-103**), with its copy, so the guardrails still see it.

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

## 2. What the code does today (verified against `main` @ 2026-10-12, not the docs)

Every line below was read in the code. Where an older plan or doc says otherwise, the code wins.

**Mobile (`apps/mobile`)**
- `app/wallet/top-up.tsx` → `src/ui/rider/TopUpFlow.tsx` is the built T1–T6. Steps 1–3 are local state. Step 3's CTA is
  `RF.requestCta(amount)`, using the **client's** typed amount. T4 renders while `status` is `pending` or not yet known, with title
  `RF.waitT(topup?.amount ?? amount)` and a 90 s bar computed from the **shared constant** `TOPUP_WINDOW_MS`, not from the intent.
  T5 shows on `succeeded` only, and T6 on `declined | expired`.
- T1 maps `TOPUP_PROVIDERS` (`src/logic/rider-prefs.ts`: ecocash, innbucks, omari). Every card is always selectable, and there is **no
  disabled state**. The default comes from `prefs.topupProvider`, which is stored **on the device** (`lynia.riderPrefs.v1`).
- Settings › Top-up number (`app/settings/index.tsx:237`) uses the rider-kit `Chips` (`src/ui/rider/kit.tsx:470`), which has **no
  disabled prop**.
- `src/query/use-topup.ts` POSTs the intent, seeds the poll with the response, polls `GET /wallet/topups/:id` every 2.5 s while
  pending, invalidates the wallet on `succeeded`, and writes a device marker (`savePendingTopup`) that holds only the `topupId`.
- Money M10–M12 (`app/rider/(tabs)/money.tsx:230–234`) re-read that intent on mount (`reconcilePendingTopup`) and show
  `pending.amount`. That is the intent's `amount`.
- Entry points: Money's "+ Top up" (`money.tsx:293`, hidden for unverified bikers) and the `topup` gate (`app/rider/(tabs)/index.tsx:937`).
  The gate fires on the server refusal `commission_low_balance` (`src/logic/rider-gate.ts:70`) or on `floorApplies`.
- `src/api/wallet.ts` casts responses and does **not** zod-parse them, so new response fields don't break installed apps.

**API (`apps/api`)**
- `WalletController` (`wallet/wallet.controller.ts`): `GET /wallet/config`, `GET /wallet`, `GET /wallet/ledger`, `POST /wallet/topups`
  (throttled to 10/hour) and `GET /wallet/topups/:id`.
- `WalletService.createTopup` (`wallet/wallet.service.ts:377`): KYC-verified bikers only (`reason: "kyc"`); dedupes on
  `idempotencyKey`; **silently clamps** the amount to [`minTopUp` $5, `maxTopUp` $50]; inserts a `pending` row with
  `expiresAt = now + 90 s`. **It calls no rail.** Nothing is pushed to the phone.
- `getTopup` (`:407`) marks a row `expired` **only when someone polls it** after the window. There is no background expiry or
  reconcile job for top-ups.
- **Nothing ever writes `declined`.** The enum value exists, but no code path sets it.
- `creditFromTopup(topUpId, providerRef?)` (`:499`) moves `pending|expired → confirmed` by CAS and credits **`topUp.amount`**. It does
  **not** check the amount the rail reports. It has no production caller. `creditManual` is the only live credit path (admin).
- Ledger receipts are built server-side in `toEntry` (`:125`). A top-up row reads title "Top-up" and meta `RAIL_LABEL[rail]`
  ("EcoCash"). `providerRef` is selected but **not shown**.
- `PaymentsModule` (`adapters/payments/payments.module.ts`) **hard-binds** `StubPaymentRail`, and nothing injects `PAYMENT_RAIL`.
  The selector pattern to copy is `selectKycVendor` (`kyc/kyc.module.ts:14`) or `selectPush` (`adapters/push/push.module.ts:82`).
- Webhook precedent: `webhooks/bird` (`auth/bird-webhook.controller.ts`) and `/kyc/callback`. Controllers have no global auth guard
  (only `ThrottleGuard` is an `APP_GUARD`). `main.ts` already enables `rawBody` and the `urlencoded` body parser, which is what Paynow posts.
  The lost-webhook sweep to copy is `kyc/kyc-reconcile.service.ts` (`setInterval` reconcile timer).

**Schema and contracts**
- `TopUp` (`prisma/schema.prisma:500`): `rail`, `amount`, `phone` (stored **as typed**), `providerRef` (unique), `status`,
  `initiatedAt`, `expiresAt`, `resolvedAt`, `idempotencyKey`. It has **no** columns for a poll URL, fee, charged amount or raw rail payload.
- `Topup` wire type (`packages/shared/src/contracts.ts:822`, `.strict()`): `id, status, amount, rail, phone, expiresAt, createdAt`.
  `CreateTopupRequest` (`:838`) still accepts `innbucks|omari`. `CommissionConfig` has no fee field.
- `COMMISSION` (`packages/shared/src/policy.ts`): `ratePct` 10 (overridable by `COMMISSION_RATE_PCT`), `freeFirstJobs` 10,
  `lowBalanceBlockBelow` 0, `minTopUp` 5, `maxTopUp` 50.

**What this means:** the UI shell is real, but the money path behind it is not. Phase 1 is more backend work than "drop a rail into
the seam". It needs the first writer of `declined`, a top-up sweep, a migration and an amount check, as listed in § 4.

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

### T1 Provider: InnBucks and O'mari read "Coming soon" (owner decision, 2026-10-12)
Three drawn radio cards: EcoCash, InnBucks, O'mari. The default comes from Settings. In Phase 1:
- **EcoCash** stays as drawn: selectable, with the sub-line "Approve on your phone".
- **InnBucks and O'mari** keep their drawn card and position, but are **not selectable**. Their sub-line reads **"Coming soon"** in
  place of "Approve on your phone". They are drawn muted: no ring dot, the name in `--muted`, and the smartphone icon dropped.
  They carry `accessibilityState={{ disabled: true }}`, and a tap does nothing. They never open a dead-end state. This beats
  letting the biker pick one and then refusing it at T3/T4.
- **Defaults:** if Settings › Top-up number holds `innbucks` or `omari`, T1 opens on **EcoCash** instead. The Settings edit sheet's
  provider chips get the same treatment: InnBucks and O'mari show as disabled chips labelled "Coming soon". The server refuses
  `rail: innbucks|omari` on `POST /wallet/topups` until Phase 2, so an old app build can't open an intent on them either.
- In Phase 2 the label and the disabled state are removed, and the cards return to the drawn look.
- "Coming soon" isn't drawn, so it goes into the same **D-103** ledger entry as the fee copy.
- Paynow also supports **OneMoney** and **cards**. They're out of scope: the current design is "enough" without them (§ 6, Q3).
- The sub-line "Approve on your phone" is accurate for EcoCash. For InnBucks it's roughly true: you approve in the InnBucks app. For O'mari it's
  wrong, because you type a code into Lynia. When T4c ships, we write the per-provider sub-line ourselves (for example O'mari: "Enter the code we text you") and add it to D-103.

### The biker pays the 2.5% transaction fee (owner decision, 2026-10-12)
The owner decided the biker absorbs Paynow's fee, and the copy says so. The rules every screen below follows:
- **The amount the biker types is what reaches their balance.** `minTopUp` $5 and `maxTopUp` $50 still bound that amount.
- **The fee is 2.5% of that amount, rounded up to the cent:** $5 → $0.13, $10 → $0.25, $20 → $0.50, $50 → $1.25.
- **The amount charged is the amount plus the fee:** $5.13 … $51.25, and that is the amount on the EcoCash prompt.
- **Mechanism (owner preference): Paynow's "add fees on top" setting is switched ON.** Our server sends Paynow the amount the biker typed
  ($5.00), and Paynow adds its own 2.5%. This is simpler than computing the charge ourselves, and Lynia settles exactly $5.00, with no
  few-cent shortfall. **This must be verified before it's relied on.** Paynow's docs describe the setting for its own checkout page
  but don't say how it behaves for express checkout (`remotetransaction`). The Phase-1 test-mode run must confirm three things:
  (a) the fee is added on an express-checkout EcoCash request at all;
  (b) Paynow's rounding, using an odd amount such as $7.00 → $0.175, matches `topupFee` below;
  (c) which figure the status update's `amount` carries, $5.00 or $5.13.
  The `resulturl` check depends on (c). Test numbers show no real USSD prompt, so finish with one live $5 top-up on a real line and
  check that the prompt reads $5.13.
  **Fallback** if any of (a)–(c) fails: switch the setting OFF and have our server send the grossed-up amount itself. The copy is the
  same either way. Never have both on, or the biker pays the fee twice.
- **The rate is served by the server, never hardcoded.** Add `topupFeePct` to `GET /wallet/config` (`CommissionConfig`), the same way
  `ratePct` is served, and make it per rail, since InnBucks and O'mari rates aren't published yet. One shared helper,
  `topupFee(amount, pct)` in `@lynia/shared`, previews the fee in the app. It must match Paynow's own figure, which is what (b) checks.
  If Paynow ever changes its rate, `topupFeePct` changes with it, or the copy lies. The `TopUp` record stores `amount` (credited),
  `fee` and `charged`.
- When Paynow confirms a payment, the server checks the paid amount (against `amount` or `charged`, depending on (c)), then credits `amount`.

None of these lines is drawn in the rider-v2 handoff, so per the design rule above we add them as new elements in the drawn
screens' own style (muted 13/18 text, tokens only). They're recorded in **D-103** with the exact copy, which lands with the build PR. The proposed copy is below.

### T2 Amount: one new line
The big amount stays the amount **to the balance**. Under the quick chips, above the existing `amountHint`, one muted 13/18 line:
> **"Transaction fee 2.5%: $0.13. You pay $5.13."**

It updates live as the amount changes, and is hidden while the amount is invalid, just like the chips' selected state.

### T3 Phone: the CTA shows what will be charged
- The CTA becomes **"Request $5.13"** (`requestCta(charged)`): the amount the EcoCash prompt is about to show.
- The existing `phoneHint` stays. Above the field, one muted line repeats the split, so the biker sees it at the moment they commit:
  > **"$5.00 to your balance + $0.13 transaction fee (2.5%)."**

Paynow requires `phone` for every mobile-money method, InnBucks included, so the step stays for all three.
Today the server stores `phone` **as typed** (`CreateTopupRequest.phone` only requires 6–20 characters). Phase 1 adds normalisation to `07XXXXXXXX`
for Paynow in `PaynowRail.initiate`. The biker never types `+263`.
**Paynow's `authemail` is required for express checkout, but it is not a field the biker fills in.** Bikers sign up with a phone,
not an email. The server sends the merchant account's email, as Paynow's test mode requires. **No email field gets added to the UI.**

### T4 Approve, EcoCash: as drawn, now actually works
- Title `waitT(charged)`: **"Approve $5.13 on your phone"**. It must equal what the EcoCash prompt shows, or the biker will think
  they're being overcharged. Body `waitB` ("Check for the EcoCash prompt or SMS on 077… and enter your PIN").
- A 90 s `Countdown` and progress bar. EcoCash's USSD prompt times out within that window, and Paynow's slow test case
  succeeds at 30 s.
- If the call fails immediately (insufficient balance, an invalid number), the flow goes **straight to T6** and never shows T4. The server marks the intent
  `declined` on Paynow's `status=Error`, and the existing poll picks that up on its first read.

### T4b Approve, InnBucks: **NEW screen, built from the current kit**
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

### T4c Approve, O'mari: **NEW screen, built from the current kit**
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
`PaymentRailResult.reason` already carries it. It would be a new element under the design rule. It isn't needed for Phase 1, so it isn't in this plan.

### Money tab M10–M12, G14, Settings: no change
They re-read the intent via the device marker and show its `amount`, which is the credit. A Paynow top-up's ledger row is built
server-side (`WalletService.toEntry`): title "Top-up", meta `RAIL_LABEL[rail]` ("EcoCash"). Phase 1 extends that meta with the
Paynow reference, which is selected today but not shown, so the biker can quote it to support. The row's amount is the credit (+$5.00). Its
`meta` adds **"You paid $5.13 (incl. 2.5% fee)"**, so the receipt reconciles with the biker's EcoCash statement. M10–M12 keep the
credited amount.

---

## 4. Phasing (recommended)

**Phase 1: EcoCash through Paynow. Backend, plus the fee lines on T2, T3 and T4 (§ 3).** These are concrete changes against today's code:

*API*
1. `adapters/payments/paynow-rail.ts`: `PaynowRail implements PaymentRail`. `initiate` POSTs `remotetransaction` (with `method=ecocash`,
   the normalised phone, `authemail` = the merchant email, and a `merchanttrace` of our `topUpId`). `confirm` and `reconcile` POST the
   stored poll URL, falling back to `/interface/trace`. Every message is SHA512-hashed both ways, and a 10 s timeout is enforced
   (`PAYMENT_RAIL_DEFAULT_TIMEOUT_MS`).
2. `payments.module.ts`: replace the hard-bound stub with a `selectPaymentRail(env)` modelled on `selectKycVendor`. Add env keys
   `PAYMENT_RAIL=stub|paynow`, `PAYNOW_INTEGRATION_ID`, `PAYNOW_INTEGRATION_KEY` (secret store), `PAYNOW_AUTH_EMAIL` and
   `PAYNOW_RESULT_URL`. Production boot fails loudly if `paynow` is selected without them, like the existing `superRefine` guards.
3. `WalletService.createTopup`: refuse `rail: innbucks|omari` with a structured reason (Phase 1 "Coming soon"). After the insert,
   call `rail.initiate`, then persist `providerRef`, the poll URL and the raw payload. On `status=Error`, mark the row **`declined`**.
   That is the first writer of that status, and it moves the row by CAS from `pending`. The response then carries `declined`, and the app
   goes straight to T6.
4. `wallet/paynow-webhook.controller.ts`: `POST /webhooks/paynow`, modelled on `bird-webhook.controller.ts` (unguarded, `rawBody`,
   urlencoded). Validate the hash, re-poll, then:
   - `Paid`, `Awaiting Delivery` or `Delivered` → check the amount, then `creditFromTopup(id, paynowreference)`;
   - `Cancelled` or `Failed` → `declined`.
   Always answer 200 once the hash is valid, so Paynow stops retrying.
5. `wallet/topup-reconcile.service.ts`: a `setInterval` sweep, modelled on `kyc-reconcile.service.ts`. It polls `pending` and recently
   `expired` Paynow intents. Today expiry happens only when the app polls, so an intent from an app that was killed would otherwise stay
   `pending` in the DB forever.
6. **Amount check:** `creditFromTopup` credits `topUp.amount` blindly. The webhook and sweep must compare Paynow's reported amount
   first: against `amount` or `charged`, depending on the fee-mechanism test (§ 3, (c)). On a mismatch, don't credit; flag it for ops.
7. `toEntry`: top-up meta becomes "EcoCash · <paynow ref>", plus the fee line from § 3.

*Schema and contracts* (expand-only migration; additive optional fields; `pnpm contract:check` snapshot updated)
8. `TopUp`: add `pollUrl`, `fee`, `charged` and `railPayload` (jsonb), all nullable.
9. `Topup` wire type: optional `fee` and `charged`. `CommissionConfig`: optional `topupFeePct` (per rail). Installed apps ignore
   them, because `src/api/wallet.ts` doesn't parse responses.

*Mobile*
10. `TopUpFlow` T1: a disabled "Coming soon" card for InnBucks and O'mari. If `prefs.topupProvider` is one of them, fall back to
    EcoCash.
11. `TopUpFlow` T2, T3 and T4: the fee line, the split line, `requestCta(charged)` and `waitT(topup.charged)` (§ 3). Keep
    `okB(amount)`.
12. Rider-kit `Chips`: add a per-item `disabled` (and a "Coming soon" label). Use it in `app/settings/index.tsx:237`.
13. Copy goes in `src/ui/rider/copy.ts`, behind the D-103 ledger entry.

*QA*
14. Run the four Paynow test numbers through to T5, slow T5, T6 and immediate T6. Run the § 3 fee-mechanism checks, then one live $5
    top-up. Then ask Paynow to go live.

**Turning Phase 1 on (after the build PR merges).** Nothing changes until all of these are done; the default is
`PAYMENT_RAIL=stub`, which charges no one.
1. In Paynow, on the "LyniaGo" 3rd-party integration: make sure it is **USD**, **EcoCash** is enabled, and **"add fees on
   top" is ON** (`PAYNOW_FEE_MODE=paynow`).
2. Store the integration key as the secret **`PAYNOW_INTEGRATION_KEY`**: GCP Secret Manager, or Key Vault (`paynow-integration-key`)
   on Azure. Never in the repo or a Variable.
3. Set the repo Variables **`PAYNOW_INTEGRATION_ID`**, **`PAYNOW_AUTH_EMAIL`** (the Paynow merchant login email) and
   **`PAYNOW_RESULT_URL`** (`https://<api-host>/webhooks/paynow`), then **`PAYNOW_ENABLED=true`**, and deploy. The
   release preflight fails in seconds if any is missing.
4. In test mode, top up with the four test numbers (§ 1) and check the fee-mechanism questions (§ 3, (a)–(c)) in the
   Paynow dashboard. If Paynow doesn't add the fee on express checkout, set `PAYNOW_FEE_MODE=server` and turn Paynow's
   setting OFF. Then ask Paynow to go live, and do one real $5 top-up.

In Phase 1, InnBucks and O'mari show on T1 as "Coming soon" and can't be selected (§ 3 T1; owner decision, § 6 Q1).

**Phase 2: InnBucks (T4b) and O'mari (T4c).** We build these as new screens from the current kit (design rule above); there's no design export to wait for.
- Build T4b and T4c (and T1's per-provider sub-line) as described in § 3, reusing `CentreState`, `CodeBoxes`, `Countdown` and
  `CtaBar`. Add their copy to D-103.
- Contract: `Topup` gains optional `authCode`, `authExpiresAt`, `otpReference`, `otpTriesLeft`. Add `POST /wallet/topups/:id/otp`.
- `TopUpFlow` branches T4 on `rail`. `useTopUp` gains `submitOtp`.
- The window must become per intent. Today `createTopup` hardcodes `expiresAt = now + TOPUP_WINDOW_MS` (90 s), and `ApproveProgress`
  in `TopUpFlow.tsx` divides by that same constant. InnBucks needs `expiresAt` from Paynow's `authorizationexpires`, and the bar needs
  the intent's own start and end.

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

1. ~~**InnBucks and O'mari in Phase 1.**~~ **DECIDED (owner, 2026-10-12): they show as "Coming soon".** EcoCash ships live
   first. InnBucks and O'mari stay on T1 and in Settings as disabled "Coming soon" options (§ 3 T1) until T4b and T4c are drawn and
   built in Phase 2.
2. ~~**Paynow's fee: who pays it?**~~ **DECIDED (owner, 2026-10-12): the biker pays it, and the copy states the 2.5% fee.**
   See § 3, "The biker pays the 2.5% transaction fee". **Copy approved by the owner (2026-10-12)** for the D-103 ledger entry.
   Still open before Phase 2: confirm the InnBucks and O'mari rates with Paynow.
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
3. ~~**OneMoney and cards.**~~ **Out, following the owner's design rule (2026-10-12):** the current design draws EcoCash, InnBucks
   and O'mari, which is enough. Adding OneMoney later would be a new T1 card under the same rule.
4. ~~**Record the reversal of D2.**~~ **Not needed.** This plan records it (see the note at the top), and no code depends on the July premise.
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
