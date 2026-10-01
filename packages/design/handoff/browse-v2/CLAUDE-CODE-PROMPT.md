# Claude Code prompt · LyniaGo Browse v2 (Restaurants, Shops, Pharmacy)

Paste everything below the line into Claude Code at the repo root, after copying this folder to `packages/design/handoff/browse-v2/`.

---

You are implementing **Browse v2** in the LyniaGo customer app (Expo / React Native, Android first). The design is final. Your job is to build it pixel-faithfully. Don't redesign anything.

## 0. Read these first (in this folder)
1. `README.md`: screen list, navigation, global rules, component spec. **§4b (round 2 polish) overrides §4 wherever they differ.** The first bullet of §4b also overrides the category rail.
2. `BRIEF.md`: the product decisions, as short final statements.
3. `screens/*.png`: 2× renders of every state (720×1440; 640×1280 for the 320 variants). **These are the acceptance target.**
4. `Browse v2 - all screens.html`: the live reference. Open `?screen=<id>` to see one screen at 360px (e.g. `?screen=S5`). Inspect it in Chrome DevTools for exact px.
5. `browse-kit.js`: the source of the mock. It holds the CSS values, the sample data (`V` venues, `D` items) and every part. The bottom section ("round 2 polish") overrides the parts above it.
6. `code/copy.ts`: **every user-facing string**, generated from `B`. Ship it verbatim as `src/ui/browse/copy.ts`. Never hard-code a string in a component.
7. `code/tokens.ts`: Calm Mint v2 colours, radii and targets. Import from it; don't introduce new hex values.

Ignore `round1/` and `Browse v2 - round 1.html`. They're history only.

## 1. Scope
Build **one shared set of components** used by three routes. Restaurants is live; Shops and Pharmacy are new.

| Route | Screen ids | Notes |
|---|---|---|
| `app/food/index.tsx` | B1, B5–B12, B14 | restaurants list (replace the existing one) |
| `app/shops/index.tsx` | B2, B3a/b, B5–B13 | new; shop kinds via the Sort sheet dropdown |
| `app/pharmacy/index.tsx` | B4, B5–B13 | new; kind locked to `pharmacy`, OTC notice |
| `app/food/[id].tsx`, `app/shops/[id].tsx`, `app/pharmacy/[id].tsx` | S1–S13 | one `Storefront` component; the body differs by service |
| item sheet (modal) | I1a–d, I2 | shared |
| new-cart confirm (sheet) | I3 | shared; it replaces today's silent clear + toast |
| `app/search.tsx` (Home) + in-service search | X1–X4, S12 | scope comes from a route param |

Put shared UI in `src/ui/browse/` (move `src/ui/food/*` there). Cart and Checkout are **out of scope**: keep them working and don't restyle them.

## 2. Components to build (spec in README §4/§4b)
`ListHeader` (mint, circles, address control → the existing Deliver-to sheet, title + sticker, search field) · `CompactListBar` (shown on scroll) · `FilterBar` (Sort pill + Free delivery pill) · `SortSheet` (category dropdown + 5 radio rows; distance rows disabled without a location) · `ListHeading` ("6 places · 25–45 min") · `VenueCardFull` · `VenueRow` · `ClosedGroupHeader` · `VenueFallbackImage` · `OtcNotice` · `OfflineBanner` · `EmptyState` (icon, title, body, optional button) · `StorefrontHeader` (cover, floating back/search, logo, name, sub) · `OpenLine` / `OpenStateStrip` (closing / closed + Remind me switch) · `InfoStrip` · `StickyTabs` (scroll-spy) · `PopularRail` + `PopularCard` (restaurants only) · `DishRow` · `ItemTile` (shops grid) · `ItemRow` (pharmacy) · `AddButton` (32–36 disc, 44–48 hit area, shows the count once in the cart) · `Stepper` (− becomes a bin at 1) · `ItemSheet` · `NewCartSheet` · `JustClosedModal` · `CartBar` (forest; small-order hint + progress) · `Toast` · `SearchField` · `SearchGroupLabel` · `VenueHit` · `ItemHit` · `ParcelShortcutRow` · `Skeleton*`.

