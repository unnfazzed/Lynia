# 04 · "Stay closed today" before opening time (MJ-RL10)

**App:** Merchant. **Extends:** merchant-v2 **T4** Closed, plus the **K1/S1 mint top card** and its open pill. **Routes:** `/queue`, `/deliveries`.

## The problem

At 06:30 a shop that opens at 08:00 already knows it won't open today (a funeral, a power cut, no stock). The header reads "Closed · opens 08:00", but tapping the pill only shows a toast: "Outside your opening hours · change them in Account". **There's no way to say "not today".** At 08:00 the shop opens itself and orders ring into an empty shop.

The same gap exists after closing time for tomorrow morning.

## The states that exist

| State | Header today | Body |
|---|---|---|
| Open | "Open · until 22:00", pill on | board |
| Closed by hand | grey card, "Closed · opens 08:00", pill off | T4: "You're closed" + Open now / Open, but busy |
| **Outside hours (not by hand)** | "Closed · opens 08:00", pill reads Closed | board. **Not drawn: this brief.** |

## Must

- From the outside-hours state, one obvious way to **stay closed through the next opening**. The result is the existing T4 "closed by hand" state, with the reopen time pushed to the following opening day.
- Undo is the existing "Open now" on T4.
- Say **which day** they reopen. "Opens Thu 08:00" beats "opens 08:00" once a day is skipped.
- The open pill keeps its word label. It stays a 44 target and a real switch for screen readers.
- No change to the opening hours themselves. This is a one-off.

## Your call

- The trigger:
  - tap the pill and get a small sheet ("Stay closed today?"),
  - a line under the header,
  - or a row in the board's empty state.
- Whether "Stay closed tomorrow" is offered after closing time, or the same control simply means "the next opening".
- How the grey top card reads when a whole day is skipped.

## Copy to start from

- "Open" / "Closed" · "Open · until 18:00" · "Closed · opens 08:00"
- T4: "You're closed" · "Customers can see your menu but can't order. You open again at 08:00." · "Open now" · "Open, but busy (+10 min)"
- Toasts: "Closed · new orders won't come in" · "You're open"

Suggested: "Stay closed today" · toast "Closed · opens Thu 08:00".

## Draw

1. The outside-hours top card + board, showing the new control.
2. The sheet or confirm step, if you use one.
3. The result: T4 with "opens Thu 08:00".
4. 320×640 of frame 1.

Suggested ids: `T4b`, `T4c`.
