# 05 · Open past midnight: needs a yes / no first (MJ-RL13)

**App:** Merchant. **Extends:** merchant-mobile **C5** Opening hours.

## Where it stands

A bar or late kitchen open "18:00–02:00" can't enter those hours today. A clear error now explains it: "Hours can't run past midnight. Close at 23:59 at the latest." This copy fix has shipped. **No drawing is needed unless the owner wants real overnight hours.**

## The question for the owner and designer

Do we support overnight hours?

- **No**: nothing to draw. Close this brief.
- **Yes**: draw it in C5, and the server needs a matching change. Hours are one window per day today.

## If yes: Must

- Works in both "Same every day" and "Per day". ("Per day" isn't drawn at all yet, so draw it too.)
- It must be obvious which day the late hours belong to. Friday night's 01:00 is Friday's shift, not Saturday's.
- Time fields stay 24-hour, like 08:00.

## Your call

A "closes next day" marker on the close time, or a split row ("18:00–23:59" + "00:00–02:00"), or something better.

## Copy to start from

"Opening hours" · "Same every day" · "Per day" · "Days open" · "Busy mode (+10 min)" · "Save hours" · "Hours saved"

## Draw (only if yes)

1. C5 "Per day" (new).
2. A day with overnight hours.
3. 320×640.
