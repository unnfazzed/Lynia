# LyniaGo customer Orders tab: UX/UI redesign brief for Claude Design (v2, 2026-10-01)

> **How to use this:** paste **Part 1 (the prompt)** into Claude Design as your first message, then
> paste **Part 2 (the current-state reference)** right after it, or attach this whole file. Then
> attach the files in **Part 3**, in that order (the first group is the "send these first" set if
> you're uploading from a phone). Claude Design can't see the repo, so this file has to carry
> everything.
>
> v2 of this brief folds in (a) the owner's answers to eight clarifying questions (2026-10-01) and
> (b) what the sibling redesign rounds already decided: **Calm Mint v2** (Home), **Rider v2**
> (both Account tabs, split histories), **After Send v2** (the order screen) and **Send a parcel v2**.

---

## Part 1: The prompt (paste this first)

You are redesigning the **Orders tab on the customer side of LyniaGo**, a delivery app in Zimbabwe
(Harare first). One Android app (Expo / React Native) serves customers and riders. The customer app
has three tabs: **Home · Orders · Account**. Customers order from three services:

- **Send a parcel:** the customer posts a parcel with an asking price, nearby riders make offers, the
  customer picks one, and the rider carries it. Usually paid **cash at the door**. A 6-digit
  **delivery code** proves the hand-off.
- **Restaurants (food):** the customer orders from a kitchen. Kitchens auto-accept, prepare it, and
  a rider is auto-dispatched near the end of prep time. Paid cash at the door or from the LyniaGo
  wallet. A kitchen that doesn't confirm in time auto-cancels the order with no charge.
- **Shops** (new, launching with the Home redesign's 4th tile): pharmacy, grocery, butchery and more.
  Same model as restaurants.

Restaurants and Shops are behind feature flags: some users see a parcels-only app.

**Who the users are:** people in Harare on cheap Android phones, often on patchy 2G/3G data, often
outdoors in bright sun, with mixed literacy (the UI language is English). Many pay cash. They open
Orders for three reasons, in this order: **"where is my order right now?"**, **"what happened to that
order?"** (did it arrive, what did I pay, why was it cancelled), and **"find that order again"** (the
restaurant I liked, the parcel I sent to my sister last week).

**What I want from you:** a redesigned, high-fidelity **Orders tab**, with every state it can be in
and the components it needs. Today it's the one tab root still in an old design generation: it sits
between the new Calm Mint v2 Home and the new Rider v2 Account tab and looks like neither. It must
look like the same app as **Calm Mint v2 Home** (the style reference; see the constraints).

### Decided for this redesign (owner answers, 2026-10-01). Treat these as final.

1. **Orders is the customer's only order history.** Remove the **Trip history** row (Rider v2 screen
   C13) from the customer Account tab. The rider's **Job history** (C12) stays on the rider side;
   history stays split by side, and Orders never shows jobs the user *carried* as a rider.
2. **A pinned "Now" section on top** for running orders: one card per running order, in the **same
   family as Calm Mint v2's live-order bar** (forest fill, brand disc with the service icon, "Tendai is
   on the way", sub-line, 7-segment progress, highlight ETA chip). Below it, the history. When nothing
   is running, the section is absent (not an empty box).
3. **One list across every service, with filter chips:** `All · Parcels · Food · Shops`. A chip only
   appears for a service that's switched on; with only one service on, there are no chips. Filters
   and search apply to the history only; the Now section always shows.
4. **Rows open the order; no inline actions.** A history row has **no** Send again / Order again /
   Rate / Help buttons on it. Tapping the row opens that order's screen (the After Send v2 screen,
   whose end states already carry the receipt, rating, "Send again" and Get help). Keep the list
   calm and scannable.
5. **Every row shows, at a glance** (owner picked all four):
   - **Outcome in words + a tone treatment:** Delivered · Cancelled · Restaurant didn't confirm ·
     No rider found · Not delivered · Refunded. Never today's "Sent" on every row.
   - **The amount actually paid.** A cancelled or no-charge order reads "No charge", never "$5.00".
   - **The rider's name and your rating** ("Tendai M. · ★★★★"), or nothing when there was no rider.
   - **An item summary**: "Documents", "2 items", or the dishes ("Sadza & beef stew, Mazoe ×2").
