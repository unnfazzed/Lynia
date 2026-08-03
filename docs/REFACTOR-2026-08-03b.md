# Refactoring routine — 2026-08-03b (LC loop R, sixteenth run)

Sixteenth run of the recurring refactoring routine (`docs/ROUTINES.md` → "Refactoring routine"),
run by the temporary LC loop R sprint. Branch `claude/bold-ramanujan-c12ngb`, based on `main` @
`6095bb5` (the fifteenth run's RF-20 PR and the day's other merged lanes).

## Phase 0 — orient

- `docs/REFACTOR-LEDGER.md`: the fifteenth run left the debt register with two OPEN rows needing a
  design pass before any extraction — RF-21 (`send.tsx`) and RF-22 (`rider/(tabs)/index.tsx`),
  RF-21 listed first. Read `docs/ROUTINES.md` § "Refactoring routine" and `docs/KNOWN_BUGS.md` for
  doctrine/dedup.
- `list_pull_requests` (open, `unnfazzed/lynia`) returned one open PR (#541, `LC-A`, a different
  lane) — no `claude/lc-r*`/`claude/refactor-*` PR in flight, no in-flight refactor PR to babysit.
- Gate: fresh checkout needed `pnpm install` + `apps/api`'s `prisma generate` (generated client
  isn't checked in, the same one-time gap every prior run has noted) before
  `pnpm typecheck && pnpm build` went green on clean `main`. The first full `pnpm test` run hit one
  failure — `app/rider/(tabs)/__tests__/index.test.tsx` timing out at the default 5000ms under the
  parallel Turbo run — coincidentally RF-22's own hotspot file, so verified it wasn't a real
  regression before treating the base as green: ran that file in isolation twice (all 4 cases pass
  in <2s both times) and re-ran the full `pnpm test` end to end, which came back 106/106 mobile
  suites, 732/732 tests, clean. Confirmed flaky-under-load, not a broken base — no watchdog
  ledger entry needed.

## Phase 1 — priority order (a): first actionable OPEN row

RF-21 is the first actionable OPEN row, tagged "needs a design pass, not a mechanical move" —
same disposition RF-05b and RF-18 had before their own design-note increments. Per the mission's
explicit instruction ("RF-05b needs its design note written FIRST as its own increment... before
any extraction PR"), this run's one increment is that design pass, written up as
`docs/RF-21-SEND-SCREEN.md`.

**Read the full 958-line file.** Unlike RF-18's target (`food/order/[orderId].tsx`, a clean
9-branch `merchantPhase`/`status` switch where each branch was already a self-contained JSX
block), `send.tsx` is one continuous compose form with a single early-return branch
(`accountOnHold`). Its ~25 pieces of component-local state are entangled through three
cross-cutting concerns that each touch nearly all of them:

- the debounced draft-persistence `useEffect` (8 fields in its dependency array),
- the idempotency-key `useMemo` (the same 8 fields + the nonce),
- `submit()`/`canSubmit` (reads essentially every form field to validate and build the payload).

That means the JSX seams that look natural (map hero vs. compose sheet) don't bound the state —
moving a JSX block out doesn't remove its fields from those three lists. Same shape RF-05b hit:
a boundary that *looks* clean on the JSX surface is crossed by logic that has to run somewhere.

**Findings, in full in `docs/RF-21-SEND-SCREEN.md`:**

- **One clean RF-18-shaped seam, ready for extraction next run:** the `accountOnHold` early-return
  (lines 590-608) — a full alternate view, ~6 bounded props (`activeOrder`, `activeOrderQ.isError`/
  `isFetching`/`refetch`, `meQ.isFetching`/`refetch`), no local state, no draft/idempotency/submit
  coupling (a held account can't reach submit — the wall replaces the whole screen). This is next
  run's actionable RF-21 increment.
- **Four bounded presentational sub-blocks**, each real but scoped to its own future PR per the
  one-concern rule: Landmarks & details collapsible (~10 props), Items list (~6 props),
  Recipient-phone block, Price/quote block.
- **WONT-DO (as a single extraction): the whole compose-sheet body.** Bundling all four sub-blocks
  plus the cross-cutting `busy`/`error`/`canSubmit`/`outOfArea`/`onBroadcast` state into one
  component would need ~25+ props — the same "port nearly as wide as the parent's own constructor"
  failure mode RF-05b's design doc identified for `tracking.gateway.ts`. The map-hero wrapper
  (lines 610-714) is already thin (delegates to `ComposeMap`/`MapHomeTopBar`/`AddressRows`/
  `AddressSearch`) and isn't worth extracting on its own — what's left is mostly wiring shared with
  the draft/idempotency dependency lists.

No code changed this run — the design note and ledger update are the only diff, matching the
mission's expectation that a design-note increment precedes any extraction PR for an entangled or
sensitive screen.

## What was deliberately skipped

- RF-22 (`rider/(tabs)/index.tsx`) — still OPEN, still needs its own design pass; not started this
  run since RF-21 was first in the debt register and one design-pass increment is this firing's
  scope (matches the fifteenth run's own reasoning for not doing two large-screen triages in one
  firing).
- The `accountOnHold` extraction itself — deliberately not done in the same PR as the design note,
  per the mission's explicit two-step precedent (design note as its own increment, extraction as
  the next one).
- No fresh hotspot recompute this run — priority order (a) had an actionable OPEN row, so step (b)
  (recompute) wasn't reached; the fifteenth run's recompute is still current.

## Self-disable check

Not exhausted: RF-21 (extraction) and RF-22 (design pass) are both actionable OPEN rows going into
the next firing. No trigger-disable action taken this run.

## Ledger

`docs/REFACTOR-LEDGER.md` updated in this PR: RF-21's debt-register row updated to reflect the
design pass and its next-increment scope, new completed-log entry at the top, "Last updated" note
revised. This report replaces the fifteenth run's same-date report (`REFACTOR-2026-08-03.md`,
deleted in this PR) per the docs retention policy — that run's findings (RF-20 DONE, RF-21/RF-22
triaged) are preserved in the ledger's hotspot map, debt register, and completed log, which are
the durable record.
