# Phase 4 — Customer food BROWSE cluster alignment

Pixel-parity (structure-first) alignment of the customer **food browse** cluster against the
`window.RC` mocks in `packages/design/explorations/restaurants/r-customer-a.jsx` (+ the DS `AppHome`
in `packages/design/_ds_bundle.js`, which `RC.home` renders). The gallery/mock wins over any code
comment.

- **Side-by-side:** `tools/parity/out/phase4_browse.png`
  (`cd tools/parity && node pair.mjs --keys "RC.home,RC.orders,RC.list,RC.search,RC.menu" --out out/phase4_browse`
  → all five print `mock ok · app ok`).
- **Result:** `pnpm --filter @lynia/mobile typecheck` clean; `pnpm --filter @lynia/mobile test`
  **907/907** pass.

Layout/structure only — no logic/state/handler/effect was changed. The one test asserting the old
Orders live-card copy was updated to the new structure (coverage kept, not dropped).

---

## RC.home → `apps/mobile/app/(tabs)/home.tsx`

The food-customer home **is** the shared customer home; it was already assembled from the DS-mirrored
primitives (`BrandHeader` → `ServiceTiles` → `LiveOrderCard` per running job → "Restaurants near you"
rail), matching `RC.home`/`AppHome`. Only one geometry nudge was needed.

| # | Mock rule (`AppHome` / DS `RestaurantCard`) | File:line change that satisfies it |
|---|---|---|
| 1 | Rail card photo band is **84px** (`RC_HOME_VENUES h:84` / DS `RestaurantCard` fallback `height:84`), inner text padding **7 / 10 / 9** | `apps/mobile/src/ui/home/RestaurantCard.tsx` — `PHOTO_HEIGHT` `88 → 84` (L8); card body `padding:10 → {paddingTop:7, paddingHorizontal:10, paddingBottom:9}` (L80) |

Already-correct structure (unchanged): green `BrandHeader` with address + bell + user + floating
search "Search food, or send a parcel"; 62px round-square service tiles (Send · Food · Pharmacy·Soon);
`LiveOrderCard` (with stepper strip) per live job; rail title "Restaurants near you" 16/700 + "See all →"
12.5/700 accent.

**Honest deviation (not faked):** the rail card's second line reads **"Open now" / "Closed"**, where
the mock draws a rating · delivery-fee meta line and an ETA badge over the photo. The Lane C1 customer
read API carries no rating/ETA/fee, so the honest degraded card stands in — showing invented numbers
would be worse (this is the same gap `RestaurantCard.tsx`'s own header comment already documents).

---

## RC.orders → `apps/mobile/app/(tabs)/orders.tsx`

The mock draws the pinned live order as a **compact accent card**, distinct from the home tab's stepper
`LiveOrderCard`. The app was reusing the stepper card here; it now renders the compact card the mock
draws.

| # | Mock rule (`RC.orders`, r-customer-a.jsx:44-71) | File:line change that satisfies it |
|---|---|---|
| 1 | Screen title **"Your orders" is 19px/700, mb 10** (inline, not the 24px shared `Heading`) | Replaced `<Heading>Your orders</Heading>` with an inline `<Text>` at `fontSize:19, fontWeight:"700", marginBottom:10` |
| 2 | Live order = **compact `Card accent`** (padding 12): 36px round accent-wash avatar (`utensils`/`package` keyed on `orderType`, accent-text icon) + headline (13.5/700) + status line (12/600 **accent-green**) + fare (`Money` 14). **No progress strip** | New `ActiveOrderCard` component; the active-order branch now renders `<ActiveOrderCard o={activeOrder} onPress={…/order/[id]}/>` instead of the stepper `<LiveOrderCard step steps …>`. Imports dropped: `Heading`, `LiveOrderCard`, `LIVE_ORDER_STEP_COUNT`, `liveOrderStepIndex`, `liveOrderCardCopy`; added `Card`, `Money`, `type OrderSnapshot`. `statusPillLabel` kept. |
| 3 | EARLIER rows: 34px surface avatar (`utensils`/`package`, 16, muted) + name 13.5/600 + date·outcome 12/muted + fare 13/600 muted, 1px bottom line | Already matched (`OrderRow`, unchanged). |

Preserved: focus-gated `["activeCustomerOrder"]` poll, `useActiveOrderCheckGate` failed-check banner
(UX20-01 / UX-2026-08-05), `useHistoryFeed` five-state paint, the empty/error states (`RC.orders_empty`),
and the `/order/[id]` navigation.

**Honest deviations (not faked):**
- The generic `OrderSnapshot` carries **no merchant name**, so a food job reads as "Restaurant order"
  and a parcel as its `pickup → dropoff` route (mirroring the EARLIER `OrderRow` anatomy). The mock's
  "Sadza Republic" headline needs a wire field the snapshot doesn't expose.
- The status line is `statusPillLabel(status)` only — the mock's trailing **"· 6 min"** ETA is not in
  the wire contract, so it is omitted rather than invented.
- The parity fixture's active order is a **parcel** (`food_orders.mjs`), so the app card shows a
  package/route while the mock shows a food card — a fixture-state difference, not a structural one.

---

## RC.list → `apps/mobile/app/food/index.tsx`

Header (rotated-chevron back + "FOOD · DELIVER TO / address" + 44px round surface search) and the
photo-led `RestaurantRow` list already matched `RC.list`. No code change was required; the remaining
gaps are honest-data deviations, not structural misses.

| Mock element | App reality | Why (honest, not faked) |
|---|---|---|
| Filter chip row: **Open now · Nearest · Under $2 fee · Top rated** | single **Open now** toggle | Nearest/fee/rating need distance/fee/rating data the C1 API doesn't carry; rendering dead chips would fake sortability. |
| Count line **"5 places deliver to Belgravia · 25–45 min"** | omitted | The area corridor and ETA range are un-backed; a partial "N places" line drops the two facts the mock's line is about. |
| **Hero** 16:9 photo card for the top row | uniform 96px thumb rows | The hero is photo-led; with no `coverPhotoUrl` (gray stub) and no rating/ETA, a 130px gray hero would read worse than a uniform honest row. |
| chevron-down beside the address | omitted | The app address is static ("Harare"); a chevron-down would signal a picker that doesn't exist. |

`RestaurantRow` itself matches the mock `RestRow` (96px thumb, name + closed pill, cuisine·price,
`Open now`/`Closing in N min` in place of the un-backed rating/distance/fee meta).

---

## RC.search → `apps/mobile/app/food/search.tsx`

The accent-bordered search field, the **PLACES** section header (12.5/700 muted), and the
`RestaurantRow` results already matched `RC.search`. No code change required.

**Honest deviation (not faked):** the mock's second **DISHES** section is not rendered — dish-level
search needs a cross-restaurant menu index the C1 customer read API doesn't expose (the screen's own
file-level comment already flags it as a future Lane-C increment). The app searches restaurant name +
cuisine client-side over the already-fetched list (real, autofocus field) rather than faking a dish
index.

