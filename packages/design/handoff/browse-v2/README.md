# LyniaGo · Browse v2 handoff (Oct 2026)
Restaurants, Shops and Pharmacy: venue list, storefront, item sheet, cart bar and search.

**Pixel reference:** `Browse v2 - all screens.html` (canvas). **One screen at a time:** `?screen=B1` (any id below, e.g. `S5·320`, `I1·fs`).
**Copy:** `browse-kit.js` → `B` is every user-facing string. Ship it verbatim as `copy.ts`. `{x}` is a runtime value.
Style source: Calm Mint v2 (`handoff/calm-mint-v2-2026-10`). There are no new tokens.

**Folder:** `CLAUDE-CODE-PROMPT.md` (start here) · `BRIEF.md` · `README.md` · `screens/` (58 PNGs at 2×) · `code/copy.ts`, `code/tokens.ts` · `Browse v2 - all screens.html` + `browse-kit.js` + `browse-screens.js` · `assets/` (fonts, service icons, Lucide subset, sample photos) · `PROMPT.md` (original brief) · `round1/` (history, ignore).

---
## 1. Screens and states
| Id | State | Verdict on old id |
|---|---|---|
| B1 (+full, ·320, ·fs) | Restaurants list: open venues, then "Closed now" | redesigns `RC.list` |
| B2 | Shops list: kind chips, no-photo fallback | new |
| B3a / B3b | A kind selected / a kind with no venues | new |
| B4 | Pharmacy list + OTC notice | new |
| B5a / B5b | Sort sheet / Sort sheet with no location | new (replaces the 4 pills) |
| B6 | Filters with no match + Clear filters | redesigns `RC.list_empty` (filters) |
| B7 | No location yet | new |
| B8 | First load: real header, skeleton body | redesigns `RC.list_loading` |
| B9a–c | Nothing delivers here (per service) | redesigns `RC.list_empty` (corridor) |
| B10a / B10b | Offline with a saved list / with nothing saved | redesigns `RC.list_error` (offline) |
| B11 | Couldn't load, ↻ Try again | redesigns `RC.list_error` |
| B12a / B12b | Loading more / end of list (collapsed header) | new |
| B13 | Service switched off (deep link) | keeps the Calm Mint notify-me sheet |
| B14 | Long names @ 320 × font 1.3 | new |
| S1 (+full, ·320, ·fs) | Restaurant open, top of page | redesigns `RC.menu` |
| S2 | Scrolled: name in the bar, tabs stuck, scroll-spy | new |
| S3 | Shop: 2-column item grid | new |
| S4 | Pharmacy: item rows + OTC | new |
| S5 / S5·320 / S5b | In the cart: steppers + cart bar (dish rows / grid) | redesigns the `RC.menu` cart bar |
| S6 | Under the $4.00 minimum | new |
| S7 | Closing soon | new |
| S8a / S8b | Closed, remind off / on | redesigns `RC.menu_closed` |
| S9 | Just closed while browsing | redesigns `RC.closed_interrupt` |
| S10 | Out of stock + category outside its time window | new |
| S11 | No cover, no logo, no rating | new |
| S12a / S12b | Search in the venue: results / none | new |
| S13a–c | Loading / couldn't load / no items yet | new |
| I1a–d (+·320, ·fs) | Item sheet: restaurant / shop / pharmacy / venue closed | redesigns the item sheet |
| I2 | Item sheet with the keyboard up on the note | new |
| I3 | "Start a new cart?" | replaces the silent clear + toast |
| X1 | Home search, empty: recent + popular | redesigns `RC.search` |
| X2a / X2·320 / X2b | Home results grouped / at 320 / parcel words | new |
| X3 | Search inside Restaurants: PLACES + DISHES | redesigns `RC.search` |
| X4a / X4b | No results / offline | new |
| — | `RC.cart`, `RC.cart_empty` | **keep** (out of scope) |

## 2. Navigation
- Home tile or rail "See all" → B list for that service. Rail card → S storefront. Home search field → X1.
- List card → S. List search field → X3, scoped to that service. Address control → the Calm Mint H5 Deliver-to sheet. Sort → B5. Chip → filters in place.
- Storefront search icon → S12. Tab → scrolls to that section. + → adds 1, no sheet. Row/tile body → I1.
- Adding from another venue → I3 first. "Start new cart" clears the cart and adds the item. "Keep my cart" closes the sheet and adds nothing.
- Cart bar → Cart (unchanged) → Checkout → order screen.
- Venue closes while you're on it → S9. "See open places" → the B list. "OK" stays on the storefront: + buttons are removed and the cart is kept.
- Service flag off → B13 sheet. Dismissing it goes back to Home.
- X2b "Send a parcel" → Send compose, with the query dropped.
- Back is always top-left, 44px. There's no tab bar on any of these pages.

