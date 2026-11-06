# Delivery price ceiling: brief for Claude Design (2026-11-05)

> **How to use this:** start a new Claude Design project. Attach the files in **Part 3** in that order, then
> paste **Part 1** as your first message and **Part 2** right after it. Claude Design can't see the repo, so
> this file carries everything it needs.
>
> **Source:** the plan `docs/plans/2026-11-05-delivery-price-ceiling.md`, agreed with the owner on 2026-11-05.

---

## Part 1: The prompt (paste this first)

You are adding one new idea to **LyniaGo**, a delivery app in Zimbabwe (Harare first). One Android app serves
customers and bikers. Merchants (restaurants, shops, pharmacies) use a phone web app. Customers pay **cash at the
door**.

**The idea: a delivery price ceiling.** Today, when a customer orders from a restaurant, shop or pharmacy, the
delivery fee is fixed at checkout. From now on:

1. At checkout the customer sees a **Recommended** delivery price and a **"Pay up to"** amount. "Pay up to"
   starts at the recommended price. They can lower it a little or raise it.
2. While the food is made, the app looks for a biker **cheap first**. It offers a little under the
   recommendation and raises the offer $0.50 a minute until a biker accepts. It never goes past the
   customer's "up to".
3. The customer pays **the price the biker accepted**. That is often less than "up to" and never more.
4. If nobody accepts even at "up to", the **shop** is asked whether to add a top-up from its own money.
   The customer's price doesn't change. If the shop says no, the **customer** is asked whether to raise
   "up to".
5. Bikers never see the customer's "up to", only the current offer. There's no bidding and nobody compares
   offers. The first biker to accept takes the job, as today.

**Your job:** draw the new states this needs on the three phones, **as variants of screens that already
exist**: the customer's Review & place and order screen (Order flow v2), the merchant's hand-over / no-biker
hold (Merchant v2), and the biker's offer card. Don't redesign those screens. Add to them, with the same frame
size, ids scheme and kit components.

**The feeling we want:** honest and calm. The customer should feel "I'm in control and I might pay less", never
"the price is unclear". The shop should feel the top-up is a choice, never a penalty. Keep it as quiet as
today's checkout. One stepper, one short line, no charts, no gamification, no "deal" language, no emoji.

**Hard rules from the system (attached `00-BRAND.md` and `tokens/`):**

- Light theme, Inter 400/600/700, tabular figures on every amount.
- Brand green `#00B14F` is never text. Green text is `--accent-text`.
- Every control is at least 44 tall, and the one primary CTA is 52.
- Draw at 360×720. Every frame must survive 320×640 and font scale 1.3: money never truncates, and actions
  stack.
- Money is `$3.50` on a $0.50 grid. A missing value is dropped, never "$0.00".
- Copy is second person, sentence case, one short sentence (two at most).
- **Use the existing components only.** Don't add tokens. If you need a value no token covers, say so in
  the README.
- Write "rider" in copy as the other handoffs do. The app shows it as "biker" automatically.

**What to send back** (the same shape as the other handoffs):

- `README.md`: one row per new frame (id, state, what changed), with specs for anything new.
- An HTML canvas with every new frame at 360×720, plus 320×640 and font scale 1.3 wherever text wraps.
  Support `?screen=<ID>` like Order flow v2.1.
- `copy.ts`: every new string verbatim and keyed. Mark changed strings with `// was: …`.
- Screenshots `<ID>.png` if you can.

---

## Part 2: The screens to draw

### The numbers you'll draw with

Use these real examples so the frames show real amounts. The recommended price is Send's parcel formula: $1.50
plus $0.60 a km, rounded to $0.50, minimum $1.50.

| Trip | Recommended (= default "up to") | Lowest "up to" | Highest "up to" | First offer to bikers |
|---|---|---|---|---|
| 1 km | $2.00 | $1.50 | $4.00 | $1.50 |
| 2.5 km (**main example**) | $3.00 | $2.50 | $6.00 | $2.50 |
| 5 km | $4.50 | $3.50 | $9.00 | $3.50 |

**Main example order:** items $67.00, 2.5 km, "up to" $3.00. The biker accepts at $2.50, so the customer pays
**$69.50** at the door instead of up to $70.00.

**Shop top-up choices:** +$0.50, +$1, +$2. If the customer is asked to raise, the default is +$0.50.

---

### A. Customer · Review & place (extends Order flow v2 **R1** / R2a / R2b)

