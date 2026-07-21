# Wallet, Earnings & Admin Data-Lifecycle Audit — 2026-07-21

Sixth run of the `WD-` lane. Ran on branch `claude/wallet-data-audit-2026-07-21`, starting from `main` at
`bcb44e1` (the night's bug-hunt/UX/deep-sweep/doc-sync/refactor routines had all already merged — the
07:21 refactor run, `refactor(api): split eraseAccount into named private helpers (RF-11)`, was the tip;
this is the first WD run of the day).

## Phase 0 — inherited history

Read `docs/KNOWN_BUGS.md` in full (all `WD-`/`DOC-`/`IR16-`/`DS-`/`ADM-` sections, the OPEN table, the
"Recently closed" table, the 9 FIXED/MOOT cluster-header rollups, and the coverage map) plus both prior
dated `WALLET-DATA-AUDIT-*.md` reports (07-17, 07-19). `mcp__github__list_pull_requests` (state=open)
returned **zero** open `claude/*` sibling PRs — nothing in flight from tonight's runs to cross-check
against `main`. All 26 numbered `WD-` findings (WD-001…WD-026) plus their `DOC-16-*` co-triaged siblings
are FIXED, confirmed against current code by the inherited ledger; the only genuinely open financial/admin
items are `DOC-16-03`/`ADM-07` (a bulk seed-credit UI — a feature gap, explicitly out of scope for a
bug-fix routine) and `KB-SETTLEMENT-DROP` (a housekeeping table-drop deferred to the refactor lane).

**Ledger hygiene note (not a new finding):** the top OPEN table's `KB-POD-DISPUTE` row still reads "Phase
B still open" even though Phase B shipped as `IR16-12` and a later section explicitly declares it CLOSED —
flagged for the next doc-sync pass to correct; not touched in this PR since it's outside the WD lane's
own findings and the doc-sync routine owns ledger-hygiene-only corrections.

## Phase 0.5 — cluster-claim re-verification

Rotation history (most→least recent): deep-sweep 07-21 (Auth/identity, Notifications/FCM, Edge/abuse) →
bug-hunt 07-20 night (KYC, Data-integrity, Mobile-journey-dead-ends) → deep-sweep 07-20 (Object-authz/IDOR,
Ship/infra correctness, Money-fraud) → UX 07-20 (Auth/identity, Notifications/FCM, Edge/abuse) → this
lane's own 07-19 run (Money-fraud, Ship/infra correctness, Auth/identity). Picked the three
**least-recently** re-checked instead of blindly re-rotating into an already-fresh header:

- **Object-authz/IDOR cluster (→ FIXED (verified))** — last re-checked deep-sweep 2026-07-20, the oldest
  of the 9. Verified 2 named members: the self-dealing wash-trade guard (`apps/api/src/offers/offers.service.ts:38`,
  `if (order.customerId === riderId) throw new ForbiddenException(...)`) and the offer-accept TOCTOU
  row lock (`offers.service.ts:106`, `SELECT status FROM orders WHERE id = ... FOR UPDATE`). **INTACT.**
- **KYC cluster (→ FIXED)** — last re-checked bug-hunt 2026-07-20 night. Verified 2 named members: the
  unsigned-webhook fail-closed guard (`apps/api/src/kyc/kyc.controller.ts:71`, refuses to process when
  `KYC_PROVIDER=didit`/production and no `DIDIT_WEBHOOK_SECRET` is set) and `applyKycResult`'s monotonic
  `kycResolvedAt` replay/reorder CAS (`apps/api/src/riders/rider.service.ts:497`,
  `where: { kycRef, OR: [{ kycResolvedAt: null }, { kycResolvedAt: { lt: eventAt } }] }`). **INTACT.**
- **Mobile-journey-dead-ends cluster (→ FIXED)** — last re-checked bug-hunt 2026-07-20 night, tied with
  KYC. Verified the `markUndelivered` guarded single-fire CAS (`apps/api/src/orders/order-lifecycle.service.ts:403-432`,
  the "gave up" edge every reliability-hold/eviction path downstream references) and the cold-start
  restore guard's every downstream demotion path (`DS19-01`/`DS17-02`/admin suspend-ban's shared
  `evictRiderFromSupply` funnel, all still routed the same way). **INTACT.**

No stale claims found; none of the three needed a fresh finding.

## Phase 1 — agentic-loop hunt

Ran `Workflow({ name: 'lane-bug-hunt' }, args: 'wallet')`. Summary: 8 diverse finder lenses
(exactly-once-credit, ledger-reconciliation, per-ride-debit, earnings-tab, admin-dashboard-kpi,
admin-action-authz-audit, concurrency-races, contract-nullability) → 2 candidates found (6 lenses returned
empty — exactly-once-credit, ledger-reconciliation, per-ride-debit, admin-action-authz-audit,
concurrency-races, and contract-nullability all came back clean, consistent with this core having been
hunted repeatedly across WD-001…WD-026) → both survived a 3-skeptic adversarial panel unanimously (6/6
"real" votes, all high confidence) → sibling-swept. Total: 16 subagents, ~1.19M tokens, ~20 minutes
wall-clock.

## Findings

