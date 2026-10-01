# Handoff: LyniaGo Merchant — mobile redesign

## Overview
A redesign of the LyniaGo **merchant** web app (restaurants and shops), moving it from a 1024px tablet layout to a **mobile-first app**, 360px Android-first. It will later be wrapped as a native app. It is visually aligned with the latest **customer app (home "8c")** and shares the delivery grammar of the customer and rider apps: offer cards, the 7-step stepper, the gold ETA pill and delivery codes.

The original screens (29 PNGs, 1024px tablet, captured 2026-09-29) are listed in `reference/ORIGINAL-SCREENS.md` with their routes. This README maps every original route to its new screen and lists every decision made in review.

## About the design files
The HTML files here are **design references**: prototypes that show the intended look and behaviour, **not production code**. Recreate them in the target codebase using its own patterns. The customer and rider apps are Expo / React Native, so use the same stack and the existing Lynia design-system components (`Button`, `Card`, `Field`, `StatusPill`, `Stepper`, `AppBar`, `TabBar`, `Icon`, `EmptyState`, `OfflineBanner`). Add new shared components where noted below.

- `Merchant Prototype (standalone).html` — **clickable prototype**. Opens offline. It has a side panel with a Restaurant/Shop switch, "Simulate new order", a jump list of every screen and a "why it changed" note per screen. On a narrow viewport it fills the screen as a phone.
- `Merchant Screens Canvas (standalone).html` — all 28 screens plus the 2026-10 branch frames (rows F and G) on one pannable canvas, grouped by flow, each with its change note.
- `reference/proto.js` — prototype wiring: every tap target, navigation parent, confirm sheet and timer. **Read this for the exact behaviour.**
- `reference/Stepper.reference.txt` — the existing design-system stepper. Merchant tracking uses its `RESTAURANT_STEPS` grammar.
- `reference/tokens/*.css` — the design tokens used by everything.

## Fidelity
**High fidelity.** Final colours, type, spacing, radii, copy and interactions. Maps are **placeholders** (striped boxes): use Google Maps Platform as the customer app does. Dish and item thumbnails are **initial tiles** by design (decision D-22); photos replace them when uploaded.

---

## Global changes from the original

| # | Original | New |
|---|---|---|
| 1 | Brand "LyniaGo" / "for Business" | **"LyniaGo Merchant"**: wordmark plus a mint "Merchant" pill on sign-in |
| 2 | 1024px tablet, left icon rail, 5 nav items | **360px phone, bottom tab bar, 4 tabs** |
| 3 | Different nav for restaurant and shop | **Same 4-tab bar.** Restaurant: Orders · Menu · Money · Account. Shop: Orders · **Items** · Money · Account |
| 4 | Shops could only book riders | **Shops receive customer orders** exactly like restaurants: ringing, accept, pack, hand over. "Book a rider" remains for phone and WhatsApp orders |
| 5 | "Connected" pill always visible | Shown **only when lost**: red `OfflineBanner` "No connection, retrying…" |
| 6 | "Sign in & start the alarm", "Play the alarm to test it" | **Removed.** Order alerts are always on. There is no alarm setting anywhere. (The native app still needs the sound and wake-lock plumbing.) |
| 7 | Map-drag pins plus a landmark field (sign-up, booking) | **No pins, no landmarks.** Sign-up: "Use my current location" (GPS reverse-geocode) plus "Search street or area". Booking: address search only |
| 8 | CASH / WALLET tags, split cash vs mobile-money totals | **No payment-type tags anywhere.** One total per order, one sales figure |
| 9 | Long subtitles and explainer paragraphs on every page | Cut to titles plus one short line at most. List rows show name only, or name and price |
| 10 | "Your rider" | **"Preferred rider"**, and the list is "Preferred riders" |
| 11 | Sign out, test alarm and setup banners on content pages | Sign out lives only in **Account**, behind a confirm |
| 12 | Full-width red Remove / Cancel buttons | Destructive actions sit **inside rows or sheets**, always behind a **confirm sheet** |
| 13 | No merchant-side delivery tracking | **Live tracking** (map, gold ETA, stepper), same grammar as the customer app, plus a merchant-only step **"Cash back to you"** |
| 14 | — | **Cash back:** the rider collects at the door (restaurants **and** shops) and returns the cash. The merchant closes the order with **"I got $X"**, or **"No cash on this one · mark completed"**, or at any time with **"Mark ride completed"** (override) |
| 15 | — | **Overdue cash** is shown, not chased: a gold "Cash overdue" figure on both Orders homes, and a row at the top of Money |

