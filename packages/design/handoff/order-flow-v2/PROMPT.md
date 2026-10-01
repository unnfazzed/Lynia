# LyniaGo Order flow v2 — Restaurants, Shops & Pharmacy, checkout → hand-over → done: brief for Claude Design (v1, 2026-10-01)

> **How to use this:** upload `order-flow-v2-bundle.zip` (built by `bundle.sh` next to this file) or
> attach the files in **Part 3** in that order. Paste **Part 1 (the prompt)** as your first message and
> **Part 2 (the current-state reference)** right after it. Claude Design can't see the repo, so this file
> carries everything.
>
> **Where this sits.** The browse brief (`docs/designs/browse-v2/PROMPT.md`) designs list → storefront →
> item sheet → cart bar, and stops there ("cart/checkout: not in scope"). The Orders brief
> (`docs/designs/orders-v2/PROMPT.md`) designs the Orders tab list. **This brief designs everything in
> between and after: cart → checkout → the order screen → the hand-over at the store → the hand-over at
> the door → done**, on all three phones (customer, merchant, rider).
>
> **Owner answers (2026-10-01), final:** (1) cover customer + merchant + rider; (2) restaurant, shop and
> pharmacy orders use **the same order screen as parcels** (After Send v2) with merchant stages added;
> (3) **cash only** at checkout; (4) draw **out-of-stock substitution, pharmacy prescription upload
> (behind a flag), proof photos at hand-over, and scheduled orders**. Everything marked **"Proposed
> decision"** is the brief author's call. Change any before sending if you disagree.

---

## Part 1: The prompt (paste this first)

You are redesigning **how a LyniaGo customer's order from a restaurant, shop or pharmacy travels from
"checkout" to "done"** — and the matching moments on the **merchant's** phone and the **rider's** phone.
LyniaGo is a delivery app in Zimbabwe (Harare first). One Android app (Expo / React Native) serves
customers and riders; merchants use a phone web app. Customers pay **cash at the door**.

- **Restaurants** are live: a kitchen is auto-accepted, cooks, a rider is auto-dispatched near the end of
  prep, collects the food with a pickup check, and hands it over at the door against cash and a 6-digit
  delivery code. The rider later returns the cash to the kitchen.
- **Shops** (grocery, butchery, fashion, auto parts, hardware, electronics, other) and **Pharmacy**
  launch next and order the same way, with nuance: things go out of stock, items are worth more, and
  medicine needs extra care.

**The lesson to learn from:** two flows were redesigned this month and testers love them —
**Send a parcel v2** (four calm steps, a Review step where every block has "✎ Edit", the price pinned in
the CTA bar) and **After Send v2** (ONE order screen: a full-bleed map, a human title per stage, and a
bottom sheet whose content follows the order's stage; rider card, step track, 6-digit code card that
becomes the biggest thing on the sheet at hand-off, calm failures with one retry). The **rider app
(Rider v2)** already uses the same kit for food jobs. **The customer's restaurant order screen is the
last screen still in the old generation** — a prep ring, a seven-row vertical stepper, a map inside a
card, a 4-digit code, leftover wallet and mobile-money copy (see `current/`). Bring it, checkout, and
the merchant/rider hand-over moments into the After Send v2 language, then extend the same template to
shops and pharmacy.

**Who the users are:** Harare, cheap Android phones, patchy 2G/3G, bright sun, mixed literacy (UI in
English). Many compare LyniaGo with "I'll WhatsApp the shop and send a courier". At every moment the
order screen must answer, in this order: **"Is it happening?"**, **"When will it get to me?"**,
**"What do I need to do?"** (usually nothing; at the door: pay and say the code).

### What I want from you

One coherent, high-fidelity **order family** with every state and the components it needs:

1. **Checkout** (customer): cart and checkout as one Review screen.
2. **The order screen** (customer): After Send v2's screen with the merchant stages.
3. **At the door** (customer + rider): cash, the code, the proof photo.
4. **Done** (customer): receipt + rating; and every ending (cancelled, refunded, not delivered).
5. **The merchant's side** of the same order: ringing, substitution, cooking/packing, hand-over to the
   rider with the pickup check and photo, tracking, cash back.
6. **The rider's side**: only the deltas on top of Rider v2's food job (B1–B6) — pickup photo, sealed
   pharmacy bag, door photo, scheduled jobs.
7. The four **nuance** flows: substitution, prescription upload (flagged), proof photos, scheduled orders.

### Proposed decisions (treat as final unless the owner changes them)

1. **One order screen for every service.** `app/order/[id]` (After Send v2) renders parcel AND
   restaurant / shop / pharmacy orders. Same header (‹ Back · human title · red Help on live orders),
   same full-bleed map, same sheet (peek measured from content, drag to full), same optional CTA bar.
   Only the stages, the map mode and the venue block differ. The old food order screen is retired.