6. **History loads older orders automatically** as you scroll near the bottom. No "Load more"
   button. Design the "loading older" row, the end of history ("That's everything"), and a failed
   page that doesn't break the list above it.
7. **Search past orders** by restaurant or shop name, area (e.g. "Belgravia") or rider name.
8. **Two or more running orders from Home:** Home's live bar shows one order plus a "+1 order" pill,
   and tapping it with 2+ running opens this tab. Design that landing: the Now section with several
   cards, clearly the place to choose which one to open.
9. **Kitchen auto-cancel** is its own outcome: "The restaurant didn't confirm in time — nothing was
   charged." It must not read as the customer's cancel or as a failure that cost them money.
10. **Shops orders** appear as a third service (icon, chip, title by shop name), styled like food.

### Hard constraints. Don't break these.

- **Platform & frames:** Android phone. Design at **360×720**. Every state must also work at
  **320×640**, and the key states at **font scale 1.3**. Content scrolls, and nothing may hide under
  the 60px tab bar.
- **Tabs stay:** `Home · Orders · Account` (Calm Mint v2's tab bar; don't redraw it).
- **No pull-to-refresh and no "Refresh" buttons.** The tab refreshes itself (on focus, every 30 s
  while visible, on reconnect, on app resume). A failed *first* load may show **"↻ Try again"**. A
  failed *background* refresh never raises an error card: the tab keeps showing what it has.
- **Errors are spoken once and go:** a failed action raises an ink toast for ~4 s with "↻ Try again".
  No persistent red error lines.
- **Tap targets:** ≥ **44px** (`--target-min`) for everything, **52px** (`--target-primary`) for the
  one primary CTA on a screen. Draw them at that size. Every icon carries a visible text label.
- **Money:** USD, tabular numerals on every number. **Never red text on white.** Problem outcomes use
  the danger wash (`#FAEDEB`) with danger ink (`#8F2418`). Green *text* is `green-text #006630`, never
  `brand #00B14F` (fills only).
- **Vocabulary (use it exactly):** *Order* = what the customer placed (all services). *Rider* = who
  carries it. *Delivery code* = the 6-digit hand-off proof. *Send again* (parcel). Say **LyniaGo**,
  not Lynia. OTPs are sent on **WhatsApp** (Calm Mint v2). Help & support goes to **WhatsApp**.
- **Tokens: use Calm Mint v2's set** (Part 2 §5), which supersedes the older table. Zero shadows:
  separation comes from tint plus hairlines; the only solid exception is the forest live card. If you
  genuinely need a new token, name it, give its value and justify it.
- **Visual language: Calm Mint v2 (the new Home) is the reference.** Reuse its parts; don't invent
  parallel components:
  - The **mint header** (bottom radius 28, decorative yellow/coral/sky circles, 44px white bell disc
    with the highlight unread dot). On Orders it carries the title "Your orders" (24/700, like the
    Home greeting) instead of the address control, and the **search field** (48px, white, radius 12)
    with placeholder "Search your orders".
  - The **forest live-order bar** → the Now cards.
  - **Chips** (mint), **skeletons** (`#EEF1F3`, radius 12), the **offline muted banner** under the
    header, the **star** (fill highlight, stroke star-stroke).
  - Service icons from Calm Mint v2's `service-icons/v2/` (send, restaurants, shops) and its tile
    tints for the row icon discs.
  - From **Rider v2**, the list-row anatomy (`LRow`: icon disc · title · "meta · time" · amount) and
    the day group labels (uppercase 12/600 muted) are the starting point for history rows; restyle
    them to Calm Mint v2.
  - From **After Send v2**, reuse its human stage names and outcome copy, so a row and the order it
    opens say the same thing.

### What's wrong today (fix these, and find more)

- **It looks like a different, older app.** Home and Account open with the mint header; Orders opens
  with a bare 19px "Your orders" on white. Its live card is a thin green-outlined box that shares
  nothing with Home's live bar for the very same order.
