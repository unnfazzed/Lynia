# Handoff: Merchant v2 follow-ups (D-77, Part A)

**Date:** 2026-10-05
**Extends:** `merchant-v2` (the export dated 2026-10-04, already merged in #1061–#1065)
**Fidelity:** high fidelity. Copy is final, apart from the items listed under "Open items".

## Contents
- `Merchant v2 - all screens.html`: a single offline file with every screen. The original 14 screens come first, with the frames changed in this pass. The new frames are in the section headed "FOLLOW-UPS · 2026-10-05".
- `source/MerchantV2.dc.html`: the original frames, plus the changes listed below.
- `source/MerchantV2Followups.dc.html`: every new frame. The first file imports it.
- `CHANGELOG.md`: every new or changed frame, by its `data-screen-label`.
- `CLAUDE-CODE-PROMPT.md`: paste this into Claude Code.
- `tokens/`: the same token files as the 2026-10-04 handoff. No new tokens were added.

## About the design files
The files are **design references made in HTML**, not production code. Rebuild them with the merchant app's own components (`apps/merchant/app/**`), theme tokens, bottom sheets and router. Take exact values and copy from the HTML; don't port the markup. Every inline `var(--x)` maps to an existing theme token.

## Global rules (unchanged, now enforced in the drawings)
- Every tappable control is **at least 44px** tall (`--target-min`). A primary button is **52px** (`--target-primary`); a secondary outline button is 48px.
- Frames are 360×720. Every screen must also work at **320×640** and font scale 1.3. All new frames were checked at 320×640: text wraps and nothing clips.
- Sheet rule at 320×640: the sheet's maximum height is the viewport minus 24px. If the content is taller, the body scrolls and the CTA pair stays pinned at the bottom.
- Money and times use tabular numbers. Clock times sit next to countdowns. Never truncate an amount.
- Lucide icons only: 20px in navigation, 16px inline, stroke 2. New icons in this pass: `x`, `external-link`, `circle-help`.
- Shops and pharmacies use their own words: "Out of stock", "Inventory", "Goods", "Packed", "Add an item", "I got the goods back".

## Shared patterns introduced

### Bottom sheet
- **Scrim:** `rgba(20,24,27,.5)` over the screen the sheet was opened from. That screen stays mounted, and on ringing screens the ring timer keeps running.
- **Sheet:** `--bg`, radius 20 20 0 0, padding 10/16/16, 12px vertical gap.
- **Grab handle:** 36×4, radius 2, `--line`, centred.
- **Title:** 20/700 `--ink`. **Subtitle:** 14/400 `--muted`, line-height 1.4.
- **Dismiss:** tapping the scrim, dragging down or the secondary button.

### Reason row (single choice)
- **Unselected:** min-height 48, radius 14, 1px `--line`, padding 0 14, gap 12, 15/600. Radio is 22px with a 2px `--line` ring.
- **Selected:** 2px `--accent` border, `--accent-wash` fill, padding 0 13 (keeps the row the same width), 15/700. Radio is 22px with a 6px `--accent` ring around a `--bg` centre.
- Rows are stacked with an 8px gap. The whole row is the tap target. Long labels wrap; the row grows.

### Destructive confirm
- 52px, radius 999, `--danger` fill, `--bg` text, 16/700.
- Paired below with a 48px outline secondary (1px `--line`, 15/700 `--ink`).
- The primary is disabled until a reason is picked.

### Path card (K3a)
- Min-height 72, radius 16, 1px `--line`, padding 12/14.
- 44px icon circle, then title 16/700, sub 13 `--muted` (line-height 1.35), then a chevron. The whole card is the tap target.

### Info strips
- **Neutral:** `--surface`, radius 12, padding 12/14, 14px text, icon in `--muted` or `--accent-text`.
- **Money, gold:** `--highlight-wash` fill, 1px `--highlight-border`, label in `--highlight-ink`.
- **Money, mint:** `--accent-wash` fill, label in `--accent-text`.
- **Goods back, red:** `--danger-wash` fill, 1px `--danger` border, label in `--danger-ink`.

## Screens

### K2a · "Why can't you take it?" (kitchen)
- **Opened from:** "Can't take it" on K2.
- **Behind the sheet:** the K2 ringing banner, dimmed.
- **Title:** "Why can't you take it?" Sub: "We tell the customer straight away."
- **Reasons:**
  - Out of an ingredient
  - Too busy right now
  - Closing soon
  - Something else
- **Busy-mode hint:** shown only when "Too busy right now" is selected. A neutral strip with the clock icon: "Busy for a while? **Open, but busy** adds 10 min to new orders instead of turning them away." Bold text isn't a link; busy mode is switched on from the top card.
- **Something else:** opens the same note field as S2a.
- **CTA:** "Turn down #A1B2" (danger). Secondary: "Go back".
- **On confirm:** reject the order with `{ reasonCode, note? }`, close the sheet and the ringing screen, and return to the board. Reason codes: `OUT_OF_INGREDIENT`, `TOO_BUSY`, `CLOSING_SOON`, `OTHER`.
- **If the ring timer expires while the sheet is open:** close the sheet and treat the order as missed.

### S2a · "Why can't you take it?" (shop or pharmacy, with note)
- Same as K2a, except:
  - the first reason is "Out of stock" (`OUT_OF_STOCK`);
  - the subtitle uses the customer's first name: "We tell Rudo straight away.";
  - there is no busy-mode hint, as shops have no prep-time quote. Show it anyway if busy mode exists for shops.
- **"Something else" note:**
  - shown only when "Something else" is selected;
  - label "Add a note" + "(optional)" in `--muted`;
  - one-line input, 52px, radius 12, 2px `--accent` border when focused;
  - helper "Rudo sees this note." (13, `--muted`);
  - limit 80 characters; may be empty.
- When the note field is focused, the keyboard pushes the sheet up and the CTA stays visible.

### K3 · Cooking ticket (changed)
- The "Problem with this order?" pill is now **44px** tall: padding 0 14, radius 999, `--danger-wash` fill, `--danger-ink` text 14/700, centred.
- **Remove the padded-hit-area workaround.**

### K3a · "Problem with this order?"
- **Opened from:** the K3 Problem pill.
- **Title:** "Problem with #A222?" Sub: "Pick what happened."
- **Path cards:**
  1. "Something ran out": `arrow-left-right` icon on `--accent-wash`. Sub: "Change items: swap or remove, then the customer OKs it". Goes to the S2 swap/remove list for this ticket, with the same 3-minute customer approval timer.
  2. "Can't finish this order": `x` icon on `--danger-wash`, title in `--danger-ink`. Sub: "Cancel with a reason. The customer and rider are told." Goes to K3b for a cash order, or K3c for a wallet-paid order.
- **Footer hint:** clock icon, "Just running late? Use +5 min on the ticket."
- **Secondary:** "Close".

### K3b · Can't finish (cash order)
- **Title:** "Cancel #A222?"
- **Sub:** "Blessing M. is booked for 07:31. We call off the rider and tell the customer." Use the booked rider's name and arrival time. With no rider yet: "We tell the customer." With no arrival time yet (before B1): "Blessing M. is booked. We call off the rider and tell the customer."
- **Reasons:**
  - Ran out and can't swap (`RAN_OUT`)
  - Kitchen problem (gas, power, water) (`KITCHEN_PROBLEM`)
  - Too busy to finish it (`TOO_BUSY`)
  - Something else (`OTHER`, with the S2a note field)
  - Shop wording: "Ran out and can't swap" stays; "Kitchen problem" becomes "Shop problem (power, stock count)".
- **Info strip:** neutral, banknote icon, "Cash order · nothing to refund".
- **CTA:** "Cancel order" (danger). Secondary: "Keep cooking" (shops: "Keep packing").

### K3c · Can't finish (paid by wallet)
- Same as K3b, except for the info strip and the CTA:
  - **Info strip:** gold, wallet icon. "**Paid by wallet · $9.50**", then "We refund the customer first, then cancel."
  - **CTA:** "Refund $9.50 and cancel" (danger).
- **On confirm:**
  - The API refunds the customer first, then cancels.
  - While waiting, show a spinner in the CTA with the text "Refunding…".
  - If the refund fails, keep the order open and show an error strip: "Couldn't refund right now. The order is still open; try again."

### S4 · Book a rider (changed)
- The item chips ("2× Brake pads", "1× Oil filter") and the "+ Add" chip are now **44px** tall: padding 0 12, radius 999, 14/700.
- **No booking-terms UI.** Send's liability terms are part of the Terms & Conditions the merchant accepts at sign-up; don't add a link or a version record to this screen.

### K1b · Board with cash out and scheduled (kitchen, shop)
- **Section order on the board:** NEEDS YOU → COOKING / PACKING → ON THE WAY → **CASH TO COME BACK · n** → **SCHEDULED · n**. Hide any section with no items.
- **Cash to come back, normal row:**
  - 1px `--line`, radius 16, min-height 56, padding 10/14;
  - title "$12.00 · #A105" (15/700);
  - sub "Blessing M. · delivered 07:12 · back by 07:30" (13, `--muted`);
  - chevron; tapping it opens K5 for that order.
- **Cash to come back, late row:**
  - fill `--highlight-wash`, 1px `--highlight-border`;
  - a `LATE` chip after the title: 20px tall, padding 0 6, radius 6, `--highlight-sun` (#FFD23F), `--highlight-sun-ink`, 11/700;
  - sub in `--highlight-ink` 13/600: "Tino K. · was due 07:10";
  - on the right, a 44px **Call** pill: `--bg` fill, `--accent-text`, phone icon, 14/700. It dials the rider.
  - Late rows sort above normal rows; within each group, the oldest comes first.
  - A row is late when now > `cashDueAt`.
- **Scheduled row:**
  - 1px **dashed** `--line`, radius 16, min-height 56;
  - clock icon, then title "12:30 today · #A301", then sub "3 dishes · $18.00 · rings at 12:00";
  - beyond today, use the day: "Tue 07:00".
  - Tapping it opens a read-only order summary. A scheduled order becomes a normal K2 ring at its ring time.
- **KPI strip:** "Cash due" includes all cash still out ($21.50 in the drawing).

### K1c · Board, open and quiet
- Same top card. The KPIs show 0 / $0.00 / $0.00; "Cash due" is in `--muted` when it is zero, not gold.
- **Body:** centred, 64px top padding.
  - Icon: a 72px `--accent-wash` circle with the `inbox` icon in `--accent-text`. Mint, not grey, so this can't be confused with T4 Closed.
  - Title: "All quiet for now" (20/700).
  - Body: "You're open. New orders ring here with sound, so keep the volume up." (15, `--muted`).
  - Secondary button (48px outline, full width): "Check your menu", which opens T1. Shops show "Book a rider" (opens S4) instead.

### K5 · On the way (unchanged)
- Make the CTA's disabled state explicit: "I got $12.00 · after delivery" uses a `--surface` fill and `--muted` text until the order is delivered.

### K5b · Delivered, no cash to bring back
- **When:** a delivered order with nothing to collect, paid by wallet or prepaid.
- **Layout:**
  - map (pin only);
  - title "#A115 delivered", sub "Blessing M. · 07:41 · 2 dishes";
  - all 5 progress steps done;
  - door photo (150px tall, radius 16);
  - a mint info strip with the wallet icon: "**Paid by wallet · $14.00**", then "Nothing to bring back. It's in your Money tab."
- **No cash card and no CTA bar.** The order leaves the board.

### K5c · Goods coming back
- **When:** delivery failed and the rider is returning the goods.
- **Title:** "#A117 couldn't be delivered". **Sub:** the reason and time, e.g. "Customer didn't answer · 07:44".
- **Progress:** step 4 is `--danger`; step 5 is `--line`.
- **Goods card** (red info strip, in the cash card's slot):
  - `package` icon and the label "GOODS BACK TO YOU" (12/700, letter-spacing .06em);
  - "2× Mazondo · $10.00" (15/700);
  - "Blessing M. brings it back by 07:58" (13/600). Without an estimate: "Blessing M. is bringing it back".
- **CTA bar:**
  - primary (52): "I got the food back", for shops "I got the goods back";
  - secondary (48, outline, `--danger-ink` text): "It wasn't returned".
- **"It wasn't returned":** opens a confirm sheet that flags the order for LyniaGo support. Reuse the reasons-sheet pattern with one confirm: "Report to LyniaGo".

### T1 · Menu / Inventory (changed)
- **New "+ Add a dish" header action:**
  - top-right of the mint top card, on the same row as the "Menu" title;
  - 44px pill, padding 0 16, `--cta-fill`, `--on-accent`, plus icon, 14/700;
  - shops and pharmacies: "+ Add an item".
  - It sits in the top card, so it can never collide with the live bar (which floats 12px above the tab bar).
- **Category chips:** now 44px tall.
- **Remove the padded-hit-area workaround.**

### T1b · Live bar states
- The bar is 56px tall, radius 16, padding 0 14, and floats 12px above the tab bar on every tab except Orders.
- It shows the **single highest-priority** state:

| Priority | State | Fill / text | Line 1 | Line 2 | Leading mark |
|---|---|---|---|---|---|
| 1 | New order ringing | `--highlight-sun` / `--highlight-sun-ink` | New order · #A1B2 | 3 dishes · $15.00 · 0:48 to answer | `volume-2` icon |
| 2 | Rider at the counter | `--live-bar` / `--bg` | Blessing is at your counter | 2 cooking · 1 on the way | 10px `--accent` dot |
| 3 | Waiting for the customer | `--live-bar` / `--bg` | Waiting for Rudo's OK · 2:28 | 2 changes on #A1B2 · keep packing | 10px ring, 2px `--highlight-sun` |
| 4 | Counts only | `--live-bar` / `--bg` | 2 cooking · 1 on the way | Next ready 07:29 | 10px `--live-bar-ink` dot |

- Line 1 is 14/700; line 2 is 12, in `--live-bar-ink` on the dark fills.
- Tapping the bar opens the Orders board scrolled to that order. A ringing order opens K2/S2 directly.
- With nothing live, the bar is hidden.

### T2 · Money (changed)
- **Late-cash Call pill:** now 44px.
- **New row, cash on its way (not late):** "#A120 · 12:48", sub "Delivered · cash on its way · back by 13:05" (`--muted`), amount "$8.00" in `--ink`, with no "+" and not green. It turns green "+$8.00" when the cash is in, and gold "cash late" when overdue.
- **Rejected row:** "#A090 · 11:10". Sub: "You couldn't take it · Too busy", using the reason label. On the right, "No sale" (14/600 `--muted`) replaces "—". **Note:** this replaces the earlier "show '—'" rule in the 2026-10-04 prompt.
- **Missed row** (no answer in time): sub "Missed · no answer in time", right side "No sale".
- **Row states summary:**
  - cash in: `+$X` in `--accent-text`;
  - cash on its way: `$X` in `--ink`;
  - cash late: `$X` in `--ink`, sub in `--highlight-ink`;
  - rejected or missed: "No sale".

### T2b · Money, this week
- **Toggle:** "This week" selected.
- **Header:** "SALES · 41 ORDERS · 28 SEP–4 OCT" (13/600 `--muted`), then "$386.00" (40/700).
- **Week bars:**
  - 7 columns, gap 8, max bar height 56; height is proportional to that day's sales;
  - past days are `--accent-wash`, today is `--accent`;
  - day initials below (12/600 `--muted`; today is `--accent-text` 700);
  - no axis and no values: the bars only show scale.
- **Day rows:**
  - min-height 56, newest first: "Sun 4 Oct · today", then "Sat 3 Oct", and so on;
  - sub: "7 orders · $9.50 cash late" (gold when any cash is late), "9 orders · all cash in" or "6 orders · 1 you couldn't take";
  - right: day total 16/700, then a chevron;
  - tapping a day opens that day in the T2 Today layout.
- **Week boundary:** use the locale week (Mon–Sun).

### T3 · Account (changed)
- **New group** "HELP", between "ORDERS & PEOPLE" and Sign out.
- It has one row: `circle-help` icon, "Help & support", right value "WhatsApp", chevron. The row is 52px.
- Tapping it opens `https://wa.me/<LyniaGo support number>` with the prefilled text "Hi LyniaGo, I need help with <business name>".
- At 320×640 the Account list scrolls; Sign out may sit below the fold.

### Other controls resized to 44px
- K1 "Hand over" pill (was 40).
- P1 "Zoom" (was 40).
- Remove every padded-hit-area workaround for these.

### A1 · Arrival states (needs B1)
- **K1 counter card, before arrival:**
  - 1px `--line` border, 40px `--surface` icon circle with a `--muted` bike;
  - "Blessing M. is coming to your counter", sub "Arrives 07:31 · #A444 · $10.00";
  - **no button**.
- **K1 counter card, arrived:**
  - 2px `--accent` border, 40px `--accent-wash` circle;
  - "Blessing M. is at your counter", sub "Since 07:30 · #A444 · $10.00";
  - 44px "Hand over" pill (`--cta-fill`).
  - The card moves to the top of NEEDS YOU.
- **K4 rider sub-line:** "AFG 2231 · ★ 4.9 · arrives 07:31" before arrival; "AFG 2231 · ★ 4.9 · at your counter" once arrived.
- **T1 live bar:** state 2 appears only after `riderArrivedAt` is set.

### A2 · Arrival time: known vs unknown
When the estimate is unknown, drop the time and keep the sentence whole. **Never** render "arrives —" or invent a time.

| Where | Known | Unknown |
|---|---|---|
| K3 timer card | Blessing M. arrives 07:31 | Blessing M. is on the way to you (`--muted`) |
| K5 sub-line | Blessing M. · arrives 07:38 · 2 dishes | Blessing M. · on the way · 2 dishes |
| Board, on the way | Arrives 07:38 · then brings you $12.00 | On the way · then brings you $12.00 |
| K1 counter card | Arrives 07:31 · #A444 · $10.00 | #A444 · $10.00 |
| Live bar line 2 | Next ready 07:29 | 2 cooking · 1 on the way |

## State and data needed
- **Reject/cancel:**
  - `reasonCode` (enum above) and `note?` (≤80 chars) on reject and on cancel.
  - Cancel responds with a `refund` status for wallet orders: `pending | done | failed`.
- **Board:**
  - `cashDueAt` and `cashReceivedAt` per order; a late flag is derived from them.
  - `scheduledFor` and `ringsAt` for scheduled orders.
- **Goods return:** `deliveryFailedReason`, `returnEtaAt?`, `goodsReturnedAt?`, and a `goodsNotReturned` report.
- **Arrival (B1):** `riderArrivedAt?`, `pickupEtaAt?`, `dropoffEtaAt?`. Every one of them can be missing; see A2.
- **Money week:** a per-day summary (`date`, `orders`, `sales`, `cashLate`, `rejected`) for the selected week.
- **Live bar:** derived on the client from the board queue, in the priority order above.

## Open items
- K5c "It wasn't returned": the support flow after the report isn't designed. For now it raises a support ticket and shows "We've told LyniaGo. We'll WhatsApp you."
- Sign-in, onboarding and the settings sub-screens: **the restyle stands**, with no redraw.
- The WhatsApp support number comes from config; it isn't in the design.