2. **Merchant stages, as a step track of four** (After Send's track is Matched → Picked up → On the way
   → Delivered; a seven-row stepper is not a track):

   | Track step | Restaurants | Shops | Pharmacy |
   |---|---|---|---|
   | 1 | **Confirmed** | **Confirmed** | **Confirmed** (or **Prescription checked**) |
   | 2 | **Cooking** | **Packing** | **Packing** |
   | 3 | **On the way** | **On the way** | **On the way** |
   | 4 | **Delivered** | **Delivered** | **Delivered** |

   Rider secured / at the store / collected are **sheet content and map state inside steps 2–3**, not
   extra steps. Titles per stage (verbatim-ready, your final wording): "Sending to Gava's Kitchen…",
   "Gava's Kitchen is confirming", "Cooking your order", "Packing your order", "Rider on the way to
   Gava's Kitchen", "Rider is collecting your order", "On the way to you", "Rider is at your door",
   "Delivered".

3. **Map modes before a rider exists.** Today the food map only appears once a rider moves. Proposed: the
   map is always there. Before a rider: the **venue pin** (service sticker disc: restaurants / shops /
   pharmacy) and **your drop pin** (red square, as parcels) joined by a dashed route, camera framing both.
   Rider secured: the ink bike disc + name pill appears heading to the venue. Collected: the solid accent
   route to you. Draw the venue pin as a new map marker.

4. **ETA honesty.** One ETA line under the title, always a **range** until a rider is collected
   ("Arrives 12:40–12:55"), a single time after ("Arrives in ~9 min · 12:47"). Prep progress is a thin
   bar inside the sheet, not a big ring. Never show a number the app can't know (no ETA without a
   location fix — draw that variant).

5. **Checkout = Send v2's Review step.** Cart and checkout merge into **one Review screen** (pushed from
   the cart bar): blocks with "✎ Edit" — **Items** (lines with − n + steppers, line notes, "Add more
   items"), **Deliver to** (pre-filled from Home's DELIVERING TO; ✎ opens inline address editing exactly
   like Send v2 step 1, with the map), **When** (ASAP · Schedule — decision 10), **Your phone**, **Note for
   the rider** ("Blue gate, 3rd house on the left"), **Pay** (one fixed row: "Cash at the door · have
   $18.50 ready — riders carry little change"). Price breakdown (Food · Delivery fee · Small-order fee ·
   Total) and the cancel rule in one muted line. The total is pinned in the CTA bar:
   **"Place order · $18.50 cash"** (52px). No map on the Review screen unless editing the address.