### Route map: original → new
| Original route / screen | New screen(s) |
|---|---|
| `/login` phone | A1 Sign in |
| `/login` code | A2 Code (no alarm copy) |
| `/join` | A5 Join a team |
| `/onboarding` step 1 | A3 What do you sell? |
| `/onboarding` step 2 (map pin, landmark, contact phone, privacy tick) | A4 Your business (GPS or search; the contact phone is the sign-in number; privacy accepted once on A1) |
| `/setup` checklist (restaurant and shop) | **Removed as a page.** The live shop is the default; missing items can surface later as a small nudge (not designed) |
| `/queue` ringing takeover | B2 (restaurant), D6 (shop) |
| `/queue` board | B1 Orders home (segments New / Cooking / Ready), B3 Cooking ticket, B4 Handover |
| `/queue` empty | B5 Closed/offline. The empty open state is not designed: use `EmptyState` "No orders yet" |
| — (new) | B6 Tracking, B7 Delivered + cash back |
| `/menu` (restaurant) | C1 Menu. `/menu/categories` becomes category chips (long-press to reorder) |
| `/menu` empty | not redrawn: `EmptyState` with the four starter-category chips |
| Out-of-stock action | C2 sheet ("Rest of today" default) |
| `/statement` | C3 Money (Today / This week) |
| `/shop`, `/hours`, `/team`, `/riders` | Moved under **C4 Account**: Shop front · Opening hours (C5) · Preferred riders (E4) · Team (E2, E3) · Help |
| `/deliveries` (shop) | D1 Shop Orders home: customer orders plus a "Riders you booked" section |
| `/deliveries/new` | D2 Where (search), D3 What + fare |
| Booking: finding | D4 Offers |
| Booking: coming | D5 Tracking |
| Booking: delivered | D7 Delivered + cash back |
| `/menu` (shop items) | E1 Items |
| Shop profile "How riders pay you" | **Removed**, since rider cash-back is now the single rule |

---

