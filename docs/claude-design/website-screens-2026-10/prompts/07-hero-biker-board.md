# 07 · Hero collage, pink phone: biker Jobs board

**Resources to attach:** `resources/biker-board/Rider v2 (standalone).html`, `resources/biker-board/rv-kit.jsx`, `resources/biker-board/rv-board.jsx`, `resources/tab-bar/Tab Bar Prototype (standalone).html`, `resources/tab-bar/README.md`, `resources/current-site/app-rider.png`

**Replaces:** `app-rider` (265×530 flat screen; the page draws the pink frame and 8° tilt). The alt text changes to **"Biker app: jobs nearby"** (see prompt 08). The file name `app-rider` stays.

---

```
Hero collage, phone 4 (pink frame). Redraw app-rider as the full 360×720 Rider v2 "1 · Jobs board", state J3 (parcels only, so there's no food line). Use the tab bar from Tab Bar v1. Export flat at 265×530 and at 2×, with no frame. Every visible "rider" reads "biker".

MintTop header:
- 104px tall including the 24px status bar. Background #e9f8ef, square bottom edge.
- Greeting: "Good morning, Tendai" (22/700 ink).
- Sub-row:
  - an 8px #00b14f dot with a 3px white ring, then "Online" (13/700 #006630)
  - then " · ", a map-pin icon and "Samora Machel Ave" (13/600 #006630)
- On the right: a 40px sun sticker, then a 44px white bell circle with an 8px unread dot.

Map (from the bottom of the header to the top of the sheet):
- Job pins: 20px #00b14f dots with a 3px white ring, each with a white fare pill under it (12/700 ink): "$2.50", "$4.00", "$3.10".
- The selected pin is 24px, with a #006630 ring and an ink fare pill with white text.
- One busy zone: a circle of about 54px radius with a soft green fill and a 1.5px dashed #00b14f stroke, with a "Busy now" pill (#006630 fill, white 11/700).
- A "You" marker.

Sheet (peek 50%, 16px top radius, 28px grabber):
- "4 parcels near you" (17/700) with "Nearest first" (12, muted) on the right.
- Demand line: map-pin icon + "Busier near Copacabana Rank · 2.1 km from you" (13/600 #006630).
- JobCards, with a 10px gap. Each is radius 12, 1px #e2e6ea border, padding 12. The first card is selected: 2px #006630 border.
- Card 1 (selected):
  - "PARCEL" tag (#e9f8ef fill, #006630 text, 11/700).
  - "0.8 km to pickup".
  - On the right, "$2.50" (20/700) with "asking" (11, muted) under it.
  - Stops: green dot "Avondale Shops", red square "Harare CBD".
  - Meta: "2.4 km trip · Small package".
  - A full-width 44px #00b14f pill: "Make an offer".
- Card 2: "PARCEL", "1.6 km to pickup", "$4.00 asking", "Avondale → Msasa" stops, "6.1 km trip · 4 items", "Make an offer".

Tab bar: Tab Bar v1's floating illustrated pill, with "Jobs · Money · Account" and Jobs active.

Remove:
- the solid-green "RIDING IN / Harare · CBD corridor ⌄" header
- the plain "Open orders" list without a map
- the "Avondale → CBD … asking $2.50" text-only rows
```