- **The live card says too little:** a status word ("Rider assigned", "Finding riders") and a price.
  No ETA, no rider, no progress. A food order the kitchen is still cooking reads "Rider assigned".
- **Every past order says "Sent".** Delivered, cancelled, no-rider and not-delivered orders all show
  "Sent" and the same muted price. A cancelled $18.00 food order looks like an $18.00 spend.
- **Titles are long landmark pairs** ("Avondale Shops → Mount Pleasant Business Park, Gate 2") that
  truncate at 360 and are unreadable at 320. Identical "Avondale Shops → Belgravia" rows can't be
  told apart.
- **No dates to scan by, no filter, no search,** and only the latest 50 orders, with no way to see
  older ones.
- **The empty state promises reorder ("reorder from here in one tap")** that this screen doesn't
  offer. Rewrite it to say what Orders actually does.
- **Two histories:** Account → Trip history and Orders show the same orders with different row
  designs (resolved: Orders wins, decision 1).
- **Offline is a sentence, not a state:** "Showing your last saved orders…" only appears when there's
  a list, and it pushes a ghost "Retry" button into it.

### Deliverables (same package shape as Calm Mint v2, After Send v2 and Rider v2)

1. `BRIEF.md`: the product decisions you made, as short final statements, plus any open questions.
2. `README.md`: screen + state list, navigation rules (what each tap opens), the global constraints
   above, a component spec (header, search, chips, Now card, history row, day label, outcome tones,
   loading-older row, banners) with exact sizes at 360 and 320, and a token table that says where
   each token is used. Include a **NEEDS BACKEND** section and a **Retires** section, like Calm
   Mint v2's.
3. A standalone HTML prototype (canvas or player) showing **every state at 360×720**, key states at
   **320×640**, and key states at **font scale 1.3**, with a single-screen view per id
   (`?screen=O1`).
4. A kit file holding the shared parts **and one object with every user-facing string** (call it
   `O`). Copy ships verbatim, so write final copy, not lorem. Use real Harare-flavoured sample data
   (Sadza Republic, Gava's Kitchen, Avondale Pharmacy, Eastgate Mall, Belgravia, riders Tendai M.,
   Rudo K.).
5. 2× PNG renders of every state.

Cover **every state in Part 2 §6**, plus anything new you introduce. For each existing screen id,
say whether you're **keeping, redesigning, merging or retiring** it.

---

## Part 2: Current-state reference (paste after the prompt)

### 1. Product rules already decided (owner-approved)

1. **One Orders list across every service** (design `RC orders`, "R0·2"): a service never gets its
   own history.
2. **One live card per running order.** A food order and a parcel running side by side both show.
3. **No manual refresh** anywhere. Background failures stay silent (owner, 2026-08-12).
4. **Errors are spoken once and go** (owner, 2026-08-12).
5. **Offline warm paint:** the last list fetched is saved on the device and painted immediately on a
   cold start, so the tab is never blank when data is dark.
6. **History is split by side** (Rider v2, D-54): customer orders here, carried jobs in the rider's
   Job history. (Since 2026-10-01 the app already hides carried jobs from this tab.)
7. **Send again** (parcel) lives on the order screen. It copies the old order into Send a parcel and
   lands on the first unfinished step with the banner "Copied from your order on 28 Sep. Check it,
   then send." (D-52: past orders don't store the recipient's phone).
8. **The order screen** (After Send v2, D-53) is one screen: full-bleed map + a sheet that follows
   the order's stage. Its end states carry the receipt, the rating ("You rated Tendai ★★★★ Good",
   rateable for 7 days) and Get help.
9. **Home** (Calm Mint v2, D-55) draws **one** live bar however many orders run, with "+1 order" when
   2+. Tapping it opens the order (one running) or this tab (2+).
10. **Restaurants auto-accept** (D-50). A kitchen that doesn't confirm within 1 hour auto-cancels:
    "The restaurant didn't confirm your order in time — nothing was charged…". Restaurant phone
    numbers are visible to customers ("Call Sadza Republic" on the food order screen).

