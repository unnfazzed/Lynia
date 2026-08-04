# Refactoring routine — 2026-08-04c (LC loop R, nineteenth run)

Nineteenth run of the recurring refactoring routine (`docs/ROUTINES.md` → "Refactoring routine"),
run by the temporary LC loop R sprint. Branch `claude/lc-r-20260804c`, based on `main` @ `ccc6f24`
(the prior run's "Landmarks & details" extraction PR plus same-day merges from other lanes).

## Phase 0 — orient

- `docs/REFACTOR-LEDGER.md`: the eighteenth run's "Landmarks & details" extraction left RF-21 OPEN,
  re-scoped to its two remaining bounded sub-block extractions (Items list, Recipient-phone,
  Price/quote — three, not two; the ledger row lists all three), with Items list named as the
  smallest/most self-contained next increment. RF-22 stayed OPEN, still needing its own design
  pass. Read `docs/ROUTINES.md` § "Refactoring routine" and `docs/KNOWN_BUGS.md` for
  doctrine/dedup.
- `list_pull_requests` (open, `unnfazzed/lynia`) returned one open PR: `claude/ecstatic-pascal-ppcpze`
  (PR #568, LC loop B, `AuctionClock` urgency crossfade) — a different lane, not
  `claude/lc-r*`/`claude/refactor-*`, so no in-flight refactor PR to babysit.
- The local designated branch (`claude/bold-ramanujan-bhf0y3`) had no unique commits — it was an
  ancestor of `origin/main` — so it was reset to `origin/main` (`ccc6f24`) before starting.
- Gate: fresh checkout needed `pnpm install` + `apps/api`'s `prisma generate` (generated client
  isn't checked in, the same one-time gap every prior run has noted) before
  `pnpm typecheck && pnpm build && pnpm test` went green: 6/6 typecheck tasks, 5/5 build tasks, 97
  API test files / 1540 API tests + 112 mobile suites / 784 mobile tests + admin/merchant/shared
  suites all green. Clean base confirmed.

## Phase 1 — priority order (a): first actionable OPEN row

RF-21's prior run named the next increment explicitly: extract the "Items list" section (the
repeatable description + quantity rows, `items`/`updateItem`/`addItem`/`removeItem`) from
`apps/mobile/app/send.tsx` — per `docs/RF-21-SEND-SCREEN.md`, a clean self-contained extraction
with no coupling to anything outside the list itself.

**Executed exactly that.** Moved the block verbatim to a new
`apps/mobile/src/ui/send/SendItemsList.tsx` (4 props: `items`, `updateItem`, `addItem`,
`removeItem`). `MAX_ITEMS` — a pure constant, not local state — is imported directly into the new
file rather than threaded as a fifth prop, the same treatment `SendLandmarksDetails.tsx` gave
`tokens`/`Field`/`Icon`. `Label` and `QtyStepper` were only referenced inside this block in
`send.tsx`, so their imports were dropped from the screen once the block moved (both are still
imported fresh inside the new file); `Field`/`Icon`/`Button` stay imported in `send.tsx` since each
has a remaining call site elsewhere in the screen.

**Characterization tests added first**, per the routine's "uncovered code gets tests first, same
PR" rule: `app/__tests__/send.test.tsx` had zero dedicated coverage of add/remove/max-items
behavior before now (only an incidental fill of the first item's field, via the LC-C06 draft-flush
test). Added 3 cases pinning the pre-extraction behavior:

1. A single item row shows no "Remove" affordance; adding a row reveals "Remove item 1" and
   "Remove item 2" on both rows.
2. Removing a row deletes it and drops that row's fields; the last remaining row again has no
   Remove affordance.
3. "Add another item" hides once 10 rows (`MAX_ITEMS`) exist, replaced by the "Up to 10 items per
   order." notice — pinned precisely via "Remove item 10" present / "Remove item 11" absent, not a
   raw field count (react-test-renderer's tree walk visits both the composite `TextInput` instance
   and its underlying host node for the same field, so a naive `.toBe(N)` on
   `accessibilityLabel + onChangeText` double-counts; switched those assertions to
   presence/absence checks, matching the convention the file's existing on-hold/landmarks tests
   already used, and used per-row `Remove item N` labels — which aren't affected by that
   duplication — for the one place an exact count actually mattered).

All 3 passed against the pre-extraction code first (confirming they characterize existing behavior,
not new behavior), then again after the move.

## What was deliberately skipped

- The two remaining bounded presentational sub-blocks the design note identified (Recipient-phone,
  Price/quote) — each is its own future one-concern PR per the design note's explicit sequencing;
  bundling either into this run's PR would exceed one refactoring concern.
- RF-22 (`rider/(tabs)/index.tsx`) — still OPEN, still needs its own design pass; not started this
  run since RF-21's next sub-block was the first actionable row.
- No fresh hotspot recompute this run — priority order (a) had an actionable OPEN row, so step (b)
  wasn't reached; the prior recompute (2026-08-02, merchant/food-scoped) is still current.

## Self-disable check

Not exhausted: RF-21 (two remaining sub-block extractions: Recipient-phone, Price/quote) and RF-22
(design pass) are both actionable/pending going into the next firing. No trigger-disable action
taken this run.

## Verification

`pnpm typecheck && pnpm build && pnpm test` green pre+post (97 API test files / 1540 API tests,
112 mobile suites / 787 mobile tests — +3 net new characterization tests, none removed/weakened;
9 admin + 24 merchant + 9 shared test files, all unchanged counts), `pnpm lint` 0 new warnings (1
pre-existing unrelated `admin-orders.service.spec.ts` shadow warning; mobile itself 0/0 on 313
files, `check-font-charset` OK), `pnpm run depcruise` 0 new violations (5 pre-existing unrelated
mobile orphan infos, confirmed identical via a `git stash -u` baseline diff on clean `main` —
`SendItemsList.tsx` isn't orphaned, it's imported by `send.tsx`). Public surface untouched: no
controller/route/DTO/socket-event touched, `packages/shared` untouched, `send.tsx`'s default
export/route path unchanged, mobile stays JS/TSX-only and OTA-able. 2 files / 114 raw changed
lines in tracked files + 1 new 73-line file (well under the ~400-line guideline).

## Ledger

`docs/REFACTOR-LEDGER.md` updated in this PR: RF-21's debt-register row updated to record the
"Items list" extraction as done and re-scope the row to its two remaining sub-block extractions
(next: Recipient-phone, then Price/quote), new completed-log entry at the top, "Last updated" note
revised, hotspot map row 17 line count refreshed. This report replaces the eighteenth run's report
(`REFACTOR-2026-08-04b.md`, deleted in this PR) per the docs retention policy — that run's findings
(the "Landmarks & details" extraction) are preserved in the ledger's debt register and completed
log, which are the durable record.
