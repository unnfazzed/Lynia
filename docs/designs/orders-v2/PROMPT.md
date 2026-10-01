# LyniaGo customer Orders tab: UX/UI redesign brief for Claude Design

> **How to use this:** paste **Part 1 (the prompt)** into Claude Design as your first message, then
> paste **Part 2 (the current-state reference)** right after it, or attach this whole file. Attach
> the files in **Part 3** too: the four PNGs in `current/` next to this file show today's screen, and
> the Send v2 / After Send / Rider v2 handoffs carry the visual language it must match. Claude Design
> can't see the repo, so this file has to carry everything.
>
> **Before you paste:** Part 1 has a short **"Decided for this redesign"** list. The items marked
> *(default — flip if you disagree)* are my recommendations, not your decisions yet. Edit them first.

---

## Part 1: The prompt (paste this first)

You are redesigning the **Orders tab on the customer side of LyniaGo**, a delivery app in Zimbabwe
(Harare first). One Android app (Expo / React Native) serves customers and riders. The customer app
has three tabs: **Home · Orders · Account**. Customers use two services:

- **Send a parcel:** the customer posts a parcel with an asking price, nearby riders make offers, the
  customer picks one, and the rider carries it. Usually paid **cash at the door**. A 6-digit
  **delivery code** proves the hand-off.
- **Restaurants (food):** the customer orders from a kitchen. The kitchen accepts and prepares it, a
  rider is auto-dispatched, and the food arrives. Paid cash at the door or from the LyniaGo wallet.
  Food is behind a feature flag: some users see a parcels-only app.

**Who the users are:** people in Harare on cheap Android phones, often on patchy 2G/3G data, often
outdoors in bright sun, with mixed literacy (the UI language is English). Many pay cash. They open
Orders for three reasons, in this order: **"where is my order right now?"**, **"what happened to
that order?"** (did it arrive, was I charged, why was it cancelled), and **"do that again"** (send
the same parcel, order the same food).

**What I want from you:** a redesigned, high-fidelity **Orders tab** with every state it can be in,
plus the row and card components it needs. It's a small screen, but today it's the weakest screen in
the customer app. It looks like a plain list from an older design generation, sitting between a
redesigned Home and a redesigned Account. See "What I'm unhappy with today" below.

Cover, in priority order:

1. **Live orders (the top of the tab).** One card per running order. A food order and a parcel can
   run at the same time, and both must show. Each card answers "where is it now and how long?" at a
   glance: a human stage name, an ETA when we have one, and a progress cue that matches the live-order
   card on **Home** (same component family, not a different-looking card). Tapping opens that order's
   live screen.
2. **Past orders (the history list).** Group rows by day (Today · Yesterday · weekday · date). Every
   row states its **outcome** in words and in a calm tone treatment (Delivered · Cancelled · Not
   delivered · No rider found · Refunded). It shows **what the customer actually paid**, and a
   cancelled order with no charge must not read as a $5.00 spend. Food rows are titled by the
   restaurant. Parcel rows read "Parcel to Belgravia", not two long landmarks joined by an arrow.
3. **Do it again, rate it, get help.** Bring the repeat actions to the list instead of making the
   customer open each order:
   - **Send again** on a parcel row (it pre-fills Send a parcel; that flow already exists).
   - **Rate** on a delivered, unrated order, for 7 days after delivery (the order screen already
     has rating).
   - **Order again** on a food row *(new; see Decided below)*.
   - **Get help** on a recent problem order (cancelled / not delivered). Help routes to WhatsApp.
4. **Filter by service:** All · Parcels · Food chips, hidden when food is off.
5. **Every state** listed in Part 2 §6: first load, offline with a saved copy, couldn't load, empty
   (food on / food off), only-live-no-history, the 50-order cap, and so on.

**Decided for this redesign. Treat these as final:**

- **Orders is the customer's one history.** The customer Account tab's "Trip history" row (Rider v2,
  screen C13) duplicates this tab. *(default — flip if you disagree)* Retire C13: Orders is the only
  customer history, and the Account row either goes or deep-links to this tab. Say which in BRIEF.md.
- **Customer orders only.** A customer who is also a rider must not see the jobs they **carried** in
  Orders. Those live in the rider's Job history (Rider v2 C12). Today they leak in, see Part 2 §4.
