# Prompt: Redesign LyniaGo "after Send" (finding a rider → choosing → tracking → delivered)

You are designing the screens a customer sees **after tapping "Send to riders"** in the LyniaGo Android app (Expo/React Native). LyniaGo is a cash, name-your-price parcel marketplace in Harare. The customer's request is broadcast to nearby riders, who bid on it. The customer picks one, tracks them live, and the parcel is handed over with a delivery code. The customer pays the rider cash.

This follows the **Send a parcel v2** redesign (the 4-step Where · What · Price · Review flow, already shipped). The new screens must feel like the same app: the same header, tokens, CTA bar, pins and components. The v2 handoff kit is in `../send-compose-v2/design/sc2-kit.jsx`; reuse its parts (Header, CTA bar, Btn, Notice, Toast, MapPin, RouteStrip, Field).

## What's in this folder
- `current-mocks/LJ-*.png`: the **old** gallery designs for these states (finding, offers live, counter-offer, select race, no riders, window expired, rider cancelled, tracking with code, tracking, GPS paused, cancel, cancelled, undelivered, delivered + rate, rate undo, completed, numbers masked). **Reference only. This prompt replaces them.**
- `current-app/app-*.png`: what the app renders today for tracking.

## Decisions already made (do not reopen)

### 1. One screen: map on top, a sheet that changes with the stage
- The order lives on **one screen**: a map on top and a bottom sheet below whose content changes as the order moves. There are no separate pages per stage.
- The map shows the pickup (green dot) and drop-off (red square) with the route. Once a rider is matched, it also shows the **rider moving live**.
- The header is the Send flow's: "‹ Back" plus a title. Use a human title per stage, never "Order 8f3a91c2" or a raw status like "open for offers".
- The sheet has a peek height and can be dragged up. The primary action sits in the pinned CTA bar where there is one.

### 2. Stages the sheet must cover
1. **Finding riders**: "Finding riders near you…", a countdown for the offer window, the price, and a plain line like "3 riders have seen it".
2. **Offers arriving**: a list of offer cards, best match first.
3. **Matched / rider on the way to pickup.**
4. **Picked up / on the way to drop-off**, with the pickup photo the rider took.
5. **Arriving / hand-off**: the delivery code front and centre.
6. **Delivered**: rating, then the receipt.
7. **Completed**: a quiet end state with "Send again".

### 3. Choosing a rider
- The offer list is sorted with a **"Best match"** tag on the first card. The match weighs price, distance or ETA, and rating. **No sort chips.**
- Each card shows:
  - rider photo or initials, name, ★ rating and trip count;
  - "ETA 6 min" to pickup;
  - the price;
  - one compact **"Choose"** button. It must be smaller than today's full-width button per card, but still at least 44px tall.
- **Counter-offers are just offer cards.** A rider asking more than the customer's price shows their price plus the difference, e.g. "$4.00 · +$0.64 over your price". Choosing it accepts that price. There is no separate counter card and no Decline button.
- Draw the **select race**: the customer taps Choose, but that rider was just taken. Use a calm toast and keep the list.

### 4. While waiting
- **"+ $0.50" raises the price in place** and re-pings riders, without starting over. Show the new price and a short confirmation.
- **"Cancel request"** is always available while finding, with a one-line confirm.

### 5. No match / rider cancelled → one-tap retry
- The window closing with no pick, no riders online, or a rider cancelling all use **one calm screen**:
  - a one-line reason (e.g. "No rider took $3.00 this time." / "Your rider had to cancel.");
  - a **suggested higher price**;
  - **"Send again at $3.50"** (primary);
  - **"Edit order"** (secondary), which opens the Send flow's Review step with everything filled.
- "Notify me when a rider's online" may stay as a small link on the no-riders variant.

### 6. Tracking: the rider card shows everything
- Rider **photo, name, ★ rating**, **bike plate** and a **Verified** tag.
- **ETA** for the current leg: "Arriving at pickup in 6 min" or "Arriving at drop-off in 12 min".
- **Status steps**: Matched → Picked up → On the way → Delivered, with the current step highlighted.
- **Call** and **WhatsApp** buttons, each with a text label.
- "Follow route in Google Maps" stays as a secondary row.
- Also draw:
  - rider GPS paused ("Your rider's location hasn't updated — call them to check in.");
  - the SOS / Get help control on a live trip;
  - **Cancel** (before pickup: free; after pickup: a warning).

### 7. Delivery code
- From matching onward, the **4-digit delivery code** is prominent on the sheet, with copy like "Give this code to the recipient. The rider enters it at hand-off."
- **"Share code"** opens SMS/WhatsApp with a prefilled message.
- On the hand-off stage the code is the biggest thing on the sheet.

