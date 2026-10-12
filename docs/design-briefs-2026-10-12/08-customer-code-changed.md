# 08 · "Your code changed" after a locked code (U04)

**App:** Customer, Send and merchant orders. **Extends:** after-send-v2 **2.14** (code being issued) and the tracking **CodeCard** (screens 6/7/9/19).

## The problem

The recipient's 6-digit code is how the parcel is handed over. After **5 wrong tries** at the door, the code locks. The app now quietly fetches a new code and swaps the digits. But:

- **nobody is told the code changed.** The sender has often already shared the old code by WhatsApp, so the recipient keeps reading out a dead code;
- after **2 re-issues** no more are allowed. The customer then gets only a toast: "Too many wrong tries on this code. Call LyniaGo support to finish this delivery."

Meanwhile the rider sees "Code locked after 5 tries · Ask {sender} to send {recipient} a new code".

## Must

- **Code changed state** on the CodeCard. The new digits (3+3), a clear note that the old code no longer works, and **Share code** made the obvious next step (re-share with the recipient).
- **Sending a new code** in progress: reuse 2.14's grey bars. Add a "Send a new code" action only if the automatic fetch failed (no data).
- **Limit reached**: no digits. Say what to do (call LyniaGo support), with a Call support button. It is a calm red info strip, not an alarm. The parcel is safe with the rider.
- Never show the code in a push. Pushes can say "Your code changed". (Engineering note: this push doesn't exist yet. Draw the in-app part only.)
- Works offline. The current code works without data, but a *new* code needs data, so say so if offline.

## Your call

- How loud "code changed" is. A gold wash strip? A one-time sheet? It must be noticed by someone who already shared the old code.
- How long the note stays (until shared? until delivered?).
- Whether the hand-off big code (state 8) needs the same note.

## Copy to start from

- "DELIVERY CODE" · "Share code" · "Getting your code…" · "Your code works without data."
- "Give this code to the recipient. The rider enters it at hand-off." · "Call support" · "Try again"
- Rider side: "Code locked after 5 tries" · "Ask {sender} to send {recipient} a new code."
- Sign-in already uses "Send a new code".

Suggested: "New code · the old one stopped working" · "Share it again with Rudo." · limit: "Too many wrong tries · call us to finish".

## Draw

1. CodeCard: code changed (on the tracking sheet).
2. CodeCard: sending a new code (failed, offline, with "Send a new code").
3. CodeCard: limit reached.
4. 320×640 of frame 1.

Suggested ids: `2.14b`, `2.14c`, `2.14d`.
