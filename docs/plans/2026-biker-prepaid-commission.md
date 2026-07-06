# Biker prepaid per-ride commission — implementation plan

**Branch:** `claude/biker-commission-system-31ptfk`
**Status:** planning + policy/UI scaffolding landed; **wallet is NOT built in this change.**
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

This **supersedes** the earlier post-paid **weekly cash-settlement** idea (the `SETTLEMENT` engine in
`apps/api/src/settlements/*`, now marked legacy/dormant in `policy.ts`). A prepaid float fits a cash,
low-trust market better: no per-rider credit risk, no weekly collection/chasing, and the balance can
never go negative because a rider with too little float simply cannot accept new rides.

**We are not building the wallet yet.** This change lands only the *policy* (rate + gating thresholds
as a single source of truth) and *honest UI copy*. The balance ledger, top-ups and payment rails are a
later phase (Phase 2/3 below).

## What landed in this change (no wallet)

1. **`packages/shared/src/policy.ts`** — new `COMMISSION` block: `model: "prepaid_per_ride"`,
   `ratePct: 0` (launch), `lowBalanceBlockBelow`, `minTopUp`; plus `perRideCommission(amountPaid)`
   (0 at the launch rate, so nothing is deducted). The legacy `SETTLEMENT`/`commissionOn` weekly engine
   is retained but doc-commented as superseded. One source of truth — no magic numbers in consumers.
2. **`apps/mobile/app/earnings/index.tsx`** — the earnings explainer now describes the real direction:
   0% today, and *later* a per-ride commission deducted from a **pre-funded commission account**, with a
   per-ride commission line + balance appearing here when the wallet ships. Removes the stale
   "weekly settlement" framing.

Both are inert at `ratePct: 0` — no money moves, no schema change, no new gate.

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

- **Phase 1 (this change).** Policy single-source-of-truth + honest UI copy. `ratePct: 0`. No wallet.
- **Phase 2 (wallet core).** `CommissionAccount` + `CommissionLedger` + migration; per-ride debit in the
  completion transaction; low-balance online-gate; rider balance/history UI on the earnings screen;
  admin visibility. Still shippable at `ratePct: 0` (exercises the plumbing, debits are 0).
- **Phase 3 (top-ups + rails).** Payment-rail integration for pre-funding; top-up UI; then calibrate and
  raise `ratePct`.
- **Legacy cleanup.** Once Phase 2 lands, retire or repurpose the weekly `SETTLEMENT` engine and its
  admin cash console (or keep it purely for historical settlement records) so there is one commission
  model, not two.

## Out of scope (surfaced, not silently built)

Payment-rail integration, the top-up transaction, the balance ledger tables/migration, the low-balance
gate wiring, reconciliation/reporting, refund interaction with prepaid commission, and retiring the
weekly `SETTLEMENT` engine — all Phase 2/3, per "we are not building the wallet yet."

## Definition of done (this change)

`pnpm --filter @lynia/shared build`, `pnpm typecheck`, `pnpm build` pass; `COMMISSION` is the single
source of truth for the rate/gating; nothing is deducted at `ratePct: 0`; the earnings copy describes
the prepaid per-ride model accurately without promising a wallet that isn't built.
