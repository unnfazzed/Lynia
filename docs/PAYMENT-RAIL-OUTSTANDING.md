# Payment rails — what is wired, and what is still outstanding

> **One sentence, if you read nothing else:** LyniaGo still has **no payment-rail integration**. The
> only rail binding is an inert stub. Commission is now **live at 10%**, so a rider who runs out of
> balance can only top up by calling support, and an admin credits them by hand.

## Why this matters more now

Commission is on (`COMMISSION.ratePct = 10` in `packages/shared/src/policy.ts`; the server reads
`COMMISSION_RATE_PCT`). A rider pays nothing for their first 10 completed jobs. After that, each completed
job of any type debits 10% of what the rider earned from their prepaid balance. There is no minimum balance.
Instead, a rider can't take a job whose commission is more than their balance (`canCoverJobCommission`).
That check runs when they bid on a parcel, when a customer picks them, and when they accept a food or
shop dispatch.

So every active rider eventually needs money in their wallet, and the only way in today is a support
call. That is the whole gap this doc tracks.

---

## 1. What is wired

### 1.1 The only real money-in path: admin manual credit

`POST /admin/riders/:id/wallet-credit` → `WalletService.creditManual`, driven from the admin console's
rider page. It is audited and idempotent (`providerRef` is unique; a double-submit returns the
already-credited balance). Each credit is capped by `WALLET_MANUAL_CREDIT_CAP_USD` (default $50,
`apps/api/src/config/env.ts`). The rider reaches it by phoning support.

### 1.2 Rider top-up screen — a real client of an API that can't confirm

`app/wallet/top-up.tsx` → `src/ui/rider/TopUpFlow.tsx` (Rider v2 T1–T6, ledger D-54) is a genuine client
of the wallet API:

| Step | What actually happens |
|---|---|
| Provider / amount / phone | `POST /wallet/topups` with a per-attempt `idempotencyKey` (a retry returns the same pending intent). Throttled at 10/hour per rider. Amount bounds are `COMMISSION.minTopUp` / `maxTopUp` ($3 / $50). |
| Wait | polls `GET /wallet/topups/:id` while `pending`, until the server's `expiresAt` (90 s, `TOPUP_WINDOW_MS`) |
| Outcome | a success shows **only** on a server-reported `succeeded`; `declined` and `expired` are labelled as such |
| App killed mid-wait | a durable marker is reconciled on the next Money-tab open |

**The outcome is the server's to decide.** No sequence of taps produces a success the server did not
report. But nothing on the server ever confirms a top-up (§2.2), so every real attempt ends `expired`.

### 1.3 Restaurant, shop and pharmacy checkout — cash only

Order flow v2 is cash on delivery (ledger D-74). `FoodOrderService` refuses a new order with
`paymentMethod: "wallet"` (`wallet_not_accepted`). The `wallet` value stays in `MerchantPaymentMethod`
only so orders placed by old installs still parse.

The USSD paths on the API — `POST orders/:orderId/payment-reference`, `POST orders/:orderId/payment-prompt`
and `.../payment-prompt/check` in `apps/api/src/merchant/food-order.controller.ts` — still exist, but
**no client calls them** (no reference in `apps/mobile` or `apps/merchant`). They only apply to a
non-cash order, and none can be placed. Treat them as dormant. The prompt path drives the stub rail,
which always returns `pending`, so it can never mark an order paid.

---

## 2. Outstanding — the plumbing

### 2.1 There is no rail client

`apps/api/src/adapters/payments/` holds the `PaymentRail` interface and `StubPaymentRail`. The stub is
the default binding.

- [ ] **A live EcoCash client** implementing `PaymentRail` (`initiate` / `confirm`), enforcing the
      per-call timeout the contract documents (`PAYMENT_RAIL_DEFAULT_TIMEOUT_MS`). The stub does not.
- [ ] **Raw vendor-payload retention** next to the mapped `PaymentRailResult`. Mapped fields move money;
      the raw payload is the audit trail.
- [ ] **A kill switch / circuit breaker on live rail calls**, in the env-flag pattern
      ([ARCHITECTURE §14](ARCHITECTURE.md#14-background-jobs--self-healing), Core vs non-core).
- [ ] **InnBucks and O'mari** clients, or a decision that they stay manual-only. The shared contract
      (`packages/shared/src/contracts.ts`) calls `manual` the launch rail for InnBucks/O'mari and the
      fallback for EcoCash.
- [ ] **Inbound-event dedupe** by provider event id for any webhook the rail sends (ARCHITECTURE §13,
      idempotency inventory).

### 2.2 Nothing can confirm a top-up

- [ ] **`WalletService.creditFromTopup` has zero production callers.** It is the only code path that
      moves a `TopUp` to confirmed and credits the balance. It is implemented and fault-tested
      (`wallet-topup-faults.spec.ts`: duplicate delivery, mid-credit crash, CAS races). Nothing calls it.
- [ ] **Nothing sends a prompt to the rider's phone.** `POST /wallet/topups` opens the intent and stops.

**Wiring a poller or webhook that calls `creditFromTopup` is the one server change that makes the rider
top-up screen work.** No app change is needed: `succeeded` is already handled.

### 2.3 Until then

- [ ] Keep the call-support action (`onCallSupport` in `app/wallet/top-up.tsx`) on the top-up screen. It is the only path
      that works.
- [ ] Make sure support can reach an admin who can credit wallets quickly. A rider past their first 10
      jobs with an empty balance cannot take a job whose commission exceeds it.

---

## 3. Deployment notes

- **Nothing auto-ships.** A mobile change reaches testers only through a `mobile-release.yml` dispatch
  with an explicit `profile` (see `CLAUDE.md` and `docs/PLAY-STORE-SUBMISSION.md`).
- **There is no kill switch on the top-up screen.** `PAYMENT_SIMULATION_ENABLED` was removed (owner
  instruction). Retracting the screen needs a code change and a build or OTA.

## 4. Design parity

- The rail rows use a **neutral wallet mark, not rail logos**. No rail brand assets ship in the app.
  Real logos need a licensing decision before a rail goes live.
- Parity wiring for the top-up screens is tracked in `tools/parity/app-targets.mjs` and
  `tools/parity/parity-status.mjs`, not here.

---

## Related

- `docs/KNOWN_BUGS.md` → `DOC-16-02` (the original always-expires flow)
- `docs/archive/plans/2026-rider-wallet-design.md` — the wallet design brief
- `apps/api/src/adapters/payments/payment-rail.interface.ts` — the seam and its scope guardrails
- `apps/api/src/wallet/wallet.service.ts` — `creditManual`, `creditFromTopup`, the per-ride debit
