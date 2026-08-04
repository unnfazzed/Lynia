# Routine schedule — source of truth

This file is the reviewable source of truth for **when** the Claude routines run.
`docs/ROUTINES.md` remains the source of truth for each routine's **policy**, and the
`docs/routines/*.md` mirrors for each routine's **prompt**. When the three disagree, the live
trigger is what actually runs — reconcile toward it (see `docs/routines/README.md`).

## Current cadence — weekly, Sundays (user instruction 2026-08-04)

> *"i now want these claude routines to be run once a week on Sunday"*

Every routine that runs against this repo fires **once a week, on Sunday (UTC)**. This replaces the
paced all-day chain of 2026-07-30 (24 sessions/day, ~168/week) with **one Sunday chain of 14 slots**
— roughly a 92% cut in scheduled sessions, and the single largest credit lever available.

The design constraints from the all-day chain are preserved, just compressed onto one day:

- **Serial by construction.** One slot per hour, never two in the same hour, so at most one heavy
  session bills at a time.
- **Order still encodes the dependencies.** The four bug-finders run first and 2 h apart so each
  one's ledger/report PR merges before the next starts (that is how they stay disjoint —
  `docs/ROUTINES.md` §bug-dedup). Documentation reconciliation follows the fixes; refactoring runs
  last on the most-settled tree; the PR-health watchdog closes the day out.
- **The LC lanes interleave on the even hours**, exactly as they did on the hourly grid, and keep
  deduping through `docs/KNOWN_BUGS.md`.

### The Sunday grid (UTC)

| Hour | Lane | Cron | Trigger |
|---|---|---|---|
| 00 | **LC steer** — replan (re-ranks the lanes before they fire) | `0 0 * * 0` | ✅ applied |
| 01 | **Bug hunting** | `0 1 * * 0` | ⏳ needs the Routines UI (see below) |
| 02 | **LC-A** — size & data diet | `0 2 * * 0` | ✅ applied |
| 03 | **User experience improvements** | `0 3 * * 0` | ⏳ needs the Routines UI |
| 04 | **LC-B** — Go-class runtime perf | `0 4 * * 0` | ✅ applied |
| 05 | **Deep bug sweep** | `0 5 * * 0` | ⏳ needs the Routines UI |
| 06 | **LC-C** — offline & 2G resilience | `0 6 * * 0` | ✅ applied |
| 07 | **Documentation update** | `0 7 * * 0` | ⏳ needs the Routines UI |
| 08 | **LC-D** — journey & soundness sweep | `0 8 * * 0` | ✅ applied (lane complete — trigger disabled) |
| 09 | **Wallet & data-lifecycle audit** | `0 9 * * 0` | ⏳ needs the Routines UI |
| 10 | **LC-R** — refactoring sprint | `0 10 * * 0` | ✅ applied |
| 11 | **Performance watch** | `0 11 * * 0` | ✅ already weekly-Sunday — unchanged |
| 13 | **Refactoring** | `0 13 * * 0` | ⏳ needs the Routines UI |
| 22 | **PR health & delivery watchdog** | `0 22 * * 0` | ⏳ needs the Routines UI |

Hours 12, 14–21 and 23 are idle — overrun margin for a long session, and the headroom the
frequency dial spends first if the cadence is ever raised again.

Two deliberate order changes vs. the daily chain, both consequences of compressing to one day:

1. **Refactoring moved from "after doc-sync" to last (13:00).** Its spec rationale — start from a
   tree the fix routines and doc reconciliation have already settled — is *better* satisfied at the
   end of the chain than in the middle of it. It also keeps a 3 h gap from LC-R (10:00), so the two
   refactoring lanes never hold two open refactor PRs against the same hotspot.
