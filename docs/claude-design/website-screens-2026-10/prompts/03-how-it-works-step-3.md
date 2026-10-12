# 03 · How it works, card 3: "Track live, share the code at hand-off"

**Resources to attach:** `resources/order-screen/After Send v2 (standalone).html`, `resources/order-screen/as-kit.jsx`, `resources/current-site/step-3-phone.png`, `resources/current-site/step-3-hl.png`

**Replaces:** `step-3-phone` (500×537), `step-3-hl` (600 wide). Tile: lavender. Headline unchanged.

---

```
Card 3. Redraw step-3-phone and step-3-hl from the attached After Send v2 design, state 6 "Rider on the way" (shown as "Biker on the way"), with the v2 six-digit code card. Copy comes verbatim from the A object in as-kit.jsx, with every "rider" shown as "biker".

Phone screen (360×720, top part shown in the 500×537 device crop):

Layout: a full-bleed map, with the sheet at the matched peek (about 450 of 720).

Header:
- "‹ Back" on the left.
- "Biker on the way" (16/700) centred.
- A red-outlined "Help" pill on the right.

Map:
- Green pickup circle, red drop-off square, 5px green route.
- The biker marker: a 34px ink disc with a 3px white border and a white bike icon. Under it, an ink name pill "Tendai" (white 12/600).

Sheet (16px top radius, 28px grabber row). Contents in order:
1. "Arriving at pickup in 6 min" (bold).
2. A 4-step track: "Matched · Picked up · On the way · Delivered". Draw it exactly as state 6 in the source draws it (where the order is on the way to pickup).
3. Biker card:
   - "TM" initials avatar, "Tendai M.", a "Verified" tag.
   - "Bike · ABH 4721" (muted).
   - "Call" and "WhatsApp" ghost pill buttons.
4. Delivery code card (white, radius 12, 1px border):
   - "DELIVERY CODE" (12/600 uppercase muted).
   - "Give this code to the recipient. The biker enters it at hand-off." (13/18 ink).
   - "418 290": six digits grouped 3+3, 28/800, letter-spacing .04em, tabular, #006630.
   - A "Share code" pill on the same row, to the right.

Remove:
- "Order 8f3a91c2" and the "en route dropoff" chip
- "Re-issue delivery code"
- the old 4-digit "418 207"
- the old green-bordered code card with its italic-looking help line

Highlight (step-3-hl, 600 wide): just the delivery code card, flat on white, at about 1.6×.
```
