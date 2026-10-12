# 02 · How it works, card 2: "Name your price, pick a biker"

**Resources to attach:** `resources/order-screen/After Send v2 (standalone).html`, `resources/order-screen/as-kit.jsx`, `resources/current-site/step-2-phone.png`, `resources/current-site/step-2-hl.png`

**Replaces:** `step-2-phone` (500×537), `step-2-hl` (600 wide). Tile: sky. **Headline changes to "Name your price, pick a biker"** (it currently says "rider"; it is also listed in prompt 08).

---

```
Card 2. Redraw step-2-phone and step-2-hl from the attached After Send v2 design, state 3 "Offers" (title "Choose a rider", shown as "Choose a biker"). Copy comes verbatim from the A object in as-kit.jsx, with every "rider" shown as "biker".

Phone screen (360×720, top part shown in the 500×537 device crop):

Layout: a full-bleed map on top, with the bottom sheet pulled up to the offers peek (about 540 of 720).

Header (24 status + 52 bar):
- "‹ Back" (15/600 #006630) on the left.
- "Choose a biker" (16/700) centred.
- On the right, a "Help" pill: 1.5px #c0392b border, life-buoy icon + "Help" 13/700 #c0392b.

Map: green pickup circle, red drop-off square, 5px green route.

Sheet:
- 16px top radius, a 28px grabber row with a 36×4 #e2e6ea bar, content padding 0 16.
- Price row: "YOUR PRICE" (12/600 uppercase muted), "$3.36" (bold, tabular), "Cash to your biker" (muted), and a "+ $0.50" pill button on the right.
- A countdown pill.
- "3 offers" (bold).
- Offer cards: white, radius 12, 1px #e2e6ea border, padding 12. In order:
  1. A "Best match" tag. "FR" initials avatar, "Farai R.", a "New" tag, "3 trips · ETA 5 min". On the right, "$3.36" with "Your price" under it, and a 44px #00b14f pill "Choose" (white text).
  2. "TM" Tendai M., "★ 4.8 · 132 trips · ETA 6 min", "$3.00", "Choose".
  3. "KN" Kudzai N., "★ 4.9 · 88 trips · ETA 9 min", "$4.00", "Choose". Under it, a strip: "+$0.64 over your price. Choose to accept $4.00."

Remove: "Order 8f3a91c2", the "open for offers" chip, "3 riders bidding", "0:58" as a bare number, the "★ RECOMMENDED" label and the "Choose this rider" button. The app says "Best match" and "Choose".

Highlight (step-2-hl, 600 wide): the Farai R. "Best match" offer card, flat on white, at about 1.6×.
```
