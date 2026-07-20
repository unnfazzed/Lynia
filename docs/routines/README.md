# Routine prompt source of truth

The eight scheduled Claude routines (see `docs/ROUTINES.md` for the canonical spec) run from
**cron trigger prompts that live inside the trigger config**, not in this repo. That made them
un-reviewable and let the spec drift ahead of what actually runs (see the 2026-07-16 routines
audit). These files are the **version-controlled mirror** of each live trigger's prompt, so the
prompts can be diffed, reviewed, and reconciled against `docs/ROUTINES.md` like any other code.

| File | Trigger name | Cron (UTC) |
|---|---|---|
| `bug-hunting.md` | Bug hunting | `0 23 * * *` |
| `ux-improvements.md` | User experience improvements | `0 1 * * *` |
| `deep-bug-sweep.md` | Deep bug sweep | `0 3 * * *` |
| `documentation-update.md` | Documentation update | `0 5 * * *` |
| `refactoring.md` | Refactoring | `0 7 */2 * *` |
| `wallet-data-audit.md` | Wallet, earnings & admin data-lifecycle audit | `0 9 */2 * *` |
| `pr-health-watchdog.md` | PR health & delivery watchdog | `0 2,8,14,20 * * *` |
| *(none yet — see note)* | Performance watch | `0 11 * * 0` |

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