### 2. Data each order has (what the design can show)

**Running order** (one per order):
- Service: parcel / food / shop (food and shops are both `merchant` orders today).
- `status` (below); for food and shops also the kitchen phase: awaiting accept → (awaiting item
  approval) → (awaiting payment) → preparing → ready for pickup.
- Food/shop: the venue name, payment method (cash at the door / wallet).
- Price: agreed fare, else the customer's asking price; food: the order total.
- Pickup and drop-off addresses (free text, can be long).
- Rider once assigned: name, photo, rating, plate, Verified flag, and a live location (gives an ETA
  while the rider's phone sends GPS).

**Past order** (history row):
- Service, venue name, pickup + drop-off address, `itemDesc` (e.g. "Documents").
- Asking price and agreed fare (agreed is empty when no rider was ever agreed).
- `status`, `createdAt`, the rider's name, and your rating (score + optional comment) if you rated.
- **Not on the row today** (NEEDS BACKEND, list them in README): the amount actually charged /
  refunded flag, payment method, the food item list, the cancel reason (who cancelled, kitchen
  auto-cancel), a delivered-at time, a shop "kind", and paging beyond the latest 50.

**Statuses:** `requested`, `open_for_offers` (finding riders), `assigned`, `confirmed`,
`en_route_pickup`, `picked_up`, `en_route_dropoff` = running. `delivered`, `completed` (delivered
and rated), `cancelled`, `expired` (no rider took it), `undelivered` (the rider couldn't hand it
over: unreachable, refused or wrong address) = past.

**Human stage names already in use** (After Send v2; reuse them): Finding riders · Rider assigned ·
Heading to pickup · Parcel collected · On the way to drop-off · Delivered · Cancelled · Expired ·
Not delivered. Food adds Waiting for the restaurant · Preparing · Ready for pickup.

### 3. Where Orders sits in the customer journey

```
HOME (Calm Mint v2: mint header · 4 service tiles · rails · ONE forest live bar)
  ├─ live bar, 1 running  ──────────────► that order's screen (After Send v2 / food order screen)
  ├─ live bar, 2+ running ──────────────► ORDERS (Now section)          ◄── design this landing
  ├─ Send → Send a parcel v2 (4 steps) ─► After Send v2 (map + stage sheet)
  └─ Restaurants / Shops → menu → cart → checkout → food order screen
ORDERS (this brief): mint header + search · Now cards · chips · day-grouped history (auto-loads older)
  ├─ Now card   ────────────────────────► the running order's screen
  └─ history row ───────────────────────► that order's screen (end state: receipt · rating ·
                                          Send again · Get help)
ACCOUNT (Rider v2: identity · Customer|Rider toggle · Notifications · Help · Settings)
                                          ← its "Trip history" row is retired by this redesign
```

### 4. What the Orders tab looks like today (`app/(tabs)/orders.tsx`)

See `current/01…04.png` (attached). From top to bottom:

- **Title:** "Your orders", 19/700 ink, on plain white, with no header card.
- **Live cards** (one per running order): white card with a 1.5px brand border, radius 16, padding
  12. A 36px mint disc with a utensils/package icon, a title (the restaurant, or "Pickup → Drop-off")
  at 13.5/700, a status line at 12/600 green-text ("Rider assigned", "Finding riders"), and the price
  right-aligned at 14/700. No ETA, rider, progress or kitchen phase.
- **"EARLIER"**: uppercase 12/700 muted label.
- **History rows:** 34px surface disc with a 16px muted icon, a title at 13.5/600, a meta line at 12
  muted "Sep 30 · Sent · Tendai M.", and the price at 13/600 muted, right-aligned. 1px line divider,
  ~56px tall, whole row tappable. **Every row says "Sent"** whatever the outcome.
- **Offline with a saved list:** a 14px muted sentence plus a ghost "Retry" when the fetch errored.
- **First load:** grey skeleton rows. **Couldn't load:** bare "Couldn't load your orders" / "Check
  your connection and try again." + "Retry".
- **Empty (`RC orders_empty`):** a card with a receipt icon, "Nothing here yet" / "Parcels and food
  orders both land on this screen — you'll be able to reorder from here in one tap.", and "Find food
  near you" (primary) + "Send a parcel" (ghost). With restaurants off: only "Send a parcel".
- **No filter, no search, no day grouping, no paging** (the server caps at the latest 50).

**Current mock** (`RC orders`, superseded by this redesign): a live card "Sadza Republic / On the
way · 6 min / $15.50", then "EARLIER" rows "Huku House · Fri · delivered · $9.00", "Parcel to Msasa
· Thu · delivered · $2.40", "Café Msasa · Wed · refunded · $7.50". It already wants outcomes,
weekday dates and "Parcel to <area>" titles; the app draws none of them.

**Account → Trip history (Rider v2 C13, retired by decision 1):** a pushed screen ("‹ Back · Trip
history") listing customer orders grouped by day, "Avondale → Belgravia", "Delivered · 30 Sep",
price in ink. Empty line: "Orders you place show here."

### 5. Design tokens: Calm Mint v2 (use only these)

| Token | Value | Use |
|---|---|---|
| ink | `#14181B` | all body text |
| muted | `#5B6670` | secondary text, inactive tabs, meta lines |
| line | `#E2E6EA` | 1px hairlines, dividers, field borders |
| surface | `#F6F7F8` | sunken areas, notes |
| brand | `#00B14F` | **fills only**: progress, icon discs. Never text |
| green-text | `#006630` | links, active tab, green text |
| cta / pressed | `#00812F` / `#006B27` | the primary button fill, white text |
| mint | `#E9F8EF` | header, chips, positive outcome wash |
| forest | `#063B22` | live-order bar → Now cards (sub-text `#BFE6CD`) |
| highlight / highlight-ink | `#FFD23F` / `#3D3100` | ETA chip, unread dot, star fill (replaces gold `#F2B705`) |
| star-stroke | `#C99500` | star outline |
| coral / sky | `#FF6B4A` / `#3EC1F3` | decorative header circles only |
| tile-send / -food / -shops / -pharmacy | `#CDEEDA` / `#FFD9CC` / `#DDD5FF` / `#C5E9DF` | service icon discs |
| danger / danger-wash / danger-ink | `#C0392B` / `#FAEDEB` / `#8F2418` | problem outcomes (never red text on white) |
| skeleton | `#EEF1F3` | loading blocks, radius 12 |
| Type | Inter 400/600/700; Fredoka 600 wordmark only | tabular numerals on every number |
| Space | gutter 16, grid 8 | |
| Radius | fields 12 · cards 14–16 · header bottom 28 · sheet 24 · pills 999 | |
| Depth | **zero shadows** | tint + hairlines; the forest card is the solid exception |
| Targets | `--target-min` 44 · `--target-primary` 52 | |

### 6. States to cover (every one at 360×720; key ones at 320×640 and font scale 1.3)

**Populated**
- O1 · One running parcel + history (the common case).
- O2 · Two or three running orders (a food order cooking + a parcel finding riders + a shop order):
  the landing from Home's "+1 order".
- O3 · Running food/shop order in each kitchen phase: waiting for the restaurant · preparing · ready
  for pickup · rider on the way (with ETA).
- O4 · Running parcel in each stage: finding riders · rider assigned · heading to pickup · collected ·
  on the way (with ETA) · rider's GPS not sending (no ETA).
- O5 · History only, nothing running (no Now section).
- O6 · History rows in every outcome: delivered (unrated) · delivered and rated · cancelled by you ·
  cancelled by the rider · restaurant didn't confirm (no charge) · no rider found · not delivered ·
  refunded. Each with its paid amount or "No charge".
- O7 · Day grouping across Today · Yesterday · weekdays · older dates, with mixed services.
- O8 · Long content: a 40-character venue name, a long address, a long item list, font scale 1.3.
- O9 · Filter chips: Parcels · Food · Shops selected; a filter with no matches; only one service on
  (no chips).

**Search**
- O10 · Search focused (keyboard up), typing, results, and no results ("No orders match 'Msasa'").
- O11 · Search while offline (searches the saved list only; say so).

**Paging**
- O12 · Loading older orders at the bottom of the list (no button).
- O13 · End of history.
- O14 · Older page failed to load: the list above stays, the bottom row offers "↻ Try again".

**Empty, loading, offline, error**
- O15 · First-ever open, loading (skeleton matching the new rows, real header).
- O16 · Empty, every service on.
- O17 · Empty, parcels only (no food or shop promise).
- O18 · Only a running order, no history yet.
- O19 · Offline cold start with a saved list (Calm Mint's muted banner, "as of 09:24"; Now cards show
  the last-known stage, no ETA).
- O20 · Offline with nothing saved.
- O21 · Couldn't load (server error, no saved copy) with "↻ Try again".

**Account side effect**
- O22 · The customer Account tab without its Trip history row (show the remaining rows: Notifications
  · Help & support · Settings).

**Retire or redraw:** `RC orders`, `RC orders_empty` (gallery "Home & orders") and Rider v2 **C13
Trip history**. Say which your design replaces.

---

## Part 3: Files to attach to Claude Design

**Send these first** (if uploading from a phone):

1. `docs/designs/orders-v2/current/*.png`: today's screen.
   - `01-mock-vs-app-populated-and-empty.png`: the current mock (left) vs the app (right).
   - `02-app-real-world-mix-360.png` / `03-app-real-world-mix-320.png`: the app with two running
     orders and a realistic history (cancelled, no-rider, not-delivered rows all reading "Sent").
   - `04-app-home-tab-for-comparison.png`: the *previous* Home (8c). The new Home is item 2.
2. **The style reference, Calm Mint v2:** `packages/design/handoff/calm-mint-v2-2026-10/`
   (`README.md`, `Calm Mint v2 - all screens.html`, `calm-mint-v2.js`, `assets/`). If it isn't on
   `main` yet, it's on branch `claude/awesome-faraday-q2tsm5`.

**Then:**

3. `packages/design/handoff/after-send-v2/` (`README.md`, `BRIEF.md`, `design/After Send v2
   (standalone).html`, `design/as-kit.jsx`): the screen every row opens; stage names, outcome copy,
   receipt, rating.
4. `packages/design/handoff/rider-v2/` (`README.md`, `design/Rider v2 (standalone).html`,
   `design/rv-kit.jsx`, `design/rv-account.jsx`): `LRow`, day labels, the customer Account tab and
   Trip history C13 being retired.
5. `packages/design/handoff/send-compose-v2/README.md`: the Send again banner.
6. `packages/design/explorations/restaurants/r-customer-a.jsx` (`RC.orders`, `RC.orders_empty`): the
   current mock, for content and IA, **not** for style.

---

## Part 4: After Claude Design returns (for us, not for Claude Design)

Per `CLAUDE.md`, a redesign lands like the Send, After Send, Rider and Calm Mint rounds did:

- Export to `packages/design/handoff/orders-v2/` (README, BRIEF, this PROMPT, design/, screens/).
- Add a **`docs/DESIGN-DEVIATIONS.md`** entry with the next free number (D-55 is Calm Mint v2, so
  **D-56** unless another lands first) marking `RC orders`, `RC orders_empty` and Rider v2 **C13** as
  superseded. The design-freeze CI job requires it.
- Add a CLAUDE.md line: "The Orders tab follows its own handoff (`handoff/orders-v2/`)", and amend
  the Rider v2 line so `app/history/index.tsx`'s customer side is no longer a rider-v2 surface.
- Align `app/(tabs)/orders.tsx`, drop the customer Account's Trip history row, move strings to
  `src/ui/orders/copy.ts` (the handoff's `O`, verbatim), and update the `tools/parity` targets.
  `tools/parity/mobile/fixtures/orders_review_mixed.mjs` already renders the messy real-world case.
- **Backend work this design needs** (from decisions 5–7 and 10): a paged `/orders/history` (cursor),
  search (server-side, plus the offline local match), and on each history row the charged amount /
  refund flag, cancel reason, item summary for merchant orders, payment method, and shop kind.