## 3. Global rules
- Design at 360×720. Every state must work at 320×640, and the key states at font scale 1.3.
- Nothing hides under the cart bar: content gets 96px of bottom padding when the bar shows.
- No pull-to-refresh and no Refresh button. Lists refresh by themselves. Only a failed *first* load shows "↻ Try again". A failed background refresh keeps the data and shows the muted offline banner.
- Errors show once, as an ink toast (~4 s). No persistent red text, and never red text on white.
- Targets ≥ 44, and 52 for the single primary CTA. The + visible disc is 32px, but its target is a 44px square inside the photo.
- Every number uses tabular numerals. USD with 2 decimals. Green *text* is `#006630` only; `#00B14F` is fills only.
- Honest data: no km, time or fee without a location. No star for an unrated venue ("New"). "Free delivery" only when the venue funds it.
- Zero shadows. The only solid exceptions are the cart bar and the sheet dim.

## 4. Component spec (360 → 320)
**List header:** mint, bottom radius 28, padding-bottom 16, Calm Mint circles (yellow 150 at −62/−58; coral 26 at right 70/top 100 → 40/104; sky 14 at 32/124 → 18/126).
- Row 1: back 44 + address control (eyebrow 11/600 muted; address 15/700, ellipsis).
- Row 2: sticker 40 (radius 12, service tile fill, 32px icon) + title 24/700.
- Search 48, white, radius 12. Placeholder per service; the short version is used at 320.

**Collapsed list bar** (on scroll): white, 56 high, hairline bottom: back · title 17/700 · search 44. The Sort + Free delivery bar sticks under it.

**Filter chips:** row padding 8 16 0, gap 8, horizontal scroll. Target 44, visible 36, radius 999, 1px line, 13/600 ink.
- Selected: mint fill, 1px green-text border and text, check 14.
- "Free delivery" chip: purple text; selected uses #ECE8FF + #4B2FBF.
- Restaurants: All + the cuisines found in the results. Shops: All · Grocery · Butchery · Fashion · Auto parts · Hardware · Electronics · Other. Pharmacy: no chips.

**Sort row:** min 44. Summary 12.5 muted ("6 places · 25–45 min"), with an ellipsis that gives way first. "Sort: Recommended ▾" 13/600 green-text.

**Sort sheet:** radius 24, grab handle, title 20/700. 5 rows, each 56 high, with a 22px radio (selected = 7px brand ring). Distance-based rows are muted and say "Set your location to use this" when there's no location.

**Venue card, full:** image 2:1 (164 at 360, 144 at 320), radius 14.
- On the image: ETA pill white 11/700 bottom-right inset 6; Free tag top-left; "Closes in N min" highlight pill bottom-left.
- Name 16/700, one line. Sub 12.5 muted ("Zimbabwean · Grills · $$" or kind). Meta 12.5: ★ 12 · **4.7** (210) · 1.2 km · $1.50 delivery.

**Venue row, compact:** 96×80 thumb, radius 14, ETA pill 10.5. Text column: name 15/700 / "cuisine · km" / "★ rating (count) · fee". Hairline on top, min-height 96.

**Closed group:** heading "Closed now" 16/700, padding 20 0 4. The thumb is grayscale at 50% opacity. The sub-line reads "Opens 10:00" in ink 600. Text keeps full contrast.

**No-photo fallback:** kind tint + initial. Full card: 76px white disc, 34/700. Row: 28/700. Plus the kind chip (white, 10.5/700) for shops; none for pharmacy.

**Storefront header:**
- Status bar on white. Cover 140 (photo, centre crop of the 3:1 banner). Fallback: the service tint at 112 with the circles.
- Back and search are 44 white discs at inset 8/10.
- Logo 60 round with a 3px white ring, overlapping −30, left 16.
- Name 22/700 (balance-wrapped). Sub 13 muted.

**Info strip:** 4 equal cells, 1px line, radius 14, margin 12 16 0. Value 15/700, label 11.5 muted. Cells: ★ 4.7 / "210 ratings" · 25–35 / min · $1.50 (or purple "Free") / delivery · 1.2 km / away.

