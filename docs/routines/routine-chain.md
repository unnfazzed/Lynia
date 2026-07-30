# Paced all-day routine chain — schedule source of truth

Added 2026-07-30 per user instruction: *"run the routines all day, one task after another, to
max out tokens but not deplete credits too — and plan to increase the frequency."* This file is
the reviewable source of truth for the **schedule** (the cron grid); `docs/ROUTINES.md` remains
the source of truth for each routine's **policy**, and the `docs/routines/*.md` mirrors for each
routine's **prompt**. When the three disagree, the live trigger is what actually runs — reconcile
toward it (see `docs/routines/README.md`).

## The design in one paragraph

The ask has a built-in tension — *max tokens* and *don't burn credits* pull opposite ways. The
resolution is: **saturate the day with productive work but serialize it and cap the count.** A
fixed hourly grid of pre-scheduled trigger firings means (a) the schedule itself is the cap — there
is no orchestrator that could loop away credits, (b) slots never share an hour, so at most one
heavy session bills at a time, and (c) the token spend goes where it converts to shipped work (the
build loops), while the maintenance routines interleave in the gaps and keep deduping through
`docs/KNOWN_BUGS.md` so extra cadence never re-bills rediscovery.

Why not more bug-finder frequency? The four bug-finders are deliberately spaced so each one's PR
merges before the next starts (that is how they stay disjoint — `docs/ROUTINES.md` §schedule).
Running them back-to-back mostly makes them re-scan an unchanged tree and dedup against each other:
tokens spent, little new signal. So the frequency bump goes to the **build loops**, which turn
tokens into launch progress, and the maintenance lanes stay at a steady interleave.

## The grid (UTC — one heavy session per hour)

| Hour | Lane | Trigger |
|---|---|---|
| 02 | **M** — maintenance rotation | (standing routine, re-timed) |
| 05 | **M** — maintenance rotation | (standing routine, re-timed) |
| 08 | **M** — maintenance rotation | (standing routine, re-timed) |
| 09 | Build **C** — restaurants backend | `0 9,15,21 * * *` |
| 10 | Build **A** — customer home + IA | `0 10,16,22 * * *` |
| 11 | Build **B** — one rider app | `0 11,17,23 * * *` |
| 12 | Build **D** — food UI | `0 12,18,0 * * *` |
| 13 | Build **E** — merchant tablet | `0 13,19,1 * * *` |
| 14 | **M** — maintenance rotation | (standing routine, re-timed) |
| 15 | Build **C** | ″ |
| 16 | Build **A** | ″ |
| 17 | Build **B** | ″ |
| 18 | Build **D** | ″ |
| 19 | Build **E** | ″ |
| 20 | **M** — maintenance rotation | (standing routine, re-timed) |
| 21 | Build **C** | ″ |
| 22 | Build **A** | ″ |
| 23 | Build **B** | ″ |
| 00 | Build **D** | ″ |
| 01 | Build **E** | ″ |

Idle by design: **03, 04, 06, 07 UTC** — breathing room, and the margin that absorbs a session
that overruns its hour without colliding with the next.

- **15 build sessions/day** (each of the 5 loops 3×/day, up from 2×). Backend lane **C** leads
  every cycle so its dependants **D** and **E** find their gate (`C1`/`C2`/`C4`) satisfied — a D/E
  firing whose gate is still unmet just exits quietly per its Phase-0, costing almost nothing.
- **5 maintenance sessions/day** on `0 2,5,8,14,20 * * *`, rotating the eight standing lanes
  (bug-hunting → ux → deep-sweep → wallet → refactoring → documentation → pr-health → performance),
  so each lane recurs roughly every 1.6 days. Each `M` firing follows its lane's mirror
  (`docs/routines/<lane>.md`) and the universal policies unchanged.
- **Hard daily cap = 20 sessions.** Serial, so never more than one billing at once.

## The frequency dial (how to "increase the frequency" safely)

One lever at a time, each reversible:

1. **Fill an idle hour** — move a maintenance slot into `03/04/06/07`, or add a sixth build cycle.
2. **Halve the cadence** — add `:30` build slots (e.g. `30 9,15,21`), turning 15 build slots into
   30. Only do this once you've confirmed a typical build session finishes inside 30 min, or slots
   will overlap and two heavy sessions will bill at once — which defeats the serial guarantee.
3. **Widen the maintenance rotation** — add hours to `0 2,5,8,14,20` for more quality cadence
   (diminishing returns per the note above; prefer lever 1 or 2 first).

To **turn it down** (credits tightening): drop a build cycle back to 2×/day (`0 9,15` etc.), or
thin the maintenance slots. The grid degrades gracefully — no single edit breaks another lane.

## Applying / reverting

Build loops (owned by this account, created via the session `create_trigger` path, so their
schedule is editable in place with `update_trigger` — a **schedule-only** edit that preserves each
loop's bound `session_context`: repo source + subagent tools):

| Loop | trigger_id | New cron | Old cron |
|---|---|---|---|
| C — restaurants backend | `trig_012bebUbKJUibgGpyzcs1g1V` | `0 9,15,21 * * *` | `0 10,17 * * *` |
| A — customer home + IA | `trig_01WUn4DAWinLN39fBH43mb1Z` | `0 10,16,22 * * *` | `0 12,19 * * *` |
| B — one rider app | `trig_01BRx1GzXAfSdJB5RD8AjeSK` | `0 11,17,23 * * *` | `0 16,22 * * *` |
| D — food UI | `trig_01BrDbbtyyFdgtf4kTvVM4Eg` | `0 12,18,0 * * *` | `0 11,18 * * *` |
| E — merchant tablet | `trig_011vw7C3qbVcaX3exRwWM5e8` | `0 13,19,1 * * *` | `0 13,21 * * *` |

Revert = `update_trigger` each back to its Old cron. The loops still self-disable when their lane
checklist completes, unchanged.

**Maintenance lanes:** the eight standing routines re-time to the `M` slots the same way — a
schedule-only `update_trigger` of each standing trigger's `cron_expression` to a slice of
`0 2,5,8,14,20 * * *`. They were created via the `meta_mcp` path and do not surface as editable
triggers from every session, so their re-timing must be run from a session whose account owns
them (their prompts are untouched — this is purely a schedule move). Until that is applied they
keep their existing crons (`docs/routines/README.md` table); the grid above is their target and
the build-loop half of the chain is live regardless.

> **Never create a replacement "conductor" trigger for this via the session `create_trigger`
> tool** — it cannot carry the `session_context` (repo source + subagent allowlist) the routines
> need, so the fresh session would come up without the repo. The chain is expressed as re-timed
> *existing* triggers precisely to keep that context intact.