- **Tab root header = the 8c mint top card**, the same as Home and both Account tabs (greeting-free
  variant is fine: e.g. title "Your orders" + bell). Today Orders is the only tab root without it.
- **Order again for food** *(default — flip if you disagree)*: design it. It opens the restaurant
  with the same items in the cart, and it handles items or a kitchen that are no longer available.
  Engineering builds the backend for it. If you'd rather not commit to it yet, design the row
  without it and keep the slot for it.
- **No receipts screen in this round.** A row opens the existing order screen (the After Send screen
  for parcels, the food order screen for food). If the list needs a detail that doesn't fit (e.g.
  items ordered), propose it in BRIEF.md as an open question rather than drawing a new screen.

**Hard constraints. Don't break these:**

- **Platform & frames:** Android phone. Design at **360×720**. Every state must also work at
  **320×640**, and the key states at **font scale 1.3**. Content scrolls, and nothing may hide under
  the tab bar.
- **Tabs stay:** `Home · Orders · Account`. The tab bar component exists already; don't redraw it.
- **No pull-to-refresh and no "Refresh" buttons.** The tab refreshes itself (on focus, every 30 s
  while visible, on reconnect, on app resume). A failed *first* load may show **"↻ Try again"**, the
  same as After Send v2 state 2.2. A failed *background* refresh must never raise an error card: it
  just keeps showing what it has.
- **Live orders never hide behind history.** If an order is running, it's at the top, above any
  filter. Filters apply to past orders only.
- **Tap targets:** ≥ **44px** (`--target-min`) for everything, **52px** (`--target-primary`) for the
  one primary CTA on a screen. Draw them at that size. Every icon carries a visible text label.
- **Money:** USD, tabular numerals. **Never red text on white.** Danger and problem states use the
  red wash fill (`--danger-wash`) with dark-red ink (`--danger-ink`). Green *text* is
  `--accent-text`, never `--accent`.
- **Vocabulary (use it exactly):** *Order* = what the customer placed (both services). *Rider* = who
  carries it. *Delivery code* = the 6-digit hand-off proof. *Send again* (parcel) / *Order again*
  (food). Say **LyniaGo**, not Lynia. Payment prompts and OTPs are **SMS**. Help & support goes to
  **WhatsApp**.
- **Use only the existing design tokens** in Part 2 §5. If you genuinely need a new token, name it,
  give its value and justify it.
- **Visual language: match the NEW customer UI, not the old list.** Four handoffs set the current
  style. Reuse their parts; don't invent parallel components:
  - **Home 8c:** the mint top card on tab roots, and the **live-order card** on Home (rider avatar
    disc, "Tendai M. · on the way", segmented progress bar, gold ETA pill). Orders' live card must
    read as the same family.
  - **Send a parcel v2:** route strip, notices (calm = `--surface`/`--line`; warn = white + 1px
    `--danger` border), the `--ink` toast with "↻ Try again", 44px small pill buttons (ghost / fill),
    chips.
  - **After Send v2:** the order screen these rows open. Reuse its human stage names, its step track,
    its outcome copy (delivered / cancelled / not delivered / no rider found), its rating language
    ("You rated Tendai ★★★★ Good"), and its blocking-state pattern (72px `--surface` circle + 32px
    icon, 22/700 title, 15/22 `--muted` line, primary + ghost) for empty / error states.
  - **Rider v2:** the `LRow` list-row anatomy (icon disc · title · "meta · time" · amount), day
    group labels (uppercase 12/600 `--muted`), chips, and the Trip history (C13) you're absorbing.
  - Type scale from the Send kit: 22 titles, 16 header/CTA, 15 values, 13 labels/chips, 12 hints and
    uppercase 12/600 labels. Lucide icons from the app's existing subset.

**What I'm unhappy with today (fix these, and find more):**

- **It looks like a different, older app.** Home and Account open with the mint 8c top card; Orders
  opens with a bare 19px "Your orders" on white. Its live card is a thin green-outlined box that
  shares nothing with Home's live-order card for the very same order.
- **The live card says too little.** A status word ("Rider assigned", "Finding riders") and a price.
  No ETA, no rider, no progress. A food order whose kitchen is still cooking reads "Rider assigned",
  because the card ignores the kitchen's phase.
- **Every past order says "Sent".** Delivered, cancelled, expired (no rider found) and not-delivered
  orders all show the same "Sent" and the same muted price. A cancelled $18.00 food order looks like
  an $18.00 spend. The mock draws "delivered" / "refunded"; the app draws neither.
