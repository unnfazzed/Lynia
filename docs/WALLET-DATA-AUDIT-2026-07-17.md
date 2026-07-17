# Wallet, Earnings & Admin Data-Lifecycle Audit — 2026-07-17

Fourth run of the `WD-` lane (every-2nd-day cadence). Ran on branch `claude/wallet-data-audit-2026-07-17`,
starting from `main` at `998fbfc` (the previous night's bug-hunt/UX/deep-sweep/doc-sync/refactor runs had
all already merged — the deep sweep merged `docs: PR health report 2026-07-17 08:13 UTC` was the tip; PR
health watchdog's own report is the newest commit).

## Phase 0 — inherited history

Read `docs/KNOWN_BUGS.md` in full (all `WD-`/`DOC-`/`IR16-` sections plus the OPEN table and the FIXED/MOOT
cluster summaries). `mcp__github__list_pull_requests` (state=open) returned **zero** open `claude/*` sibling
PRs — nothing in flight to cross-check against `main`.

## Phase 0.5 — cluster-claim re-verification

Picked two "→ FIXED / MOOT" cluster headers **not** already re-checked by the prior day's deep sweep (which
had just covered Auth/identity, Data-integrity, and Money-fraud):

- **KYC cluster** — verified `applyKycResult`'s monotonic `kycResolvedAt` CAS (`apps/api/src/riders/rider.service.ts:422`, `where: { kycRef, OR: [{ kycResolvedAt: null }, { kycResolvedAt: { lt: eventAt } }] }`) and the DOC-16-05 `duplicateIdFlag` hold-for-review branch (`:419-420`) are both genuinely present in code. **INTACT.**
- **Object-authz/IDOR cluster** — verified the self-bid guard (`apps/api/src/offers/offers.service.ts:38`, `if (order.customerId === riderId) throw new ForbiddenException(...)`) and the shared online-gate standing check (`:65`, `onlineRefusalReason(rider)`) are both genuinely present. **INTACT.**

No stale claims found; neither header needed a fresh finding.

## Phase 1 — agentic-loop hunt

Ran `Workflow({ name: 'lane-bug-hunt' }, args: 'wallet')`. Summary: 8 diverse finder lenses (exactly-once-credit,
ledger-reconciliation, per-ride-debit, earnings-tab, admin-dashboard-kpi, admin-action-authz-audit,
concurrency-races, contract-nullability) → 3 candidates found (5 lenses returned empty — the wallet core,
ledger reconciliation, and admin-KPI surfaces have been hunted repeatedly across WD-001…WD-020 and hold up)
→ all 3 survived a 3-skeptic adversarial panel **unanimously** (9/9 "real" votes, all high confidence) →
sibling-swept. Total: 20 subagents, ~1.52M tokens, ~27 minutes wall-clock.

## Findings

| ID | Description | Area | Sev | Confidence | Status |
|---|---|---|---|---|---|
| WD-021 | `AdminOrdersService.adjudicateDelivered` read `order.agreedFare`/`suggestedFare` via a plain (unlocked) `findUnique` BEFORE its own status CAS (`undelivered`→`completed`), then passed that pre-CAS snapshot straight into `wallet.chargeCommission` with no re-read after the CAS took the row lock. The CAS guards only on `status`, not on the fare, so a concurrent `adjustFare` committing in the gap is invisible to it — the `ride_commission` row gets permanently priced off the stale fare, and `adjustFare`'s own reconciliation can never detect it afterward (it diffs against the order's CURRENT, already-corrected `agreedFare`) | `apps/api/src/admin/admin-orders.service.ts:204-245` | MEDIUM | High | **FIXED** |
| WD-022 | `deliverM` (`confirmDelivery`, the mutation that lands a `delivered` order) invalidated only `["activeJob"]` on success — never `["history"]`/`["earnings","summary"]`, the two queries the Earnings tab and Trip History read. A rider who'd opened either screen within the shared 30s `staleTime` window shortly before completing a delivery saw the pre-delivery total/trip-count with no stale-data indicator (the `showingStale` banner only fires when the cache is entirely absent, not merely stale-but-present) | `apps/mobile/app/rider/job.tsx:246-285` | MEDIUM | High | **FIXED** |
| WD-023 | `RESERVED_AUDIT_ACTIONS` (the DS16-01 guard against the free-text `POST /admin/audit-actions` endpoint forging a domain-mutation's action string) listed only `rider.kyc_approve`/`rider.kyc_decline` from `RiderService.adminSetKyc` — omitting the same endpoint's `rider.kyc_expire`/`rider.kyc_reset` strings, plus `applyKycResult`'s automated-webhook `rider.kyc_review_required` | `apps/api/src/admin/admin-audit.service.ts:15` | MEDIUM | High | **FIXED** |

## Sibling-sweep

**WD-021** — pattern signature: a pre-CAS order snapshot forwarded into a wallet-charging call with no
post-CAS re-read.
```
grep -rn "chargeCommission" apps/api/src --include=*.ts
grep -rn "agreedFare" apps/api/src --include=*.ts | grep -v spec
grep -rn "updateMany" apps/api/src --include=*.ts | grep -v spec
```
3 hits enumerated. `completeOrder()`/`rate()` (order-lifecycle.service.ts) already re-read `agreedFare`
fresh post-CAS (WD-005); `adjustFare` (admin-orders.service.ts) already re-reads `status`/`riderId` post-CAS
(WD-013). `adjudicateDelivered` was the only caller of `chargeCommission` still forwarding a pre-CAS
snapshot — fixed this run. **No further siblings.**

**WD-022** — pattern signature: a query-invalidation call site (mutation `onSuccess`, WS self-heal handler,
or `useForegroundRefetch` callback) that omits `["history"]`/`["earnings","summary"]` even though it fires
on a delivered/cancelled/undelivered transition.
```
grep -rn 'invalidateQueries' apps/mobile/app apps/mobile/src --include='*.ts' --include='*.tsx' | grep -v __tests__
grep -rn 'queryKey:\s*\["history"\]|queryKey:\s*\["earnings"' apps/mobile
grep -rn 'refetchJob|refetchOrder|refresh()|healBoard' apps/mobile/src/realtime apps/mobile/app/rider/job.tsx apps/mobile/app/order/[id].tsx
```
30 hits enumerated. Six call sites shared the gap and are all fixed this run:
- `deliverM` (the reported bug), `cancelM`, `undeliverM` — all three in `apps/mobile/app/rider/job.tsx`, all
  routed through the same local `refresh()` helper.
- `use-rider-job-socket.ts`'s reconnect/`connect_error` self-heal (`refetchJob`).
- `use-order-socket.ts`'s connect/`order:status` self-heal (`refetchOrder`) — history-only, since the
  customer side has no earnings aggregate.
- `home.tsx`'s foreground-resume refetch.

Two adjacent call sites were checked and confirmed **NOT** siblings: `rider/index.tsx`'s board self-heal
(no history/earnings dependency on that screen) and `order/[id].tsx`'s own `rateM`/`cancelM` (these already
explicitly invalidate `["history"]` — the BH-13 sibling-sweep the night before had already checked and
cleared both of these for the *adjacent* "self-heal invalidates fewer keys than its own live events"
pattern; this run's finding is the same shape but a different missing key set, so it isn't a re-report).

