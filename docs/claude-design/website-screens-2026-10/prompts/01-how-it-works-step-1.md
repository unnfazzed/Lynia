# 01 · How it works, card 1: "Set pickup and drop-off"

**Resources to attach:** `resources/send-compose/Send Compose v2 (standalone).html`, `resources/send-compose/sc2-kit.jsx`, `resources/current-site/step-1-phone.png`, `resources/current-site/step-1-hl.png`

**Replaces:** `step-1-phone` (500×605), `step-1-hl` (600 wide). Tile: coral. Headline unchanged.

---

```
Card 1. Redraw step-1-phone and step-1-hl from the attached Send Compose v2 design, step 1 "Where", with both addresses filled. Copy comes verbatim from the S object in sc2-kit.jsx.

Phone screen (360×720, top part shown in the 500×605 device crop):

Header:
- White, with a 1px #e2e6ea bottom border.
- Row 1 (52px): "‹ Back" (chevron + "Back", 15/600 #006630) on the left; "Send a parcel" centred, 16/700 ink.
- Row 2: a step bar with 4 equal columns, "Where · What · Price · Review". Each column is an 18px circle plus a 12px label, with a 3px bar 4px below.
  - "Where" is current: #006630 circle with a white "1", ink 700 label, #00b14f bar.
  - "What", "Price" and "Review" are upcoming: #f6f7f8 circle with a 1px #e2e6ea border, muted number and label, #e2e6ea bar.

Map:
- A light map (surface #f6f7f8 base) fills the rest of the screen. Harare streets: Avondale, Milton Park, Harare CBD, Samora Machel Ave.
- A green circle pin at the pickup, a red square pin at the drop-off, and a 5px #00b14f route between them.

Address card:
- Floats 12px in from each side and 8px under the header. White, radius 14, shadow 0 1px 4px rgba(20,24,27,.08), 0 2px 12px rgba(20,24,27,.06).
- Two rows with a 1px #e2e6ea divider.
- Row 1 (min 56px): 14px green circle; label "PICKUP · Your location" (12/600 uppercase muted, with "Your location" in #006630); value "Eastgate Mall, CBD" (15/600 ink); on the right, the text button "✎ Change" (13/600 #006630).
- Row 2: 14px red square; label "DROP-OFF"; value "Avondale Shops"; "✎ Change".
- No landmark lines.

CTA bar: pinned to the bottom, white with shadow 0 -2px 16px rgba(20,24,27,.08). A 52px full-width #00b14f pill reading "Next" (16/700 white). It may fall below the crop.

Remove: the old floating "LyniaGo" logo pill, the profile button, the "Use my location" chip, the "Search an address…" hint and the "What are you sending?" field. None of these are on step 1 any more.

Highlight (step-1-hl, 600 wide): just the two-row address card, flat on white, at about 1.6× scale.
```
