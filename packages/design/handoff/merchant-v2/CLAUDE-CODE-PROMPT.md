# Claude Code prompt: LyniaGo Merchant v2 (kitchens, shops, pharmacies)

Paste this whole file into Claude Code from the repo root. Put this folder in the repo at `packages/design/handoff/merchant-v2/`.

---

## Your job
Redesign the **merchant app** (restaurants, shops, pharmacies) to Merchant v2. It must match the already-shipped **Rider v2** and **Order flow v2.1** visual language: mint top card, tab bar with a pill behind the active icon, back header, pinned CTA bar, 5-step progress bar, cash card.

Rebuild everything with the app's own components, theme tokens, router, bottom sheets and map. **Don't port the HTML.** Take exact values and copy from it.

## Sources of truth, in order
1. `BRIEF.md`: product rules. If the design or code disagrees, BRIEF wins.
2. `Merchant v2 - all screens.html`: every screen at 360×720. Open it in a browser. All copy on it is final; use it word for word.
3. `README.md`: screen list, navigation, the component spec table, Needs backend, Keep/Retire.
4. `MerchantV2.dc.html`: the source markup, for exact spacing, sizes and colour variables.
5. `tokens/`: colour, type and spacing tokens. **Add no new colour values.** Every `var(--x)` in the design must map to an existing theme token. If one is missing, add it to the theme, not inline.

## Build order (one PR each)
1. **Shell:**
   - the 4-tab bar (Kitchen: Menu; Shop and pharmacy: Inventory);
   - the mint top card with the open pill and the KPI strip;
   - the Closed state (T4);
   - the live bar on non-Orders tabs (T1).
2. **Shared parts:** `ProgressSteps(5)`, `BoardCard`, `RiderCard`, `CodeCard` (6-digit, `NNN NNN`), `CashCard`, `CtaBar`.
3. **Orders board** (K1, S1): one list sorted by urgency, replacing the New / Cooking / Ready tabs.
4. **Ringing** (K2, S2):
   - one full-screen ringing screen for manual, auto-accepted and scheduled orders;
   - the kitchen ready-in picker;
   - the shop's inline swap / remove / undo, plus the "Accept with N changes" button.
5. **Ticket** (K3): countdown, +5 min, Change items, and the Problem pill.
6. **Hand over** (K4, S3):
   - no merchant hand-over button: the screen moves on when the server sends `order.handed_over`;
   - the shop's 3-step checklist with the photo thumbnail.
7. **On the way + cash back** (K5): one screen that changes as the order moves; "I got $X" stays disabled until the order is delivered.
8. **Book a rider** (S4): one form screen, then the existing Send v2 offers list.
9. **Rx check** (P1): photo plus checklist; Approve is disabled until every box is ticked.
10. **Money** (T2) and **Account** (T3).

## Rules
- Touch targets are at least 44 px. Use tabular numbers for money, times and codes. Never truncate an amount; wrap the label instead.
- Show times as clock times ("ready 07:29"), not just relative times, next to every countdown.
- Show money with the currency sign and two decimals. Show an order the merchant couldn't take as "—", never "$0.00".
- No emoji. Lucide icons only (see the list in the README).
- Support 320 px width and font scale 1.3 without anything clipping.
- Sign-in, onboarding and the settings sub-screens: restyle only (new header, inputs and buttons); don't change their flow.

## Backend
Everything in README → "Needs backend". If a piece of backend doesn't exist yet:
- add a typed client stub and put the feature behind a flag;
- don't block the UI;
- list it in your PR description.

## Done means
- Every screen K1–T4 matches the HTML at 360×720, and also at 320 width and font scale 1.3.
- Every retired screen or flow in README → Keep/Retire is deleted.
- The two open questions in BRIEF.md are either answered or left as TODOs behind a flag.
- Each PR includes before and after screenshots.