| ID | Description | Area | Sev | Confidence | Status |
|---|---|---|---|---|---|
| WD-027 | The Earnings screen's hero card total/count (`tripCount`/`total`) come from the server's unbounded, rider-role-only aggregate (`earningsSummary`), while the itemized trip list beneath it (`trips`) is filtered from `useHistoryFeed()`'s capped 50-row page — which is shared across BOTH the customer and rider roles of the same account (`historyForUser` matches `customerId === userId OR riderId === userId`, no per-role cap). A rider whose 50 most-recent orders (across both roles) contain few or zero rider completions — e.g. an account that mostly orders as a customer and only occasionally rides — sees the hero card correctly report a non-zero total/trip count while the list beneath renders fewer rows than that count, or none at all, with no indication anything is missing. The `tripCount === 0` zero-state branch is never reached (tripCount is nonzero), so the screen fell into the main branch and silently rendered a blank area under a truthful, non-zero total | `apps/mobile/app/earnings/index.tsx:103,126` | MEDIUM | High | **FIXED** |
| WD-028 | The admin overview's "needs attention" stuck-order row hardcoded "no status update in 25+ min while in delivery," quoting the abandoned 25-minute admin-dashboard-only literal DS20-01 (2026-07-20) deliberately unified away. The actual threshold both the dashboard aggregate and the per-order detail badge use is `STUCK_AFTER_MS` = 20 minutes (`apps/api/src/admin/admin.shared.ts`); DS20-01's fix updated the two backend call sites but never touched this frontend prose, so an ops operator triaging the queue saw a threshold that overstated the real one by 5 minutes | `apps/admin/app/page.tsx:187` | LOW | High | **FIXED** |

## Sibling-sweep

**WD-027** — pattern signature: a `<count/total>Var === 0 ?` zero-state gate fed by one query, next to a
rendered list fed by a DIFFERENT, independently-scoped query.
```
grep -rnE "\b\w+(Count|Total)\s*===\s*0\s*\?" apps/mobile/app apps/mobile/src --include="*.tsx" --include="*.ts" | grep -v __tests__
grep -rn "useEarningsSummary|earningsSummary" apps/mobile --include="*.tsx" --include="*.ts" | grep -v __tests__
```
1 gate + `useEarningsSummary` consumed at exactly one call site total. `earnings/index.tsx` is the only
screen that reads `useEarningsSummary()` at all — no sibling call site pairs an unbounded aggregate gate
with a differently-scoped list. **No further siblings.**

**WD-028** — pattern signature: hardcoded numeric-threshold prose in `apps/admin` (a separate
deployable that can't import server-side constants) describing a value also enforced server-side, which
can silently drift stale after the backend value changes.
```
grep -rnE "[0-9]+\+? ?min" apps/admin/app --include="*.tsx"
grep -rn "RIDER_STRIKE_LIMIT|RIDER_STRIKE_COOLDOWN_MS|ON_HOLD_BELOW|SOS_POLICY" apps/admin --include="*.tsx" --include="*.ts"
```
Post-fix, the first grep returns **zero** hits (the only prior hit — the stuck-order row — now reads the
shared `STUCK_AFTER_MINUTES` constant via a template literal instead of a raw number). The second grep
(other product-policy constants that could be independently duplicated in the admin console) returns
**zero** hits — no sibling instance of this drift class exists elsewhere in `apps/admin`. **No further
siblings.**

Both fixes additionally close the underlying class structurally rather than only patching the one call
site: WD-027 makes the mismatch between the header total and the rendered list visible instead of silent
(any future screen with the same "unbounded aggregate gate + differently-scoped list" shape would still
need its own note, but the pattern is now a named, tested helper — `earningsCoverageNote` — to reuse).
WD-028 moves the number into `packages/shared`'s `STUCK_AFTER_MINUTES` (the single source both
`apps/api`'s `STUCK_AFTER_MS` and `apps/admin`'s copy now derive from), so the two literals that drifted
once structurally cannot drift again — the class is closed by construction, not just by this run's sweep.

## Why prior sweeps missed these

- **WD-027** requires an account that is disproportionately active as a **customer** relative to how often
  it rides — every previous WD run's earnings-tab lens exercised a rider-typical account (mostly rider-role
  completions), where the top-50 combined-role window naturally stays dominated by rider trips and the
  header/list agree. The bug only surfaces on the minority-usage-pattern account shape, which none of the
  five prior earnings-tab passes (WD-004, WD-011, WD-022, WD-025, and this lane's own repeated hunts)
  happened to construct.
- **WD-028** is a doc-drift bug in the mirror direction of the DS20-01 fix itself: DS20-01 (2026-07-20)
  fixed the two BACKEND call sites that had drifted to different minute values, but its own sibling-sweep
  was scoped to `apps/api` (`grep -rn "STUCK_AFTER_MS" apps/api/src`) and never crossed into `apps/admin`,
  where the number is unavoidably re-typed as prose (a separate deployable, no shared import path existed
  at the time). The gap sat one hop outside DS20-01's own sweep radius.

## Suggestions (not implemented)

None this run — both findings were straightforward correctness/UX-honesty fixes squarely within scope;
nothing warranted a deferred feature idea.

## Stopping rule

Two findings this run (one MEDIUM, one LOW) — reported in full per the mandatory sibling-sweep evidence
rule, not padded with additional LOW-severity noise: 6 of 8 hunt lenses returned zero, and both findings
sit in code paths that shipped or were touched by runs AFTER the wallet/ledger core's last hardening pass
(WD-021…WD-026), consistent with the core continuing to converge while newer/adjacent surfaces (the
earnings screen's list-vs-total reconciliation, the admin console's copy mirroring a backend constant)
still turn up real, narrow gaps.

## Verification

`pnpm typecheck` (all 5 packages, force-executed — no stale turbo cache) + `pnpm test` (1169 API + 45
admin + 120 shared + 524 mobile, all green — +1 mobile suite/5 tests for `earnings.test.ts`, +1 shared
test for `STUCK_AFTER_MINUTES`, +1 assertion in `admin.service.spec.ts`) + `pnpm --filter @lynia/api build`
+ `pnpm --filter @lynia/admin build` — all green.
