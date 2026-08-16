# Routine prompt source of truth

The eight scheduled Claude routines (see `docs/ROUTINES.md` for the canonical spec) run from
**cron trigger prompts that live inside the trigger config**, not in this repo. That made them
un-reviewable and let the spec drift ahead of what actually runs (see the 2026-07-16 routines
audit). These files are the **version-controlled mirror** of each live trigger's prompt, so the
prompts can be diffed, reviewed, and reconciled against `docs/ROUTINES.md` like any other code.

All eight run **weekly, on Sunday (UTC)** as of 2026-08-04 — see `routine-chain.md` for the grid.

| File | Trigger name | Cron (UTC) |
|---|---|---|
| `bug-hunting.md` | Bug hunting | `0 1 * * 0` |
| `ux-improvements.md` | User experience improvements | `0 3 * * 0` |
| `deep-bug-sweep.md` | Deep bug sweep | `0 5 * * 0` |
| `documentation-update.md` | Documentation update | `0 7 * * 0` |
| `wallet-data-audit.md` | Wallet, earnings & admin data-lifecycle audit | `0 9 * * 0` |
| *(none yet — see note)* | Performance watch | `0 11 * * 0` |
| `refactoring.md` | Refactoring | `0 13 * * 0` |
| `pr-health-watchdog.md` | PR health & delivery watchdog | `0 22 * * 0` |
| `crash-fuzzing.md` | Crash fuzzing | `0 20 * * 0` |
| `logic-model-audit.md` | Logic model audit | `0 21 * * 0` |
| `flag-retirement.md` | Flag retirement | `0 23 * * 0` |
| `useless-test-pruning.md` | Useless-test pruning | `0 0 * * 1` |

> **Four Sunday-night lanes added 2026-08-16** (owner instruction: weekly from 22:00 Harare, on
> Sonnet 5, not Fable — see `docs/ROUTINES.md` §"Four Sunday-night maintenance lanes"). These four
> were created via the in-session `create_trigger` MCP path and their model IS pinned
> programmatically (`claude-sonnet-5`); their prompts were landed here in the same change that
> created the triggers, so mirror and live trigger start identical.

> **Temporary build loops (2026-07-28): finished.** All five Restaurants + Send lanes completed
> 2026-07-31 and their triggers no longer exist. `build-loops-restaurants-send.md` is kept as
> history. See `docs/plans/2026-07-28-restaurants-send-joint-launch-plan.md` §6.

> **Schedule (all crons) — `routine-chain.md`.** As of 2026-08-04 every routine and LC loop runs
> once a week on Sunday, on a single hourly grid (one heavy session at a time, one frequency dial).
> `routine-chain.md` is the source of truth for that schedule — the grid, the exact trigger IDs +
> old/new crons, which triggers were re-timed programmatically vs. which need the claude.ai Routines
> UI, and the apply/revert procedure. When it and the cron column above disagree, `routine-chain.md`
> wins.

> **Performance watch has no mirror file yet.** `docs/ROUTINES.md` added this 8th routine
> 2026-07-19 (its own `## Performance watch` section), but its live trigger prompt was never
> landed here per the "Edit the file here and land it" convention above. Not auto-authored by the
> doc-reconciliation routine — writing a trigger-prompt mirror is new operational content, not a
> reconciliation edit, and a guessed prompt body would itself be a stale doc the moment it diverged
> from the real live trigger. Needs a human (or the routine's next prompt-audit pass) to add
> `performance-watch.md` from the actual live trigger text.

## Keeping the live triggers in sync

The triggers were created via the `meta_mcp` path, which binds each to a `session_context`
(tool allowlist incl. `Task`/subagents, and the `unnfazzed/Lynia` repo source). **The
`create_trigger`/`update_trigger` MCP tools available in a routine session cannot edit a prompt
body without dropping that `session_context`** — only the schedule/name/enabled/model fields are
editable in place. So to change a routine's prompt:

1. Edit the file here and land it (this is the reviewed source of truth).
2. Open the trigger in the scheduler UI (the same surface that created it) and paste the updated
   prompt body verbatim. Do **not** delete-and-recreate the trigger from a routine session — a
   recreated trigger loses its repo source binding and subagent tool allowlist.

A prompt change is not "shipped" until both steps are done. When they disagree, the **live
trigger is what actually runs** — reconcile the file to it, or push the file into the trigger.
