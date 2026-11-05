# Handoff: LyniaGo Delivery ceiling v1 (2026-11-05)

New states for the delivery price ceiling (`docs/plans/2026-11-05-delivery-price-ceiling.md`), drawn as variants of existing screens: Order flow v2.1 (R, T), Merchant v2 (hold, board, cash back, Money), Orders v2 (Now card), Notifications v1 (row) and the admin order detail. Nothing else is redesigned.

## Files
- `CLAUDE-CODE-PROMPT.md`: **start here if you're implementing.**
- `DESIGN-DEVIATIONS-entry.md`: the ledger entry to paste into `docs/DESIGN-DEVIATIONS.md` (owner approval needed, same PR).
- `Delivery ceiling v1 - all screens.html`: the canvas. It loads the Order flow v2.1 kit from `../order-flow-v2-2026-10/` unchanged, so vendor both folders side by side. `?screen=R1c` opens one frame, `?w=320` renders every frame at 320×640, `?fs=1.3` at font scale 1.3. On the canvas, − / + on any R1c frame steps live.
- `Delivery ceiling v1 (standalone).html`: the same canvas as one offline file.
- `dc-screens.js`: the new frames and `DC` (every string). `dc-render.js`: the canvas.
- `code/copy.ts`: every new string, keyed, verbatim from `DC`. Replaced strings carry `// was: …`.
- `screenshots/<ID>.png`: one PNG per frame. Phones at 2× (720×1440, or 640×1280 for the 320 checks). E1 is a 0.6× preview; capture it at full size from `?screen=E1`. R1c·full has no PNG.
- `assets/service-icons/v2/`: copies of the kit stickers so the canvas resolves them from this folder.

## Rules kept
Light theme, Inter 400/600/700 (the v2.1 polish draws 800 on titles, which renders as 700), tabular figures. Green text is `#006630`; `#00B14F` only fills. Controls ≥ 44, the one primary 52. Money on the $0.50 grid; a free delivery reads "Free", never "$0.00". Copy says "rider"; the app shows "biker". **No new tokens.**

## Wording rule
The ceiling always reads as a **maximum that can be lower**: the label is "Pay no more than", amounts read "$X at most", and the promise says riders are asked lower first. Never "up to". After a rider accepts, every amount is exact, with no qualifier.

## The example
Avondale Fresh, 5 items, goods $67.00, 2.5 km. Recommended $3.00 (lowest $2.50, highest $6.00, starting offer $2.50). Customer Rudo, rider Tendai.
- **Customer path (T6p):** a rider accepts at $2.50, so Rudo pays $69.50 instead of at most $70.00.
- **Hold path (M4h → M6a-t → E1):** no one takes it at $3.00 by round 6 (12:47). The shop adds +$1.00 and Tendai accepts the $4.00 offer in round 7 (12:48). Rudo pays $70.00, Tendai keeps $4.00 and brings $66.00 back. Delivered 13:02.
- **Raise path (T11c):** the shop doesn't top up, so Rudo is asked to raise to $3.50 ($70.50 at most).

