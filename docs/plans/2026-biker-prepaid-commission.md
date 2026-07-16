# Biker prepaid per-ride commission — implementation plan

**Branch:** `claude/biker-commission-system-31ptfk`
**Status:** SUPERSEDED — the wallet has since been built per
[`2026-rider-wallet-design.md`](2026-rider-wallet-design.md) (APPROVED 2026-07-13), which explicitly
supersedes this plan's phasing while keeping its data-model sketch as a starting point (see that
doc's Context section). This doc is kept for its original policy/data-model reasoning; treat
`2026-rider-wallet-design.md` as current for what actually shipped (`apps/api/src/wallet/*`).
**Source of truth for the model:** [CONCEPT §6](../CONCEPT.md) (revenue model — rider commission),
[`packages/shared/src/policy.ts`](../../packages/shared/src/policy.ts) `COMMISSION`.

## Context

The revenue model is decided (CONCEPT §6): Lynia takes a **percentage of the amount paid on each
completed parcel delivery** — a rider-side commission (inDrive-style), **not** a customer surcharge.
Commission is **0% for the launch period** (~6–8 months) while the pilot builds supply, demand and
liquidity; riders keep the full agreed fare.

This plan pins down **how commission is collected** once the rate turns on, and confirms one decision:

> **Collection model = prepaid per-ride.** The biker pre-funds a **commission account**; each completed
> ride debits `perRideCommission(amountPaid)` from that balance. When the balance drops below a floor,
> the rider is gated from going online until they top up.

This **supersedes** the earlier post-paid **weekly cash-settlement** idea (the `SETTLEMENT` engine),
whose code + admin surface have been removed in favour of this model. A prepaid float fits a cash,
low-trust market better: no per-rider credit risk, no weekly collection/chasing, and the balance can
never go negative because a rider with too little float simply cannot accept new rides.

**We are not building the wallet yet.** This change lands only the *policy* (rate + gating thresholds
as a single source of truth) and *honest UI copy*. The balance ledger, top-ups and payment rails are a
later phase (Phase 2/3 below).

## What landed in this change (no wallet)

The prepaid per-ride model at 0% now **fully overrides** the old weekly cash-settlement model — every
surface that presented the abandoned 15% weekly billing was replaced, not left running alongside it.

*Policy + rider app:*

1. **`packages/shared/src/policy.ts`** — new `COMMISSION` block: `model: "prepaid_per_ride"`,
   `ratePct: 0` (launch), `lowBalanceBlockBelow`, `minTopUp`; plus `perRideCommission(amountPaid)`
   (0 at the launch rate, so nothing is deducted). The old `SETTLEMENT` const + `commissionOn` helper
   (the 15% weekly rate) were **deleted** — one source of truth, no contradicting rate.
2. **`apps/mobile/app/earnings/index.tsx`** — the earnings explainer now describes the real direction:
   0% today, and *later* a per-ride commission deducted from a **pre-funded commission account**.

*Admin console + API (the weekly model removed):*

3. **`apps/api/src/settlements/settlements.service.ts`** — the weekly engine (`generateForPeriod`,
   `currentWeek`, `recordPayment`, `autoPauseOverdue`, `weeklyPeriod`, refund-netting) was replaced by a
   single read-only **`commissionOverview()`**: rides + fares per rider over a trailing 7-day window and
   the commission that would accrue at the current rate ($0 at 0%). No money is billed, settled or paused.
4. **`apps/api/src/admin/admin.controller.ts`** — dropped `POST cash/settlements/:id/pay` and
   `POST cash/settlements/auto-pause`; `GET cash/settlements` now returns the overview.
5. **`apps/admin`** — `cash/page.tsx` reworked to a "Commission" overview (rate, rides, fares, accrued —
   no record-payment / overdue / due-date / refund-netting); `RecordPayment.tsx` + `cash/actions.ts`
   deleted; sidebar label `Cash` → `Commission`; rider detail's "Cash owed / settlement overdue" →
   "Commission · 0% at launch · prepaid per ride"; `adminTypes` swapped `Settlement*` for `Commission*`.
6. **`apps/api/src/admin/admin.service.ts`** — rider detail returns `commission: "0.00"` (was `cashOwed`);
   removed the now-moot "settlement already paid" fare-adjust guard (no settled periods exist any more).
