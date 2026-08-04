# Refactoring routine — 2026-08-04b (LC loop R, eighteenth run)

Eighteenth run of the recurring refactoring routine (`docs/ROUTINES.md` → "Refactoring routine"),
run by the temporary LC loop R sprint. Branch `claude/lc-r-20260804b`, based on `main` @ `4f992ea`
(the prior run's `accountOnHold` extraction PR plus same-day merges from other lanes).

## Phase 0 — orient

- `docs/REFACTOR-LEDGER.md`: the seventeenth run's `accountOnHold` extraction left RF-21 OPEN,
  re-scoped to its four remaining bounded sub-block extractions (Landmarks & details, Items list,
  Recipient-phone, Price/quote), with Landmarks & details named as the smallest/most self-contained
  next increment. RF-22 stayed OPEN, still needing its own design pass. Read `docs/ROUTINES.md` §
  "Refactoring routine" and `docs/KNOWN_BUGS.md` for doctrine/dedup.
- `list_pull_requests` (open, `unnfazzed/lynia`) returned three open PRs: a `release-please`
  automated release branch, and two PRs from other lanes (LC loop B `claude/ecstatic-pascal-nb4xpb`,
  LC loop C `claude/admiring-albattani-5jzsjz`) — no `claude/lc-r*`/`claude/refactor-*` PR in
  flight, so no in-flight refactor PR to babysit.
- Gate: fresh checkout from `origin/main` needed `pnpm install` + `apps/api`'s `prisma generate`
  (generated client isn't checked in, the same one-time gap every prior run has noted) before
  `pnpm typecheck && pnpm build && pnpm test` went green: 6/6 typecheck tasks, 5/5 build tasks, 97
  API test files / 1540 API tests + 110 mobile suites / 769 mobile tests + admin/merchant/shared
  suites all green. Clean base confirmed.

## Phase 1 — priority order (a): first actionable OPEN row

RF-21's prior run named the next increment explicitly: extract the "Landmarks & details"
collapsible (the tap-to-expand section holding pickup/drop landmark fields + declared value) from
`apps/mobile/app/send.tsx` — per `docs/RF-21-SEND-SCREEN.md`, a clean ~10-prop extraction with no
local state of its own and no draft/idempotency/submit coupling, the same shape as RF-18's
pure-prop branches.

**Executed exactly that.** Moved the block verbatim to a new
`apps/mobile/src/ui/send/SendLandmarksDetails.tsx` (12 props: `detailsOpen`/`toggleDetails`,
`landmarksOk`/`declaredValueOk`, pickup/drop landmark value + "from map" flag + onChange callback,
declaredValue + onChange), following the `apps/mobile/src/ui/send/*` extraction convention the
prior run's `SendAccountOnHoldView.tsx` established. The toggle state, validation booleans, and
field values all stay owned by `send.tsx` and thread down as props — nothing about the
draft-persistence/idempotency/submit entanglement the design note flagged as unsplittable was
touched.

**Characterization tests added first**, per the routine's "uncovered code gets tests first, same
PR" rule: `app/__tests__/send.test.tsx` had zero coverage of this collapsible before now. Added 3
cases pinning its exact pre-extraction behavior:

1. The collapsed-state header's accessibility-label summary ("landmarks required" when empty) and
   the toggle expanding/collapsing the panel — including that the landmark/declared-value fields
   only mount while open.
2. A reverse-geocoded landmark is labeled "• from map" until the user hand-edits it, at which point
   the label drops (mirrors `editPickupLandmark`'s `setPickupLandmarkFromMap(false)`).
3. A declared value outside $0–150 shows the inline red validation message, which clears once the
   value is back in range.

All 3 passed against the pre-extraction code first (confirming they characterize existing
behavior, not new behavior), then again after the move.

## What was deliberately skipped

- The three remaining bounded presentational sub-blocks the design note identified (Items list,
  Recipient-phone, Price/quote) — each is its own future one-concern PR per the design note's
  explicit sequencing; bundling any of them into this run's PR would exceed one refactoring
  concern.
- RF-22 (`rider/(tabs)/index.tsx`) — still OPEN, still needs its own design pass; not started this
  run since RF-21's next sub-block was the first actionable row.
- No fresh hotspot recompute this run — priority order (a) had an actionable OPEN row, so step (b)
  wasn't reached; the prior recompute (2026-08-02, merchant/food-scoped) is still current.

## Self-disable check

Not exhausted: RF-21 (three remaining sub-block extractions) and RF-22 (design pass) are both
actionable/pending going into the next firing. No trigger-disable action taken this run.

## Verification

`pnpm typecheck && pnpm build && pnpm test` green pre+post (97 API test files / 1540 API tests,
110 mobile suites / 772 mobile tests — +3 net new characterization tests, none removed/weakened;
9 admin + 24 merchant + 9 shared test files, all unchanged counts), `pnpm lint` 0 new warnings (1
pre-existing unrelated `admin-orders.service.spec.ts` shadow warning; mobile itself 0/0 on 309
files, `check-font-charset` OK), `pnpm run depcruise` 0 new violations (4 pre-existing unrelated
mobile orphan infos, matching prior baseline — `SendLandmarksDetails.tsx` isn't orphaned, it's
imported by `send.tsx`). Public surface untouched: no controller/route/DTO/socket-event touched,
`packages/shared` untouched, `send.tsx`'s default export/route path unchanged, mobile stays
JS/TSX-only and OTA-able. 3 files / 128 raw changed lines in tracked files + 1 new 89-line file
(well under the ~400-line guideline).

## Ledger

`docs/REFACTOR-LEDGER.md` updated in this PR: RF-21's debt-register row updated to record the
"Landmarks & details" extraction as done and re-scope the row to its three remaining sub-block
extractions (next: Items list), new completed-log entry at the top, "Last updated" note revised,
hotspot map row 17 line count refreshed. This report replaces the seventeenth run's report
(`REFACTOR-2026-08-04.md`, deleted in this PR) per the docs retention policy — that run's findings
(the `accountOnHold` extraction) are preserved in the ledger's debt register and completed log,
which are the durable record.