**Open-state strip** (min 40, radius 12, 13px):
- Open: mint, brand dot, "**Open until 22:00** · Ready in ~20 min".
- Closing: #FFF6D6, highlight-ink text, "Closes in 15 min · order by 17:45".
- Closed: surface "Closed · opens 10:00", then a 52px bordered row with bell · "Remind me when they open" · switch 44×26.

**Sticky tabs:** 48 high, 14/600 muted; active is ink 700 with a 3px brand underline. Hairline bottom. Scroll-spy.

**Section heading:** 18/700, padding 18 16 2. A time-window chip (surface, 12/600, "Served 07:00–11:00") and a 13px note under it.

**Dish row:** padding 14 16, hairline. Name 15/700, description 13 muted (2 lines max), price 14/700. Photo 96×96, radius 12, with the + disc inside it, bottom-right.

**Item tile (shops):** 2 columns, gap 16/12. Square photo radius 14, + inside it. Name 14/600 (2 lines), price 14/700. In the cart, the stepper spans the full tile width.

**Item row (pharmacy):** photo 64, radius 12. Name 15/600 (pack size is part of the name), price 14/700. + target 44 on the right.

**Stepper:** 44 high, 1px line, radius 999. − / count 15/700 / +. At quantity 1, − becomes a bin icon (removes the item).

**Item sheet:**
- Radius 24. Photo 16:9, radius 16, with a close 44 white disc.
- Name 20/700 + price 17/700, description 14 muted.
- Quantity row with stepper. Note label 13/600 + "(optional)". Field min 72, radius 12, focused border 1.5 brand, counter "n/200", rule "Notes can't change the price."
- CTA 52 "Add · $4.50" / "Add 2 · $9.00".
- With the keyboard up, the photo is dropped and the sheet sits above the keyboard with the CTA visible.

**New-cart sheet:** 56 icon disc (highlight wash) · title · body (15) · "You're adding …" (14 muted) · primary "Start new cart" · ghost "Keep my cart".

**Cart bar:**
- Forest, inset 12 at left, right and bottom, radius 18, min 64. 40 brand disc with the bag icon.
- Title 14/700 white "3 items · $12.50". Sub 12 #BFE6CD (the venue, or the small-order hint plus a 3px progress line, max 150).
- "View cart" highlight, 44 high, 13/700.

**OTC notice:** surface, radius 12, padding 12 14, circle-alert 18 green-text, "**Over-the-counter only.** No prescription medicine yet." It's text, not a gate.

**Offline banner:** surface, radius 12, wifi-off 16, 12.5 muted.

**Toast:** ink #14181B, radius 12, 13.5 white, 16 from the sides, above the cart bar.

**Search:** field 48 with a 1.5 brand border while focused, plus a clear X (44).
- Group labels 11.5/700 caps muted, with "See all n" on the right.
- Venue hit: 48 thumb · name 15/700 with the match in green-text · "25–35 min · fee · km".
- Dish/item hit: thumb · name · venue · price.
- Parcel row: mint, radius 16, send sticker 48.

**Skeletons:** #EEF1F3, radius 12. The header and back control are always real.

## 4b. Round 2 polish (supersedes the matching §4 values)
Same features. Layout, hierarchy and spacing tightened. Round 1 stays viewable in `Browse v2 - round 1.html`.
- **Categories moved into Sort (round 3).** The category rail is removed from the list. Cuisine (restaurants) / Shop type (shops) is a dropdown at the top of the Sort sheet. A chosen category prefixes the Sort pill ("Auto parts · Sort: Recommended", mint). Free delivery stays as its own pill. The rail spec below is kept for reference only.
- ~~Category rail~~ replaces the chip row on the list. 72px columns, 60px circles, label 12/600.
  - Restaurants: dish photos. Shops: kind tint + initial. "All" is the service sticker on the tile tint.
  - Selected: 2.5px brand ring offset 2, label green-text 700. 
- **Filter bar:** "Sort: Recommended ▾" pill and a "Free delivery" toggle pill. Surface fill, 36 visible / 44 target. Selected sort is mint/green-text. Selected Free is #ECE8FF/purple with a check.
- **List heading:** "6 places" 20/700 + "25–45 min" 13 muted on the right.
- **Full card:** image 16:9, radius 16.
  - Name 17/700 with a rating badge on the right (surface pill: ★ 13 · 4.7 · muted (210); unrated: mint "New").
  - Sub 13 muted. Meta: bike 14 · "$1.50 delivery" or purple **Free delivery** · km.