2. **Wallet & data-lifecycle audit moved to 09:00, ahead of refactoring.** It stays last among the
   *bug-finders* (its spec's actual requirement) and still inherits everything the earlier lanes
   merged.

### Trade-off worth knowing: the watchdog is now weekly too

The PR-health watchdog used to run 4×/day (`0 2,8,14,20`), which is what caught a stalled or red PR
within hours. At `0 22 * * 0` it sweeps the Sunday chain's own PRs and nothing else — a PR that goes
red on Monday sits until the following Sunday. This is acceptable because every routine merges its
own PR on green (universal policy 1) and the watchdog is a backstop, not the primary path. **If PRs
start stalling, the cheapest fix is a single mid-week watchdog slot** (e.g. `0 22 * * 0,3`) — one
edit, reversible, and far cheaper than restoring any hunting lane.

### The frequency dial

One lever at a time, each reversible, cheapest first:

1. **Add a mid-week watchdog slot** — `0 22 * * 0,3`. Delivery hygiene only; almost no token cost.
2. **Add a second day** — move the whole grid to `* * 0,3` (Sunday + Wednesday), doubling cadence
   while keeping the serial guarantee intact.
3. **Fill the idle hours** — 12, 14–21, 23 are free for a second pass of the heaviest lanes.
4. **Return to the daily chain** — the 2026-07-30 grid is preserved below; every cron in it is a
   single `update_trigger` away.

To turn it **down** further: disable individual LC lanes (they resume where they left off — their
state lives in the program doc's checklists, not the trigger), or drop the standing lanes you value
least. The grid degrades gracefully — no single edit breaks another lane.

## Applying / reverting

**LC lanes** (created via the session `create_trigger` path, so schedule/prompt/model are editable
in place with `update_trigger` — a schedule-only edit preserves each loop's bound `session_context`:
repo source + subagent tools). **All six were re-timed to the Sunday grid on 2026-08-04:**

| Loop | trigger_id | Cron (weekly) | Previous (sprint) | State |
|---|---|---|---|---|
| LC steer — replan | `trig_015tKgeoWM6b5RWQcLF6PbA4` | `0 0 * * 0` | `30 5,17 * * *` | enabled |
| LC-A — size & data diet | `trig_0162YfHfSRVt6pwdt2f9b6C7` | `0 2 * * 0` | `40 */3 * * *` | enabled |
| LC-B — Go-class runtime perf | `trig_015XeLQaP76oxec1uLvrHBno` | `0 4 * * 0` | `15 */3 * * *` | enabled |
| LC-C — offline & 2G resilience | `trig_019iywx2Jg44wWTvhjR8YiVx` | `0 6 * * 0` | `30 */3 * * *` | enabled |
| LC-D — journey & soundness sweep | `trig_01QTyPeoNaV4kk8rFMWBXTNR` | `0 8 * * 0` | `45 */3 * * *` | **disabled** — Lane D complete |
| LC-R — refactoring sprint | `trig_015cSL8dCPaZdociia4mqAjB` | `0 10 * * 0` | `55 */3 * * *` | enabled |

> **The Tuesday-night sprint revert was deleted, not left to fire.** The 2026-08-02 sprint scheduled
> a one-shot reminder for 2026-08-04 23:00 UTC to put every LC lane back on its *daily* cron and
> disable LC-R. Under the weekly directive that revert would have silently undone the new schedule
> hours after it was set, and its prompt could not be re-pointed (a one-shot bound to another
> session is not editable in place), so it was deleted. **LC-R therefore survives the sprint** and is
> now the weekly refactoring lane alongside the standing routine — they dedupe through
> `docs/REFACTOR-LEDGER.md` as they did during the sprint. Disable it if the standing refactoring
> routine is confirmed running and one refactor lane per week is enough.

**The eight standing routines** were created via the `meta_mcp` path and **do not surface as
editable triggers from a routine or interactive session on this account** — `list_triggers` does not
return them, so their crons cannot be moved programmatically from here. Set each one's schedule in
the **claude.ai Routines UI** (each Routine → schedule) to the value in the grid above:

| Routine | New cron | Old cron |
|---|---|---|
| Bug hunting | `0 1 * * 0` | `0 23 * * *` |
| User experience improvements | `0 3 * * 0` | `0 1 * * *` |
| Deep bug sweep | `0 5 * * 0` | `0 3 * * *` |
| Documentation update | `0 7 * * 0` | `0 5 * * *` |
| Wallet & data-lifecycle audit | `0 9 * * 0` | `0 9 */2 * *` |
| Performance watch | `0 11 * * 0` | `0 11 * * 0` — already correct |
| Refactoring | `0 13 * * 0` | `0 7 */2 * *` |
| PR health & delivery watchdog | `0 22 * * 0` | `0 2,8,14,20 * * *` |

Their **prompts are untouched** by this change — it is purely a schedule move, so nothing in
`docs/routines/<lane>.md` needs to change with it.

> **Status check, 2026-08-04:** the eight standing routines have landed no PR and no dated report
> since 2026-07-26 (newest reports on `main`: `BUG-HUNT-2026-07-25`, `UX-USABILITY-REVIEW-2026-07-26`,
> `DEEP-SWEEP-2026-07-26`, `WALLET-DATA-AUDIT-2026-07-21`, `PR-HEALTH-REPORT-2026-07-26-0720`), while
> the LC lanes have been landing work daily throughout. They may already be disabled or deleted
> upstream. Confirm in the Routines UI before re-timing them; if they are gone, they need
> re-creating rather than re-scheduling.

> **Never create a replacement "conductor" trigger for this via the session `create_trigger`
> tool** — it cannot carry the `session_context` (repo source + subagent allowlist) the routines
> need, so the fresh session would come up without the repo. The chain is expressed as re-timed
> *existing* triggers precisely to keep that context intact.

**Build loops (Restaurants + Send):** all five lanes completed 2026-07-31 and their triggers no
longer exist (`update_trigger` on each of the five recorded IDs returns *not found*). They are out
of the schedule entirely; `docs/routines/build-loops-restaurants-send.md` is kept as history.

---

## History — the paced all-day chain (2026-07-30 → 2026-08-04, superseded)

Added 2026-07-30 per user instruction: *"run the routines all day, one task after another, to max
out tokens but not deplete credits too — and plan to increase the frequency."* Superseded by the
weekly Sunday cadence above; kept because it is the revert target if the cadence is ever raised back.

The design: **saturate the day with productive work but serialize it and cap the count.** A fixed
hourly grid of pre-scheduled firings meant (a) the schedule itself was the cap — no orchestrator that
could loop away credits, (b) slots never shared an hour, so at most one heavy session billed at a
time, and (c) the token spend went where it converted to shipped work (the build loops), while the
maintenance routines interleaved in the gaps and kept deduping through `docs/KNOWN_BUGS.md`.

| Hour | Lane | Trigger |
|---|---|---|
| 02 | **M** — maintenance rotation | (standing routine, re-timed) |
| 03 | **LC-A** (Mon-Sat) / **LC steer** (Sun) | `0 3 * * 1-6` / `0 3 * * 0` |
| 04 | **LC-B** | `0 4 * * *` |
| 05 | **M** — maintenance rotation | (standing routine, re-timed) |
| 06 | **LC-C** | `0 6 * * *` |
| 07 | **LC-D** | `0 7 * * *` |
| 08 | **M** — maintenance rotation | (standing routine, re-timed) |
| 09 | Build **C** — restaurants backend | `0 9,15,21 * * *` |
| 10 | Build **A** — customer home + IA | `0 10,16,22 * * *` |
| 11 | Build **B** — one rider app | `0 11,17,23 * * *` |
| 12 | Build **D** — food UI | `0 12,18,0 * * *` |
| 13 | Build **E** — merchant tablet | `0 13,19,1 * * *` |
| 14 | **M** — maintenance rotation | (standing routine, re-timed) |
| 15–19 | Build **C/A/B/D/E** | ″ |
| 20 | **M** — maintenance rotation | (standing routine, re-timed) |
| 21–01 | Build **C/A/B/D/E** | ″ |

- **15 build sessions/day** (each of the 5 loops 3×/day). Backend lane **C** led every cycle so its
  dependants **D** and **E** found their gate satisfied.
- **5 maintenance sessions/day** on `0 2,5,8,14,20 * * *`, rotating the eight standing lanes so each
  recurred roughly every 1.6 days.
- **4 LC sessions/day** on `0 3/4/6/7`.
- **Hard daily cap = 24 sessions.** Serial, so never more than one billing at once.

Why the frequency bump went to the build loops rather than the bug-finders: the four bug-finders are
deliberately spaced so each one's PR merges before the next starts. Running them back-to-back mostly
makes them re-scan an unchanged tree and dedup against each other — tokens spent, little new signal.
That reasoning is why the weekly grid above compresses the cadence without reordering the lanes.

Build-loop trigger IDs and crons under that chain (all five now deleted):

| Loop | trigger_id | Chain cron | Original cron |
|---|---|---|---|
| C — restaurants backend | `trig_012bebUbKJUibgGpyzcs1g1V` | `0 9,15,21 * * *` | `0 10,17 * * *` |
| A — customer home + IA | `trig_01WUn4DAWinLN39fBH43mb1Z` | `0 10,16,22 * * *` | `0 12,19 * * *` |
| B — one rider app | `trig_01BRx1GzXAfSdJB5RD8AjeSK` | `0 11,17,23 * * *` | `0 16,22 * * *` |
| D — food UI | `trig_01BrDbbtyyFdgtf4kTvVM4Eg` | `0 12,18,0 * * *` | `0 11,18 * * *` |
| E — merchant tablet | `trig_011vw7C3qbVcaX3exRwWM5e8` | `0 13,19,1 * * *` | `0 13,21 * * *` |

> **Model caveat (2026-08-01, still current):** programmatic model pinning returns
> `model_update_disabled`, so firings use the account/environment default until the founder assigns
> each Routine's model in the claude.ai Routines UI. The loops function correctly on the default
> model; the split is a cost/quality optimization, not a correctness requirement.
> **Connector caveat:** these triggers store no MCP connectors, so fired sessions may lack the
> GitHub MCP tools — the documented fallback applies (`docs/ROUTINES.md` §known constraints: push
> the branch, session auto-PR opens it, the PR-health watchdog merges on green).
