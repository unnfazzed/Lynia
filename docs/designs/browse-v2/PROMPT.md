# LyniaGo Restaurants, Shops & Pharmacy browse: UX/UI redesign brief for Claude Design (v1, 2026-10-01)

> **How to use this:** paste **Part 1 (the prompt)** into Claude Design as your first message, then
> paste **Part 2 (the current-state reference)** right after it, or attach this whole file. Then
> attach the files in **Part 3**, in that order (the first group is the "send these first" set if
> you're uploading from a phone). Claude Design can't see the repo, so this file has to carry
> everything.
>
> This brief follows the sibling rounds that already landed: **Calm Mint v2** (Home, D-55),
> **Rider v2** (D-54), **After Send v2** (D-53), **Send a parcel v2** (D-52), and the **Orders v2**
> brief (`docs/designs/orders-v2/PROMPT.md`). Everything marked **"Proposed decision"** below is the
> brief author's call, made because the owner said "similar, except where you use your discretion".
> Change any of them before sending if you disagree.

---

## Part 1: The prompt (paste this first)

You are redesigning the **"view restaurants" and "view shops and pharmacies" pages on the customer
side of LyniaGo**, a delivery app in Zimbabwe (Harare first). One Android app (Expo / React Native)
serves customers and riders. The customer app has three tabs: **Home · Orders · Account**. Home
(Calm Mint v2, attached) has four service tiles: **Send · Restaurants · Shops · Pharmacy**, and two
rails: "Popular restaurants" and "Popular shops".

- **Restaurants** is live. A customer picks a kitchen, adds dishes to a cart, pays cash at the door
  (or from the LyniaGo wallet), and a rider is auto-dispatched near the end of prep time.
- **Shops** (grocery, butchery, fashion, auto parts, hardware, electronics, other) and **Pharmacy**
  are launching next. Shopkeepers are already signing up on the merchant app and loading their item
  catalogue. Customers order **exactly like restaurants**: same cart, same checkout, same rider, same
  order screen. Today the Shops and Pharmacy tiles open a "coming soon" sheet.

**Who the users are:** people in Harare on cheap Android phones, often on patchy 2G/3G data, often
outdoors in bright sun, with mixed literacy (the UI language is English). Many pay cash, and most
compare against "I'll just WhatsApp the shop and send a courier". The page has to answer, in this
order: **"who can deliver to me right now?"**, **"how long and how much?"**, and **"do they have
what I want?"**

**What I want from you:** one coherent, high-fidelity **browse family** for the three services,
with every state and the components it needs:

1. **The venue list** (what a Home tile or "See all" opens): Restaurants, Shops, Pharmacy.
2. **The storefront** (one restaurant's menu, one shop's or pharmacy's items).
3. **The item sheet** (add to cart: quantity, note, price).
4. **Search** (inside a service, and the Home search that spans all of them).
5. The **cart bar** and the **"you already have a cart from another place"** moment.

The three services should feel like **one template with three skins**, not three products. Today's
restaurant pages are an older design generation and look nothing like the new Home (see "What's wrong
today"). The new pages must look like the same app as **Calm Mint v2 Home**.

### Proposed decisions (treat as final unless the owner changes them)

1. **One template, three modes.** List → storefront → item sheet → cart is the same structure for
   all three services. The differences are deliberate and small:

   | | Restaurants | Shops | Pharmacy |
   |---|---|---|---|
   | Entry | Home tile "Restaurants", rail "See all" | Home tile "Shops", rail "See all" | Home tile "Pharmacy" |
   | Header sticker / tint | restaurants · `tile-food` | shops · `tile-shops` | pharmacy · `tile-pharmacy` |
   | List chips | cuisines (from the venues' tags) | **shop kinds**: Grocery · Butchery · Fashion · Auto parts · Hardware · Electronics · Other | none (kind is fixed) |
   | Card fallback (no photo) | food tint + initial | kind tint + initial + kind chip (Calm Mint v2 §2.5) | pharmacy tint + initial |
   | Storefront body | dish **rows** (photo right, description) | item **2-column grid** (photo-led, name, price, inline +) | item **rows** (name, pack size in the name, price) |
   | Note label | "Note for the kitchen" | "Note for the shop" | "Note for the pharmacy" |
   | Time word | "Ready in ~20 min" (prep) | "Packed in ~10 min" | "Packed in ~10 min" |
   | Extra notice | — | — | **"Over-the-counter only. No prescription medicine yet."** on the list and storefront |

   Pharmacy is the Shops template locked to kind = pharmacy, with its own title, tile colour and the
   OTC notice. It is not a chip inside Shops (it has its own Home tile, so it gets its own page).
2. **Mint header on every list, compact on the storefront.** The list opens with Calm Mint v2's mint
   header (bottom radius 28, decorative circles), carrying: back (44), the service title
   ("Restaurants" / "Shops" / "Pharmacy", 24/700) with the service sticker, the **same
   "DELIVERING TO" address control as Home** (opens the same Deliver-to sheet, H5), and the 48px
   white search field ("Search restaurants or dishes" / "Search shops or items" / "Search pharmacy
   items"). The storefront uses a cover photo with a compact sticky header that collapses to the
   venue name on scroll.
3. **Sort and filter, simplified.** Today's list has four equal pills (Open now · Nearest · Under $2
   fee · Top rated) that scroll off the screen at 360. Replace with: one row of **filter chips**
   (cuisines / kinds, plus **"Free delivery"** when any venue offers it) and a single **"Sort:
   Recommended ▾"** control (Recommended · Nearest · Fastest · Top rated · Lowest delivery fee).
   **Closed venues never vanish:** open venues first, then a "Closed now" group with "Opens 07:00"
   on each card. No "Open now" toggle.
4. **List cards = Calm Mint v2 rail cards, full width.** Same anatomy as the Home rail card (image
   radius 14, white ETA pill bottom-right, the purple "Free delivery" tag top-left, name 14/700,
   meta "★ 4.7 · 1.2 km · $1.50 delivery"), laid out as a **full-width card with a 16:9-ish image**
   for the first few results and a **compact row** (96px thumb left) after that, so a long list stays
   scannable. Closed cards are dimmed with "Closed · Opens 07:00"; "Closing in 15 min" uses the
   highlight wash. Your call on exact proportions, but the card must read as the Home card's sibling.
5. **The storefront answers "how long, how much, are they open" above the fold:** cover (16:9, or the
   tint + initial fallback), round logo, name, cuisine/kind, then an **info strip**: ★ rating (count)
   · delivery time range · delivery fee · distance. Below it, the open state (open / closing soon /
   closed + "Remind me when they open"). Then **sticky category tabs** that scroll-spy (the whole menu
   is one scroll; tapping a tab jumps to its section, today it swaps the list). A **search icon**
   searches inside this venue.
6. **Add without a sheet when there is nothing to choose.** A **+** on every row/tile adds one
   straight away and turns into a **− 1 +** stepper. Tapping the row/tile body opens the **item
   sheet** (big photo, description, quantity, note, "Add · $9.00"). There are no options, sizes or
   add-ons in v1 (merchant decision: no variants, barcodes or stock counts).
7. **One cart at a time, said up front.** Adding from a second venue opens a **confirm sheet**:
   "Start a new cart? Your cart from Gava's Kitchen (3 items, $14.50) will be cleared." with "Start
   new cart" / "Keep my cart". Today it clears silently and tells you afterwards in a toast.
8. **Cart bar:** pinned, forest-family (match Home's live-order bar language, not a generic green
   button): "3 items · $14.50" · "View cart". Under the **$4.00 minimum** it also says "Add $1.20 to
   skip the $1.00 small-order fee" (it never blocks checkout).
9. **One search, scoped by where you came from.** From a service page, search that service (PLACES +
   DISHES / ITEMS sections). From Home's search ("Search food, shops or parcels") show all services,
   grouped: Restaurants · Shops · Pharmacy · dishes/items, plus a **"Send a parcel"** shortcut row
   when the query looks like a parcel ("documents", "parcel", "send").
10. **A service that's off** (feature flag) keeps today's **coming-soon sheet** from Home (Calm Mint v2
    notify-me sheet: "Shops are coming soon … Notify me"). You don't need to redraw it, but draw what a
    deep link into an off service shows.

### Hard constraints. Don't break these.

- **Platform & frames:** Android phone. Design at **360×720**. Every state must also work at
  **320×640**, and the key states at **font scale 1.3**. Content scrolls; nothing hides under the
  pinned cart bar.
- **No tab bar on these pages** (they are pushed from Home). Back is always top-left, 44px.
- **No pull-to-refresh and no "Refresh" buttons.** Lists refresh themselves. A failed *first* load
  may show **"↻ Try again"**. A failed background refresh never raises an error card; the page keeps
  what it has, with Calm Mint's muted offline banner ("You're offline · showing places from 09:24").
- **Errors are spoken once and go:** an ink toast for ~4 s. No persistent red lines.
- **Tap targets:** ≥ **44px** (`--target-min`) for everything, **52px** (`--target-primary`) for the
  one primary CTA. Draw them at that size (the + on an item must be a 44px target even if the visible
  disc is smaller). Every icon carries a visible label or an obvious meaning.
- **Money:** USD, tabular numerals on every number. **Never red text on white.** Green *text* is
  `green-text #006630`, never `brand #00B14F` (fills only).
- **Honest data only.** Never show a number the app can't know: no distance, ETA or fee without the
  customer's location (draw that state), no star for an unrated venue (no "New ★ 0"), no "Free
  delivery" unless the venue funds it. Draw the "no location yet" variant.
- **Every live item has a photo** (merchant rule: an item without a photo can't go live). Venues may
  have no cover or logo; draw the tint + initial fallback.
- **Pharmacy is OTC only.** No prescription upload, no "Rx" items, no medical claims. The notice is
  copy, not a gate.
- **Vocabulary (use it exactly):** *Restaurant* / *kitchen* (food), *shop*, *pharmacy*; *dish* (food)
  vs *item* (shops, pharmacy); *Order*, *Rider*, *Delivery fee*, *Small-order fee*. Say **LyniaGo**,
  not Lynia. Help goes to **WhatsApp**.
- **Tokens: use Calm Mint v2's set** (Part 2 §6). Zero shadows: separation from tint plus hairlines;
  the only solid exceptions are the forest bar and the dim behind sheets. If you genuinely need a new
  token, name it, give its value and justify it.
- **Visual language: Calm Mint v2 is the reference.** Reuse its parts (mint header, address control,
  search field, rail card, kind tints, "Free delivery" tag, highlight ETA chip, star, skeletons
  `#EEF1F3` radius 12, Deliver-to sheet, notify-me sheet, forest bar). Don't invent parallel
  components.

### What's wrong today (fix these, and find more)

- **It's a different, older app.** Home opens with a mint header, stickers, a highlight ETA chip and
  zero shadows; the restaurant list opens with a bare "FOOD · DELIVER TO" line on white, drop-shadow
  cards and a generic grey search circle.
- **The filter row is cut off** at 360 ("Top r…") and the four pills mix filters and sorts as equals.
  "Open now" hides closed kitchens entirely; "Nearest" and "Under $2 fee" silently disable without a
  location.
- **The list card wraps badly:** "4.5 (96) 2.4 km 29–39 min" breaks across three lines in the compact
  row (see `01-list.png`). The fee sits on its own green line.
- **The hero card is just the first result,** with a 130px tinted initial when there's no photo. It
  reads as an empty image, not as a featured venue.
- **The menu has no "how long / how much" at all.** No rating, ETA, fee or distance on the
  storefront; only the name, "$$" and cuisine tags.
- **Category chips swap the list** instead of scrolling a single menu, and the restated section
  heading ("MAINS") duplicates the chip.
- **The + button overflows the dish thumbnail** and is clipped at the screen edge
  (`04-menu.png`).
- **The cover is 92px tall** with the venue name printed inside it *and* repeated below.
- **Closed is a grey box above the menu**; the dishes still show bright + buttons that open a sheet
  which then says you can't order.
- **Switching venues clears your cart silently** and tells you afterwards in a toast.
- **No Shops or Pharmacy pages exist at all** (the tiles open a coming-soon sheet).
- **Search** only knows restaurants and dishes; Home's "Search food, shops or parcels" lands on it.

### Deliverables (same package shape as Calm Mint v2, After Send v2 and Rider v2)

1. `BRIEF.md`: the product decisions you made, as short final statements, plus open questions.
2. `README.md`: screen + state list, navigation rules (what each tap opens), the global constraints
   above, a component spec (list header, filter chips, sort sheet, venue card full + compact,
   closed group, storefront header + info strip, sticky tabs, dish row, item tile, item row, item
   sheet, stepper, cart bar, new-cart confirm, OTC notice, search results) with exact sizes at 360
   and 320, a per-service table of the differences, and a token table saying where each token is
   used. Include **NEEDS BACKEND** and **Retires** sections, like Calm Mint v2's.
3. A standalone HTML prototype (canvas or player) showing **every state at 360×720**, key states at
   **320×640** and at **font scale 1.3**, with a single-screen view per id (`?screen=B1`).
4. A kit file holding the shared parts **and one object with every user-facing string** (call it
   `B`). Copy ships verbatim, so write final copy, not lorem. Use real Harare-flavoured sample data
   (Part 2 §7).
5. 2× PNG renders of every state.

Cover **every state in Part 2 §8**, plus anything new you introduce. For each existing screen id
(Part 2 §5), say whether you're **keeping, redesigning, merging or retiring** it.

---

## Part 2: Current-state reference (paste after the prompt)

### 1. Product rules already decided (owner-approved)

1. **Restaurants are live; Shops and Pharmacy are next.** Shops already sign up in the merchant app
   with a **kind** (pharmacy, grocery, butchery, fashion, auto parts, hardware, electronics, other),
   chosen once. Shops "receive customer orders exactly like restaurants: ringing, accept, pack, hand
   over" (merchant mobile handoff, D-48).
2. **Catalogue v1:** categories → items, each with name, optional description, price (USD), a
   **required photo**, and "out of stock for today". **No sizes, variants, add-ons, barcodes or stock
   counts.** Categories can have a time window ("Breakfast 07:00–11:00") and can be hidden.
3. **Pharmacies sell over-the-counter products only** (no prescription items without MCAZ/PCZ
   sign-off). Merchant side shows "Over-the-counter products only for now".
4. **Opening hours** are weekly windows per venue. Open / closing soon / closed / "opens at" are
   derived live on the phone. A venue can also be closed by hand until a time. A kitchen in **busy
   mode** adds ~10 min to prep.
5. **Remind me when they open:** a per-venue toggle on a closed storefront ("We'll tell you when Gava's
   Kitchen open."). If the venue just opened: "They are open now — pull to refresh the menu."
6. **Just closed while browsing:** a modal "Gava's Kitchen just closed · They stopped taking orders.
   Your cart is saved — nothing was ordered." with "See open places" / dismiss.
7. **One cart at a time**, saved on the phone. Adding from another venue starts a new cart.
8. **Pricing (config):** delivery fee **$0.80/km, rounded to the nearest $0.50, minimum $1.50**.
   Subtotal under **$4.00** adds a **$1.00 small-order fee** (never blocks checkout). Item notes up to
   200 characters ("No chilli, please"). Notes can never change the price.
9. **Payment** at checkout: cash at the door, or the LyniaGo wallet. Restaurants **auto-accept**
   (D-50); an order not confirmed within 1 hour auto-cancels with no charge.
10. **The venue's phone** is shown to customers with a live order (not while browsing).
11. **Not drawn ⇒ not rendered.** Whatever you don't draw, the app won't ship; whatever you draw, it
    must. So draw only what you mean.

### 2. Data each venue has (what the design can show)

**Venue (list card + storefront header):** `name`, `coverPhotoUrl` (3:1 banner, may be null),
`logoUrl` (round, may be null), `cuisineTags` (up to 3, restaurants), `priceLevel` 1–3 ($–$$$, may be
null), weekly `hours`, `location` (lat/lng, so the phone computes distance and fee),
`ratingAvg` + `ratingCount` (null/0 until rated), `prepBaselineMinutes` (null → default 20).
ETA on the card = prep + a delivery-leg estimate from the distance.
**Shops add:** `shopKind`.

**Item:** `name`, `description` (nullable), `priceUsd`, `photoUrl`, `outOfStock` (today), grouped
under ordered categories.

**Search today:** server search returns **PLACES** (venues) + **DISHES** (dish name, price, photo,
venue name, deep-links to that venue's menu). Blank or too-short queries return nothing.

**NEEDS BACKEND (list these in your README; design them anyway, the backend will follow):**
- A customer **shop list** API with `kind`, and a customer **shop catalogue** read API (the
  restaurant ones exclude shops today).
- **Free delivery** flag per venue (merchant-funded).
- **Popular / Recommended ranking** (today "popular" = nearest open).
- Cross-service search (venues + dishes + shop items).
- "Fastest" sort needs a live prep/queue signal beyond the baseline.

### 3. Where these pages sit in the customer journey

```
HOME (Calm Mint v2: mint header · Send | Restaurants | Shops | Pharmacy tiles · two rails · live bar)
  ├─ Restaurants tile / "Popular restaurants · See all" ──► B · RESTAURANTS LIST
  ├─ Shops tile / "Popular shops · See all" ──────────────► B · SHOPS LIST     (today: coming-soon sheet)
  ├─ Pharmacy tile ───────────────────────────────────────► B · PHARMACY LIST  (today: coming-soon sheet)
  ├─ rail card ───────────────────────────────────────────► S · STOREFRONT (that venue)
  └─ search field ────────────────────────────────────────► X · SEARCH (all services)
LIST ──► card ──► STOREFRONT ──► item ──► ITEM SHEET ──► cart bar ──► CART ──► CHECKOUT ──► order screen
                                                                     (cart/checkout: not in scope,
                                                                      keep them working; Part 2 §5)
```

### 4. What the restaurant pages look like today

See `current/01…07.png` (attached; `07-home.png` is the new Calm Mint v2 Home for comparison).

**List (`app/food/index.tsx`, `01-list.png`):** white page. Header row: back chevron, eyebrow
"FOOD · DELIVER TO" 12/700 muted, address "12 Lanark Rd, Belgravia" 15/700 + chevron-down (opens the
Home Deliver-to sheet), a 44px grey search disc on the right. A horizontally scrolling row of four
outlined pills (Open now · Nearest · Under $2 fee · Top rated; selected = accent border on accent
wash). A summary line "5 places deliver to Belgravia · 25–49 min" 12.5 muted. Then cards with drop
shadows: the **first** is a hero card (130px image band, white ETA pill), the rest are compact cards
(96px thumb left, name 15/700 + "Closed"/"Closing in N min" pill, cuisine tags 12.5 muted,
"★ 4.7 (210) · 1.2 km · 25–35 min", "$1.50 delivery" 12.5/700 green-text on its own line). Closed
cards are 72% opacity. Pages load 20 at a time as you scroll.
Empty with filters: "Nothing matches those filters · Clear filters". Empty with Open now:
"No kitchens are open right now · Show closed kitchens too". Empty corridor: "No restaurants deliver
here yet · We're onboarding kitchens in your area — check back soon." Kill switch: "Restaurants isn't
available yet · Check back soon." Loading (`02-list-loading.png`): full-screen skeleton. Offline with
a saved copy: "Showing what we had at 09:24." + ghost "Retry".

**Search (`app/food/search.tsx`, `03-search.png`):** back, field "Search restaurants or cuisine",
"PLACES" label + restaurant rows, "DISHES" rows (dish · restaurant · price). No match: "No matches ·
Nothing found for "…"."

**Menu (`app/food/[id].tsx`, `04-menu.png`, `05-menu-closed.png`):** 92px cover band (photo, or mint
tint with the venue name printed in it), floating 40px white back and search discs with shadows, a
52px round logo overlapping the bottom-left. Name 18/700 + "$$", cuisine tags. Closed: a grey card
"Gava's Kitchen is closed. You can look, but you can't order yet." + outlined "Remind me when they
open". Category pills (swap the visible list), a restated uppercase category label, then dish rows:
name 15/700, description, price, a ~68px thumb on the right with a 44px white + disc overlapping
it. Out of stock rows are disabled. Cart bar when the cart is from this venue: "3 items · $14.50 ·
View cart". Tapping a dish opens the item sheet: photo, name, description, quantity stepper,
"NOTE FOR THE KITCHEN" (placeholder "No chilli, please"), "Add · $9.00".

**Cart (`06-cart.png`):** shown for context only; it is not part of this redesign.

### 5. Existing screen ids (say keep / redesign / merge / retire for each)

Gallery `RC` (restaurants customer, `packages/design/explorations/restaurants/r-customer-a.jsx`):
`RC.list`, `RC.list_loading`, `RC.list_error`, `RC.list_empty`, `RC.search`, `RC.menu`,
`RC.menu_closed`, `RC.closed_interrupt`, `RC.cart`, `RC.cart_empty` (cart: keep, out of scope),
plus the Home coming-soon sheets for Shops / Pharmacy (Calm Mint v2, D-55).

### 6. Design tokens: Calm Mint v2 (use only these)

| Token | Value | Use |
|---|---|---|
| ink | `#14181B` | all body text |
| muted | `#5B6670` | secondary text, meta lines |
| line | `#E2E6EA` | 1px hairlines, dividers, field borders |
| surface | `#F6F7F8` | sunken areas, notes |
| brand | `#00B14F` | **fills only**: progress, icon discs, + discs. Never text |
| green-text | `#006630` | links, "See all", selected chip text |
| cta / pressed | `#00812F` / `#006B27` | the primary button fill, white text |
| mint | `#E9F8EF` | header, chips |
| forest | `#063B22` | live-order bar → cart bar family (sub-text `#BFE6CD`) |
| highlight / highlight-ink | `#FFD23F` / `#3D3100` | ETA chip, star fill, "closing soon" wash |
| star-stroke | `#C99500` | star outline |
| free | `#4B2FBF` + white | "Free delivery" tag |
| coral / sky | `#FF6B4A` / `#3EC1F3` | decorative header circles only |
| tile-food / -shops / -pharmacy | `#FFD9CC` / `#DDD5FF` / `#C5E9DF` | service header tint, sticker discs |
| kind tints | Pharmacy `#DFF4EE` · Grocery `#E9F8EF` · Butchery `#FFE7E0` · Fashion `#FFE4F2` · Auto parts `#E3F6FE` · Hardware / Electronics / Other `#F6F7F8` | no-photo fallback |
| danger / danger-wash / danger-ink | `#C0392B` / `#FAEDEB` / `#8F2418` | problems (never red text on white) |
| skeleton | `#EEF1F3` | loading blocks, radius 12 |
| Type | Inter 400/600/700; Fredoka 600 wordmark only | tabular numerals on every number |
| Space | gutter 16, grid 8 | |
| Radius | fields 12 · cards & images 14–16 · tiles 16 · header bottom 28 · sheet 24 · pills 999 | |
| Depth | **zero shadows** | tint + hairlines |
| Targets | `--target-min` 44 · `--target-primary` 52 | |

### 7. Sample data (use it, so the mocks look like Harare)

- **Restaurants:** Gava's Kitchen (Zimbabwean · Grills, ★4.7 (210), 1.2 km, $1.50), Sadza Republic
  (Zimbabwean, ★4.6), Mbuya's Kitchen (Traditional, ★4.8), Golden Bao (Chinese, ★4.9, free delivery),
  Chicken Slice (Chicken · Fast food, unrated), Pizza Inn (Pizza, ★4.8 (44), closed, opens 10:00).
  Dishes: Sadza & beef stew $4.50, Roast chicken (half) $6.00, Rice & chicken $5.00, Mazoe orange
  2L $3.20, Chips (large) $2.00.
- **Shops:** Avondale Fresh (Grocery), Mbare Auto Spares (Auto parts), Borrowdale Butchery,
  Sam Levy's Boutique (Fashion), Kensington Hardware, a shop with no photos (initial fallback).
  Items: Brake pads (front) $24.00, Oil filter $6.50, Bread (Lobels 700g) $1.10, Eggs (tray of 30)
  $5.50, T-bone steak (1 kg) $9.80.
- **Pharmacy:** Avondale Pharmacy, Belgravia Pharmacy (closing in 15 min), Eastgate Pharmacy (closed).
  Categories: Pain & fever · Cold & flu · Baby · Vitamins · First aid · Personal care. Items:
  Paracetamol 500mg (20 tabs) $1.50, ORS sachets (x5) $2.00, Plasters (20) $1.80, Vitamin C 1000mg
  (10) $3.40.
- **Customer:** Rudo, delivering to 12 Lanark Rd, Belgravia.

### 8. States to cover (every one at 360×720; key ones at 320×640 and font scale 1.3)

**List (B)**
- B1 · Restaurants list, populated (open venues, then a "Closed now" group).
- B2 · Shops list, populated, with kind chips (All selected) and the no-photo fallback card.
- B3 · Shops list with a kind chip selected (e.g. Auto parts) — and that kind with no venues.
- B4 · Pharmacy list with the OTC notice.
- B5 · Sort sheet open (Recommended · Nearest · Fastest · Top rated · Lowest delivery fee).
- B6 · Filters with no match, and how to clear them.
- B7 · No location yet (no distance/fee/ETA; distance sorts unavailable; prompt to set location).
- B8 · First load (skeleton with the real header).
- B9 · Nothing delivers here yet (per service).
- B10 · Offline with a saved list (muted banner, "as of 09:24"), and offline with nothing saved.
- B11 · Couldn't load (no saved copy) with "↻ Try again".
- B12 · Loading more at the bottom; end of list.
- B13 · Service switched off (deep link into an off service).
- B14 · Long venue names, font scale 1.3, 320px.

**Storefront (S)**
- S1 · Restaurant open, top of page (cover, logo, info strip, sticky tabs, dish rows).
- S2 · Restaurant scrolled (collapsed header with the name, tabs stuck, scroll-spy).
- S3 · Shop storefront with the 2-column item grid.
- S4 · Pharmacy storefront with item rows and the OTC notice.
- S5 · Items in the cart (steppers on rows/tiles, cart bar).
- S6 · Cart under the $4.00 minimum (small-order-fee hint on the bar).
- S7 · Closing soon.
- S8 · Closed (+ "Remind me when they open", off and on); how dishes look when you can't order.
- S9 · Just closed while browsing (the modal).
- S10 · Out-of-stock items; a category outside its time window ("Breakfast · 07:00–11:00").
- S11 · No cover/logo (fallback); no rating yet.
- S12 · Search inside the venue (results, no results).
- S13 · Loading, couldn't load, empty catalogue ("No items yet").

**Item & cart (I)**
- I1 · Item sheet (restaurant: "Note for the kitchen"), and shop/pharmacy variants.
- I2 · Item sheet with the keyboard up on the note.
- I3 · "Start a new cart?" confirm (adding from a second venue).

**Search (X)**
- X1 · Home search, empty (recent searches; or suggestions per service).
- X2 · Home search results grouped across services (+ the "Send a parcel" shortcut row).
- X3 · Search inside one service (PLACES + DISHES / ITEMS).
- X4 · No results; offline search.

---

## Part 3: Files to attach to Claude Design

**Send these first** (if uploading from a phone):

1. `docs/designs/browse-v2/current/*.png`: today's screens at 360×720 (2×):
   `01-list`, `02-list-loading`, `03-search`, `04-menu`, `05-menu-closed`, `06-cart`, and
   `07-home` (the new Calm Mint v2 Home, the style to match).
2. **The style reference, Calm Mint v2:** `packages/design/handoff/calm-mint-v2-2026-10/`
   (`README.md`, `Calm Mint v2 - all screens.html`, `calm-mint-v2.js`, `mint2.js`, `shared.js`,
   `assets/` — especially `assets/service-icons/v2/{restaurants,shops,pharmacy}.svg`,
   `assets/food/*.jpg`, `assets/lynia-icons.js`, `assets/fonts/`).

**Then:**

3. `packages/design/handoff/merchant-mobile/README.md` (+ `Merchant Prototype (standalone).html`):
   how shops build their catalogue (E1 Items), the kinds, the "Not live yet" rules.
4. `docs/designs/merchant-web-upgrade.md`: the shop decisions (OTC-only pharmacies, photos required,
   no variants v1, "Shops next").
5. `packages/design/handoff/after-send-v2/README.md`: the order screen a placed order opens (for
   vocabulary and the stage names; don't redesign it).
6. `docs/designs/orders-v2/PROMPT.md`: the sibling Orders brief (Shops orders appear there as a third
   service, styled like food).
7. `packages/design/explorations/restaurants/r-customer-a.jsx` and `r-parts.jsx` (`RC.list`,
   `RC.menu`, `RC.search`, `RC.menu_closed`, `RC.closed_interrupt`; `RestRow`, `MenuRow`): the
   current mocks, for content and IA, **not** for style.

---

## Part 4: After Claude Design returns (for us, not for Claude Design)

Per `CLAUDE.md`, a redesign lands like the Send, After Send, Rider and Calm Mint rounds did:

- Export to `packages/design/handoff/browse-v2/` (README, BRIEF, this PROMPT, design/, screens/).
- Add a **`docs/DESIGN-DEVIATIONS.md`** entry with the next free number (D-55 is Calm Mint v2; Orders
  v2 is expected to take D-56) marking `RC.list*`, `RC.search`, `RC.menu*` and
  `RC.closed_interrupt` as superseded and the Shops/Pharmacy coming-soon sheets as flag-off only.
  The design-freeze CI job requires it.
- Add a CLAUDE.md line: "Restaurants, Shops and Pharmacy browse follow their own handoff
  (`handoff/browse-v2/`)".
- Align `app/food/index.tsx`, `app/food/[id].tsx`, `app/food/search.tsx`, `src/ui/food/*`; add the
  Shops and Pharmacy routes on the same components; move strings to a `copy.ts` (the handoff's `B`,
  verbatim); update `tools/parity` targets and fixtures (`food_list`, `food_menu`, … already exist).
- **Backend this design needs:** customer shop list + catalogue APIs with `kind`, the free-delivery
  flag, a ranking for "Recommended", cross-service search, and the `RESTAURANTS_ENABLED`-style flag
  for Shops / Pharmacy.