- **Compact row:** 104×104 thumb, radius 16, no hairlines (12px rhythm). Lines: name 16/700 · "★ 4.5 (96) · cuisine" · "bike $2.00 delivery · 2.4 km".
- **Closed group:** heading 20/700 + "Look now, order when they open." 13 muted.
- **Storefront:**
  - Cover 196 (fallback band 150). Logo 76 with a 4px ring.
  - Name 26/700. The open state is an inline line ("● **Open until 22:00** · Ready in ~20 min") above the info strip. Closing and closed keep their wash strips, under the strip.
  - Info strip: surface fill, no border, radius 16, value 16/700.
  - Tabs 15px. Section headings 20/700, padding 26 16 6.
- **Popular (restaurants):** a horizontal rail of 148px square cards (radius 16, + inside, name 14/600 on 2 lines, price 14/600 muted). In the cart, a full-width stepper sits under each card.
- **Dish row:** inset hairlines (margin 0 16). Photo 112, radius 14. Name 16/600, description 13.5, price 15/600. + disc 36 in a 48 target.
- **Shop tile:** price first (16/700), then name 13.5/400 on 2 lines. Radius 16, row gap 20.
- **Pharmacy row:** photo 72, radius 14, vertically centred. Name 15/600, price 15/700.

## 5. Per-service differences
| | Restaurants | Shops | Pharmacy |
|---|---|---|---|
| Sticker / tint | restaurants · #FFD9CC | shops · #DDD5FF | pharmacy · #C5E9DF |
| Chips | cuisines + Free delivery | kinds + Free delivery | none |
| Storefront body | dish rows | 2-column grid | item rows |
| Note label | Note for the kitchen | Note for the shop | Note for the pharmacy |
| Time word | Ready in ~20 min | Packed in ~10 min | Packed in ~10 min |
| Item noun (search) | DISHES | ITEMS | ITEMS |
| Extra | — | kind chip on the fallback | OTC notice on the list, storefront and item sheet |

## 6. Tokens (Calm Mint v2; no new ones)
| Token | Where it's used |
|---|---|
| ink #14181B | all text, toast fill |
| muted #5B6670 | meta, summary, labels, closed text |
| line #E2E6EA | chips, info strip, stepper, row hairlines |
| surface #F6F7F8 | OTC note, offline banner, closed strip, out-of-stock chip |
| brand #00B14F | + discs, count discs, tab underline, open dot, cart-bar disc, focused field |
| green-text #006630 | Sort control, selected chip, search match, links |
| cta #00812F | the primary button |
| mint #E9F8EF | list header, selected chip, open strip, no-location card, parcel row |
| forest #063B22 / #BFE6CD | cart bar |
| highlight #FFD23F / ink #3D3100 | "Closes in" pill, View cart, star fill; wash #FFF6D6 on the closing strip and new-cart icon |
| star-stroke #C99500 | star outline |
| free #4B2FBF | Free tag, Free chip, "Free" in the info strip |
| coral / sky | header circles only |
| tile-food / -shops / -pharmacy | header sticker, fallback cover band |
| kind tints | no-photo fallback, item photo placeholders |
| skeleton #EEF1F3 | loading |

## 7. NEEDS BACKEND
- A customer **shop list API** with `kind`, and a customer **shop catalogue read API** (the restaurant ones exclude shops today).
- A **free-delivery** flag per venue (merchant-funded).
- A **Recommended** ranking (today "popular" means nearest open).
- **Cross-service search:** venues + dishes + shop items, grouped by service, and a parcel-intent hint.
- **"Fastest" sort:** needs a live prep/queue signal beyond the baseline.
- `SHOPS_ENABLED` / `PHARMACY_ENABLED` flags, like `RESTAURANTS_ENABLED`.
- **Category time windows and "out of stock today"** in the customer catalogue payload.

## 8. Retires
- The four equal pills (Open now · Nearest · Under $2 fee · Top rated) and the "Open now" toggle.
- The "Show closed kitchens too" empty state.
- The drop-shadow cards and the hero card that was just the first result.
- The 92px cover with the name printed in it.
- Category chips that swapped the list, and the restated uppercase label.
- The + disc overlapping the thumbnail edge.
- The grey "is closed" box above bright + buttons.
- The silent cart clear + toast.
- The "FOOD · DELIVER TO" header.
- The Shops and Pharmacy coming-soon sheets, except when their flag is off.