## Frames
| id | state | what changed |
|---|---|---|
| R1c (+full, 320, fs) | Review, ceiling = Recommended $3.00 | New **DELIVERY** card between Note for the rider and Pay: "Recommended $3.00", hairline, **Pay no more than** stepper, mint promise "Riders are asked at a lower price first, so you’ll often pay less. Never more." Fee row "$3.00 at most", Total "$70.00 at most", CTA "Place order · $70.00 cash at most". Pay sub: "Have $70.00 ready. It may be less. You’ll see the exact amount when a rider accepts." |
| R1c-low (+320) | Lowered to $2.50 (lowest) | − disabled. Clock line "Below the recommended price, riders may take longer to accept." under Recommended, shown whenever the ceiling < Recommended. |
| R1c-high | Raised to $4.00 | Totals and CTA follow ($71.00 at most). No extra line. |
| R1c-max | At the highest, $6.00 | + disabled. |
| R1c-free | Free-delivery venue | No DELIVERY card, no stepper. Fee row "Free" (green text), violet "Free delivery" tag under the venue, CTA "Place order · $67.00 cash", Pay sub as today. |
| T4u (+320, fs) | Packing or cooking, searching | One surface row under the prep bar: **"Delivery $3.00 at most"** · finding a lower price. Your order row: "5 items · $70.00 cash at most". Track and ETA unchanged. Applies to T4, T5a/b and the search. |
| T6p | Rider accepted at $2.50 | Mint row under the track: **"Have $69.50 ready"**, "Delivery $2.50 · you saved $0.50" (the saving in green 700). Your order row: "$69.50 cash". |
| T6p-same | Accepted at $3.00 | Same row, "Have $70.00 ready", "Delivery $3.00". No saving. |
| T11c (+320, fs) | Raise prompt (after T11a) | New T11a sub: "No rider has taken it at $3.00 yet. Your order is kept ready at Avondale Fresh." No ETA line (no rider, so no honest ETA). A 2px `--accent` card: "Raise to $3.50?" + "More riders say yes at a higher price. You still pay only what a rider accepts." **Pinned bar:** label row "PAY NO MORE THAN" · "Total $70.50 cash at most", the stepper (starts at +$0.50, − disabled there), **Raise to $3.50** (52, label follows the stepper), Keep waiting (48). |
| T11c-toast | After Raise | Back to searching at $3.50, no ETA. Forest toast "Raised to $3.50 at most. Asking riders now." |
| T11c-push | The push | Title "No rider yet for your Avondale Fresh order", body "Raise delivery to $3.50 at most, or keep waiting." Actions: Raise to $3.50 · Keep waiting. No code. |
| O-card-u | Orders tab Now card | Sub only: "Packing · $70.00 cash at most", then "Have $69.50 ready at the door". |
| N-row-u | Notifications row + push | Line only: "Packing your order · delivery $3.00 at most", then "Tendai accepted · have $69.50 ready". The T6 push now names the amount: "Tendai is heading to Avondale Fresh" / "Have $69.50 ready at the door." |
| M4h (+320, fs) | Merchant hold | Gold hold card: "No rider yet", "Riders are offered $3.00. Nobody has taken it so far.", "Add to the offer from your cash" + "You pay it. Rudo’s price doesn’t change.", three top-up buttons **+$0.50 / +$1 / +$2**, each showing "Offer $3.50 / $4.00 / $5.00", Keep searching (48), Cancel order (44 text), "We’ll ask Rudo to raise in 1:42." |
| M4h-sent | After +$1 | Card turns mint: spinner, "Finding a rider", "Offered $4.00 · includes your $1.00". Forest toast "Offer raised to $4.00. Finding a rider." |
| M6a-t | Cash back | "Tendai is bringing $66.00", rows Goods $67.00 · Rider top-up −$1.00 · **Cash back $66.00**. CTA "I got $66.00". |
| T2-t | Money · Today | Row "#A1B2 · 13:02", sub "Delivered · rider top-up −$1.00", +$66.00. Header $103.50, "3 orders · $104.50 sales · rider top-ups −$1.00". |
| K-card-h | Board, NEEDS YOU (12:47) | Held card: gold bike disc, "#A1B2 · No rider yet", "Offered $3.00 · we ask Rudo in 1:42", 44 **Top up** pill that opens M4h. KPIs: 3 orders · $104.50 · cash due $15.00 (#A120, on the way). |
| E1 | Admin order detail, 1440×900 | Delivery price block: Recommended · Customer’s maximum · Starting offer · Shop top-up · Accepted price · Rider fare · Accepted in round · Customer asked to raise. Money block with the top-up deduction. Dispatch rounds list. |

## Decisions (the "your call" items)
- **Where the block sits:** its own card, directly above Pay, so the stepper sits next to the money it changes. The totals card stays plain rows.
- **Stepper:** the kit stepper surface (`--surface` pill) at full width, 56 tall: two 44 white circles with the amount between them (26 on Review, 22 in the raise bar). Disabled = no fill, `--illus-idle-mid` icon, `aria-disabled`. Full width so it never wraps at 320 / fs 1.3. One step = $0.50.
- **Ceiling on T:** its own one-line row under the prep bar (inside the peek), plus the Your order sub. Not in the title.
- **Saving:** T6 only, once. D1’s receipt shows the real Delivery fee and no saving line.
- **Raise:** the same stepper, starting at +$0.50. It's pinned with both buttons so the decision is never below the fold.
- **Top-up amounts:** buttons, not a stepper. Each shows the offer it creates, so the shop sees the result before tapping. One tap sends; the toast confirms. The grid drops to two columns when narrow. Labels "+$1" and "+$2" follow the brief; their a11y labels read "Add $1.00" / "Add $2.00".
- **2-minute line:** shown, quiet (clock + muted), on the hold card and the board card.
- **Rider offer card (RD1a/RD1b): no change.** It shows the current offer as the fare, never the ceiling. No "Raised" marker: it would teach riders to wait for a rise, which is the drift the plan says to watch. Nothing drawn.
- **Admin (E):** drawn as E1, plain rows only.

## Specs for new parts
- **DELIVERY card:** `rb` card, gap 6. Header: label + "2.5 km" muted (nowrap). Row "Recommended" 15/600 · "$3.00" 15/700. Optional clock line 13 muted. 1px `--line` hairline (6/4 margins). "Pay no more than" 15/700. Stepper. Mint note (`shield-check`, `--accent-text`) with the promise.
- **Ceiling value in rows:** the amount in the row’s own weight, 4px gap, then "at most" 13/600 `--muted`.
- **Searching row:** min-height 44, radius 12, `--surface`, padding 8/12, `bike` 18 `--accent-text`, text 14: bold "Delivery $3.00 at most" + muted " · finding a lower price". Wraps.
- **Door-amount row (T6p):** radius 16, `--accent-wash`, padding 12/14; 40 white disc with `banknote` 20; title 17/700; sub 13 `--ink`; saving 13/700 `--accent-text`.
- **Raise card:** `card` with 2px `--accent` border, padding 14, gap 4; title 18/700; sub 13 muted.
- **Raise bar:** the CTA bar (gap 8): label row (overline + 13 muted total, wraps), stepper, primary 52, secondary 48.
- **Top-up button:** min-height 56, radius 14, white, 1.5px `--line`; amount 16/700, "Offer $X" 12/600 muted.
- **Finding card:** `--accent-wash`, radius 16, padding 14; 40 white disc with spinner; title 17/700; "Offered…" 13/600 `--accent-text`.
- **Toast (merchant and T11c):** `--forest`, radius 14, one line, about 2.5 s.

## Values
The Free delivery tag uses `--free` (#4B2FBF) with white text, as in Calm Mint v2. No new values.

## Behaviour
- Bounds come from the server (`ceilingBounds`); the client only steps on the $0.50 grid. − disables at the floor, + at 2 × Recommended.
- Before acceptance, every amount the customer sees is goods + ceiling, read "at most". After acceptance it is goods + accepted price, exact, everywhere: the sheet, the Orders card, Notifications, push, door card P1 and the receipt.
- T11c appears 2 minutes after the hold, or at once if the shop taps Keep searching. A shop top-up cancels the pending prompt. Free-delivery orders never show T11c.
- M4h buttons are disabled for any amount above the goods total (the `merchantDeliveryShare` cap).

## NEEDS BACKEND
Order fields `deliveryRecommended`, `deliveryCeiling`, `deliveryOffer`, `merchantTopUp`, `deliveryAcceptedRound`; `POST …/orders/:id/top-up`; `POST /orders/:id/raise-ceiling`; the raise push; `holdAskAt` for the countdown line; the accepted price on the Orders and Notifications feeds; per-round dispatch log for E1.
