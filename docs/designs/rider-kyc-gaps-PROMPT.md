# Claude Design prompt: rider ID check, the undrawn pieces (2026-10-12)

First Run v2 (`packages/design/handoff/first-run-v2/`, ledger D-82) drew every ID-check **outcome** (F1–F8), and
Calm Mint v2 drew R1–R3. A review of the code on 2026-10-12 found four rider-KYC surfaces that ship today with **no
drawing behind them**. Paste the prompt below into Claude Design, attach the files it lists, and bring the export back
as `packages/design/handoff/rider-kyc-gaps/`. Until it lands, the app keeps what ships now.

The Didit check's own pages (document capture, selfie) are not in this brief: they are themed through Didit's branding
settings, see `docs/KYC-DIDIT-BRANDING.md`.

| # | Surface | Code today | What ships now |
|---|---|---|---|
| K1 | The sheet around the ID check | `apps/mobile/src/kyc/KycCheckHost.tsx` | Header "ID check" / "Have your national ID ready" + ✕; loading "Opening your ID check…" → "Still opening — hang on."; leaving is a plain Android dialog "Leave the ID check?" / "You can pick it up again from your biker board." / Leave |
| K2 | Browser fallback + return page | `src/kyc/verify.ts`, `apps/api/src/kyc/kyc.controller.ts` (`GET /kyc/return`) | Didit in a browser tab, then a plain page "All done here" / "Head back to the LyniaGo app — we'll take it from there." / "Back to LyniaGo" |
| K3 | Declined: ID already on another account | `src/ui/firstrun/IdCheckOutcome.tsx` (`F5dup`) | F5's page with an undrawn body: "This ID is on another account. One ID, one account. Message us and we'll sort it." (owner-approved 2026-10-06) |
| K4 | Customer Account card while a check runs | `src/ui/rider/kit.tsx` `BecomeCard` | Rider v2's card in four states: progress "Finish verifying your ID" + Continue; review "Your ID is under review"; failed "We couldn't verify your ID" + Try again; locked "We still couldn't verify your ID" + WhatsApp. First Run v2 drew only the start state (G2's violet card) |

---

## Paste this

> You're extending **First Run v2** for **LyniaGo**, a cash delivery app in Harare, Zimbabwe (one Android app, Expo /
> React Native). A rider verifies their national ID with a selfie inside the app. The check itself is a third-party
> web page we show inside our own sheet; **never name the vendor** anywhere. First Run v2 (attached) drew every
> outcome of the check (F1–F8). **Draw the four pieces it left out**, in First Run v2's look (its shell, hero panel,
> tones, footer, sheet, toast). Every state at **360×720**, checked at **320×640** and font scale 1.3.
>
> **K1 · The sheet around the check.** The check's own pages fill the middle; draw only our chrome:
> - K1a **Header**: a ✕ (`--target-min`, 44dp) and a title plus one helper line. The vendor's pages are white with
>   green buttons, so the header must sit calmly on top of them.
> - K1b **Opening** (0–8s): what fills the sheet before the check loads.
> - K1c **Still opening** (after ~8s, patchy 2G/3G is normal): same, with a reassuring line.
> - K1d **Leave the check?**: a First Run v2 sheet, not a system dialog. The rider loses nothing by leaving; they
>   pick it up again from the biker board (F3 "Almost there"). One primary "Keep going", one danger text link "Leave".
> - Android back steps back inside the check while it can; only then K1d.
> - If the check can't open at all, the sheet closes and F7 shows. Don't draw a second error inside the sheet.
>
> **K2 · When the check opens in the browser instead** (old phones without the in-app viewer):
> - K2a The moment before we hand over: one line telling the rider the check opens in their browser and comes back here.
> - K2b **The return page** the browser shows at the end (a plain web page, 360 wide, our tokens, the LyniaGo mark):
>   "done, go back to the app" with one button that reopens the app, and what to do if the button does nothing.
>
> **K3 · Declined: this ID is on another account.** An F page in First Run v2's shell. No retry can fix it, so
> WhatsApp is the only action and there is no tries meter. Today's body (owner-approved, keep it unless you have a
> clearly better one): "This ID is on another account. One ID, one account. Message us and we'll sort it." Decide the
> tone (mint like F5, or danger like F4) and say why.
>
> **K4 · The customer Account while a check is under way.** First Run v2 G2 drew only the start card ("Earn with
> your bike", violet). Draw the same card for: **in progress** (Continue), **in review** (no action), **declined**
> (Try again; the body names the reason), **locked** (WhatsApp). Tapping a card opens the matching F page.
>
> **Rules:**
> - Write every new string into one `KG` copy object. It ships verbatim. "Biker", never "rider", in user-visible copy.
> - Tap targets ≥ 44dp (`--target-min`), primary 52dp.
> - Use only Calm Mint v2 / First Run v2 tokens, no new ones.
> - No confetti, no badges, no invented headings.

## Attach

1. `packages/design/handoff/first-run-v2/`: `README.md`, `BRIEF.md`, `copy.ts`, `design/First Run v2 - All States.html`,
   `design/fr-kit.js`, `design/fr-states.js`, `screenshots/` (F1–F8, G2).
2. `packages/design/handoff/calm-mint-v2-2026-10/README.md` (R1–R3).
3. `packages/design/handoff/rider-v2/README.md` (the Account card it drew).
4. `packages/design/tokens/*.css`.
5. A phone screenshot of today's sheet (`KycCheckHost`) and of the `/kyc/return` page.

## After the export lands

Hand it to Claude Code with: *"vendor `rider-kyc-gaps` verbatim into `packages/design/handoff/`, add the ledger entry
and implement it"*. The reverse-drift guardrail requires the ledger entry in the same PR. K1 then retires D-37's "no
gallery screen draws the sheet's chrome", and K3 retires the undrawn-body note in D-82 §4.