- **Titles are long landmark pairs** ("Avondale Shops → Mount Pleasant Business Park, Gate 2") that
  truncate at 360 and are unreadable at 320. Five identical "Avondale Shops → Belgravia" rows give no
  way to tell them apart.
- **No dates to scan by.** "Sep 30 · Sent · Tendai M." on every row, in one undivided list.
- **Rider jobs leak in.** A customer who also rides sees jobs they *carried* mixed into their own
  orders, with a "Delivered · Rudo K." meta that means something else entirely.
- **The empty state promises reorder ("reorder from here in one tap") that doesn't exist.** There is
  no Send again, no Order again and no Rate on this screen. The customer has to open each order.
- **No filter.** Food and parcels are one undivided list with a 34px grey icon as the only cue.
- **Tapping a past food order opens the parcel screen**, not the food one (an engineering bug we'll
  fix regardless, but the design should make each row's destination obvious).
- **Two histories.** Account → Trip history (Rider v2 C13) and the Orders tab show the same orders
  with different row designs.
- **Offline is a sentence, not a state.** "Showing your last saved orders — we'll refresh when you're
  back online." only appears if there's a list, and it pushes a ghost "Retry" button into the list.

**Deliverables (same shape as our previous handoffs, e.g. "After Send v2" and "Rider v2"):**

1. `BRIEF.md`: the product decisions you made, as short final statements, plus any open questions.
2. `README.md`: screen + state list, navigation rules (what each tap opens), the global constraints
   above, a component spec (live card, history row, day label, chips, row actions, notices) with
   exact sizes, and a token table that says where each token is used.
3. A standalone HTML prototype with a player (← → keys) showing **every state at 360×720**, the key
   states at **320×640**, and the key states at **font scale 1.3**.
4. A kit file holding the shared parts **and one object with every user-facing string** (call it
   `O`). Copy ships verbatim, so write final copy, not lorem. Use real Harare-flavoured sample data
   (Sadza Republic, Gava's Kitchen, Eastgate Mall, Belgravia, Avondale, riders Tendai M., Rudo K.).
5. 2× PNG renders of every state.

Cover **every state in Part 2 §6**, plus anything new you introduce. For each existing screen id,
say whether you're **keeping, redesigning, merging or retiring** it.

---

## Part 2: Current-state reference (paste after the prompt)

### 1. Product rules already decided (owner-approved)

1. **One Orders list across every service.** Food and parcels share one tab; a vertical never gets
   its own history (design `RC orders`, "R0·2").
2. **One live card per running order.** A food order and a parcel running side by side both pin. This
   matches Home, which also draws one live card per running job.
3. **No manual refresh.** The tab refetches on focus, every 30 s while focused, on reconnect, and on
   app resume. A background poll that fails shows nothing extra (owner, 2026-08-12).
4. **Errors are spoken once and go** (owner, 2026-08-12): a failed *action* raises an `--ink` toast for
   ~4 s. There are no persistent red error lines.
5. **Offline warm paint:** the last list we fetched is saved on the device and painted immediately on
   a cold start, so the tab is never blank when the data connection is dark.
6. **Send again** exists for parcels: it copies an old order into Send a parcel, and Send shows the
   banner "Copied from your order on 28 Sep. Check it, then send." It lands on the first incomplete
   step.
7. **Rating:** a customer can rate a delivered order (stars + tags) on the order screen for 7 days
   (After Send v2 state 2.25).
8. **Accounts:** one LyniaGo account can be a customer only, or a customer + rider (Rider v2 /
   ledger D-54). History is split by side: the customer's orders and the rider's carried jobs are
   separate lists.
9. Food dispatch and restaurants are behind feature flags. With restaurants off, the app is
   parcels-only and no copy may promise food.

### 2. Data each order has (what the design can show)

**Live order** (one per running order):
- `orderType`: parcel or food (`merchant`).
- `status` (below), and for food the kitchen `merchantPhase`: awaiting accept → (awaiting item
  approval) → (awaiting payment) → preparing → ready for pickup.
- Food: `merchantName` (restaurant) and payment method (cash at the door / wallet).
- Price: agreed fare, else the customer's asking price.
- Pickup and drop-off landmarks (free text, can be long).
- Rider: name, photo, rating, plate and Verified flag once assigned, plus a live location (gives an
  ETA when the rider's phone is sending GPS).
- Delivery code (6 digits) once a rider is on the way.

**Past order** (the history row; the server returns the latest **50** across both roles):
- `orderType`, `merchantName`, `role` (customer / rider: the screen must show customer rows only).
- Pickup + drop-off landmarks, `itemDesc` (e.g. "Documents"), the sender's `note`.
- Asking price and agreed fare (agreed is empty when no rider was ever agreed).
- `status`, `createdAt` (we don't have a separate delivered-at time on the row).
- `rating` (score + optional comment, or none) and the rider's name (`counterpartyName`).
- No items list, no payment method, no refund flag on the row today. If the design needs them, say so
  in BRIEF.md and engineering will add them.

**Statuses:** `requested`, `open_for_offers` (finding riders), `assigned`, `confirmed`,
`en_route_pickup`, `picked_up`, `en_route_dropoff` = live. `delivered`, `completed` (delivered and
rated), `cancelled`, `expired` (no rider took it), `undelivered` (the rider couldn't hand it over:
unreachable, refused or wrong address) = past.

**Human stage names the app already uses** (After Send v2 is the source; reuse them): Finding riders ·
Rider assigned · Heading to pickup · Parcel collected · On the way to drop-off · Delivered · Cancelled ·
Expired · Not delivered. Food adds the kitchen phases (Waiting for the restaurant · Preparing · Ready
for pickup) before the rider stages.

### 3. Where Orders sits in the customer journey

```
HOME (8c mint top card · service tiles · one live-order card per running job · restaurants)
  ├─ Send → Send a parcel v2 (4 steps) → After Send (map + stage sheet) ─┐
  └─ Restaurants → menu → cart → checkout → food order screen ──────────┤
ORDERS (this brief)                                                      │
  ├─ live card ──────────────── opens the live order screen ◄────────────┘
  └─ past row ───────────────── opens that order's screen (terminal state: delivered / cancelled /
                                not delivered, with Rate · Send again · Get help)
ACCOUNT (8c mint top card · identity · Customer|Rider toggle · Trip history · Notifications · Help ·
         Settings)   ← "Trip history" (C13) duplicates Orders
```

### 4. What the Orders tab looks like today (`app/(tabs)/orders.tsx`)

See `current/01…04.png` (attached). From top to bottom:

- **Title:** "Your orders", 19/700 `--ink`, on plain white with no top card. Home and Account both
  open with the 8c mint top card.
- **Live cards** (one per running order): white card with a 1.5px `--accent` border, radius 16,
  padding 12. A 36px `--accent-wash` disc with a utensils/package icon, a title (the restaurant, or
  "Pickup landmark → Drop-off landmark") at 13.5/700, a status line at 12/600 `--accent-text`
  ("Rider assigned", "Finding riders", "On the way to drop-off"), and the price right-aligned at
  14/700. No ETA, rider, progress or kitchen phase.
- **"EARLIER"**: uppercase 12/700 `--muted` label.
- **History rows:** 34px `--surface` disc with a 16px muted icon, a title at 13.5/600 (restaurant, or
  "Pickup → Drop-off"), a meta line at 12 `--muted` "Sep 30 · Sent · Tendai M.", and the price at
  13/600 `--muted`, right-aligned. 1px `--line` divider, ~56px tall, the whole row tappable, a mint
  wash on press. **Every customer row says "Sent"** whatever the outcome. Rider-carried rows
  (customer + rider accounts) appear in the same list with their own "Delivered" / "Cancelled" meta.
- **Offline with a saved list:** a 14px `--muted` sentence "Showing your last saved orders — we'll
  refresh when you're back online." plus a ghost "Retry" button when the fetch errored. It only shows
  when there are past rows.
- **First load:** grey skeleton rows.
- **Couldn't load (no saved copy):** bare EmptyState with a wifi-off icon, "Couldn't load your
  orders" / "Check your connection and try again." and a "Retry" primary button.
- **Empty (design `RC orders_empty`):** a white card with a 72px `--accent-wash` disc and a receipt
  icon, "Nothing here yet" / "Parcels and food orders both land on this screen — you'll be able to
  reorder from here in one tap.", and the buttons "Find food near you" (primary) + "Send a parcel"
  (ghost). With restaurants off: only "Send a parcel", as primary.
- **No filter, no day grouping, no row actions, no pagination** (the server caps at 50; older orders
  silently aren't shown).

**Current mock** (`RC orders`, the screen this redesign supersedes): the same structure. A live
card "Sadza Republic / On the way · 6 min / $15.50", then "EARLIER" rows "Huku House · Fri ·
delivered · $9.00", "Parcel to Msasa · Thu · delivered · $2.40", "Café Msasa · Wed · refunded ·
$7.50". The mock already wants outcomes, weekday dates and "Parcel to <area>" titles; the app
doesn't draw them.

**Account → Trip history (Rider v2 C13, `app/history/index.tsx?side=customer`):** a pushed screen
(header "‹ Back · Trip history") listing customer orders grouped by day with `LRow` rows ("Avondale →
Belgravia", "Delivered · 30 Sep", price in ink). Empty line: "Orders you place show here." This is the
duplicate the redesign should absorb.

### 5. Design tokens (use only these)

| Token | Value | Notes |
|---|---|---|
| `--ink` | `#14181b` | body text |
| `--muted` | `#5b6670` | secondary text, captions, muted icons |
| `--bg` | `#ffffff` | page / card |
| `--surface` | `#f6f7f8` | sheets, chips, sunken areas |
| `--line` | `#e2e6ea` | borders, dividers |
| `--accent` | `#00b14f` | Grab green: **fills/graphics only** (2.9:1 on white) |
| `--accent-700` | `#009d3b` | pressed fill |
| `--accent-text` | `#006630` | green text & small icons (≈7:1) |
| `--accent-wash` | `#e9f8ef` | mint wash: selected, chips, header card |
| `--cta-fill` | `#00812f` | primary CTA fill (white label ≈4.7:1, sunlight) |
| `--cta-fill-pressed` | `#006b27` | |
| `--highlight` | `#f2b705` | gold: ETA pill / unread dot, sparing |
| `--highlight-wash` / `--highlight-ink` / `--highlight-border` | `#fffcf2` / `#6b5600` / `#f2b70566` | notices |
| `--danger` | `#c0392b` | destructive (borders, fills) |
| `--danger-wash` / `--danger-ink` | `#faedeb` / `#8f2418` | problem outcomes (never red text on white) |
| `--on-accent` | `#ffffff` | text on green/red fills |
| `--tile-send-blob` / `--tile-food-wash` / `--tile-food-blob` | `#cdeeda` / `#fdeadd` / `#fbd9bd` | 8c service tints (parcel = green family, food = peach family) |
| Font | Inter (UI); Fredoka (wordmark only) | weights 400/600/700 |
| Type | display 28 · h1 24 · h2 20 · title 18 · price 20 · body-lg 16 · body 14 · caption/label 12 · micro 10 | tabular numerals for money, codes, times |
| Spacing | 4 · 8 · 12 · 16 · 24 · 32 · 48; screen gutter 16 | |
| Radius | input 12 · card 16 · buttons/pills 999 | |
| Targets | `--target-min` 44 · `--target-primary` 52 | |
| Shadows | card `0 1px 4px rgba(20,24,27,.08), 0 2px 12px rgba(20,24,27,.06)`; sheet `0 -2px 16px rgba(20,24,27,.08)` | |

### 6. States to cover (every one, at 360×720; key ones at 320×640 and font scale 1.3)

**Populated**
- O1 · One live parcel + history (the common case).
- O2 · Two live orders at once (a food order cooking + a parcel finding riders) + history.
- O3 · Live food order in each kitchen phase: waiting for the restaurant · preparing · ready for
  pickup · rider on the way (with ETA).
- O4 · Live parcel in each stage: finding riders (countdown?) · rider assigned · heading to pickup ·
  collected · on the way (with ETA) · rider's GPS not sending (no ETA).
- O5 · History only, no live order.
- O6 · History rows in every outcome: delivered (unrated, with Rate) · delivered and rated · cancelled
  by you · cancelled by the rider/kitchen · no rider found (expired) · not delivered · refunded food.
- O7 · Long names: a 40-character restaurant, a long landmark, font scale 1.3.
- O8 · Filter: Parcels selected · Food selected · a filter with no matches.
- O9 · 50+ orders: what the bottom of the list says.

**Actions from the list**
- O10 · Send again (parcel) tapped → lands in Send a parcel with the copy banner (existing).
- O11 · Order again (food): items all available · some items gone · restaurant closed now.
- O12 · Rate from the row (inline stars or open the order; your call, justify it).
- O13 · Get help on a problem order → WhatsApp.

**Empty, loading, offline, error**
- O14 · First-ever open, loading (skeleton matching the new rows).
- O15 · Empty, restaurants on ("Find food near you" + "Send a parcel").
- O16 · Empty, restaurants off (parcels only, no food promise).
- O17 · Only a live order, nothing earlier yet.
- O18 · Offline cold start with a saved list ("as of 09:24"; live cards show last-known stage, no ETA).
- O19 · Offline with nothing saved.
- O20 · Couldn't load (server error, no saved copy) with "↻ Try again".
- O21 · An action failed (e.g. Order again couldn't start): the `--ink` toast with "↻ Try again".

**Account side effect**
- O22 · Customer Account tab after the change: what happens to the "Trip history" row.

**Retire or redraw:** design ids `RC orders` and `RC orders_empty` (gallery "Home & orders") and Rider
v2 **C13 Trip history**. Say which of these your design replaces.

---

## Part 3: Files to attach to Claude Design (if you can upload files)

From the repo, in priority order:

1. **Today's screen:** `docs/designs/orders-v2/current/*.png`
   - `01-mock-vs-app-populated-and-empty.png`: the current mock (left) vs the app (right), populated
     and empty.
   - `02-app-real-world-mix-360.png` / `03-app-real-world-mix-320.png`: the app with two live orders
     and a realistic history (cancelled, expired, not delivered, rider-carried rows).
   - `04-app-home-tab-for-comparison.png`: the Home tab, for the mint top card and live-order card
     Orders should match.
2. **The style to match:**
   - `packages/design/handoff/home-8c/` (`README.md`, `home-8c.html`): mint top card, live-order card.
   - `packages/design/handoff/after-send-v2/` (`README.md`, `BRIEF.md`,
     `design/After Send v2 (standalone).html`, `design/as-kit.jsx`): stage names, outcome copy, rating
     language, blocking states. These are the screens the rows open.
   - `packages/design/handoff/send-compose-v2/` (`README.md`, `design/Send Compose v2
     (standalone).html`, `design/sc2-kit.jsx`): notices, toast, chips, pill buttons, Send again banner.
   - `packages/design/handoff/rider-v2/` (`README.md`, `design/Rider v2 (standalone).html`,
     `design/rv-kit.jsx`, `design/rv-account.jsx`): `LRow`, day labels, both Account tabs, Trip
     history C13.
3. `packages/design/tokens/colors.css`, `typography.css`, `spacing.css`: token source of truth.
4. `packages/design/explorations/restaurants/r-customer-a.jsx` (`RC.orders`, `RC.orders_empty`): the
   current mock, for content and IA, **not** for style.
5. `packages/design/explorations/journey/All Screens Gallery.html`: every current screen, rendered.

---

## Part 4: After Claude Design returns (for us, not for Claude Design)

Per `CLAUDE.md`, a redesign lands like `send-compose-v2`, `after-send-v2` and `rider-v2` did:

- Export to `packages/design/handoff/orders-v2/` (README, BRIEF, PROMPT (this file), design/,
  screens/).
- Add a **`docs/DESIGN-DEVIATIONS.md`** ledger entry (the next free number, **D-55** at the time of
  writing) that marks `RC orders`, `RC orders_empty` and, if retired, Rider v2 **C13** as superseded.
  The design-freeze CI job requires this for any `packages/design/**` change.
- Add a CLAUDE.md line: "The Orders tab follows its own handoff (`handoff/orders-v2/`)", alongside
  the Send / order screen / rider lines.
- Then align `app/(tabs)/orders.tsx` (and the customer half of `app/history/index.tsx` plus the
  customer Account row, if C13 is retired), move the strings to a `src/ui/orders/copy.ts` (the
  handoff's `O`, verbatim), and update the `tools/parity` targets (`RC.orders`, `RC.orders_empty`,
  and the new state keys). `tools/parity/mobile/fixtures/orders_review_mixed.mjs` already renders
  the messy real-world case.
- Engineering items the brief surfaces (independent of the design, but needed by it):
  - Past food rows route to `/order/:id` (the parcel screen) instead of `/food/order/:id`.
  - The history feed isn't filtered to `role === "customer"` on this tab.
  - Order again (food) has no backend. The history row has no payment method, refund flag, item list
    or delivered-at time, if the design asks for them.