### 8. Delivered: rating
- **1–5 stars**, then optional quick tags ("On time", "Careful with parcel", "Friendly", "Good communication"; negative tags if 1–2 stars), a **Skip**, and an undo after submitting.
- The **receipt** sits below: route, items, agreed price, "Paid cash to rider", rider, times, and "Share receipt".
- Phone numbers are masked once the order ends ("Numbers are hidden now the trip's over").

### 9. Not delivered / cancelled
- **Not delivered**: the reason the rider recorded, "Call rider", and "Send again".
- **Cancelled**: who cancelled and why, plus "Send again".

### Fixed visual language (from v2)
- Tokens only:
  - Colours: `--accent #00b14f` (fills/CTAs only), `--accent-text #006630`, `--accent-wash #e9f8ef`, `--ink #14181b`, `--muted #5b6670`, `--line #e2e6ea`, `--bg #fff`, `--surface #f6f7f8`, `--danger #c0392b`.
  - Shapes and type: `--radius-input 12px`, `--radius-pill 999px`, `--text-label 12px`.
  - Fonts: Inter for UI, Fredoka for the wordmark only.
- Pins: pickup = green dot, drop-off = red square. **Rider = a distinct marker** (propose one; it was a gold pin before).
- **Tap targets at least 44px, 52px for the primary CTA.** Draw them at that size.
- **Every icon has a visible text label.** Low-literacy users, low-end Android, patchy data.
- **Cash only.** There is no card or wallet UI.
- **Copy ships verbatim.** Write final strings, short and plain.
- Frames: **360×720**, and check the key states at **320×640**.

## Data the app has (design within it)
| Thing | Available |
|---|---|
| Offer | rider name, rating, trip count, `etaMinutes` to pickup, offered price, whether it is above the customer's price |
| Order statuses | open_for_offers → assigned → confirmed → en_route_pickup → picked_up → en_route_dropoff → delivered → completed; plus expired, cancelled (by customer, rider or LyniaGo), undelivered (with a reason) |
| Live tracking | rider GPS position (can pause), pickup photo, delivery code, rider phone (masked after the trip) |
| Riders nearby | a count of riders online near the pickup while finding |

**Needs backend work (draw it anyway, the app team will add it):**
- raising the price in place on an open order;
- parcel rating tags (these exist for food only today);
- a live ETA per leg during tracking;
- the rider's photo, plate and verified flag on the customer side;
- WhatsApp deep links.

## Pain points with today's screens (fix these)
- The heading is a meaningless order id ("Order 8f3a91c2") and a raw status pill ("open for offers").
- Every offer card has a full-width green "Choose this rider" button, so 3 offers fill the whole screen.
- Four sort chips (Best match / Cheapest / Fastest / Top rated) add noise.
- Counter-offers live on a separate card with Decline, which is confusing.
- Tracking shows a phone number where the rider's name should be. The map is a small box with Expand / Recenter buttons. The delivery code hides behind a "Re-issue" button.
- Each failure has its own screen and wording, and "Raise price & send again" starts a brand-new order.
- The rating is stars only, and the receipt is a separate card further down.

## States to draw (360×720)
1. Finding: just sent, 0 offers, countdown, "+ $0.50", Cancel request
2. Finding: no riders online nearby (with "Notify me")
3. Offers: 3 offers, one above the customer's price, Best match tag
4. Offers: select race toast (the rider was just taken)
5. Price raised in place (confirmation)
6. Matched: rider on the way to pickup (card, ETA, steps, code, Call/WhatsApp)
7. Picked up: on the way to drop-off, with the pickup photo
8. Hand-off: arriving, the code dominant, "Share code"
9. Rider GPS paused
10. Cancel confirm (before pickup) and cancel warning (after pickup)
11. SOS / Get help on a live trip
12. No match / window closed: one-tap retry ("Send again at $3.50" / "Edit order")
13. Rider cancelled: the same retry screen with its own reason line
14. Delivered: stars, tags, Skip
15. Rated: undo toast, then the receipt
16. Completed: the receipt, numbers masked, "Send again"
17. Not delivered: the reason, Call rider, Send again
18. Cancelled (by the customer / rider / LyniaGo)
19. Offline / reconnecting banner on the tracking screen

Re-check states 3, 6, 8 and 14 at **320×640**.

## Deliverable
- Hi-fi screens for every state above, side by side and labelled, in a standalone HTML file.
- An `S` copy object with every string, as in v2's `sc2-kit.jsx`.
- A README covering components, tokens, interactions (sheet snaps, map behaviour, transitions between stages) and a short changelog versus the old LJ screens.