Today's R1 has: Deliver to · items · If something's out of stock · Your phone · Note for the rider · **Pay** (Cash
at the door, "Have {p} ready — riders carry little change.") · totals (Items / Delivery fee / Total, "Free to cancel
until the rider collects your order.") · pinned CTA "Place order · {p} cash".

**Must**

- Show **Recommended $3.00** and a **"Pay up to"** stepper (− $3.00 +) in the delivery part. The stepper starts at
  the recommendation.
- − is disabled at the lowest; + is disabled at the highest.
- Below the recommendation, one muted line warns that bikers may take longer.
- One line explains the promise: they pay this amount or less, and we look for the lowest price first.
- The Total row and the CTA show the **"up to"** amount, e.g. "Place order · up to $70.00 cash".
- The Pay block's "Have {p} ready" can't promise an exact amount yet, so it needs new wording.
- **Free-delivery venue** (the venue pays delivery and the customer pays $0): **no stepper at all**. Draw it to
  show it stays as today.

**Your call:** where the block sits (its own card, or inside the totals card), the stepper's look (reuse the
merchant's −/+ fare stepper style if it fits), and the exact words.

**Draw**

| Suggested id | State |
|---|---|
| R1c | Default: "up to" = Recommended $3.00 (+ 320, fs 1.3) |
| R1c-low | Lowered to $2.50 (the lowest): − disabled, the "may take longer" line showing |
| R1c-high | Raised to $4.00 |
| R1c-free | Free-delivery venue: no stepper, $0 delivery |

---

### B. Customer · Order screen (extends Order flow v2 **T4 / T5 / T6 / T11a**, plus the **Orders tab card** and **Notifications** rows)

**Must**

- **Before a biker accepts** (T4 cooking, T5 packing, the search): the sheet shows delivery as "up to $3.00" and
  that we're looking for the best price. Keep it to one line. The track and ETA stay as they are.
- **After a biker accepts** (T6 rider to venue onward): show the **real amount** the customer will pay at the
  door ("Have $69.50 ready"). If it's lower than "up to", show the saving once, quietly ("You saved $0.50"). No
  confetti and no celebration.
- **Raise prompt** (new, after T11a "Finding a rider is taking longer"): a card on the sheet asks whether to
  raise "up to" to $3.50, with **Raise to $3.50** (the primary) and **Keep waiting** (secondary). The same
  question also goes out as a **push** (title and body, no codes).
- The **Orders tab card** (Orders v2) and the **Notifications row** (Notifications v1) need "up to $70.00" before
  acceptance and "$69.50" after.

**Your call:** whether the "up to" line lives in the title, the sub or the money row, and whether the saving shows
on T6 only or also on D1 (delivered).

**Copy to start from**

- T11a today: "Finding a rider is taking longer" / "We're asking more riders now. Your food is kept warm — same food,
  same price, nothing extra to pay." *That sub is no longer true once raising is possible. Rewrite it.*

**Draw**

| Suggested id | State |
|---|---|
| T4u | Cooking, searching: "up to $3.00" (+ 320, fs 1.3) |
| T6p | Rider accepted at $2.50: "Have $69.50 ready", saved $0.50 |
| T6p-same | Rider accepted at the full "up to" $3.00: no saving line |
| T11c | Raise prompt: Raise to $3.50 / Keep waiting (+ 320, fs 1.3) |
| T11c-push | The push, as a notification shade frame |
| O-card-u | Orders tab card: before and after acceptance |

---

### C. Merchant · No-biker hold (extends Merchant v2 hand-over **M4** hold card / the board card that says NEEDS YOU)

Today the hold card is a gold strip: **"No biker yet"** / "Nobody has taken it so far. Keep searching, or cancel and
the customer is told." / **Keep searching** / *Cancel order*.

**Must**

- Add a **top-up** choice: **+$0.50 · +$1 · +$2**. It says plainly that the shop pays it from its own cash and
  that the customer's price doesn't change. Tapping a choice sends the new offer at once.
- Keep **Keep searching** (no top-up) and **Cancel order**.
- Show the offer bikers are seeing now ("Bikers are offered $3.00").
- After a top-up: a toast, and the card returns to "Finding a biker", showing the new offer ("Offered $4.00 ·
  includes your $1.00").
- **The money view:** where the shop sees what comes back from the rider (M6a cash back and the Money tab), the
  top-up is a deduction, e.g. "Rider top-up −$1.00".
- If the shop does nothing for 2 minutes, the customer gets the raise prompt. The card can say so ("We'll ask
  the customer in 2:00"), or not. Your call.

**Your call:** whether the three amounts are chips, a stepper or buttons, and how much explanation fits on the
counter-glance card versus the order page.

**Draw**

| Suggested id | State |
|---|---|
| M4h | Hold with top-up choices (+ 320) |
| M4h-sent | After +$1: searching again, "Offered $4.00 · includes your $1.00" |
| M6a-t | Cash back with the top-up deducted |
| K-card-h | The board card for a held order (NEEDS YOU) showing the top-up entry |

---

### D. Biker · Offer card (extends Order flow v2 **RD1a / RD1b** and Rider v2's food offer)

**Must**

- The card shows the **current offer** as the fare, as today. The layout is unchanged.
- It never shows the customer's "up to".

**Your call:** whether a raised offer gets a small marker (e.g. "Raised"). If you add one, draw it. If not, say
"no change" in the README and draw nothing.

**Draw:** RD1a-r only if you add a marker.

---

### E. Admin · Order detail (low priority, desktop 1440×900)

One block on the order detail: Recommended · Customer's "up to" · Accepted price · Shop top-up · Accepted in round
N. Plain rows. Draw only if time allows.

---

## Part 3: Files to attach (in this order)

1. `docs/design-briefs-2026-10-12/00-BRAND.md`: the system on one page.
2. `packages/design/tokens/`: `colors.css`, `typography.css`, `spacing.css`, `fonts.css`, `icons.css`.
3. `packages/design/handoff/order-flow-v2/order-flow-v2-1.html`: the customer, merchant and biker order
   canvas (one offline file), plus its `README.md` and `code/copy.ts`.
4. `packages/design/handoff/merchant-v2/Merchant v2 - all screens.html` and its `README.md`.
5. `packages/design/handoff/orders-v2/README.md` and `packages/design/handoff/notifications-v1/README.md`
   (for the card and row variants).
6. The current checkout screenshot (the Review order screen with "Place order · $68.50 cash").
7. `docs/plans/2026-11-05-delivery-price-ceiling.md`: the full plan, for the rules behind each state.

## After the export comes back

Put the export at `packages/design/handoff/delivery-ceiling-v1/`. That folder must land in the same PR as an
owner-approved entry in `docs/DESIGN-DEVIATIONS.md` (CI's reverse-drift freeze fails it otherwise). Building then
follows §7 of the plan, behind `DELIVERY_CEILING_ENABLED` (off by default).