## Screens
Common frame: 360 × 720 (320px must also work, so 16px screen edges). A 30px status bar. Root screens have a **mint header** (`--accent-wash` #E9F8EF, 16px padding, bottom 16px) and a **tab bar**. Pushed screens use an `AppBar` (back chevron plus a 16px/700 title).

### A · Get in
- **A1 Sign in.** LyniaGo mark (34px) with the Fredoka wordmark "Lynia**Go**" (Go in `--accent`) and a "Merchant" pill (mint, `--accent-text`, 11.5px/700). H1 "Sign in" 24/700. A phone field with a fixed **+263** prefix, a divider and the number. Primary "Send code" pinned at the bottom, with the hint "By continuing you accept the privacy notice" (link).
- **A2 Code.** Back. "Enter the code" and "Sent on WhatsApp to +263 …". Six boxes of 52px, radius 12, active box with a 2px `--accent` border. "Resend in 0:42" · "Wrong number?". Primary "Sign in" (auto-submits on the 6th digit).
- **A3 What do you sell?** "Step 1 of 2" plus a 2-segment progress bar. Two radio cards, min-height 84px, radius 14; selected: 2px `--accent` border on `--accent-wash`. Restaurant uses `food.svg` on a #FDEADD tile; Shop uses `biz-small-business.svg` on a #DFF4EE tile (56px tiles). Link "Joining a team instead?". Primary "Next".
- **A4 Your business.** Step 2 of 2. Fields: Business name and Your name. **Location:** a result card (2px accent border, mint) showing a map-pin icon, "5th Street, Mbare", "From your phone's location" and a "Change" link. Below it, a ghost "Use my current location" button and an "Or search street or area" field. Primary "Create my business".
- **A5 Join.** Back. A 64px mint tile with the illustration. "Join Siyaso Spares" / "Farai added you as **Staff**." A name field. Primary "Join Siyaso Spares", then links "Not me" · "Start my own business".

### B · Restaurant orders
- **B1 Orders home.** Mint header: business name 22/700 with "● Open until 22:00" (12.5/600, `--accent-text`) and an **open/closed switch** (44×26) on the right. Three stat tiles (white, radius 14): Orders `7` · Sales `$59.50` · **Cash overdue `$9.50`** (gold: `--highlight-wash` bg, `--highlight-border` outline, `--highlight-ink` text; tapping opens Money). Body:
  - Segmented control **New 1 · Cooking 2 · Ready 1**.
  - New-order card (2px accent border): "#A333" with the total on the right, an items line, and a primary sm "View & accept".
  - Section "Waiting for rider": #A444 row.
  - Section "Out for delivery": #A111 row with a gold "8 min" pill, which opens B6.
- **B2 New order ringing** (full-screen takeover, `--cta-fill` bg). A white header strip with a speaker icon, "NEW ORDER" and "#A111", and a big **1:14** countdown on the right. A white sheet below (radius 20 top) holds:
  - Item lines (qty 15/700 · name · price), with the customer's note in a gold wash box indented under its line.
  - "Order total $12.00" (24/700) and an "Edit items" link (tapping a line strikes it; the customer approves).
  - "READY IN (MIN)" chips 10/15/20/30/45 (15 selected, ink fill).
  - Primary "Accept · ready in 15 min", which updates with the chip.
  - Red link "Can't take it" (confirm sheet).

  Back is blocked here: the alarm must be answered.
- **B3 Cooking ticket.** AppBar "#A222" with the total. A mint card with a conic **prep ring** (52px, `--accent` on #CDEEDA) showing "9:20", "Rider secured, start cooking" and "Blessing M. · ~8 min". An items card. A mini-timeline (Accepted, Rider secured, Rider at your counter). Primary "Food is ready", then red link "Can't finish this order" (confirm).
- **B4 Handover.** A rider row (avatar, name, plate, rating, 44px call button). "Rider's pickup code": four boxes, then "✓ Code matches". An "Order total $10.00" card. Primary "Hand over", which opens B6.
- **B5 Closed + offline.** A grey header with a switch that is off, "● Closed · opens 08:00". A red offline bar (`--danger`, wifi-off icon). Centre: power icon, "You're closed", primary "Open now", link "Open in busy mode (+10 min)".
- **B6 Tracking.** Full-bleed map (170px) with a round back button. A sheet (radius 20, −20px overlap) holds "#A111 on the way" with a gold ETA pill, "2 items · $12.00 · to Avondale", a rider row, and the **stepper**: Order placed · You accepted · Rider secured · Rider at your counter · Picked up · On the way · Delivered · **Cash back to you**. Done steps show a filled accent circle with ✓ and the time; the current step has an accent ring and "live". Link "Mark ride completed" (confirm). When Delivered completes, it goes to B7.
- **B7 Delivered + cash back.** A mint hero: check icon, "Delivered 12:31", "Buyer confirmed with the code". A **cash card** (2px `--highlight` border) with "CASH BACK TO YOU", "Blessing M. is bringing **$12.00**", "Due by 13:00 · 22 min left", a primary sm "I got $12.00", and a ghost "No cash on this one · mark completed" (confirm). A summary row "7 of 8 steps done", which opens the full timeline.

### C · Menu, money, account
- **C1 Menu.** Mint header "Menu" with a search. Category chips (selected = ink fill; "+ Category" in mint). Rows are 64px: a 44px initial tile, name/price, and a **stock switch**. An off dish is greyed, with "Off until tomorrow" in `--highlight-ink`. Tapping the row edits it (editor not drawn). Primary "+ Add a dish".
- **C2 Out-of-stock sheet.** Scrim, then a sheet "Mazondo is off. For how long?" with radio options **Rest of today** (default, "Back on automatically at 08:00") and "Until I turn it back on". Primary "Turn off", link "Keep it on"; tapping the scrim cancels.
- **C3 Money.** Header segmented Today / This week, "Sales · 7 orders" and **$59.50** (34/700). Body: a gold overdue row "$9.50 overdue · #A098 · Tino · due 11:40", then an Orders list (#id · time / status, total on the right).
- **C4 Account.** An avatar (initials) with the business name and "Farai · Owner". Rows: Shop front · Opening hours · **Branches** (owner only; muted count when 2+; opens C7) · Preferred riders · Team (gold "1" badge) · Help, then a red "Sign out" (confirm). The same screen serves both modes (name, initials and the second tab change). Staff should not see Money or Team (not drawn).
- **C5 Hours.** Segmented "Same every day | Per day". Open/Close time fields (18/600). Days-open chips M–S (multi-select). A "Busy mode (+10 min)" switch card. Primary "Save hours".

### F · Branches (2026-10, brief "branch switcher and Add branch")
Each branch is its own business (location, hours, menu, team, orders, cash). The owner works in one branch at a time; switching moves the whole app. Server: PR #999.

- **B1 / D1 header, 2+ branches.** A 20px `chevron-down` after the 22/700 name; name + chevron is one tap target, 44px tall (`--target-min`; drawn with −8px/−6px margins so the header height is unchanged). It opens C6. **One branch: header exactly as today, no chevron.** B5 (closed) carries the same chevron.
- **C6 Branches** (bottom sheet, radius 20 top, `--shadow-sheet`, scrim tap closes). Title "Your branches" (18/700). Rows 64px min: name 14.5/600 and location 13 muted, each one line with ellipsis. Current branch first with an accent `check` (20px); a grey `pl` **"Not live yet"** (11.5/700) on branches LyniaGo hasn't switched on (they still open). Ghost button "+ Add a branch" (44px) at the foot, owner only.
  - Tap another branch → sheet closes on that branch's Orders home (B1 / D1, or the not-live state) with toast **"Now at {branch name}"**. Tap the current branch → just closes.
  - Many (up to 20): the list scrolls inside the sheet; the sheet tops out 8px below the status bar (top 38px); title and "Add a branch" stay fixed.
  - Offline: the red offline bar sits under the title, full-bleed; rows and "Add a branch" disabled (45% opacity).
- **C7 Add a branch** (pushed, AppBar "Add a branch"). Top to bottom: **Branch name** (empty, hint "How customers will see it, like Mama’s Kitchen · Avondale"); **Location**, A4's block unchanged (result card + ghost "Use my current location" + "Or search street or area"; result-card meta "From your phone’s location" or **"From search"**); **Copy my menu** / **Copy my items** row with `Switch`, on by default, meta "12 dishes in 3 categories" / "40 items in 5 categories" (live counts); muted 13 line "Your logo, photos, opening hours and cash rule come too. You can change them in the new branch."; primary **"Create branch"** (52px) pinned at the bottom. No phone field (contact = owner's sign-in number).
  - Disabled (`--line` fill, `--muted` text) until there's a name and a location.
  - Saving: spinner + "Creating branch…" in the primary; form at 50% and back locked.
  - Success: switch to the new branch, land on its Orders home in the not-live state, toast **"{branch name} is ready"**.
- **B1 / D1 not live yet.** Header: name + chevron, grey "Not live yet" pill in place of the open line; **no open switch, no stat tiles**. Body (centred): 72px surface circle with `store`, "Almost ready" (18/700), "LyniaGo will call you to switch this branch on. Customers can’t see it until then." (13), ghost "Check your menu" (shop: "Check your items", opens C1 / E1), link "Set opening hours" (C5). Tab bar as normal.

**C7 error copy (final — the API copy changes to match):**
| When | Shown | Copy |
|---|---|---|
| Name used by another of their branches | Inline under the name (replaces the hint; field border `--danger`) | You already have a branch with that name. Add the area, like “Mama’s Kitchen · Avondale”. |
| Location outside the covered area | Inline under the result card (card border `--danger`, `--danger-wash` fill) | That address is outside the area LyniaGo covers for now. *(reworded from "That pin…")* |
| 20 branches already | Banner at the top of the form (`--danger-wash`, link "Open WhatsApp"); primary disabled | You can have up to 20 branches. Message LyniaGo on WhatsApp for more. |
| Account on hold | Same banner; primary disabled | This account is on hold. Message LyniaGo on WhatsApp to sort it out. |
| Offline | Red offline bar under the AppBar; fields editable, primary disabled | No connection, retrying… |

**Who sees what.** Staff work at one business: no chevron, no Branches row, no "+ Add a branch" (not drawn; same screens minus those).

**Open question — orders at other branches: answer A.** Leave it as is: each branch's own staff and phones ring for its orders. Revisit with B (a "2 new" count per C6 row, needs a server addition) if owners report missed orders.

**DESIGN-DEVIATIONS.md entry (for the app PR):** `2026-10 · Merchant D-48 · Added C6 Branches (sheet) and C7 Add branch, B1/D1 branch chevron + not-live state, C4 Branches row. New icon use: chevron-down in the Orders header. API error copy for "outside area" reworded to "That address is outside the area LyniaGo covers for now."`

### D · Shop orders and book a rider
- **D1 Shop Orders home.** The same header as B1 (Mbare Auto Spares, Open until 18:00, stats Orders · Sales · Cash overdue), plus a white full-width "Book a rider" button in the header. Body:
  - Segments **New · Packing · Ready**.
  - New-order card "#S214 $29.00", "View & accept", which opens D6.
  - Section "Riders you booked": mint pill trackers (the customer home pattern) — "Car battery · 3 offers / Pick a rider · 1:02" opens D4; "Brake pads · Blessing M." with a progress bar and "6 min" opens D5.
- **D2 Book · where.** AppBar "Book a rider · 1 of 2". "Where is it going?" and an address search, with results as rows (selected = mint row with a check). "Buyer's phone" (+263). Primary "Next".
- **D3 Book · what + fare.** "Items · 2" in a card list: qty, name, line price, and an ✕ to remove. Two ghost buttons: "From your items" and "Type one". "Worth $51.00" (auto-summed from catalogue prices). A fare stepper (− / **$3.50** / +, step $0.50, min $1.50) with "Typical $3–4". A "Booking terms" link. Primary "Find a rider · $3.50", which updates live.
- **D4 Offers.** AppBar with a gold 1:01 countdown. A context line. Sort chips Best match / Cheapest / Closest. Offer cards:
  - The **Preferred rider** card sits on top with a 2px accent border and a primary "Pick Farai".
  - The others use ghost Pick buttons and show a price delta ("$0.40 less").

  Red link "Cancel booking" (confirm).
- **D5 Tracking (shop).** Map (150px) plus a sheet: "On the way to buyer", a gold ETA, an items line, the rider row, and a **Buyer's code** card (grey, 24px accent-text digits spaced out, "Send to buyer" on WhatsApp). Stepper: Booked · Rider secured · Rider at your shop · Picked up · On the way · Delivered · **Cash back to you**. Links: red "Cancel booking", "Mark ride completed". When Delivered completes, it goes to D7.
- **D6 Shop order ringing.** Identical to B2 with shop items ("Ready in" means packed).
- **D7 Delivered + cash back (shop).** The hero, then a cash card with "$51.00", "I got $51.00" and "No cash on this one", then the summary row, an items card (2× Brake pads (front) · 1× Oil filter · Fare to Blessing M. $3.50), then link "Book again".

### E · Shop items, team, riders
- **E1 Items.** Identical to C1 (search, chips, switch rows, "+ Add an item"), with the shop tab bar.
- **E2 Team.** Rows: Owner (you) with a mint Owner pill; Staff with "active today" and a grey pill; Invited with "Resend" (gold pill). Primary "+ Add someone". Tapping a person opens E3.
- **E3 Person sheet.** Avatar and masked number. Segmented Owner / Staff (role change). A red-wash consequence box. A danger-filled "Remove Tendai". Link "Keep" (the scrim also cancels).
- **E4 Preferred riders.** "4 of 20". Rows with Online (mint) / Offline (grey) / Paused (gold) pills. For someone not on LyniaGo, "Send sign-up link". Primary "+ Add a rider" (opens a sheet; not drawn).

---

## Interactions and behaviour
- **Navigation model.** Tabs are roots (no back). Every pushed screen has a **fixed parent**, not a history stack: A2→A1, A3→A2, A4→A3, A5→A1, B3/B4/B5/B6/B7→B1, C2→C1, C5→C4, **C6→B1/D1 (sheet closes), C7→C4 (whether opened from C4 or C6)**, D2→D1, D3→D2, D4/D5/D7→D1, E2→C4, E3→E2, E4→C4. Hardware back = the same parent logic; it closes an open sheet first.
- **Ringing (B2/D6).** Loops until Accept or Decline. Back is blocked with the toast "Accept or decline to stop the alarm". The countdown starts at 1:14 (the accept window is 3:00 per N-03; the mock starts mid-way). On timeout: return home, "Missed · the customer was told".
- **Confirm sheet** (a reusable bottom sheet: title, one line, confirm button, "Keep", tap-scrim-to-close) before: Decline order, Cancel order, Cancel booking, Sign out, Mark ride completed, Close without cash, Remove team member. Destructive = `--danger` fill; neutral closes = `--cta-fill`.
- **Toasts.** Ink bubble 84px above the bottom, 2.2s, after every committed action ("Accepted · customer told 15 min", "Cash confirmed · order closed", …).
- **Open/closed switch.** Header of B1/D1. Off shows B5 (grey header).
- **Stock switch.** Turning a dish off opens C2. Turning it back on is immediate.
- **Tracking.** Driven by the order status stream. On Delivered (confirmed by the buyer's 6-digit code at the door), go to the Delivered screen. The "Cash back to you" step completes only when the merchant taps "I got $X", or closes with "No cash" / "Mark ride completed".
- **Overdue.** When cash isn't confirmed by its due time, add it to "Cash overdue" (header stat and the top row in Money). **No automatic penalties or reminders** in this version.
- **Offers countdown (D4).** 60–90s. On expiry: "Time up · pick a rider or book again".
- **Fare stepper.** ±$0.50, min $1.50. It updates the CTA label and the "you offered" line.
- **Offline.** Red bar within 3s. Mutating actions disabled. Orders that arrive during the outage are backfilled.

## State
`mode: 'restaurant' | 'shop'` (fixed at onboarding) · `isOpen`, `busyMode` · `orders[]` with status (new → accepted → rider_secured → rider_at_pickup → picked_up → on_the_way → delivered → cash_returned | closed_no_cash | force_completed), `total`, `items[]`, `note`, `prepMins`, `cashDueAt` · `bookings[]` (shop): `items[{qty,name,price}]`, `worth`, `fare`, `address`, `buyerPhone`, `offers[]`, `riderId`, `deliveryCode` · `menu/items[]` with `inStock`, `offUntil` · `team[]` with role and status · `preferredRiders[]` with online status · `overdueCash` (derived).

## Design tokens (from `reference/tokens`)
- **Colour**
  - Text and surfaces: ink #14181B · muted #5B6670 · bg #FFFFFF · surface #F6F7F8 · line #E2E6EA
  - Brand greens: accent #00B14F (fills and graphics only) · accent-700 #009D3B · accent-text #006630 · accent-wash #E9F8EF · **cta-fill #00812F** (pressed #006B27)
  - Highlight: highlight #F2B705 · highlight-wash #FFFCF2 · highlight-ink #6B5600 · highlight-border #F2B70566
  - Danger: danger #C0392B · danger-wash #FAEDEB · danger-ink #8F2418
  - Merchant-only tints: food tile #FDEADD (ink #9A4A12) · shop tile #DFF4EE · ring track #CDEEDA · gold pill text #3D3100
- **Type:** Inter 400/600/700 with tabular numerals for all money, times and codes. Fredoka for the wordmark only. Sizes: 34 hero money · 28 countdown · 24 H1 and totals · 22 header business name · 18 sheet titles · 16 buttons and AppBar · 14.5 row titles · 14 body · 13 meta · 12.5 hints · 11.5 tab labels and pills.
- **Spacing:** 4/8/12/16/24/32/48; screen edge 16. **Radius:** inputs 12 · cards 16 · stat tiles 14 · sheets 20 (top) · pills and buttons 999 · phone 24. **Targets:** min 44, primary 52 (sm 44).
- **Elevation:** cards are **shadow-free with a 1px line border** (8c style). Only sheets use `--shadow-sheet`.

## New shared components to add to the design system
`SegmentedControl` (count badges) · `Switch` (44×26) · `StatTile` (plus a gold "overdue" variant) · `CodeBoxes` (4 or 6, reused by the rider handover) · `ConfirmSheet` · `PrepRing` · `CashBackCard` · a `Stepper` merchant variant (time inline or below, see below).

## Differences from the customer and rider apps (open, awaiting product decision)
1. Tracking layout: the customer app puts the map and stepper inside a Card; merchant uses a full-bleed map with a sheet over it.
2. Delivery code: the customer app shows 28px accent-text digits with letter-spacing 6 in an accent card and "Re-issue"; merchant shows 24px digits on grey with "Send to buyer".
3. Stepper: the component puts the time **under** the label with "· live"; merchant puts it inline.
4. Status label: customer tracking uses `StatusPill`; merchant uses the gold ETA pill.
5. Header: customer has a 25px greeting, address and bell; merchant has a 22px business name, an open switch and stats, and no bell.
6. Components new to the system: segmented control, switch, stat tile.
7. Tabs: customer and rider have 3; merchant has 4.
8. Pickup-code boxes are new; the rider app must mirror them.

Suggested resolution: match 1–4 to the customer app; keep 5 (add a bell) and 7; add 6 and 8 to the design system.

## Not designed yet (use existing patterns)
Dish/item editor · add-rider sheet · shop front editor · order detail from Money · "This week" view · staff-role restrictions · empty states (no orders, empty menu) · error states (wrong pickup code, failed search) · notifications list.

## Assets
- `assets/lyniago-mark.svg` — brand mark.
- `assets/food.svg` — restaurant sticker from the customer service tiles.
- `assets/biz-small-business.svg` — shop illustration from the business set.
- Icons are the **Lucide** subset (`lynia-icons.js` in the design system): inbox, utensils, package, wallet, user, bike, timer, clock, phone, map-pin, navigation, search, plus, minus, x, check, circle-check, circle-alert, chevron-right, volume-2, power, wifi-off, store, banknote.

## Files
- `Merchant Prototype (standalone).html` — clickable prototype (offline). Branches: tap the business name on Orders home → C6; Account → Branches → C7 (type a name, tap "Use my current location", Create).
- All Screens Gallery: the branch frames are registered under **Merchant · phone (D-48)**, bands MM1 (switcher) and MM2 (add a branch), rendered live from the canvas via `?frame=<id>`.
- `Merchant Screens Canvas (standalone).html` — every screen with its change notes.
- `reference/proto.js` — the interaction wiring.
- `reference/Stepper.reference.txt` — the design-system stepper.
- `reference/tokens/` — colour, type and spacing tokens.
- `reference/ORIGINAL-SCREENS.md` — the original screen and route list.
- Source in the design project: `explorations/merchant/Merchant App Redesign.html`, `explorations/merchant/Merchant App Prototype.html`.
