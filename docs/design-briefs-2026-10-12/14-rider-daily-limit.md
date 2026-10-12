# 14 · Tried too many times today

**App:** Rider. **Extends:** first-run-v2 **F4a–d** (declined) and its tries meter.

## The problem

Declines are now split (KYC-R26-13):

- **Fixable** (blurry photo, face didn't match, expired document, other): these **no longer use up one of the two tries**. The rider can simply try again.
- **Strikes** (document looks altered, failed liveness, ID on another account): these still count toward the two-try lock (F5).

Each check costs us money, so fixable retries are capped at **3 a day**. When the cap is hit, Try again is refused and the app only shows a toast: "Couldn't start verification — try again in a moment." "In a moment" is wrong, because it means tomorrow.

The F4 **tries meter** ("1 try left") also needs a rule: after a fixable decline the count doesn't change, so the meter shouldn't make it look like a try was spent.

## Must

- An F4 variant where **Try again is unavailable until tomorrow**, saying so plainly. Keep the decline's own tips: tomorrow they still need good light.
- Keep `KY.help` (WhatsApp) for someone who is stuck.
- Show the tries meter **only after a strike**. After a fixable decline, show no meter.

## Your call

- A disabled Try again with a caption, or replace it with the line.
- Whether to show the time it opens again ("after 14:30") or just "tomorrow". The server knows the time.

## Copy to start from

- `KY.tryAgain` "Try again" · `KY.triesLeft` "1 try left" · `KY.help` "Help on WhatsApp".

Suggested: "You've tried 3 times today. Try again tomorrow."

## Draw

1. F4a with the daily limit reached.
2. F4a after a fixable decline (no tries meter), to confirm the rule.
3. 320×640 of frame 1.

Suggested id: `F4x`.