Rather than patch six call sites by hand (and leave the class free to recur on the next new mutation/socket
handler), the fix adds two shared funnels to `apps/mobile/src/query/use-history-feed.ts` —
`invalidateRiderJobQueries` (activeJob + history + earnings) and `invalidateCustomerOrderHistory`
(history only) — and every one of the six sites now calls one of the two instead of re-typing the
query-key list.

**WD-023** — pattern signature: an `auditLog.create`/`auditData(...)` call inside a domain-mutation
transaction whose action string is absent from `RESERVED_AUDIT_ACTIONS`.
```
grep -n "RESERVED_AUDIT_ACTIONS" -A20 apps/api/src/admin/admin-audit.service.ts
grep -rn "auditLog.create" apps/api/src --include=*.ts | grep -v spec
grep -rn 'action:\s*"[a-z_.]*"' apps/api/src --include=*.ts | grep -v spec
grep -rn 'auditData([^,]*,\s*"[a-z_.]*"' apps/api/src --include=*.ts | grep -v spec
grep -rln "RESERVED_.*_ACTIONS|ReadonlySet<string>" apps/api/src apps/admin apps/mobile packages
```
16 hits enumerated. Every domain-mutation action string already had a reserved entry (rider
suspend/lift/ban/clear_hold, customer hold/lift, order cancel/fare_adjust/adjudicate_delivered, issue
resolve, sos acknowledge, wallet credit, the rider-standing feed notice) except the three KYC-decision
strings above. All three added. **No further gaps.**

## Why prior sweeps missed these

- **WD-021** lives in `adjudicateDelivered`, which shipped later (the KB-POD-DISPUTE Phase B PR,
  2026-07-16) than the WD-005/WD-013 fixes it should have mirrored — a new code path can silently miss a
  pattern the rest of the codebase already converged on if nothing re-diffs new completion paths against
  the established re-read-after-CAS convention. Unit tests mock Prisma at the `$transaction` boundary and
  never exercise two genuinely separate, interleaved transactions, so the race itself is invisible to the
  existing test suite regardless of coverage.
- **WD-022** is a client-side query-cache omission with no server-side signal at all — every existing test
  for `deliverM`/`cancelM`/`undeliverM` asserts the *mutation* succeeds and the *active job* clears, which
  it does; nothing in the existing suite ever asserted Trip History/Earnings also refresh, because no
  regression had ever surfaced there before. The bug is invisible unless a screen happens to have a
  30s-old cache from a very recent prior visit — exactly the kind of session-shaped timing window a
  single-pass manual QA session rarely reproduces.
- **WD-023** is an enumeration-completeness gap in a guard that itself was a fix (DS16-01, 2026-07-16) —
  the guard's own author reserved the two action strings they were looking at (`kyc_approve`/`kyc_decline`)
  without grepping for every OTHER string the same function can emit depending on its `status` argument, and
  a second, unrelated automated-webhook action string (`kyc_review_required`, added the same day by
  DOC-16-05) landed in the same file without anyone cross-referencing it against the guard.

## Suggestions (not implemented)

None this run — all three findings were straightforward correctness/data-integrity fixes squarely within
scope; nothing warranted a deferred feature idea.

## Stopping rule

Three MEDIUM findings, zero CRITICAL/HIGH. Per the stopping rule this is reported in full (not padded with
LOW-severity noise) because each carries mandatory sibling-sweep evidence, not because the count needed
inflating. Combined with the Phase-0.5 clean re-verification and 5-of-8 empty lenses, the wallet/ledger/
admin-KPI core continues to converge — this run's findings all sit in code that shipped or was touched
*after* the last WD pass (`adjudicateDelivered`, the mobile query-cache wiring, the DS16-01 guard's own
follow-up).

## Verification

`pnpm typecheck` (all 5 packages), `pnpm test` (1012 API tests, 415 mobile tests), `pnpm --filter @lynia/api
build` — all green.