7. **`apps/api/prisma/schema.prisma`** — the `Settlement` table is marked **dormant** (no code touches
   it). Left in place to avoid a destructive migration; dropped/repurposed when the wallet is built.

Everything is inert at `ratePct: 0` — no money moves, no new gate, no schema migration.

## Target data model (Phase 2 — the wallet)

New tables, added only when monetization begins. Money as `Decimal(10,2)`, matching `Order.agreedFare`.

- **`CommissionAccount`** (1:1 with `Rider`) — `riderId` (PK/FK), `balance` (default 0), `currency`,
  `status` (`active` | `blocked`), `updatedAt`. The prepaid float.
- **`CommissionLedger`** — append-only entries: `id`, `riderId`, `orderId?`, `type`
  (`topup` | `ride_commission` | `adjustment` | `reversal`), `amount` (signed: credit +, debit −),
  `balanceAfter`, `note`, `createdAt`. Every balance change is one immutable row → auditable, and
  `balance` is always reconstructable by summing the ledger (the account row is a cached running total).
- **`enum CommissionAccountStatus { active blocked }`**, **`enum CommissionEntryType { … }`** in
  `schema.prisma` + a migration (mirror the existing `SettlementStatus`/migration style).

Idempotency: the per-ride debit is keyed on `(riderId, orderId, type=ride_commission)` unique, so a
retried completion webhook never double-charges.

## Target flow (Phase 2)

1. **Debit on completion.** In the order-completion path (where a ride reaches `completed`), compute
   `perRideCommission(amountPaid)`. At `ratePct: 0` this is `0` → skip. When > 0, in the **same
   transaction** that completes the order: write a `ride_commission` ledger row and decrement
   `CommissionAccount.balance`. Never block completion of a ride already delivered — a debit that would
   cross zero still records; the *gate* below stops the rider taking the **next** ride.
2. **Low-balance gate.** Add `commission_low_balance` to the rider online-gate reasons
   (`apps/mobile/src/logic/gates.ts` + the API online-gate check). A rider whose `balance <
   COMMISSION.lowBalanceBlockBelow` is `blocked`: cannot go online / accept, sees a "Top up to keep
   riding" state. Clears (hysteresis) once a top-up lifts the balance back over the floor.
3. **Top-up (Phase 3).** A credit ledger row + balance increment via the chosen rail (Paynow / EcoCash /
   cash-at-agent). Rate-agnostic; the wallet UI (balance, top-up, per-ride commission history) reads
   the ledger. `minTopUp` floors it.

## Turning it on

Flip `COMMISSION.ratePct` from `0` to the calibrated take-rate in `policy.ts` — one line. Deduction
logic, gate and UI copy already reference it, so nothing else changes to start charging (assuming the
wallet from Phase 2 is live).

## Phasing

- **Phase 1 (this change).** Policy single-source-of-truth + honest UI copy + the admin console/API
  migrated off the weekly model onto the read-only commission overview. `ratePct: 0`. No wallet.
- **Phase 2 (wallet core).** `CommissionAccount` + `CommissionLedger` + migration; per-ride debit in the
  completion transaction; low-balance online-gate; rider balance/history UI on the earnings screen;
  admin visibility. Still shippable at `ratePct: 0` (exercises the plumbing, debits are 0). This is also
  where the dormant `Settlement` table is dropped or repurposed for the ledger (one destructive migration).
- **Phase 3 (top-ups + rails).** Payment-rail integration for pre-funding; top-up UI; then calibrate and
  raise `ratePct`.

## Out of scope (surfaced, not silently built)

Payment-rail integration, the top-up transaction, the balance ledger tables/migration, the low-balance
gate wiring, reconciliation/reporting, refund interaction with prepaid commission, and dropping the
dormant `Settlement` table — all Phase 2/3, per "we are not building the wallet yet." The vendored admin
design mockups (`packages/design/ui_kits/admin/*.html`) still show the old weekly model and are a
non-functional follow-up.

## Definition of done (this change)

`pnpm --filter @lynia/shared build`, `pnpm typecheck`, `pnpm build` pass; `COMMISSION` is the single
source of truth for the rate/gating; nothing is deducted at `ratePct: 0`; the earnings copy describes
the prepaid per-ride model accurately without promising a wallet that isn't built.