---

## RC.menu → `apps/mobile/app/food/[id].tsx`

The mock opens the menu on a **full-bleed cover band** with a floating back button and a round shop
logo overhanging its bottom-left corner. The app was opening on a plain back-only `AppBar` + a 64px
square thumb row — a structural miss. Rebuilt to the mock's header.

| # | Mock rule (`RC.menu`, r-customer-a.jsx:181-223) | File:line change that satisfies it |
|---|---|---|
| 1 | **Cover band** (`CoverPhoto height:92`), full-bleed to the screen edges | New header block: a `height:92` band that breaks out of `Screen`'s 16px padding via `marginTop:-space.screen, marginHorizontal:-space.screen`. `coverPhotoUrl` → `<Image>`; null → tinted `accentWash` band with the shop name (28/700 accent-text, DS `CoverPhoto` fallback). |
| 2 | **Back button floating on the cover** — 40px round white tile, shadow, rotated chevron, top-left | `<Pressable>` `position:absolute, left:12, top:10, 40×40, radius 20, bg, shadow.card`; rotated `chevron-right`. Replaces the removed `AppBar` on the main render (AppBar kept for the error branch). |
| 3 | **Round shop logo overhanging** the cover's bottom-left (`ShopLogo size:52`, 3px bg ring, shadow, `bottom:-22`) | `position:absolute, left:14, bottom:-22, 52×52, radius 26, 3px bg border, shadow.card`; `logoUrl` → `<Image>`; null → accent fill + white monogram. |
| 4 | Header content **padding 26px top** so it clears the overhanging logo | name block `marginTop:26` (was the thumb-row's `marginBottom:10`). |
| 5 | Name row: **name 18/700 + price-level `$$` 13/700 muted**, baseline-aligned, gap 8 | name row `flexDirection:"row", alignItems:"baseline", gap:8`; price = `"$".repeat(restaurant.priceLevel)` when present. |
| 6 | Category chips, `CATEGORY` section label, `MenuRow` list (68px thumb + 44px add badge), cart footer bar | Already matched (`MenuRow`, category tabs, `View cart` footer) — unchanged. |

Preserved: `useRestaurantMenu`, cart context/add-to-cart, open/closed derivation + `RemindWhenOpen`
(`RC.menu_closed`, out of scope), the `justClosed` interrupt (`RC.closed_interrupt`), `ItemSheet`
(`RC.item`), and the cart-bar footer.

**Honest deviations (not faked):**
- The mock draws a **search button** on the cover's top-right. The app menu has no in-menu search, so
  the button is omitted rather than added as a dead control. Candidate for `docs/DESIGN-DEVIATIONS.md`
  if in-menu search is wanted.
- The mock's **meta line** (★4.7 (210) · 1.2 km · 25–35 min · $1.50 delivery) is omitted — rating,
  distance, ETA and delivery fee are not in the C1 customer read API (same gap as the browse list).
- The mock's one-sentence **tagline** ("Home-style sadza…") has no wire field; the app keeps the
  honest `cuisineTags` line in that slot.
- In the harness the cover renders as a tinted band and the logo as a monogram (`coverPhotoUrl`/
  `logoUrl` are null in the fixture, and photos are gray stubs per the honest-stub rule) — both load
  real images on device.