## 3. Behaviour (must match exactly)
- **Sort order:** open venues by the chosen sort, then a "Closed now" group (closed venues are never hidden). There's no Open-now filter.
- **Sort sheet:** choosing a row applies it and closes the sheet. A chosen category prefixes the Sort pill label and turns it mint/green. "Free delivery" is a toggle pill, shown only if at least one venue has `freeDelivery`.
- **First 2 results** use `VenueCardFull`; the rest use `VenueRow`. Pages load 20 at a time (B12a). End of list: B12b.
- **On scroll,** the mint header scrolls away. `CompactListBar` + `FilterBar` stick.
- **No location (B7):** hide km, fee and ETA everywhere. Show the mint "Where should we deliver?" card. Disable Nearest, Fastest and Lowest delivery fee in the sort sheet.
- **Storefront:** a single `SectionList`. `StickyTabs` scroll-spy (tapping a tab scrolls to its section). After scrolling past the name, the header collapses to a 56px bar with the venue name (S2).
- **+** adds 1 with no sheet. Tapping the row or tile body opens `ItemSheet`. When the cart holds an item from another venue, show `NewCartSheet` **before** adding. "Start new cart" clears the cart and adds the item; "Keep my cart" does nothing.
- **Closed venue:** no + anywhere. `ItemSheet` opens read-only with a disabled "Opens at 10:00" bar and the Remind me switch.
- **The venue closes while you browse** → `JustClosedModal` (S9). The cart is kept.
- **Out of stock today:** the photo goes grayscale at 50%, an "Out of stock today" chip shows, and there's no +. A category outside its time window gets a "Served 07:00–11:00" chip plus a note, and no +.
- **Cart bar:** shown whenever the cart belongs to this venue. Under a $4.00 subtotal, show "Add $X to skip the $1.00 small-order fee" with a progress line. It never blocks checkout.
- **Search:** debounce 300 ms, minimum 2 characters. Home scope groups RESTAURANTS · SHOPS · PHARMACY · DISHES & ITEMS. Show `ParcelShortcutRow` when the query matches `/parcel|document|send|deliver|keys|package/i`. In-venue search lists only that venue's items.
- **Errors:** no pull-to-refresh and no Refresh buttons. Only a failed *first* load shows "↻ Try again" (B11, S13b). A failed background refresh keeps the cached data and shows `OfflineBanner`. Action errors are an ink `Toast` for 4 s.
- **Service flag off** (`SHOPS_ENABLED` / `PHARMACY_ENABLED` false): a deep link opens the existing Calm Mint notify-me sheet over a dimmed header (B13). Dismissing it goes back to Home.

## 4. Hard rules
- Target 360×720. Everything must also work at 320×640 and at Android font scale 1.3 (`allowFontScaling` stays on). Use the `·320` and `·fs` renders to check.
- Hit targets ≥ 44, and 52 for the one primary CTA. The visible + disc is smaller, so use `hitSlop` or a 44–48 wrapper.
- `fontVariant: ['tabular-nums']` on every number. USD always has 2 decimals.
- **Zero shadows / elevation.** Separation comes from tint and hairlines only. The solid exceptions are the forest cart bar and the sheet dim.
- Green *text* is `C.greenText` only. `C.brand` is for fills only. Never red text on white.
- Honest data: no star for an unrated venue (show "New"), no "Free delivery" unless the venue funds it, no km/fee/ETA without a location.
- Fees are computed on the phone: `max(1.50, round_to_0.50(km × 0.80))`.
- Images: the cover is a 3:1 banner centre-cropped to 196px tall. Item photos are required (the merchant rule).
- Fonts: Inter 400/600/700 from `assets/fonts/`. Icons: the Lucide subset (`assets/lynia-icons.js` lists the names; use `lucide-react-native` with the same names).

## 5. Backend gaps (stub behind a feature check, then file issues)
Customer shop list + catalogue APIs with `kind` · `freeDelivery` per venue · Recommended ranking (fall back to nearest-open) · cross-service search (fall back to the restaurant search + client-side grouping) · a live prep signal for "Fastest" (hide the option until it exists) · category time windows + `outOfStock` in the catalogue payload. See README §7.

## 6. Landing it (per CLAUDE.md)
1. Copy this folder to `packages/design/handoff/browse-v2/`.
2. Add a `docs/DESIGN-DEVIATIONS.md` entry with the next free number (D-55 is Calm Mint v2; Orders v2 may take D-56). It should supersede `RC.list*`, `RC.search`, `RC.menu*` and `RC.closed_interrupt`, and mark the Shops/Pharmacy coming-soon sheets as flag-off only.
3. Add this line to CLAUDE.md: "Restaurants, Shops and Pharmacy browse follow their own handoff (`handoff/browse-v2/`)".
4. Update `tools/parity` targets and fixtures (`food_list`, `food_menu`, …). Add `shops_list`, `shops_store`, `pharmacy_list`, `pharmacy_store` and `browse_search`, using the sample data in `browse-kit.js` (`V`, `D`).
5. Implement in this order: tokens/copy → list (B1, B2, B4) → storefront (S1, S3, S4) → cart interactions (S5, S6, I1, I3) → states (B5–B14, S7–S13) → search (X1–X4).

## 7. Acceptance
For every id in README §1, a 360×720 screenshot of the app (2× density) matches `screens/<id>.png` within the parity tool's tolerance. The `·320` and `·fs` variants pass too. No string appears in the app that isn't in `copy.ts`.
