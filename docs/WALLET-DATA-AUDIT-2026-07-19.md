# Wallet, Earnings & Admin Data-Lifecycle Audit — 2026-07-19

Fifth run of the `WD-` lane. Ran on branch `claude/wallet-data-audit-2026-07-19`, starting from `main` at
`6b25edc` (the night's bug-hunt/UX/deep-sweep/doc-sync/refactor routines had all already merged — the
07:00 refactor run, `refactor(api): extract KYC-review reads out of AdminRidersService (RF-06)`, was the
tip; this is the first WD run of the day).

## Phase 0 — inherited history

Read `docs/KNOWN_BUGS.md` in full (all `WD-`/`DOC-`/`IR16-`/`DS-`/`ADM-` sections, the OPEN table, and the
FIXED/MOOT cluster summaries) plus the three prior dated `WALLET-DATA-AUDIT-*.md` reports.
`mcp__github__list_pull_requests` (state=open) returned **zero** open `claude/*` sibling PRs — nothing in
flight from tonight's runs to cross-check against `main`.

## Phase 0.5 — cluster-claim re-verification

The last three routines (deep-sweep 03:00, UX 01:00, and this lane's own 07-17 run) had already rotated
through Notifications/FCM, Edge/abuse, KYC, Object-authz/IDOR, Mobile-journey-dead-ends, Auth/identity,
Data-integrity, and Money-fraud within the last 1-2 days — 8 of the ledger's 9 cluster headers. Picked the
three **least-recently** re-checked instead of blindly re-rotating into an already-fresh header:

- **Money-fraud cluster (→ MOOT)** — verified `settlements.service.ts` is still the read-only prepaid
  projection it was rewritten to (`CommissionOverview`/`CommissionRiderRow` shapes only; `grep -rn
  "recordPayment" apps/api/src` returns zero non-spec hits). **INTACT.**
- **Ship/infra correctness cluster (→ FIXED)** — verified the WIF/keyless-deploy terraform (`wif.tf`,
  referenced from `release.yml`/`deploy-staging.yml`/`deploy-admin.yml`/`rollback.yml`) and the Cloud Run
  request-timeout config (`infra/terraform/lb.tf:66`, `--timeout 3600`) are both still present. **INTACT.**
- **Auth/identity cluster (→ FIXED)** — verified the JWT default-secret production boot-guard
  (`apps/api/src/config/env.ts` `INSECURE_JWT_DEFAULT`, exercised by `env.spec.ts`'s "rejects the shipped
  dev-default secret in production" case), the HS256 algorithm pin (`token.service.ts:50,53`,
  `jwt.verify(token, secret, {algorithms:["HS256"]})`), and the `x-user-id` dev-only fallback
  (`current-user.decorator.ts:20`, gated on `devEnv`). **INTACT.**

No stale claims found; none of the three needed a fresh finding.

## Phase 1 — agentic-loop hunt

Ran `Workflow({ name: 'lane-bug-hunt' }, args: 'wallet')`. Summary: 8 diverse finder lenses
(exactly-once-credit, ledger-reconciliation, per-ride-debit, earnings-tab, admin-dashboard-kpi,
admin-action-authz-audit, concurrency-races, contract-nullability) → 3 candidates found (5 lenses returned
empty — exactly-once-credit, ledger-reconciliation, per-ride-debit, admin-action-authz-audit, and
concurrency-races all came back clean, consistent with this core having been hunted repeatedly across
WD-001…WD-023) → all 3 survived a 3-skeptic adversarial panel (one finding split 2/3 real — a "refuted"
vote is expected noise, not a defeat, since the majority-of-3 threshold is what the workflow's own
verify-gate applies) → sibling-swept. Total: 20 subagents, ~1.45M tokens, ~21 minutes wall-clock.

## Findings

| ID | Description | Area | Sev | Confidence | Status |
|---|---|---|---|---|---|
| WD-024 | The admin overview's "Completed today"/"Fares today" headline KPIs (`AdminService.overview()`) keyed off the `deliveredAt` timestamp alone (`order.count({where:{deliveredAt:{gte:startOfDay}}})`, and the same filter feeding the fares `_sum` aggregate), never checking the order's CURRENT `status`. `delivered` is deliberately non-terminal (`packages/shared/src/enums.ts` `TERMINAL_STATUSES` excludes it, by design — it's still a live target for `AdminOrdersService.cancelOrder`, whose own code comment confirms this). `cancelOrder`'s update sets `status:'cancelled'` but never clears `deliveredAt`/`agreedFare`. So an order delivered today, then admin-cancelled later the same day (a fraud/dispute cancel), permanently kept counting toward `today.completed`, `today.fares`, and the numerator of `completionRatePct` — even though the order shows `status:'cancelled'` everywhere else in the console | `apps/api/src/admin/admin.service.ts:89-91` | HIGH | High | **FIXED** |
| WD-025 | The Earnings tab's commission-balance row (`CommissionRow` in `apps/mobile/app/earnings/index.tsx`, via `useWallet()`) was never invalidated by a ride completion. `WalletService.chargeCommission` debits the exact same `walletKey`/`walletLedgerKey`-backed balance in the same server transaction as order completion (both the normal `rate()`/`completeOrder` path and `adjudicateDelivered`'s force-complete), but the shared rider-side invalidation funnel `invalidateRiderJobQueries` (the WD-022 fix, `apps/mobile/src/query/use-history-feed.ts`) only invalidated `["activeJob"]`, history, and the earnings-summary aggregate — never the wallet keys. Those were invalidated only inside the dedicated Wallet screen itself. A rider who'd glanced at Earnings within the shared 30s query staleTime shortly before completing a delivery (the identical trigger WD-022 documented) saw the pre-debit commission balance on the Earnings tab with no staleness indicator, for up to ~30s or until the Wallet screen was separately opened | `apps/mobile/src/query/use-history-feed.ts:46` | MEDIUM | High (2 of 3 verifiers; one refuted vote treated as expected panel noise, not a defeat) | **FIXED** |
| WD-026 | `AdminOrdersService.adjudicateDelivered` (KB-POD-DISPUTE Phase B) force-completes a disputed `undelivered` order — `status:'completed', completedAt:new Date()`, commission charged — but never stamps `deliveredAt` and never clears `undeliveredAt`. Because the same `deliveredAt`/`undeliveredAt`-keyed overview KPIs (WD-024's root cause) never check current status, an adjudicated order was PERMANENTLY excluded from `today.completed`/`today.fares` on the day it was adjudicated (no `deliveredAt` was ever set) while staying PERMANENTLY double-counted as a failure in `undeliveredToday` (its `undeliveredAt` from the original failed hand-off is never cleared) — so `completionRatePct`'s denominator carries a real, commissioned completion as a failure forever, with no corresponding numerator credit | `apps/api/src/admin/admin.service.ts:89-91` (root cause shared with WD-024), `apps/api/src/admin/admin-orders.service.ts:227` (`adjudicateDelivered`) | MEDIUM | High | **FIXED** |

WD-024 and WD-026 share one root cause — the "today" KPI queries in `AdminService.overview()` gated on a
timestamp column that can silently outlive the order's current status — so both are fixed by the same
change, described once under Sibling-sweep below.

## Sibling-sweep

**WD-024 / WD-026** — pattern signature: an admin/reporting aggregate that filters on a lifecycle
timestamp (`deliveredAt`/`undeliveredAt`/`completedAt`) without also constraining the order's CURRENT
`status`, so a later status transition that doesn't clear the earlier timestamp silently mis-keeps or
mis-drops the row from the aggregate.

```
grep -rn "deliveredAt:\s*{" apps/api/src --include=*.ts | grep -v spec
grep -rn "undeliveredAt:\s*{" apps/api/src --include=*.ts | grep -v spec
grep -rln "startOfDay\|startOfWeek\|startOfMonth" apps/api/src --include=*.ts | grep -v spec
grep -n "deliveredAt\|completedAt\|undeliveredAt\|status:" apps/api/src/settlements/settlements.service.ts
```

4 hits total (excluding the two lines this fix touches). `order-lifecycle.service.ts:175`
(auto-close-stale-delivered sweep, `where:{status:"delivered", deliveredAt:{lt:cutoff}}`) and `:481`
(the reliability-window undelivered-rate lookback, `where:{riderId, status:"undelivered",
undeliveredAt:{gte:windowStart}}`) already pair the timestamp with the matching `status` — not siblings.
`settlements.service.ts:92` (the commission-overview period query) already does exactly the pattern this
fix applies — `where:{status:"completed", completedAt:{gte:periodStart, lt:periodEnd}, riderId:{not:null}}`
— confirming it's the established correct convention and `AdminService.overview()` was the one outlier
that hadn't converged on it. **No further siblings** — `admin.service.ts`'s three "today" queries
(completed-count, undelivered-count, fares-aggregate) were the only offenders, all fixed in this run by
adding the matching `status` filter (`"completed"` / `"undelivered"`) alongside each timestamp gate.

**WD-025** — pattern signature: a call site that invalidates the shared rider-job query funnel
(`invalidateRiderJobQueries`/`invalidateCustomerOrderHistory`) or reads `walletKey`/`walletLedgerKey`
without a path back to whichever funnel actually refreshes them on a ride completion.

```
grep -rn "walletKey\|walletLedgerKey" apps/mobile/src apps/mobile/app
grep -rn "invalidateQueries\|invalidateRiderJobQueries\|invalidateCustomerOrderHistory" apps/mobile/app apps/mobile/src | grep -v __tests__
grep -rn "useWallet(\|useWalletLedger(" apps/mobile/app apps/mobile/src | grep -v __tests__
```

9 + 30 + 6 hits enumerated. `walletKey`/`walletLedgerKey` are read in exactly two places:
`apps/mobile/app/wallet/index.tsx` (which already explicitly invalidates both on its own top-up-success
and focus-refresh paths — not a sibling) and `apps/mobile/app/earnings/index.tsx`'s `CommissionRow` (the
reported bug). Every rider-side completion path funnels through the single `invalidateRiderJobQueries`
helper — `job.tsx`'s `deliverM`/`cancelM`/`undeliverM` `refresh()` and `use-rider-job-socket.ts`'s
reconnect self-heal both call it, with no other call site bypassing it — so fixing the one shared funnel
(adding the two wallet-key invalidations there) closes every identified call site in one change, with no
independent second occurrence of the bug shape. **No further siblings.**

## Why prior sweeps missed these

- **WD-024/WD-026** sit in `AdminService.overview()`, which has been read by four prior WD runs but always
  through the lens of "does the number reconcile with the ledger" rather than "does the FILTER survive a
  later status transition on the same row." `cancelOrder`'s ability to act on an already-`delivered` order
  (WD-024) and `adjudicateDelivered`'s force-complete without a `deliveredAt` stamp (WD-026, itself the
  subject of WD-021 in the 07-17 run, but that finding was about the FARE the debit priced off, not the
  KPI visibility of the completion) are both edge transitions that a straight-line "rider completes a
  delivery" trace never exercises — they only manifest when an admin action interposes on an already-moved
  order. `admin.service.spec.ts`'s existing tests mocked the count/aggregate calls by their argument shape
  without asserting the shape ITSELF was correct (i.e., they'd have passed unchanged even with the bug),
  so nothing in the existing suite ever encoded the "current status must gate the timestamp" invariant.
- **WD-025** is the same class of client-cache omission WD-022 fixed two runs ago, but on a query key
  WD-022's own sibling-sweep didn't have cause to check — WD-022 was scoped to `["history"]`/
  `["earnings","summary"]` (Trip History + Earnings totals), and the wallet balance/ledger keys live in a
  different module (`use-wallet.ts`) that Earnings only reads incidentally (`CommissionRow`). A
  sibling-sweep scoped to "what does `invalidateRiderJobQueries` invalidate" would have caught it at the
  time; one scoped to "what does the Earnings screen show" (this run's `earnings-tab` lens) is what
  actually surfaced it.

## Suggestions (not implemented)

None this run — all three findings were straightforward correctness/data-integrity fixes squarely within
scope; nothing warranted a deferred feature idea.

## Stopping rule

Three findings this run (one HIGH, two MEDIUM) — reported in full per the mandatory sibling-sweep evidence
rule, not padded with LOW-severity noise: 5 of 8 hunt lenses returned zero, and all three findings sit in
code paths (admin force-complete adjudication, the client query-cache funnel) that shipped or were
touched by runs AFTER the wallet/ledger core's last hardening pass (WD-021…WD-023, 07-17), consistent with
the core continuing to converge while its newer edges (adjudication, cross-screen cache funnels) still
turn up real gaps.

## Verification

`pnpm typecheck` (all 5 packages) + `pnpm test` (1071 API tests, 449 mobile tests) + `pnpm --filter
@lynia/api build` — all green.
