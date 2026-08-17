# Customer Home 8c — handoff package

**Status: SELECTED (2026-08-17).** This folder is self-contained: hand the whole folder to Claude Code.

## Contents
- `home-8c.html` — the pixel reference. Open in a browser at 360px; this is the acceptance target.
- `assets/send.svg · food.svg · pharmacy.svg` — the flat sticker service icons (final, no ground shadow). Use these files verbatim; do not redraw. Canonical copies live in the design system at `assets/service-icons/`.
- `assets/food/*.jpg` — placeholder venue photos (replace with live data).
- `lynia-icons.js` — Lucide icon subset used by the reference (map-pin, chevron-down, search, bike, chevron-right, store, receipt, user).
- `CLAUDE-CODE-PROMPT.md` — the implementation work order with exact specs.

## Screen anatomy (top → bottom)
1. **Mint header** (`--accent-wash` #e9f8ef, square bottom edge, padding-bottom 24)
   - Status bar (system).
   - Greeting row: "Good {morning|afternoon|evening}, {firstName}" 25px/700, ink. Right: flat sun sticker 46px (moon after 18:00), then 42px white circle bell button with gold unread dot. **No avatar button.**
   - Address row (11px below greeting): 13px map-pin + **the user's current detected location** (reverse-geocoded street address), 12.5px/600 `--accent-text`, chevron-down. Tap → address/location sheet. This is a live GPS value, not a saved profile address; fall back to last known address with a "set location" prompt when permission is denied.
   - Search bar: white card, radius 12 (rounded corners, NOT a full pill), padding 10×15, 12.5px muted placeholder "Search food, or send a parcel". Deliberately quiet — must not outweigh greeting/tiles.
2. **Service tiles** (grid 3 equal cols, gap 8, padding 14 16 0) — Chowdeck-scale buttons, label INSIDE:
   - Tile: radius 16, padding 10 4 9, column layout, gap 6. NO shadow.
   - Backgrounds: Send `--accent-wash` · Restaurants #fdeadd · Pharmacy #dff4ee.
   - Icon stage: 44px tall, centered; behind each icon a 42px circle blob one shade deeper (#cdeeda / #fbd9bd / #c5e9df); icon widths 50 / 56 / 53 (food +4px top, pharmacy +3px).
   - Label: 12px/400 (regular, NOT bold), ink #14181b.
   - Pharmacy carries gold SOON chip (8.5px/800, #f2b705 on #3d3100 text) top-right until launch; tap opens the notify-me sheet — never dead.
3. **Live order tracker** (only when an order is running; margin 14 16 0): mint pill — `--accent-wash`, radius 999, padding 9 14 9 10. 36px `--accent` circle + white bike icon · "‹Rider first name L.› · on the way" 13px/700 ink · 7-segment progress (3px bars, on `--accent`, off #cdeeda) · right: gold ETA chip "‹N› min" 11.5px/800, #f2b705 bg, #3d3100 text. Tap anywhere → tracker screen.
4. **Popular near you**: section header 16px/700 + "See all →" 12.5px/700 `--accent-text`. 2-col grid, gap 10: photo cards radius 16, **1px `--line` border, no shadow**, 76px photo, white ETA pill (bordered, no shadow) bottom-right on photo, name 13px/700, gold star + rating, delivery fee right in `--accent-text` 700.
5. **Tab bar**: Home (store, active `--accent-text`) · Orders (receipt) · Account (user); 21px icons, 11.5px labels, top hairline.

## Hard rules
- **Zero box-shadows** anywhere on this screen — depth comes from tint and hairline borders.
- Gold (`--highlight`) appears ONLY on: unread dot, SOON chip, ETA chip, star ratings.
- Tokens from the DS (`tokens/colors.css`); type is Inter, tabular numerals on all numbers.
- Icons are the shipped SVG files — see the DS card "Service icons — flat sticker set".

## Provenance
Exploration: `explorations/home-redesign/Home Redesign R1.html` §8c (lineage 2a → 7a/7b → 8a → 8b → 8c). DS card: `ui_kits/mobile/home-8c.html`.
