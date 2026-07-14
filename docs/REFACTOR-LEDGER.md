# REFACTOR-LEDGER.md — refactoring-routine memory

**Purpose.** The recurring refactoring routine (see `docs/ROUTINES.md` → "Refactoring
routine") reads this file FIRST on every run and writes back to it in the same PR as its
changes. It carries four things between runs: the hotspot map, the debt register, in-flight
multi-run migrations, and the completed-refactor log. Without this file the routine
re-analyzes from scratch; with it, each run resumes where the last one stopped.

**Last updated:** 2026-07-14 (seeded; no refactoring run has executed yet).

## Hotspot map

Ranked churn × complexity candidates. Recompute each run (churn window: last 45 days of
`git log --name-only`; complexity proxy: file length + lint-reported complexity +
`any`-density) and reconcile against this table — a hotspot that was refactored should drop
off; a persistent riser is the next target.

| Rank | File | Churn (45d commits) | Why it's hot | Status |
|---|---|---|---|---|
| — | _(seeded empty — first run populates)_ | | | |

## Debt register

Every distinct refactoring opportunity found gets a row, whether or not it was done in that
run. IDs are `RF-NN`. Kind is one of: `dead-code`, `duplication`, `oversized`, `misplaced`,
`type-safety`, `test-health`, `migration`.

| ID | File(s) | Kind | Description | Effort | Status | PR |
|---|---|---|---|---|---|---|
| — | _(seeded empty)_ | | | | | |

Statuses: `OPEN` (found, not started), `BLOCKED-NO-TESTS` (needs characterization tests
first — say which behaviors to pin), `IN-PROGRESS` (multi-run; see migrations below),
`DONE` (link PR), `WONT-DO` (say why — e.g. cold code, style-only churn).

## In-flight strangler migrations

Multi-run refactors only. Each entry tracks: target, the new path introduced, callers moved
so far / remaining, and the deletion condition for the old path. A migration entry with no
movement across 3 consecutive runs must be either finished next run or downgraded to
`WONT-DO` with a reason — no zombie migrations.

_(none yet)_

## Completed-refactor log

One line per merged refactor PR, newest first: date, PR, RF-IDs, one-line summary,
before/after evidence (e.g. "exports diff clean, 14 tests green pre+post").

_(none yet)_
