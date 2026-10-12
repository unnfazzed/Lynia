# 13 · Your ID expires soon

**App:** Rider. **Extends:** first-run-v2 **F6** (ID expired) and the rider board (Rider v2 J1).

## The problem

The app knows when a rider's ID document expires. On that day a sweep takes them **offline mid-shift**, and they land on F6 "Your ID has expired · Re-verify to keep riding". There is no warning before, so a working rider loses jobs with no notice.

## Must

- A **reminder 30 days before**, and again **7 days before**, that the ID expires on `{date}`, with **Re-verify now** (`KY.expCta`).
- It must not block work. The rider stays online until the day itself.
- Dismissable for the day, then back the next day once inside the last 7 days.
- Two places:
  - an in-app strip or card on the rider board;
  - a push. Push copy only, no document details. Engineering will add the push; draw the in-app part.
- After re-verifying, it goes away.

## Your call

- A strip at the top of the board, or a card in the board's list.
- Whether the 7-day version is louder (highlight `#FFD23F` / `#3D3100`) than the 30-day one.

## Copy to start from

- `KY.expA` "Your ID" · `KY.expB` "has expired" · `KY.expBody` "Expired 2 Oct 2026. Re-verify to keep riding." · `KY.expCta` "Re-verify my ID"

Suggested: "Your ID expires on 2 Nov" · "Re-verify now so you can keep riding." · push: "Your ID expires soon. Re-verify in the app to keep riding."

## Draw

1. Board with the 30-day reminder.
2. Board with the 7-day reminder.
3. 320×640 of frame 2.
