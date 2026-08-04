# Refactoring routine — 2026-08-04f (LC loop R, twenty-second run)

Twenty-second run of the recurring refactoring routine (`docs/ROUTINES.md` → "Refactoring
routine"), run by the temporary LC loop R sprint. Branch `claude/bold-ramanujan-2rfnbe`, based on
`origin/main` @ `698e80d` (the twenty-first run's "Price/quote" extraction PR plus same-day merges
from other lanes).

## Phase 0 — orient

- `docs/REFACTOR-LEDGER.md`: the twenty-first run's "Price/quote" extraction finished RF-21. RF-22
  (`apps/mobile/app/rider/(tabs)/index.tsx`) was left as the only actionable OPEN row, tagged "needs
  its own design pass" — same disposition RF-05b/RF-18/RF-21 had before their own design passes.
  Read `docs/ROUTINES.md` § "Refactoring routine" and `docs/KNOWN_BUGS.md` for doctrine/dedup.
- `list_pull_requests` (open, `unnfazzed/Lynia`) returned three open PRs (`claude/admiring-albattani-y504ri`
  — LC loop C, `claude/lc-a-20260804` — LC loop A, and a release-please PR) — none on a
  `claude/lc-r*`/`claude/refactor-*` branch, so no in-flight PR from this lane to babysit.
- Gate: fresh checkout needed `pnpm install` + `apps/api`'s `prisma generate` (generated client
  isn't checked in, the same one-time gap every prior run has noted) before
  `pnpm typecheck && pnpm build && pnpm test`:
  - `pnpm typecheck` — 6/6 packages green.
  - `pnpm build` — 5/5 tasks green (API has no build task; admin/merchant/mobile/shared/design all
    compiled clean).
  - `pnpm test` — first full run: 97 API test files / 1540 API tests green, but
    `app/rider/(tabs)/__tests__/index.test.tsx` (the RF-22 file's own test suite) hit a "Exceeded
    timeout of 5000 ms" on one test under the full-monorepo parallel `pnpm test` invocation.
    Re-ran that single test in isolation — passed in 334ms. Re-ran the full mobile suite alone a
    second time — 120/120 suites, 859/859 tests green, no failure. Confirmed CPU-contention flake
    (all packages' test suites competing for workers under one `turbo run test` invocation),
    not a regression — the gate is treated as green. (Noted here rather than silently ignored,
    per the "never refactor on a broken base" spirit — the flake is now on record if it recurs.)

## Phase 1 — priority order (a): first actionable OPEN row

RF-22 was the first (and only) actionable OPEN debt-register row, tagged "needs a design pass
before any extraction, not a mechanical move" — the exact disposition RF-05b/RF-18/RF-21 had before
their own design passes were written as dedicated increments. Per the mission's priority order,
wrote that design pass this run rather than attempting an extraction directly.

**`docs/RF-22-RIDER-BOARD-SCREEN.md`** inventories the screen's ~25 pieces of state (GPS, heartbeat,
KYC-reconcile, bid-draft hydrate/persist, sent-offers hydrate/persist/sweep) and classifies the six
JSX blocks the earlier B-O1b/B-O9 work already hoisted to local consts (specifically so the screen's
`FlatList`/`ScrollView` return branches render byte-identical shared markup):

- **4 cleanly separable, non-sensitive** — `activeJobBanner` (+ the already-standalone
  `ActiveJobCheckFailedBanner` helper), `sentOffersSection`, `trailingFooterContent`,
  `onlineToggleCard`. Each has a bounded, enumerable prop set and no local state of its own. The
  last one (`onlineToggleCard`) triggers the `setOnline` presence mutation but is explicitly reasoned
  as *not* SENSITIVE per the hotspot map's own bucket definition (bid acceptance / order assignment
  / agreed-price / KYC gating) — it's a presence toggle, not one of those four.
- **1 separable but SENSITIVE** — `selectedCard`, the bid-compose card (`makeOffer` submit), same
  bucket as `order/[id].tsx`/`rider/job.tsx`. Mechanically as extractable as the other four (bounded
  props, RF-18-third-extraction-shaped), but flagged for its own PR with the sensitive-lane
  doctrine's four-question format in the body, sequenced last so its diff carries no other unrelated
  JSX movement.
- **1 not worth it** — `boardBanner` (six lines, two static props + two router callbacks) — WONT-DO
  as its own extraction, net-negative indirection.

Also traced whether the `FlatList`/`ScrollView` duplication itself (each return carries its own copy
of the "Open orders" section body) is in scope — concluded it's a structural merge question (a
`FlatList` and a bare `.map()` can't share one render path without a wider shared interface), not a
JSX-extraction question, same reasoning RF-05b/RF-21 used for their own "combine the branches"
candidates. Out of scope for a behavior-preserving refactor.

**No code changed this run — docs only.**

## What was deliberately skipped

- The actual extractions the design note recommends (`activeJobBanner` first) — priority order (a)
  requires the design note to land as its own increment before any extraction PR, mirroring
  RF-05b/RF-18/RF-21's own sequencing.
- A fresh hotspot recompute — priority order (a) had an actionable OPEN row (RF-22), so step (b)
  wasn't reached; the prior recompute (2026-08-02, merchant/food-scoped) is still current.

## Self-disable check

Not exhausted: RF-22 has five queued extraction increments (four non-sensitive, one sensitive) per
the design note's recommended sequence — the next firing's actionable row is the `activeJobBanner`
extraction. No trigger-disable action taken this run.

## Verification

`pnpm typecheck && pnpm build && pnpm test` green pre+post (no source file touched, so behavior is
unchanged by construction): 97 API test files / 1540 API tests, 120 mobile suites / 859 mobile
tests (after confirming the one observed failure was a CPU-contention flake, not a regression — see
Phase 0), 9 admin + 24 merchant + 9 shared test files, all unchanged counts. Public surface
untouched: docs-only diff, no controller/route/DTO/socket-event/screen file touched. 3 files (new
design doc, ledger update, this report; the twenty-first run's report deleted per retention) — well
under the ~400-line guideline.

## Ledger

`docs/REFACTOR-LEDGER.md` updated in this PR: RF-22's debt-register row updated from "OPEN — needs a
design pass first" to "OPEN — design pass done, next increment is the `activeJobBanner`
extraction"; new completed-log entry at the top; "Last updated" note revised. This report replaces
the twenty-first run's report (`REFACTOR-2026-08-04e.md`, deleted in this PR) per the docs retention
policy — that run's findings (the "Price/quote" extraction, RF-21's completion) are preserved in the
ledger's debt register and completed log, which are the durable record.
