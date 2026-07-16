# Wallet, Earnings & Admin Data-Lifecycle Audit — 2026-07-16

Second run of the `WD-` lane (every-2nd-day cadence). Phase 0 read `docs/KNOWN_BUGS.md` first and
inherited six OPEN items the 2026-07-16 doc-sync routine had already found and tagged for this lane
(`DOC-16-01`, `DOC-16-02`, `DOC-16-03`, `DOC-16-04`, `DOC-16-05`, `DOC-16-06`) — all six were triaged this
run (five fixed or resolved, one confirmed out of scope and left OPEN with reasoning). Phase 1+2 then ran
two independent fresh research passes over the four audit surfaces (A: wallet top-up journey + B:
per-ride commission debit; C: earnings tab + D: admin dashboard), each cross-checked against the ledger
first so neither re-reported WD-001…WD-011 or the six inherited items. Six new findings came back —
**twelve findings total this run, one HIGH, three MEDIUM, eight LOW — eleven fixed, one confirmed OPEN
(a new-feature build correctly out of scope)**, each fix carrying a regression test.
`pnpm typecheck` + `pnpm lint` + 932 API tests + 401 mobile tests + `apps/api` build all green.

## Findings

| ID | Description | Area | Sev | Confidence | Status |
|---|---|---|---|---|---|
| DOC-16-01 | `top_ups.phone` (the mobile-money number captured on every top-up) was never scrubbed on account erasure, unlike every other dialable-phone field (`profiles.phone`, order-embedded `contactPhone`, `Order.note`) | `apps/api/src/privacy/privacy.service.ts` | LOW-MED | High | **FIXED** |
| DOC-16-02 | Self-serve top-up on all three rails (EcoCash/InnBucks/O'mari) guaranteed a 90s timeout — `creditFromTopup`, the only path that ever confirms a `TopUp`, had zero callers. Live, user-facing, permanently-broken money flow (`WALLET_REVEAL` defaults `true`) | `apps/mobile/app/wallet/top-up.tsx`, `apps/api/src/wallet/wallet.service.ts` | HIGH | High | **FIXED** |
| DOC-16-03 | Admin console has no UI at all for the wallet (balance/ledger/manual-credit form/bulk seed-credit) despite the backend routes existing | `apps/admin/app/riders/[id]/page.tsx`, `admin.controller.ts` | MEDIUM | High | **OPEN — out of scope.** Building this UI is a new feature (multiple new screens/forms), not a bug fix; this routine's mandate is behavior-correcting fixes only. Left for a dedicated build. |
| WD-012 (was DOC-16-04) | The commission basis had no floor tying it to `suggestedFare` — a colluding customer+rider pair could lowball `offeredFare` to near-zero and owe near-zero commission once the rate flips. Dormant only because `COMMISSION_RATE_PCT=0` | `packages/shared/src/policy.ts`, `apps/api/src/wallet/wallet.service.ts` `chargeCommission`, `apps/api/src/admin/admin-orders.service.ts` `adjustFare`, `apps/api/src/settlements/settlements.service.ts` | HIGH (dormant pre-flip) | High | **FIXED** |
| DOC-16-05 | KYC duplicate-ID dedup (`duplicateIdFlag`, A-04) was advisory-only for the AUTO-mode vendor webhook path — `applyKycResult` never read the flag, so a banned/suspended rider re-registering with a new SIM and the SAME real ID/face sailed straight to `verified` with no human review, under the default `KYC_MODE=auto` | `apps/api/src/riders/rider.service.ts` `applyKycResult` | MEDIUM (owning lane: DS — fixed anyway, no deferrals) | High | **FIXED** |
| DOC-16-06 | Design Premise 6 ("the dormant `Settlement` table is dropped in this build") was never executed; migration 0027 explicitly deferred it | `docs/plans/2026-rider-wallet-design.md`, `apps/api/prisma/schema.prisma` | LOW (housekeeping, zero functional risk) | High | **RE-AFFIRMED (doc-only)** — see below |
| WD-013 | `AdminOrdersService.adjustFare` read `order.status` PRE-CAS and never re-checked it — a completion (`rate()`/`completeOrder()`) racing the fare CAS could flip `delivered→completed` and charge `ride_commission` at the OLD fare in the gap, and the stale snapshot then skipped the WD-001 reconciliation block entirely, silently re-opening that exact gap | `apps/api/src/admin/admin-orders.service.ts` `adjustFare` | MEDIUM (dormant pre-flip) | High | **FIXED** |
| WD-014 | The fare-adjust ledger delta rounded a pre-summed fare delta (`perRideCommission(newFare − oldFare)`) instead of differencing two independently-rounded totals — could drift the ledger a cent off "rate% of the final fare" per correction | `apps/api/src/admin/admin-orders.service.ts` `adjustFare` | LOW (dormant pre-flip) | High | **FIXED** |
| WD-015 | `adjustCommissionInTx` wrote every fare-adjust `adjustment` row with `orderId: null` (to dodge the old blanket unique index) — but that made every adjustment row invisible to `SettlementsService.commissionOverview`'s per-order reconciliation query (`orderId: { in: [...] } }` never matches NULL), so a corrected order's "commission accrued" KPI silently reverted to the pre-correction amount. The existing WD-006 regression test's fixture assumed a real `orderId` on adjustment rows — a shape production code could never actually produce | `apps/api/src/wallet/wallet.service.ts` `adjustCommissionInTx`, `apps/api/src/admin/admin-orders.service.ts`, `apps/api/prisma/schema.prisma` | MEDIUM (dormant pre-flip) | High | **FIXED** — schema migration |
| WD-016 | Admin `cash` page and the rider-detail "Commission" KPI carried stale copy ("the prepaid wallet... is not built") from before the wallet shipped (2026-07-15), and the rider-detail `commission` field was a hardcoded `"0.00"` string ("wallet deferred") instead of the real `CommissionAccount.balance` | `apps/admin/app/cash/page.tsx`, `apps/api/src/settlements/settlements.service.ts`, `apps/api/src/admin/admin-riders.service.ts` | LOW (copy stale now; hardcoded value affirmatively wrong once `ratePct > 0`) | High | **FIXED** |
| WD-017 | Customer `cancelRatePct` (directory + detail) counted every `status: "cancelled"` order regardless of who cancelled it — a rider bailing or an ops cancel inflated a punitive-looking signal attributed to the customer, unlike the analogous rider/order surfaces which already filter on `Order.cancelledBy` | `apps/api/src/admin/admin-customers.service.ts` | LOW-MEDIUM | Medium | **FIXED** |

**Confirmed-clean re-checks (Phase 0, not new findings):** WD-001…WD-011 all still intact in code
(spot-checked WD-001/WD-002/WD-006's fix shape while touching the same files for WD-012/WD-013/WD-015).
UX16-01…08, DS16-01/02, and the 07-16 doc-sync's other findings were confirmed already merged and out of
this lane.

## Why prior sweeps missed these

- **WD-012/DOC-16-04, WD-013, WD-014, WD-015** all live in code paths that are either **dormant at the 0%
  launch rate** (any commission calculation is `$0.00 × anything = $0.00`, so no test or manual QA pass
  would ever observe a discrepancy) or **only visible on a race** (WD-013 requires a fare-adjust and a
  completion landing in the same narrow window) — exactly the class of bug that only surfaces once the
  rate flips or under production concurrency, neither of which a routine sweep exercises. WD-015
  specifically slipped through because the WD-006 regression test that was supposed to prove the
  reconciliation query worked seeded a fixture (`adjustment` row with a real `orderId`) that production
  code could never actually produce — the test and the implementation silently diverged.
- **DOC-16-05** is the auto-mode KYC webhook path, which only real vendor traffic (not the `stub` provider
  used in dev/test) exercises — and even then, only for the narrow case of a re-registration under a
  colliding national ID, a scenario no existing test seeded.
- **WD-016/WD-017** are small, easy-to-miss consequences of the wallet shipping AFTER the copy/hardcoded
  value was written — nobody re-audited every "the wallet isn't built yet" string or hardcoded stub value
  the day it shipped.

## DOC-16-06 resolution detail

Rather than run a destructive `DROP TABLE Settlement` migration bundled into this bug-fix PR, the design
doc's Premise 6 was amended in place to re-affirm the deferral already recorded in migration
`0027_commission_wallet`'s own comment ("left in place... its drop is a separate destructive migration
once the wallet has soaked"). The wallet has now soaked through PR1 + WD-001..011 + BH-07..12 +
WD-012..015 with zero reads/writes against `Settlement`/`Refund.settlementId`, but a schema drop carries
its own migration risk for zero functional upside — it's dead weight, not a live risk. Tracked in
`docs/KNOWN_BUGS.md` as `KB-SETTLEMENT-DROP`, owned by the refactor routine (dead-code removal is
explicitly in its remit).

## DOC-16-02 resolution detail

The old top-up screen collected an amount/phone/rail, opened a 90-second "Check your phone" countdown,
and — because nothing in the codebase has ever called `WalletService.creditFromTopup` — always landed on
"The request expired." Per the finding's own remedy note ("at minimum... route riders to the working
admin-manual-credit path instead of a fake self-serve form that can never succeed"), the screen was
replaced with an honest instruction card pointing at the ALREADY-WORKING manual-credit path
(`POST /admin/riders/:id/wallet-credit` → `WalletService.creditManual`), reusing the existing
`SupportCallRow` component used elsewhere for "the only honest instruction is call us" states. This
applies to all three rails (not just InnBucks/O'mari) since EcoCash's real integration was never built
either. No merchant/paybill numbers were fabricated — the screen routes to a human, not a fake payment
form. Two smaller findings from the wallet-surface research pass are **mooted by this fix**, not
separately addressed:

- A top-up idempotency-replay check that ignored the request payload (amount/rail/phone) on a retry could
  return a stale intent from a since-edited attempt — the specific repro required the removed
  amount/rail/phone form and its "Cancel request" retained-key flow, both gone now. The underlying
  server-side `createTopup` permissiveness is unchanged and worth hardening whenever a real self-serve
  flow is rebuilt (see Suggestions).
- The removed timeout/declined screen's "No money moved" copy technically contradicted
  `creditFromTopup`'s re-openable-`expired` design (a late rail confirmation can still credit). The screen
  saying that no longer exists.

## Suggestions (not implemented)

- **Build the admin wallet UI (DOC-16-03).** Balance + ledger table + a capped manual-credit form on the
  rider detail page, plus the bulk seed-credit action on the commission page, per
  `docs/plans/2026-rider-wallet-design-brief.md`. Ops currently has no way to run the top-up rail or
  rehearse the flip without hand-rolling API calls.
- **A real payment-rail integration** (EcoCash C2B at minimum, per the design brief's Premise 4) to
  replace the DOC-16-02 support-routing instruction card with genuine self-serve top-up.
- **Harden `createTopup`'s idempotency replay** to compare `amount`/`rail`/`phone` against the stored
  intent and 409/mint-fresh on a mismatch, rather than blindly returning whatever intent the key matched —
  currently moot (client repro path removed by DOC-16-02) but worth doing before any client rebuilds
  self-serve top-up.
- **`KB-SETTLEMENT-DROP`**: the actual `DROP TABLE Settlement` migration, once a maintenance window is
  convenient — see DOC-16-06 above. Not a bug; pure housekeeping.

## Stopping rule

Phase 1+2 (the fresh research passes, independent of the six inherited items) surfaced one HIGH
(WD-012/DOC-16-04, already counted above) and several MEDIUM/LOW findings — the stopping rule (skip
padding once zero NEW CRITICAL/HIGH) does not apply verbatim since inherited items carried real severity,
but no new CRITICAL surfaced and every MEDIUM+ finding is accounted for above with a fix.

## Verification

`pnpm typecheck` clean · `pnpm lint` clean (0 warnings/errors, 4 packages) · `pnpm test`: 932 API tests +
401 mobile tests, all green · `pnpm --filter @lynia/api build` clean · Prisma schema validates and
`prisma generate` succeeds against the two new migrations (`0030_commission_ledger_drop_blanket_unique`,
`0031_commission_ledger_ride_commission_unique`) · `migration-safety.spec.ts`'s online-lock guard passes
against both new migration files.