6. **Substitution (shops and pharmacy first; restaurants too).** Today the merchant can only strike a
   line at accept time (customer approves or cancels in 60 s), and can silently change quantities later
   (the customer only sees a banner). Proposed:
   - The **merchant proposes per line**: *Remove it* or *Swap for…* (pick from their own catalogue; the
     new price shows). Multiple lines can change at once.
   - The **customer approves per line** on the order screen ("Avondale Fresh is out of Lobels bread 700g.
     Swap for Bakers Inn 700g (+$0.10)?" — Accept swap · Remove it), with a total that updates live and
     one "Confirm changes · New total $23.40".
   - **Window: 3 minutes. No answer = the swaps are declined and the items removed, the order continues**
     (not cancelled; cancelling is always one tap away). A change that **raises** the total always needs
     a yes; one that only lowers it is applied and announced.
   - **Any later change** (mid-prep "Change items") goes through the same approval. No silent edits.
   - Customer can pre-set per order on the Review screen: "If something's out of stock: **Ask me** ·
     Remove it" (default Ask me).

7. **Proof at hand-over.**
   - **Pickup:** the rider photographs the **sealed bag** at the counter (Rider v2 A2–A6 pattern). Required
     for shops and pharmacy, optional for restaurants. The merchant sees it on the hand-over screen; the
     customer sees "Collected · sealed bag photo" with **View** on their sheet.
   - **Pharmacy bags** carry a seal (sticker or stapled receipt). The rider ticks "Bag is sealed" before
     the photo; the customer is told "Check the seal before you pay."
   - **Door:** the 6-digit code stays the proof. A **door photo** is taken only when the code can't be used
     (customer unreachable / handed to someone else / left at the gate by agreement), and is shown to the
     customer, the merchant and support.

8. **The door, simplified.** Today: food first → customer taps "I gave the rider $X" → rider taps
   "I received $X" (2-minute ring) → the code unlocks behind press-and-hold → rider types it. Keep the
   rule (code only after both confirm cash) but draw it as **one "At your door" card with three numbered
   lines**: ① Take your order (and check the seal) ② Pay $18.50 cash ③ Say your code — each ticking as
   it happens; the code is the biggest thing on the sheet once unlocked (After Send's 3+3 "418 290", 6
   digits, never 4). The rider side mirrors it (Rider v2 B4 with CashSplit).

9. **Done = receipt + two ratings.** "Delivered 12:47" hero, a **receipt** (items, fees, paid in cash,
   rider, venue, order #, "Share receipt"; none exists for food today), and one rating card with **two
   rows**: the order ("How was Gava's Kitchen?") and the rider ("How was Tendai?"), stars + quick tags,
   Skip, Undo. Then "Order again" (re-fills the cart).

10. **Scheduled orders.** Review → **When: ASAP · Schedule**. Schedule opens a sheet with **Today /
    Tomorrow** and **30-minute slots** inside the venue's hours ("12:30–13:00"), only slots the venue can
    meet (prep + delivery estimate). A **closed** venue's storefront offers "Order for when they open"
    (first slot). The order screen shows a **Scheduled** state ("Arrives 17:30–18:00 tomorrow ·
    Gava's Kitchen starts cooking at 17:05"), cancel free until the kitchen starts. The merchant gets it
    in a **Scheduled** list and it **rings at start time** like a new order. Cash at the door, as always.
    NEEDS BACKEND.

11. **Pharmacy prescription upload — drawn now, shipped behind a flag** (no Rx sales until MCAZ/PCZ
    sign-off; at launch the OTC notice from the browse brief stays and nothing below is visible).
    - Rx items show a "Prescription needed" tag on the storefront and in the cart.
    - Review gains a **Prescription** block: "Add a photo of your prescription" (camera / gallery, up to 3
      pages), patient name, "I'll show the original to the rider" consent line.
    - Order screen stage before Packing: **"Pharmacist is checking your prescription"** (range ETA),
      then approved (track step 1 reads "Prescription checked") or **declined with a reason** and the Rx
      items removed (rest continues, or cancel free).
    - Merchant (pharmacist) gets a **Prescription check** screen: zoomable photo, patient name, items,
      Approve · Decline (reason chips: Unreadable · Expired · Not valid for this medicine · Other).
    - Door: rider sees "Prescription order · see the original script" on the stop card and ticks "Saw the
      original" before the code. NEEDS BACKEND (Script entity, pharmacist account).

12. **Merchant side = merchant-mobile handoff language** (mint header, segmented control, ringing
    takeover, CodeBoxes, ConfirmSheet, PrepRing, CashBackCard). Vocabulary per service: Cooking ↔
    Packing, "Food is ready" ↔ "Order is packed", "kitchen" ↔ "shop" ↔ "pharmacy". Add: the substitution
    proposer (in the ringing takeover AND mid-prep), the pickup photo on the hand-over screen, the
    Scheduled list, the Prescription check. Shops' "Book a rider" (D2–D7) stays as is.

13. **Live bar, Orders card and push** follow the stage: draw Home's forest live-order bar and the
    Orders-tab live card copy per stage for a restaurant, a shop and a pharmacy order, and the push copy
    (title / body) for every stage change. Push never contains the delivery code.

### Hard constraints. Don't break these.

- **Platform & frames:** customer + rider Android at **360×720**, merchant phone web at **360×720**.
  Every state also at **320×640**; key states at **font scale 1.3**. Nothing hides under the CTA bar.
- **Reuse, don't invent.** After Send v2 (`as-kit.jsx`: header, sheet, map pins, rider card, step track,
  code card, toast), Send v2 (`sc2-kit.jsx`: Review blocks with ✎ Edit, CTA bar, inline address card),
  Rider v2 (`rv-kit.jsx`, `rv-job.jsx`: JobShell, StopCard, CashSplit, CodeBoxes + numpad, photo steps),
  merchant-mobile (B1–B7, D-family), Calm Mint v2 (stickers, forest bar, kind tints). New components must
  be named and justified.
- **Cash only.** No wallet, card, EcoCash or InnBucks UI anywhere (legacy copy that mentions a wallet or
  mobile money is removed).
- **No pull-to-refresh, no Refresh buttons.** Live data updates itself. A failed *first* load may show
  "↻ Try again". Offline keeps the last state with a muted banner ("You're offline · last update 12:31").
- **Errors are spoken once and go:** ink toast ~4 s. No persistent red lines. Warnings are hints, never
  blocks (except the code and the cash rule).
- **Tap targets ≥ 44px (`--target-min`), the one primary CTA 52px (`--target-primary`)**, drawn at size.
  Every icon carries a visible label (Call, WhatsApp, View, Share).
- **Money:** USD, tabular numerals. Never red text on white. Green *text* is `#006630`, never `#00B14F`.
- **Codes:** delivery code **6 digits** (3+3), pickup code **4 digits**. Push never carries a code.
- **Vocabulary:** *Restaurant/kitchen*, *shop*, *pharmacy*; *dish* (food) vs *item*; *Order*, *Rider*,
  *Delivery fee*, *Small-order fee*, *Pickup code*, *Delivery code*. Say **LyniaGo**. Help → **WhatsApp**.
- **Honest data only.** No ETA, distance or fee without a location; no star for an unrated venue; no
  "Free delivery" unless the venue funds it.
- **Pharmacy:** no medical claims; OTC notice at launch; Rx only behind the flag (decision 11).
- **Not drawn ⇒ not rendered.** What you draw ships; what you don't, doesn't. Draw only what you mean.

### What's wrong today (fix these, and find more) — see `current/`

- **Two order screens, two generations.** Parcels (`30-`, `31-`) have the map + stage sheet; food
  (`03-`…`08-`) has a prep ring, a seven-row stepper and, once a rider moves, a map *inside a card*
  with Expand/Recenter buttons and a "the gold pin updates live" explainer.
- **The stages lie.** `05-preparing`: "We'll start looking for a rider once it's ready." while the
  stepper already ticks "Rider secured" and highlights "Rider at the restaurant".
- **4-digit delivery code on food** (`07-`, "4 8 2 1") vs 6 on parcels; the server issues 6.
- **Wallet and mobile-money copy in a cash-only flow:** "nothing has left your wallet" (`03-`), "Paid
  to · mobile money", "Your reference EC-…" (`09-`, `10-`), "…mobile money only" after a failed delivery.
- **Item approval is a cancel-or-accept ultimatum** (`04-`): no swap, "no answer cancels it", and later
  merchant edits skip approval entirely (banner after the fact).
- **Checkout is a form, not a review:** a grey map placeholder, "Search an address · Find", landmark,
  phone, a single radio "HOW YOU'LL PAY", and a disabled pale "Place order" (`02-`). The cart (`01-`) is a
  separate screen with static qty badges (the stepper hides in a note sheet).
- **No receipt for food**, and the rating only asks about the rider (`08-`).
- **No ETA story** before a rider exists: "17 min prep" is the kitchen's number, not "when will it get to
  me".
- **No photos** on food jobs: the pickup photo exists for parcels only; the door-proof photo exists in
  the API and admin but no screen takes it.
- **The door dance is three cards** (cash card, 2-minute ring, a press-and-hold masked code) — the right
  rule, the wrong amount of UI.
- **Nothing for shops/pharmacy** on the customer side (tiles open "coming soon"), no scheduled orders, no
  Rx.

### Deliverables (same package shape as After Send v2, Rider v2 and Calm Mint v2)

1. `BRIEF.md`: the product decisions you made, as short final statements, plus open questions.
2. `README.md`: screen + state list (ids below), navigation (what each tap opens), the global constraints,
   a component spec (Review blocks, schedule sheet, substitution card, venue pin, merchant stage sheet,
   door card, proof-photo row + viewer, receipt, two-row rating, Rx block, Rx check, Scheduled list) with
   sizes at 360 and 320, a **per-service table** (restaurant / shop / pharmacy differences), the **peek
   table** per stage, the **push copy** table, a token table, and **NEEDS BACKEND** + **Retires** sections.
3. A standalone HTML prototype showing **every state at 360×720**, key states at **320×640** and **font
   scale 1.3**, one screen per id (`?screen=T4`), customer / merchant / rider columns side by side for
   the hand-over moments.
4. A kit file with the shared parts **and one object with every user-facing string** (call it `O`), final
   copy, Harare sample data (Part 2 §7).
5. 2× PNG renders of every state.

Cover **every state in Part 2 §8**, plus anything you introduce. For each existing screen id (Part 2 §5)
say **keep, redesign, merge or retire**.

---

## Part 2: Current-state reference (paste after the prompt)

### 1. Product rules already decided (owner-approved)

1. **Restaurants are live; Shops and Pharmacy are next** and order the same way (browse brief). Merchants
   have `businessType` restaurant | shop and, for shops, a `shopKind` (pharmacy, grocery, butchery,
   fashion, auto parts, hardware, electronics, other).
2. **Cash at the door only** (D-48). The API still knows wallet/mobile-money lanes for old installs; no
   screen offers them.
3. **Restaurants auto-accept** (D-50). The kitchen must still confirm it's making the order ("Got it,
   we're making it"); unconfirmed orders escalate to ops at 5 min and **auto-cancel at 1 hour, no charge**
   ("The restaurant didn't confirm your order in time — nothing was charged"). Non-auto-accept merchants
   have **3 minutes** to accept or it auto-cancels.
4. **Dispatch** starts **8 min before prep ends**: the offer goes to the 10 best riders (the merchant's
   preferred riders first), 60-s rounds, up to ~6 rounds, then "no rider". **No customer auction** for
   merchant orders; the delivery fee is fixed at checkout.
5. **Pickup check:** a **4-digit pickup code** the merchant reads to the rider (rider types it, 5 tries),
   or — at auto-accept kitchens — "Collected" inside a **150 m** geofence.
6. **Door:** the customer takes the order, pays cash, both confirm the cash (2-minute window; then support
   is alerted), then the **6-digit delivery code** unlocks; the rider types it (5 tries). Free to cancel
   until the rider collects; after that cancelling costs the full total.
7. **Cash back:** the rider returns the goods money to the merchant within **30 min**; merchant taps
   "I got $X" (or "No cash on this one"). Failed delivery → goods go back ("I got the food back").
8. **Customer no-show:** rider waits **8 min** and calls twice, then can mark undelivered (the rider app
   says 10 min today — a bug; draw 8).
9. **Pricing:** delivery fee $0.80/km rounded to $0.50, min $1.50; subtotal under **$4.00** adds a **$1.00
   small-order fee** (never blocks). Notes ≤ 200 chars, never change the price.
10. **The venue's phone** is visible to a customer with a live order ("Call Gava's Kitchen").
11. **Help** goes to WhatsApp; **Emergency** dials and alerts the safety team (After Send v2 2.18).
12. **Pharmacy sells OTC only until MCAZ/PCZ sign-off.** Rx is designed now but ships behind a flag.

### 2. Data each order has (what the design can show)

`Order`: `orderType` parcel | merchant; `status` (requested → assigned → en_route_pickup → picked_up →
en_route_dropoff → delivered → completed; cancelled, expired, undelivered); for merchant orders a
`merchantPhase` (awaiting_accept → awaiting_item_approval → preparing → ready_for_pickup); `prepMinutes`
and ready-by time; `kitchenConfirmedAt`; items (name, qty, price, line note), order note, subtotal,
small-order fee, delivery fee, total; drop-off pin + landmark + contact phone; venue (name, logo,
location, phone, businessType, shopKind); rider (name, photo, rating, trips, plate, verified, live GPS);
`pickupCodeHash`, delivery code (6 digits), `customerCashConfirmedAt` / `riderCashConfirmedAt`;
`pickupPhotoKey` (parcels only today), `deliveryProofKey` + GPS (API only today); cancel reason (who,
why); rating (rider only today).

**NEEDS BACKEND (list in your README; design them anyway):**
- Per-line substitution proposals + per-line approval; approval for mid-prep edits; "if out of stock"
  preference.
- Pickup photo on merchant orders; door-proof photo surfaced to customer + merchant.
- Scheduled orders (slot, ring-at-start, "order for when they open").
- Rx: Script entity, pharmacist role, Rx items flag, check/decline.
- Venue rating from the customer (today only the rider is rated) and a merchant-order receipt.
- Customer shop/pharmacy catalogue + order APIs (restaurant-only today).
- A merchant-order step track on the customer socket (today it's derived on the phone).

### 3. Where this sits in the journey

```
HOME / STOREFRONT (browse-v2) ──► cart bar ──► R · REVIEW & PLACE (this brief)
                                                   │ Place order · $18.50 cash
                                                   ▼
                       T · ORDER SCREEN  (app/order/[id], After Send v2 shell)
   confirming → cooking/packing → rider to venue → collected → on the way → at your door → delivered
        │              │                  ▲                                     │
        │   substitution card (U)         │ pickup code + sealed-bag photo      │ cash + code (+ door photo)
        ▼              ▼                  │                                     ▼
MERCHANT: ring (B2) → confirm/cook (B3) → hand-over (B4) → tracking (B6) → cash back (B7)
RIDER:    offer (F1) → to venue (B1) → collect (B2 + photo) → to customer (B3) → code (B4) → return cash (B5)
                       ▼
     D · DONE (receipt + two ratings) ── Orders tab (orders-v2) · Home live bar
```

### 4. What it looks like today

Renders at 360×720 (2×) in `current/`:

| File | Screen | What to notice |
|---|---|---|
| `01-cart` | `app/food/cart.tsx` | separate cart screen; static qty badges; "Delivery fee is added at checkout" |
| `02-checkout` | `app/food/checkout.tsx` | grey map box, "Search an address · Find", landmark, phone, one pay radio, pale disabled CTA |
| `03-awaiting-restaurant` | order screen, awaiting accept | 1:29 ring, "nothing has left your wallet", 7-row stepper, "Cancel the order — free" |
| `04-item-removed` | order screen, item approval | "Answer within 0:51 — no answer cancels it", Yes-send-without / Cancel whole order |
| `05-preparing` | order screen, cooking | 17-min ring + contradictory copy + stepper |
| `06-no-rider` | order screen, no rider | "Try again now" / "See other restaurants nearby" |
| `07-on-the-way` | order screen, live | map inside a card, Expand/Recenter, "gold pin" explainer, rider phone line, **4-digit** code |
| `08-delivered-rate` | delivered | rate the rider only; no receipt |
| `09-rejected`, `10-refunded` | legacy prepaid endings | mobile-money refund copy (retire) |
| `20-rider-food-offer` | rider offer (Rider v2) | already in the new kit |
| `21-rider-food-job`, `22-rider-food-nav` | rider job (Rider v2) | step bar Pickup/Collected/Drop-off/Done, CashSplit |
| `30-`, `31-parcel-after-send-v2-*` | **the target language** | header, map, sheet, rider card, track, 6-digit code |

Merchant screens: see `reference/merchant-mobile/Merchant Prototype (standalone).html` (B1–B7, D1–D7) —
the shipped merchant app matches it (D-48).

**Today's copy worth keeping (rewrite freely, keep the meaning):** "Sending your order to the kitchen… /
Don't close the app. If this fails, nothing is ordered and nothing is paid." · "Free to cancel until the
rider collects your food." · "Have the exact amount if you can — riders carry little change." ·
"Finding another one now — same food, same price, nothing extra to pay." · "Your rider tried at your
delivery address. The food is going back to Gava's Kitchen — you weren't charged for it." · merchant:
"LyniaGo accepted this for you · Confirm you're making it so we can send a rider." · rider: "Passing or
missing a food offer doesn't affect your standing."

### 5. Existing screen ids (say keep / redesign / merge / retire)

- **Gallery `RC`** (`explorations/restaurants/r-customer-a.jsx`): `RC.cart`, `RC.cart_empty`,
  `RC.checkout_cash`, `RC.checkout_wallet` (retire: cash only), `RC.await_accept`, `RC.item_removed`,
  `RC.pay_now`, `RC.pay_confirmed` (retire), `RC.track_prep`, `RC.no_rider`, `RC.track_way`,
  `RC.delivered_rate`, `RC.rejected`, `RC.refunded`, `RC.closed_interrupt`.
- **App-only food views** (`src/ui/food/`): Confirming, AwaitingAccept, ItemApproval, AwaitingPayment
  (retire), Preparing, ReadyForPickup, LiveTracker, CashHandshakeCard, DeliveryCodeCard, Delivered,
  Cancelled, Undelivered, RiderDropped, RefundPending.
- **After Send v2** states 1–19 + 2.1–2.34 (parcel; keep — you extend, not replace).
- **Rider v2** F1–F4, B1–B6, A2–A6, X1–X14 (keep; add deltas).
- **Merchant mobile** B1–B7, D1–D7 (keep; add substitution, photo, Scheduled, Rx check).

### 6. Design tokens (Calm Mint v2 + After Send v2 — same family; use only these)

| Token | Value | Use |
|---|---|---|
| ink / muted / line / surface | `#14181B` / `#5B6670` / `#E2E6EA` / `#F6F7F8` | text, meta, hairlines, sunken |
| brand (`--accent`) | `#00B14F` | **fills only**: route, track, discs |
| green-text (`--accent-text`) | `#006630` | links, "✎ Edit", selected text |
| cta / pressed | `#00812F` / `#006B27` | primary button |
| mint (`--accent-wash`) | `#E9F8EF` | code card, ok notices, header |
| forest | `#063B22` (sub `#BFE6CD`) | Home live-order bar, cart bar |
| highlight / -ink / star-stroke | `#FFD23F` / `#3D3100` / `#C99500` | ETA chip, stars, "closing soon" |
| danger / -wash / -ink | `#C0392B` / `#FAEDEB` / `#8F2418` | drop-off square, Help pill, problems |
| tile-food / -shops / -pharmacy | `#FFD9CC` / `#DDD5FF` / `#C5E9DF` | venue pin + sticker discs |
| skeleton | `#EEF1F3` r12 | loading |
| Type | Inter 400/600/700/800; tabular numerals on money, codes, times | |
| Space / radius | gutter 16, grid 8 · fields 12 · cards 14–16 · sheet 20–24 · pill 999 | |
| Depth | zero shadows except the sheet over the map and the dim behind modal sheets | |
| Targets | `--target-min` 44 · `--target-primary` 52 | |

### 7. Sample data (use it)

- **Customer:** Rudo, 12 Lanark Rd, Belgravia, 0771 234 567. **Rider:** Tendai M., ★4.8 · 132 trips,
  Bike ABH 4721, Verified.
- **Restaurant order** — Gava's Kitchen (☎ 0242 700 111): 2× Sadza & beef stew $9.00, 1× Roast chicken
  (half) $6.00 · Food $15.00 · Delivery fee $1.50 · Total **$16.50** cash. Prep 20 min.
- **Shop order** — Avondale Fresh (Grocery): Bread (Lobels 700g) $1.10 → out, swap **Bakers Inn 700g
  $1.20**; Eggs (tray of 30) $5.50; Mazoe orange 2L $3.20; Cooking oil 2L $4.80 · Total **$16.30**.
  Second shop: Mbare Auto Spares — Brake pads (front) $24.00, Oil filter $6.50 (high value: pickup photo).
- **Pharmacy order** — Avondale Pharmacy: Paracetamol 500mg (20 tabs) $1.50, ORS sachets (x5) $2.00,
  Plasters (20) $1.80 · Items $5.30 · Delivery $1.50 · Total **$6.80**. Rx variant (flag on):
  Amoxicillin 500mg (21 caps) $4.20, "Prescription needed".
- **Scheduled:** Gava's Kitchen, tomorrow 12:30–13:00; Pizza Inn (closed, opens 10:00) "Order for when
  they open · 10:30–11:00".
- Codes: delivery **418 290**; pickup **7316**. Order #A1B2.

### 8. States to cover (every one at 360×720; key ones at 320×640 and font scale 1.3)

**Review & place (R)**
- R1 · Review, restaurant (items with steppers + notes, Deliver to, When = ASAP, phone, rider note, Pay
  cash, breakdown, pinned "Place order · $16.50 cash").
- R2 · Review, shop (with "If something's out of stock: Ask me · Remove it") and pharmacy (OTC notice).
- R3 · Editing the address inline (Send v2 step 1 card + map), out-of-area notice.
- R4 · Under the $4.00 minimum (small-order fee line + hint).
- R5 · Schedule sheet (Today / Tomorrow, slots, unavailable slots), and Review with a scheduled slot.
- R6 · Something changed since the cart (sold out / price changed / venue just closed) — how Review says it.
- R7 · Placing (in flight), failed (toast + retry, nothing ordered), offline (CTA disabled + why).
- R8 · Rx block (flag on): add photos, patient name, consent; Review blocked until a photo is added.
- R9 · Empty cart; no location yet.

**Order screen (T)** — each with map mode, title, ETA line, track, sheet, CTA
- T1 · Sending (just placed).
- T2 · Confirming (auto-accepted, kitchen not confirmed yet; Call Gava's Kitchen; Cancel free).
- T3 · Waiting for accept (non-auto merchants, 3-min window).
- T4 · Cooking (restaurant) / T5 · Packing (shop, pharmacy) — prep bar, ETA range, order summary.
- T6 · Rider secured, heading to the venue (rider card appears; ETA range).
- T7 · Rider at the venue / collecting; T8 · Collected (sealed-bag photo row + View; pickup-photo viewer).
- T9 · On the way (live ETA, Call / WhatsApp rider, code card).
- T10 · Rider at your door (door card ①②③; code big after cash).
- T11 · Finding a rider is taking long; rider dropped → finding another (same price).
- T12 · No GPS fix / rider GPS paused ("Last seen 2 min ago").
- T13 · Scheduled (before start), scheduled → started.
- T14 · Loading, couldn't load, not found, offline with saved copy (After Send v2 2.1–2.4 equivalents).
- T15 · Cancel sheet (free before collection; full total after) + in flight + failed.
- T16 · Get help / Report a problem (Wrong item · Missing item · Damaged · Seal broken · Rider · Other).

**Substitution (U)**
- U1 · Merchant proposes (ringing takeover): per line Remove / Swap for… (catalogue picker with price).
- U2 · Customer approval card on the order screen: one line; three lines; a swap that raises the total;
  countdown 3:00; "Confirm changes · New total $16.40".
- U3 · No answer in time → removed, order continues (toast + summary).
- U4 · Mid-prep change (merchant "Change items") → same approval; reduce-only change → announced.
- U5 · Everything out of stock → order cancelled, nothing charged.

**At the door & proof (P)**
- P1 · Customer door card: take order (check the seal), pay cash, confirm; waiting for rider (2-min ring).
- P2 · Code revealed (3+3, biggest on the sheet); Share code (for someone receiving on your behalf).
- P3 · Cash disagreement / ring lapsed → support alerted (calm).
- P4 · Rider side: pickup — "Bag is sealed" tick + photo (shop/pharmacy required, food optional),
  offline queued photo; door photo when the code can't be used.
- P5 · Customer/merchant view of a door photo ("Left with Chipo at the gate · 12:47 · View").

**Done & endings (D)**
- D1 · Delivered: hero, receipt, two-row rating (venue + rider), tags, Skip, Undo; "Order again".
- D2 · Completed later: rated / not rated; Share receipt.
- D3 · Cancelled by you / by the venue ("couldn't take your order") / kitchen didn't confirm in 1 h
  (nothing charged) / no rider found / by LyniaGo.
- D4 · Not delivered (you weren't reachable: what happens to the order and to cash on your account).
- D5 · Rx declined (reason) with the rest of the order continuing / cancelled.

**Merchant (M)** — merchant-mobile language, restaurant + shop + pharmacy vocabulary
- M1 · Ringing (B2) with the substitution proposer; scheduled order ringing at start time.
- M2 · Waiting for the customer to approve changes (countdown; what the kitchen should do meanwhile).
- M3 · Cooking / Packing ticket (B3) with "Change items".
- M4 · Hand-over (B4): pickup code, the rider's sealed-bag photo appearing, "Hand over".
- M5 · Tracking (B6) with the 4-step track matching the customer's; door photo when one is taken.
- M6 · Cash back (B7) unchanged; goods back after a failed delivery.
- M7 · Scheduled list (segment or section on Orders home) + scheduled ticket.
- M8 · Prescription check (pharmacist): photo viewer, items, Approve / Decline + reasons.

**Rider deltas (RD)** — on top of Rider v2
- RD1 · Food/shop/pharmacy offer tag variants (FOOD / SHOP / PHARMACY), scheduled job offer.
- RD2 · At the venue: pickup code → sealed-bag tick → photo → "I've collected the order".
- RD3 · Rx order stop card: "See the original script" tick before the code.
- RD4 · Door photo when the code can't be used.

**Global (G)**
- G1 · Home live-order bar per stage (restaurant, shop, pharmacy, scheduled).
- G2 · Orders-tab live card copy per stage (match orders-v2).
- G3 · Push copy per stage change (all three phones).
- G4 · 320×640 + font scale 1.3: R1, T4, T9, T10, U2, D1, M4.

---

## Part 3: Files to attach to Claude Design

The bundle (`bash docs/designs/order-flow-v2/bundle.sh`) packs these under the same folder names:

1. **Send first:** `PROMPT.md` (this file) and `current/*.png` (today's renders, table in Part 2 §4).
2. `reference/after-send-v2/` — **the pattern to extend**: `README.md`, `BRIEF.md`, `PROMPT-v2.md`,
   `design/as-kit.jsx` (components + `A` copy), `design/as-screens.jsx`, `design/as-v2.jsx`,
   `design/sc2-kit.jsx`, `design/After Send v2 (standalone).html`.
3. `reference/calm-mint-v2/` — **the style**: `README.md`, `Calm Mint v2 - all screens.html`, its JS,
   `assets/` (service-icons v2 restaurants/shops/pharmacy, food photos, `lynia-icons.js`, fonts).
4. `reference/rider-v2/` — rider phone: `README.md`, `BRIEF.md`, `design/rv-kit.jsx`, `design/rv-job.jsx`,
   `design/Rider v2 (standalone).html`.
5. `reference/merchant-mobile/` — merchant phone: `README.md`, `Merchant Prototype (standalone).html`.
6. `reference/send-compose-v2/` — Review step + inline address card: `README.md`, `PROMPT.md`,
   `design/sc2-kit.jsx`, `design/Send Compose v2 (standalone).html`.
7. `reference/briefs/` — sibling briefs: `browse-v2/PROMPT.md` (before this flow), `orders-v2/PROMPT.md`
   (the Orders tab).
8. `tokens/*.css`.

---

## Part 4: After Claude Design returns (for us, not for Claude Design)

- Vendor the export under `packages/design/handoff/order-flow-v2/` (README, BRIEF, design/, PNGs) with a
  **new ledger entry in `docs/DESIGN-DEVIATIONS.md`** (next free number; the reverse-drift freeze needs
  it) naming the superseded `RC` order/checkout ids and the app-only food views, and a CLAUDE.md pointer
  like D-52…D-56.
- Implementation order: (1) customer order screen on the After Send v2 shell for restaurants (no backend
  change); (2) Review & place; (3) merchant + rider deltas; (4) substitution, photos, scheduled (backend);
  (5) shops/pharmacy APIs (with browse-v2); (6) Rx behind its flag.
- Fix on the way: rider no-show copy 10 → 8 min; drop wallet/mobile-money copy from customer views.
- Parity: retire/replace the `RC.*` order targets in `tools/parity/app-targets.mjs` +
  `codegen/adopted.mjs` as SUPERSEDED deferrals (pattern from D-55), add a `shoot-order-flow.mjs` sheet.
