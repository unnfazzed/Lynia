# Routine prompts

These files are the version-controlled prompts for the scheduled Claude routines specified in
`docs/ROUTINES.md`. A routine's trigger runs the prompt pasted into it, so these mirrors are what gets
reviewed and diffed against the spec.

**Status (2026-10-12): dormant.** No routine trigger exists, and none has run since late July 2026.
These prompts are what to paste into a new trigger to restart a lane; the schedule is in
`docs/ROUTINES.md` §"The routines".

| File | Routine |
|---|---|
| `bug-hunting.md` | Bug hunting |
| `ux-improvements.md` | User experience improvements |
| `deep-bug-sweep.md` | Deep bug sweep |
| `documentation-update.md` | Documentation update |
| `wallet-data-audit.md` | Wallet, earnings & admin data-lifecycle audit |
| `refactoring.md` | Refactoring |
| `pr-health-watchdog.md` | PR health & delivery watchdog |

The Performance watch routine never had a mirror; its scope is `docs/ROUTINES.md` §"Performance
watch". Prompts for lanes that never ran or have finished were removed on 2026-10-12 (git history has
them).

## Creating or updating a trigger

A trigger created from the claude.ai Routines UI is bound to a `session_context` (the
`unnfazzed/Lynia` repo source and a tool allowlist that includes subagents). The `update_trigger` MCP
tool can change a trigger's schedule, name, enabled flag and model in place, but replacing a prompt
body from a routine session can drop that binding. So:

1. Edit the file here and land it (the reviewed source of truth).
2. Paste the updated prompt verbatim into the trigger in the Routines UI. Don't delete and recreate a
   trigger from a routine session: the recreated trigger loses its repo binding and subagent tools.

A prompt change has shipped only when both steps are done.
