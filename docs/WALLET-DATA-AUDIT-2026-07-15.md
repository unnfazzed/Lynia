# Wallet, Earnings & Admin Data-Lifecycle Audit — 2026-07-15

First run of the wallet & data-lifecycle audit routine (`docs/ROUTINES.md`, lane `WD-`). Phase 0 confirmed
`docs/KNOWN_BUGS.md` carries no prior wallet/commission/earnings-specific findings — this is genuinely new
ground; the closest prior coverage is the deep-sweep's generic backend-concurrency/money-handling pass
(DS15) and the settlement-engine mootness note, neither of which touched the prepaid wallet build.

Four independent research passes audited the full money + reporting path: **A** rider wallet top-up
(`wallet.controller/service.ts`, `apps/mobile/app/wallet/*`), **B** per-ride commission debit
(`order-lifecycle.service.ts`, `wallet.service.ts`), **C** the rider earnings tab
(`apps/mobile/app/earnings/index.tsx`, `orders.service.ts`), **D** the admin dashboard's financial/reporting
surface (`admin-orders.service.ts`, `settlements.service.ts`, `wallet.service.ts`'s admin-facing methods).
Passes B and D independently converged on the same two root causes (WD-001, WD-002/003) from different
angles — cross-confirmation, not duplication.

**Two CRITICAL/HIGH-cluster findings** (the stopping rule does not apply): WD-001 is a genuine CRITICAL —
the schema's own documented invariant ("fare-adjust deltas append here at the ride's original rate") was
never implemented, leaving a fare-corrected completed order's commission debit permanently stale. All 11
findings below (1 CRITICAL, 3 HIGH, 3 MEDIUM, 4 LOW) are **fixed in this run**, each with a regression test.
`pnpm typecheck` + `pnpm lint` + 909 API tests (+16) + 383 mobile tests (+13) + `apps/api` build all green.
No findings were deferred — the two forward-looking, currently-dormant observations are recorded under
Suggestions instead of Findings because there is no live bug to fix yet (see below).

## Findings

| ID | Description | File:line | Severity | Confidence |
|---|---|---|---|---|
| WD-001 | `AdminOrdersService.adjustFare` never wrote a compensating `adjustment` ledger row when correcting the fare on an already-`completed` order — the schema's own design comment ("fare-adjust deltas append here at the ride's original rate so the one-ride_commission-row-per-order invariant stays absolute") was unimplemented. `creditAccount` (the only method that could write `adjustment`/`grace`) had zero callers anywhere in the codebase. A rider's wallet balance and every commission report would silently diverge from the corrected fare the moment commission activates. | `apps/api/src/admin/admin-orders.service.ts:156-184` (pre-fix) | CRITICAL | High — independently confirmed by two research passes (commission-debit and admin-dashboard audits), zero callers of `creditAccount` verified by repo-wide grep |
| WD-002 | `WalletService.creditManual` (admin manual wallet-credit, `POST /admin/riders/:id/wallet-credit`) wrote no `AuditLog` row at all — every other admin mutation in the codebase (order cancel/fare-adjust, rider/customer standing changes) writes its audit row inside the same transaction as the mutation; this one didn't write one anywhere. A dollar amount could move with zero recoverable attribution. | `apps/api/src/wallet/wallet.service.ts:414-458` (pre-fix) | HIGH | High — direct code read, no `auditLog.create` call anywhere in the method |
| WD-003 | `creditManual`'s idempotency guard was dead code: it pre-checked `CommissionLedger.idemKey`, a column this code path never wrote (only the unused `creditAccount` sets it). The real de-dup mechanism — `TopUp.providerRef @unique` — worked, but a genuine retry with the same `idempotencyKey` hit an uncaught Prisma `P2002`, which `AllExceptionsFilter` turns into a generic `500`, contradicting the endpoint's own documented "a double-submit is structurally harmless" guarantee. | `apps/api/src/wallet/wallet.service.ts:434-439` (pre-fix) | HIGH | High — traced end-to-end through the ledger-create call and the schema's unique constraint |
| WD-004 | The rider Earnings tab's total and trip count were computed by summing the client-side `/orders/history` page, which is capped at 50 rows **across both roles combined** (a 2026-07-15 UX fix for list payload size). A rider with more than 50 lifetime orders (mixing customer + rider activity) would see a silently truncated "what I earned" total and delivered-trip count, with no indication anything was omitted. | `apps/mobile/app/earnings/index.tsx:57-58` (pre-fix), `apps/api/src/orders/orders.service.ts:536-556` | HIGH | High — the 50-row cap's own code comment justifies it purely as a list-payload concern, which doesn't hold for a cumulative total |
| WD-005 | `OrderLifecycleService.rate()` (the customer-rating completion path) read `order.agreedFare` **before** the CAS `updateMany` that locks the row, then reused that pre-lock snapshot when calling `chargeCommission`. A concurrent admin fare-adjust landing in the gap between the read and the CAS (the CAS predicate doesn't include `agreedFare`) would let the commission debit charge on a fare the order no longer had. The sibling completion path, `completeOrder()`, already re-reads `agreedFare` **after** its CAS for exactly this reason — `rate()` was the one path that didn't follow the pattern. | `apps/api/src/orders/order-lifecycle.service.ts:468-513` (pre-fix) | MEDIUM | High — direct comparison against the safe pattern two call sites away in the same file |
| WD-006 | The admin `cash/settlements` "Commission accrued" figure (`SettlementsService.commissionOverview`) recomputed commission as `fare × CURRENT live rate` for every order in the trailing 7-day window, rather than reading what was actually charged. If `COMMISSION_RATE_PCT` changes mid-window, an order completed earlier in the window at the OLD rate gets silently re-priced at the new one — the console figure would never reconcile with the dollars actually debited from wallets (or a fare-adjust's WD-001 correction). | `apps/api/src/settlements/settlements.service.ts:77-104` (pre-fix) | MEDIUM | High — the projection-vs-ledger design gap is explicit in the code's own docstring ("the commission that WOULD accrue at the current rate") |
| WD-007 | `WalletService.getTopup` handled a rider polling right at a top-up's expiry boundary: if the expiry CAS (`pending`→`expired`) lost a race to a concurrent confirm (0 rows updated), the method fell through and returned the **stale, pre-confirm** in-memory snapshot — still reporting `pending` even though the ledger row and balance were already credited. Self-healing on the next poll cycle (no fund loss), but a false status for one cycle. | `apps/api/src/wallet/wallet.service.ts:265-276` (pre-fix) | LOW-MEDIUM | High — direct code read; the missing re-read after a 0-row CAS is unambiguous |
| WD-008 | The wallet screen's hero balance rendered `formatMoney(balance)` with no negative-sign handling — a rider with an owed (negative) balance saw a malformed `"$-5.00"` instead of `"-$5.00"`. The ledger rows elsewhere in the same screen already wrap in `Math.abs` + a sign prefix; the hero figure was the one spot that didn't. | `apps/mobile/app/wallet/index.tsx:88`, `apps/mobile/src/logic/money.ts:7-10` (pre-fix) | LOW | High — direct trace through both functions |
| WD-009 | The top-up screen (`app/wallet/top-up.tsx`) validated the amount against the bundled `COMMISSION` constant baked into the app binary, never `/wallet/config` (the server-authoritative source every other wallet surface reads) — a latent divergence risk mirroring the exact anti-pattern the commission RATE is explicitly guarded against. It also displayed the rider's locally-typed amount on the wait/success screens instead of the server-confirmed `topup.amount` — today these always coincide, but nothing enforces it. | `apps/mobile/app/wallet/top-up.tsx:1,37-44,226,240` (pre-fix) | LOW | High — verified no `useWalletConfig` usage anywhere in the file |
| WD-010 | `resolveCommissionRatePct` (the one place the `COMMISSION_RATE_PCT` env override is interpreted) had no decimal-place limit, while `CommissionLedger.ratePct` is `Decimal(5,2)` — an ops typo like `"12.345"` would be served to clients and used in the per-ride commission calculation at full precision, then silently truncate on write to each ride's receipt row, a client/ledger figure mismatch. | `packages/shared/src/policy.ts:158-163` (pre-fix) | LOW | Medium — plausible from the type mismatch; requires an unusual ops misconfiguration to trigger |
| WD-011 | The Earnings screen's cumulative total folded in `proposedFare` (the customer's original, never-agreed ask) for any completed/delivered order with a null `agreedFare` — a documented data anomaly `chargeCommission` already tolerates by skipping the debit. A price that was never actually agreed shouldn't inflate a "what I earned" total. (Superseded in practice by WD-004's server-side aggregate, whose SQL `SUM` naturally excludes NULL rows — this entry covers the local fallback path that still runs before the summary loads.) | `apps/mobile/app/earnings/index.tsx:58` (pre-fix) | LOW | Medium — depends on how often the underlying anomaly occurs, which isn't independently knowable from static reading |

## Fixes (this run, all with regression tests)

- **WD-001**: `WalletService.adjustCommissionInTx` (new) writes a signed `adjustment` ledger row inside the
  *same* transaction as `AdminOrdersService.adjustFare`, computed at the rate the ride was **actually**
  charged (read from its `ride_commission` row), never the current live rate. `orderId` is deliberately left
  `NULL` on the row — the `(riderId, orderId, type)` unique index would otherwise reject a *second*
  correction on the same order (Postgres treats each `NULL` as distinct), so this keeps the ledger
  append-only across N corrections without a schema migration; the order stays identifiable via `note`. A
  ride charged at 0% (or never charged at all — a null-fare anomaly) has nothing to correct, so nothing is
  written. Tests: `wallet.service.spec.ts` (the helper itself, zero-delta no-op, NULL-orderId proof),
  `admin-orders.service.spec.ts` (three cases: reconciles on a completed order, skips a non-completed order,
  skips a completed order with no prior ledger row).
- **WD-002 / WD-003**: `creditManual` rewritten as one atomic transaction — `TopUp` create (pre-confirmed,
  ops credits are synchronous, not a rail round-trip) → ledger row → balance update → `AuditLog.create`, all
  in the same `$transaction`. The dead idempotency pre-check is gone; a `P2002` on `TopUp.providerRef`
  (the real, working de-dup mechanism) is now caught and returns the current balance instead of a 500.
  Tests: `wallet.service.spec.ts` (audit row present in the same tx, idempotent-retry-returns-balance,
  amount-cap still enforced).
- **WD-004**: new server-side aggregate `OrdersService.earningsSummary` (`GET /orders/earnings/summary`,
  Prisma `aggregate` with `_sum`/`_count`, unbounded by the history cap) feeds the Earnings screen's total
  and trip count; the recent-trips list underneath is unaffected (still the capped, fast page). The screen
  falls back to a local sum only until the summary loads or if it errors — strictly the same-or-better
  figure the old code always showed, never a regression. Tests: `orders.service.spec.ts` (3 cases, incl. the
  NULL-sum-for-a-fresh-rider edge case).
- **WD-005**: `rate()` re-reads `agreedFare` immediately after its CAS succeeds (the row is locked for the
  rest of the transaction at that point), mirroring `completeOrder()`'s existing safe ordering. Test:
  `order-lifecycle.service.spec.ts` (mocks two different `agreedFare` values across the two reads and
  asserts `chargeCommission` receives the second, fresh one).
- **WD-006**: `commissionOverview` now looks up actual `CommissionLedger` rows (`ride_commission` +
  `adjustment`) per order in the window and uses that sum when present; the current-rate projection is now
  only a fallback for orders with no ledger row at all (the 0% launch period — unchanged observable
  behavior today). Tests: `settlements.service.spec.ts` (3 cases: ledger overrides a changed live rate, an
  `adjustment` correction nets into the figure, the no-ledger-row fallback still projects).
- **WD-007**: `getTopup` re-reads the row from the database when its own expiry CAS reports 0 rows changed,
  instead of returning the pre-CAS in-memory snapshot. Tests: `wallet.service.spec.ts` (both the
  lost-the-race re-read and the won-the-race local-expire path).
- **WD-008**: `formatMoney` now renders sign-first (`-$5.00`), with a rounds-to-zero guard so a sub-cent
  negative doesn't render a stray `-$0.00`. Test: `money.test.tsx` (4 new cases).
- **WD-009**: the amount-bounds check factored into a pure `validateTopupAmount` (testable in isolation);
  `top-up.tsx` now sources `minTopUp`/`maxTopUp` from `useWalletConfig()` (bundled `COMMISSION` only as the
  pre-load fallback) and displays `topup?.amount ?? amountNum` on the wait/success screens. Test:
  `topup.test.tsx` (6 cases, including bounds that diverge from the bundled default).
- **WD-010**: `resolveCommissionRatePct` rounds its result to 2dp. Test: `wallet.service.spec.ts` (3 cases).
- **WD-011**: covered by the WD-004 fix (the server aggregate's SQL `SUM` ignores NULL `agreedFare` rows by
  construction); the local fallback in `earnings/index.tsx` no longer folds `proposedFare` into the sum.

## Suggestions (not implemented)

Feature-shaped or currently-dormant items, per the routine's no-new-features scope — recorded for a human
decision, not built:

- **Net-earnings line at commission go-live.** The Earnings screen's copy already promises "a per-ride
  commission line and your account balance will appear here" once commission activates, but nothing in the
  screen reads `CommissionLedger`/`ride_commission` rows per-trip or nets them into the total — today this
  is harmless (0% rate ⇒ gross == net), but the promised UI doesn't exist yet. Worth building alongside
  whatever launches the rate flip, not as a standalone patch now.
- **Wallet screen pull-to-refresh / foreground-refetch.** The wallet balance/ledger have no
  `RefreshControl` or `useForegroundRefetch` wiring, unlike other live screens (`rider/index.tsx`,
  `order/[id].tsx`). This mirrors an app-wide gap — `RefreshControl` isn't used anywhere in the mobile app
  today — so it reads as a missing convention to introduce deliberately, not a one-screen bug fix.

## Verification

`pnpm typecheck` (all 5 packages) · `pnpm lint` (all 5 packages, 0 warnings/errors) · API: 909 tests (+16),
all green · mobile: 383 tests (+13), all green · `apps/api` production build (`tsc -p tsconfig.build.json`)
green.
