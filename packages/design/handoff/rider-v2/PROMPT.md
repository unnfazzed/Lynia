# LyniaGo Rider app: UX/UI improvement brief for Claude Design

> **How to use this:** paste **Part 1 (the prompt)** into Claude Design as your first message, then
> paste **Part 2 (the current-state reference)** right after it, or attach this whole file. If you can,
> also attach the files listed in **Part 3**. Claude Design can't see the repo, so this file has to
> carry everything.

---

## Part 1: The prompt (paste this first)

You are redesigning the **rider side of LyniaGo**, a delivery app in Zimbabwe (Harare first). One
Android app (Expo / React Native) serves customers and riders. A rider is a customer who passed ID
and bike verification (KYC). Riders carry two kinds of job:

- **Parcels ("Send")**: the customer posts a parcel with an asking price, and nearby riders **make an
  offer** (accept the asking fare or name their own, plus "you'll be there in N min"). The customer
  picks one rider. The customer usually pays cash at the door, and that cash is the rider's.
- **Food (Restaurants)**: auto-dispatch. One rider gets a full-screen **offer** with about 60 seconds
  to accept. Sometimes the rider pays the kitchen up front and collects the food money at the door.
  That cash is owed back to the kitchen, not the rider's.

The rider pays LyniaGo a **commission from a prepaid wallet** (topped up with EcoCash, InnBucks or
O'mari mobile money). If the balance falls below a floor (default $2), the rider can't take jobs.

**Who the users are:** motorbike riders on cheap Android phones, often in bright sun, often with one
hand on the bars, on patchy 2G/3G data, with mixed literacy (English is the UI language). They are
paid in cash. Their time is money, and a confusing screen costs them a job.

**What I want from you:** a redesigned, coherent, high-fidelity rider experience, **plus a redesign
of the Account section and Settings for BOTH the customer and rider sides** (see "Account, the
role switch and Settings" below). Cover these areas in this priority order:

1. **Jobs (home / board):** the rider's home while working. It covers the list of nearby jobs, making
   an offer on a parcel, "your offers" waiting on customers, "a customer picked you", and every gate
   that stops a rider working (KYC pending/failed/expired, no GPS, out of area, cooldown, suspended,
   balance too low).
2. **The active job:** one screen pattern for parcel and food, built as the **rider-side mirror of
   the customer's After Send screen** (same map + stage-driven sheet + step track + CTA bar). Pickup → (verify items / photo proof)
   → drop-off → 6-digit delivery code → done. It also covers cash held ("yours" vs "owed to the
   kitchen"), SOS, get help, and the exceptions (wrong code lockout, can't reach the customer, can't
   deliver, cancel or drop the job, connection lost mid-job, customer cancelled).
3. **Money:** commission balance, top-up, cash held, and a history of what came in and went out. Add
   **what the rider earned** (today, this week). Today the tab only tracks commission, and riders
   care most about their earnings.
4. **Account and Settings:** identity and verification status, bike & documents, job history,
   notifications, help & support (WhatsApp + safety line), settings (location, notifications,
   language, payment, privacy, terms, sign out, delete account), and switching back to the customer
   side. This is now a **joint customer + rider redesign**. The full spec is in the section below.
5. **Food offer:** the full-screen timed accept/decline.

**Decided for this redesign (owner answers, 2026-10-01). Treat these as final:**

- **Top priorities, all four:**
  1. **Map + demand on the Jobs board.** Show job pins on a map, plus where it's busy. Riders should
     no longer read a text list and guess.
  2. **Earnings first on Money.** "Today" and "This week" earnings + trips are the hero. The
     commission balance comes second. It still drives the top-up gate and stays clearly visible.
  3. **A simpler active job.** One dominant current step and one primary action. Every exception
     sits behind a single "Problem with this job?" entry.
  4. **Reliability & rating made visible:** rating, acceptance, strikes, and "one strike from a
     pause" warnings. These go on Account (and as a warning wherever a strike can happen).
- **Always online stays.** No Online/Offline toggle. Switching to the customer side is how a rider
  stops receiving jobs. Say that clearly on the switch.
- **Food: design both states.** The main design assumes parcels + food. Also draw the parcels-only
  variants (food dispatch off) for the board, its empty state and Money.
- **History is split by side.** The rider's "Job history" shows only jobs they carried, with the fare
  earned. The customer's "Trip history" shows only orders they placed.

### Account, the role switch and Settings (customer AND rider)

One LyniaGo account can be a customer only, or a customer + rider. Redesign the **Account tab on both
sides** and the shared **Settings** screen so the two roles are obviously separate, and moving between
them is one visible tap.

**The role switch:**
- At the **top of the Account tab on both sides**, directly under the identity card, put an
  always-visible **segmented toggle "Customer | Rider"**. The current side is selected. It's 44px
  minimum height, labelled, and is the most obvious control on the screen.
- Switching to Rider lands on Jobs. Switching to Customer lands on Home.
- **Rider → Customer while able to take jobs:** show a confirm sheet saying the rider will stop
  getting jobs. Current copy: "Go to customer view" / "Stay online as a rider". **During an active
  job:** explain that the job continues and they can come back to it. Don't silently drop it.
- **A customer who is not a rider** doesn't see the toggle. In the same spot, show a **"Become a
  rider" card** ("Earn with your bike", leading into the KYC flow). Design these states:
  - KYC in progress: "Finish verifying your ID"
  - Under review
  - Failed
  - Verified: the toggle appears
- Design both Account tabs as **siblings**: the same identity card, the same toggle, the same row
  style. Each side shows only its own items.

**Customer Account** (today: identity card, then rows Notifications · Help & support · Settings,
then a bridge row "Switch to rider" / "Become a rider"). Redesign it around the toggle / Become-a-rider
card, and add **Trip history** (customer orders only). Keep it lean.

**Rider Account** (today: seven look-alike rows, and the identity card can't be tapped). It should
show:
- The identity card with **rating, jobs completed and verified status**.
- A **reliability card**: acceptance, strikes and the pause threshold, written in plain words (this
  covers mocks `RJM strikes` / `strikes_final`).
- Rows: Job history (rider only) · Notifications · Help & support · Settings.
- Remove the "Money" row, because it duplicates the tab.

**Settings: one screen, clearly separated into sections:**
1. **Your account (shared):** name and phone, Language, Privacy notice, Terms & conditions, Sign out,
   Delete account (danger, last).
2. **Customer:** Payment ("Cash"), and the customer's notification consequence ("You won't hear when
   a rider offers or when your parcel arrives").
3. **Rider (shown only to riders):**
   - **Job alerts.** Test the new-job ping and the looping food-offer alarm. A strong warning when
     notifications are off: "You won't get new jobs".
   - **Location.** It must be on to receive jobs, with rider-specific consequence copy.
   - **Navigation app.** Choose Google Maps or Waze for pickups and drop-offs.
   - **Top-up number.** Default mobile-money number + provider (EcoCash / InnBucks / O'mari),
     prefilled into Top up.
   - **Bike & documents.** KYC status, plate, ID expiry, and the re-verify path. This moves here from
     the Account rows.

Permissions (location, notifications) read the phone's real state ("While using" / "Off"). They're
never hardcoded. There is **no "Edit profile"** row and no "coming soon" items. The design must look
right for a customer-only user (no Rider section at all) and for a rider.

**Hard constraints. Don't break these:**

- **Platform & frames:** Android phone. Design at **360×720**, and every screen must also work at
  **320×640**. Content scrolls, and nothing may hide under a bottom CTA bar or the tab bar.
- **Tabs stay:** `Jobs · Money · Account`. This mirrors the customer app's `Home · Orders · Account`.
- **Always online:** riders don't toggle a shift. Being past every gate *is* being online. There is no
  "Go online / Go offline" button. Show connection state honestly (Online / Reconnecting) without
  adding a control.
- **No manual refresh anywhere:** no pull-to-refresh, no "Refresh" buttons. The app updates itself
  (socket + polling + on resume). Design empty and stale states that say what the app is doing.
- **One job at a time.** No batching. Jobs that get taken disappear from the list. Parcel cards have
  **no countdowns**. Only the food offer is timed.
- **Tap targets:** ≥ **44px** for everything and **52px** for the one primary CTA per screen. Draw
  them at that size. Every icon carries a visible text label.
- **Map conventions (app-wide):** pickup = **green dot**, drop-off = **red square**, rider = **dark
  bike disc**.
- **Money:** USD, tabular numerals, "+$2.40" credits in green text, debits in ink. **Never red text on
  white.** Danger uses the red wash fill with dark-red ink.
- **Vocabulary (use it exactly):** *Job* = anything a rider carries. *Order* = what the customer
  placed. *Fare* = what the rider earns. *Collect* = money taken at a door. *Delivery code* = the
  6-digit hand-off proof, the same in both verticals. Say *LyniaGo* (not Lynia). Payment prompts and
  OTPs are **SMS**. Help & support routes to **WhatsApp**, with a **call the safety line** option.
- **Use only the existing design tokens** listed in Part 2. If you genuinely need a new token, name
  it, give its value and justify it.
- **Visual language: match the NEW customer Send UI.** Two handoffs set the current style: **"Send a
  parcel v2"** (the customer's 4-step compose) and **"After Send"** (the order screen: one full-bleed
  map with a bottom sheet that changes with the order status). The rider app must look like the same
  product, and the rider's active job is literally **the other side of the customer's After Send
  screen**. Reuse that kit as-is, and don't invent parallel components:
  - **Header** (pushed screens): 52px white bar with a 1px `--line` bottom border. On the left, "‹
    Back" (ChevronLeft 22 + "Back" 15/600 `--accent-text`, 44px tall). In the centre, a title 16/700.
    On live jobs only, a red-outlined **"Help"** pill on the right (LifeBuoy + "Help" 13/700
    `--danger`, 34px visual / 44px hit area). Titles are human stage names ("Heading to pickup",
    "Arriving now"), never ids or raw statuses.
  - **Full-bleed map + bottom sheet** for the active job (and ideally the board). The sheet has a 16px
    top radius and a 36×4 grabber. It snaps between peek and full. Each stage sets its own peek
    height, and the map re-fits so pins never hide under the sheet. Sheet content scrolls.
  - **Map styling:**
    - Pickup: a 22px `--accent` circle with a white ring and a "Pickup" pill.
    - Drop-off: a 20px `--danger` square with a "Drop-off" pill.
    - Route: 5px `--accent` line.
    - Rider: a 34px `--ink` disc with a white Bike icon and a name pill. On the rider's own map this
      is "You". Paused state: muted disc and "Last seen…".
    - Heading to pickup: a dotted `--ink` line from the rider to the pickup.
    - No Expand/Recenter buttons.
  - **CTA bar:** pinned bottom, white, `--shadow-sheet`, padding 10 16 12. Buttons are 52px pills at
    16/700:
    - Primary: `--accent` fill.
    - Ghost: white, 1.5px `--line` border, `--accent-text`.
    - Ghost-danger: the ghost with `--danger` text.
    - Layouts: stacked or side-by-side, with an optional one-line 13px `--muted` hint above saying
      only what's missing.
  - **Step track:** 4 columns with 20px circles and 3px connectors.
    - Done: `--accent-text` circle with a check.
    - Current: `--accent-text` circle with a 4px `--accent-wash` halo, label 700 `--ink`.
    - Upcoming: `--surface` circle with a `--line` border.
    - Use it for the parcel / food job stages.
  - **Send v2 parts:**
    - Step bar (4 columns, circle, label, 3px bar): for multi-step flows like top-up and KYC.
    - Fields: 48px, radius 12, focus 2px `--accent-text`, error 2px `--danger` + "ⓘ message".
    - Big-price control: 56/700 price, tap to type, 52px "− $0.50 / + $0.50" ghost buttons, and a
      "usual" band bar. Use it for the rider's **name-your-fare offer**, which mirrors the customer's
      price step.
    - Route strip: 64×56 mini-map + pickup/drop-off lines + "✎ Edit".
    - Notices: calm = `--surface` / `--line`; warn = white with a 1px `--danger` border. Warn notices
      are hints, never blocks.
    - `--ink` toast with a "↻ Try again" button.
    - Countdown pill (`--surface`, timer icon, "0:42 left", 4px progress bar). Use it for the
      60-second food offer.
    - Small 44px pill buttons (ghost / fill / white).
    - Offer card anatomy: avatar, name, ★ rating · trips, ETA, price + action.
    - Delivery-code card on `--accent-wash`.
    - Blocking state: a 72px `--surface` circle with a 32px icon, a 22/700 title, a 15/22 `--muted`
      line, and primary + ghost at the bottom. Use it for every **gate** (on hold, cooldown, out of
      area, KYC…).
  - **Labelled icons everywhere** ("✎ Change", "↻ Try again", "📞 Call support"). Use Lucide icons
    from the app's existing subset. Type scale from the Send kit: 56 price, 22 titles, 16 header/CTA,
    15 values, 13 labels/chips, 12 hints and uppercase 12/600 labels.
  - **Tab roots** (Jobs, Money, Account) keep the customer home's "8c" mint top card (greeting +
    sun/moon sticker + bell). **Every pushed or flow screen** (offer, active job, food offer, top-up,
    gates, settings sub-screens) uses the Send v2 / After Send header, sheet and CTA bar above.

**What I'm unhappy with today (fix these, and find more):**

- The **board is a long list of text cards** with no sense of *where* jobs are. There's no map, no
  "how far to pickup", and nothing that says whether the area is busy or quiet. Riders guess where to
  wait.
- **Making a parcel offer** is two plain text fields (fare, ETA in minutes) inside the list. It needs
  to be fast, one-handed and hard to fat-finger. Reuse the **Send v2 price step** (big tap-to-type
  price, − / + $0.50, "usual" band), add ETA chips, and add a route strip at the top.
- **Gates are a single generic empty-state card** (icon, title, sentence, button). They feel like
  dead ends. Each should say *why*, *what to do* and *when it'll clear* (cooldown time left, amount
  to top up).
- **The active job screen is a long scroll** of cards with up to **five different ghost buttons**
  ("Can't complete delivery", "Cancel job", "Drop this job", "Can I drop this job?", "Can't reach the
  customer?"). The current step and its one primary action should dominate. Exceptions belong in one
  calm "Problem with this job?" entry.
- **Money is commission-only.** The hero card is "COMMISSION BALANCE". There's no earnings summary,
  "cash yours" always reads $0 on the tab, the food filter mostly says "isn't live yet", and older
  history sits behind a "Load older" button. Riders want to know: *what did I make today, and can I
  keep working?*
- **Account is seven same-looking rows** (Bike & documents, Job history, Money (duplicating the tab),
  Notifications, Help & support, Settings, Switch to customer). The identity card can't be tapped.
  Reliability/strikes and rating aren't visible anywhere, even though a strike system exists.
- **Settings is shared with the customer** and carries customer copy (e.g. turning notifications off
  warns "You won't hear when a rider offers…"). Riders need rider-specific consequences: missed job
  pings, and the fact that location must be on to receive jobs.

- **Customers and riders share one Account/Settings design** today, but it's the rider's row
  grammar bolted onto the customer side. The switch between roles is a row at the bottom of a list,
  easy to miss.

**Deliverables (same shape as our previous handoffs, e.g. "After Send" and "Send a parcel v2"):**

1. `BRIEF.md`: the product decisions you made, as short final statements, plus any open questions.
2. `README.md`: screen list, navigation rules, the global constraints above, and a token table that
   says where each token is used.
3. A standalone HTML prototype with a player (← → keys) showing **every state at 360×720** and the
   key states at **320×640**.
4. A kit file holding the shared parts **and one object with every user-facing string**. Copy ships
   verbatim, so write final copy, not lorem.
5. 2× PNG renders of every state.

Cover **every state listed in Part 2 §6**, plus anything new you introduce: the earnings summary,
the reliability card, the **customer Account** (customer-only user, customer + rider, and each
Become-a-rider stage), the **rider Account**, the **role-switch confirm sheets** (able to take jobs /
active job), **Settings as a customer-only user and as a rider**, the split Job history / Trip
history, and the board map with demand. For each existing screen, say whether you're **keeping, redesigning,
merging or retiring** it.

---

## Part 2: Current-state reference (paste after the prompt)

### 1. Product rules already decided (July–Aug 2026, owner-approved)

1. One rider app for parcels and food. **One board**, with cards tagged `PARCEL` / `FOOD`.
2. **One commission model:** a prepaid wallet for both services, with the same % deducted when a job
   closes. One balance, one go-online gate. (Currently the rate may be 0%, in which case the copy says
   riders keep the full fare.)
3. **One job at a time.** No opt-out of a vertical: online means online for everything.
4. **One Money tab:** commission balance + cash held + one ledger filterable by service.
5. **Cash is split**, "yours" vs "owed to a kitchen", and always on screen while carrying.
6. **Tab bar `Jobs · Money · Account`.**
7. **Always online** (Aug 17): no shift toggle. **No manual refresh** anywhere (Aug 16).
8. *(Being replaced by this redesign: see "Account, the role switch and Settings".)* Today the
   rider → customer switch is the last row on the Account tab ("Switch to customer · Order food and
   send parcels"). If the rider is online or mid-job, it asks for confirmation first ("Go to customer view"
   / "Stay online as a rider").
9. Food offers hold for **60 seconds**, then go to the next rider. Passing or missing one doesn't
   affect standing.
10. Parcel offers: **one offer per job** (accept the asking price or counter, one round only).
11. Delivery-code entry allows 5 attempts, then locks out and the customer re-issues the code.
12. Food dispatch is behind a feature flag (`merchantDispatchAutoEnabled`, currently **off**). With it
    off, the board is parcels-only and the copy must not promise food jobs.

### 2. Rider journey, end to end

```
Sign in (phone + SMS OTP) → Choose role → Location + notification permissions
  → Become a rider (KYC: ID check via Didit in-app web sheet, rider photo, bike) → pending / verified
  → JOBS board (always online)
       ├─ Parcel card → "Make an offer" → fare + ETA → "Send offer" / "Skip this job"
       │     → "Your offers" (waiting) → "A customer picked you!" → Open job
       │     → or: not chosen / job taken first / auction expired
       └─ Food offer (full screen, 60s) → "Accept this job" / "Not this one" → or expired
  → ACTIVE JOB
       Parcel: to sender → verify items (+ proof-of-pickup photo) → collected → to drop-off
               → delivery code (6 digits) → delivered → rate sender
       Food:   to restaurant → (pay the merchant, upfront kitchens only) → collected → to customer
               → collect cash at the door → delivery code → return cash to kitchen (if owed)
       Always: cash-held strip, SOS, Get help with this job, Report customer
       Exceptions: wrong code / lockout, can't reach customer, undelivered (unreachable / refused /
               wrong address), rider cancels (bail, hits reliability), drop the job (food),
               customer cancelled, connection lost (job saved locally, syncs on reconnect)
  → MONEY: balance, Top up (provider → amount → phone → approve on phone → success / declined)
  → ACCOUNT: identity, Bike & documents, Job history, Notifications, Help, Settings, Switch to customer
```

### 3. What each main screen looks like today

**Jobs tab (board), `app/rider/(tabs)/index.tsx`**
- Header: the 8c **mint top card**. It has a two-line time-aware greeting (e.g. "Good morning,
  Tendai"), a sun/moon sticker, a 42px bell with a gold unread dot, and a sub-row showing the
  **detected current location**. No search bar.
- Status row: a small "Online" pill (or "Reconnecting" when the socket drops).
- List: `JobCard`s. Each has a PARCEL/FOOD tag, "pickup → drop-off" landmarks, a distance label, the
  fare (money line), a note, and one primary action ("Make an offer").
- Tapping "Make an offer" expands an offer card. It shows the PARCEL tag, "Sender asking $X", a field
  "Your fare (USD)" (prefilled with the asking price) with the hint "Ask for more if the trip's worth
  it — the customer accepts or declines. One offer per job.", and a field "You'll be there in"
  (minutes) with the hint "Be honest — arriving late is what loses you the next job." Footer: "Send
  offer" + ghost "Skip this job".
- "Your offers" section lists sent bids waiting on the customer.
- "A customer picked you!" banner + "Open job".
- Empty state: a card with an inbox icon, "Nothing in range yet", and "You'll see parcels here the
  moment they're posted near you. Jobs that get taken simply leave the list." No button.
- Gates replace the list with an EmptyState (title + message + button):
  - Not a rider: "Set up as a rider" → "Become a rider"
  - KYC pending: "Your ID is under review" / "Finishing verification…" / "Finish verifying your ID"
  - KYC failed: "We couldn't verify your ID" → "Try again" (after 2 fails: contact support only)
  - KYC expired: "Your ID has expired" → "Re-verify my ID"
  - Can't open the ID check: "We couldn't open the ID check" → "Try again" + "Contact support"
  - No GPS: "Can't find your location" → "Open location settings" + "I've turned it on"
  - Server refusals: "You're outside the service area", "You're on a cooldown", "Your account is
    suspended", "Your account is banned", "Your account is on hold", "Top up to keep riding" → "Go to
    Money"
  - Gates with no action also show a ghost "Order food and send parcels" bridge to the customer side.
- Load error: "Couldn't load nearby orders" → "Retry".

**Food offer, `app/rider/food-offer.tsx`**
- AppBar "Food job", with sub "pickup → drop-off". Offer card (restaurant, customer area, fare, cash
  to collect if any). Buttons: "Accept this job" / ghost "Not this one".
- Expired: "That one went to another rider" / "Offers hold for 60 seconds, then move to the next rider
  nearby. Passing or missing one doesn't affect your standing." → "Back to the board".

**Active job, `app/rider/job.tsx` (parcel) and `app/rider/food-job.tsx` (food)**
- AppBar + status pill, a stepper, a job details card (landmarks, phones, call buttons), a pickup
  checklist (verify items), a proof-of-pickup photo, a cash strip ("YOURS $x / OWED $y"), the
  delivery-code input (6 boxes) with "Confirm delivery" and "Call sender to re-send code", the SOS
  control, Get help, Report.
- Ghost exits stacked at the bottom: "Can't complete delivery", "Cancel job" (parcel); "Can't reach
  the customer?", "Drop this job", "Can I drop this job?" (food). Bottom-sheets: Bail, Undelivered,
  Cancel-blocked.
- Terminals: delivered (with a small celebration) → rate sender → "Back to board"; undelivered done;
  cancelled hand-back; food "Back to board — I'll return the food".
- A "Job restored" banner appears after an app restart. Offline banner: "Reconnecting… your data may be
  a moment behind".

**Money tab, `app/rider/(tabs)/money.tsx`**
- Heading "Money".
- Hero card (accent-bordered white card): eyebrow "COMMISSION BALANCE" (or "GRACE CREDIT · BALANCE"
  on first open), balance at 28px, a one-line explainer ("10% comes off this balance when a job closes
  — parcels and food, same rate. Run it to zero and you can't go online."), and a "Top up" button.
  Low states switch the card to the red wash: "Getting low — top up soon…", "Below the $2.00 floor —
  top up to keep riding.", "You owe this — your next top-up clears it first."
- A pending top-up recovery banner (succeeded while the app was closed / still waiting / didn't go
  through).
- Cash-held strip: YOURS / OWED (YOURS is always $0 on this tab).
- Filter chips: All · Parcels · Food.
- Ledger rows: icon circle, title, "meta · date time", amount (+green / −ink). "Load older" ghost
  button.
- Empty: "Nothing here yet — Your commission history starts with your next ride…".
- **Missing:** earnings totals (today/week), trips count, the fare earned per job.

**Top up, `app/wallet/top-up.tsx` + `src/ui/rider/TopUpFlow.tsx`**
- Back row "Money". Provider choice: EcoCash / InnBucks / O'mari ("Approve on your phone"). Amount
  (USD). Phone number ("This is the number that gets the payment prompt — change it if you'd pay from
  another line."). Request → wait (about 90s, approve the SMS/USSD prompt on the phone) → success
  ("Back to Money" / "Top up again") or declined/timed out ("Try again", call LyniaGo support).

**Account tab, `app/rider/(tabs)/account.tsx`**
- AppBar "Account". Identity card (not tappable): avatar circle, name, "★ 4.9 · 312 jobs · verified"
  line, and an Online/Offline pill.
- One card of rows (icon · label · sub-line · chevron):
  1. Bike & documents: "Verified · view your documents" / "Verify your ID and register your bike."
  2. Job history: "Parcels and food in one list" (shared screen with the customer's trip history)
  3. Money: "Balance, cash held, commission" (duplicates the tab)
  4. Notifications: unread count
  5. Help & support: "Call the safety line"
  6. Settings: "Permissions, privacy and sign out"
  7. Switch to customer: "Order food and send parcels"

**Settings, `app/settings/index.tsx` (shared with customer)**
- AppBar "Settings". Identity row (short name + phone). Rows with right-hand values: Location ("While
  using" / "Ask every time" / "Off", which opens OS settings), Notifications (On/Off + a consequence
  line), Language "English", Payment "Cash", Privacy notice, Terms & conditions, **Sign out** (danger),
  **Delete account** (danger). There's no "Edit profile" row (removed on purpose; don't add a
  "coming soon").

**Other rider screens:** Bike & documents (`app/rider/documents.tsx`), Become a rider / KYC
(`app/rider/become.tsx`), Notifications inbox (shared), Help (shared, WhatsApp + safety line), Job
history (shared).

### 4. Design tokens (use only these)

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
| `--highlight` | `#f2b705` | gold: "recommended"/unread dot, sparing |
| `--highlight-wash` / `--highlight-ink` / `--highlight-border` | `#fffcf2` / `#6b5600` / `#f2b70566` | notices |
| `--danger` | `#c0392b` | destructive |
| `--danger-wash` / `--danger-ink` | `#faedeb` / `#8f2418` | low balance, gate reason (never red text on white) |
| `--on-accent` | `#ffffff` | text on green/red fills |
| `--tile-send-blob` / `--tile-food-wash` / `--tile-food-blob` | `#cdeeda` / `#fdeadd` / `#fbd9bd` | 8c service tints |
| Font | Inter (UI); Fredoka (wordmark only) | weights 400/600/700 |
| Type | display 28 · h1 24 · h2 20 · title 18 · price 20 · body-lg 16 · body 14 · caption/label 12 · micro 10 | tabular numerals for money, codes, times |
| Spacing | 4 · 8 · 12 · 16 · 24 · 32 · 48; screen gutter 16 | |
| Radius | input 12 · card 16 · buttons/pills 999 | |
| Targets | `--target-min` 44 · `--target-primary` 52 | |
| Shadows | card `0 1px 4px rgba(20,24,27,.08), 0 2px 12px rgba(20,24,27,.06)`; sheet `0 -2px 16px rgba(20,24,27,.08)` | |

### 5. Known gaps from earlier audits (worth solving in the redesign)

- No **demand hint** (where is it busy?) and no **"why am I not getting jobs"** explanation.
- No **ETA-slip / running late** signal to the customer.
- **Reliability is invisible**: bails create strikes (and "one strike from a pause"), but the rider
  never sees a score, acceptance rate or rating trend. Mocks `RJM strikes` / `strikes_final` exist but
  aren't built.
- Locked out of the delivery code: the rider needs a clear "ask customer to re-send" path.
- Offer can't be withdrawn once sent.
- **Notifications-denied** silently kills the rider's job pings. It needs a strong, rider-specific
  warning.
- Low-bandwidth: the job is saved locally, but the UI should make "still saved" vs "something's wrong"
  obvious if the connection stays dark for minutes.

### 6. Full current screen inventory (cover all of these)

Design gallery ids (`RJM` = current one-app rider mocks, `RJ` = older rider mocks still current):

- **First run & sign in:** RJ splash, onboard, login, otp, role_select, perm_loc, perm_notif
- **Become a rider (KYC):** RJ kyc_intro, kyc_form, photo_capture, photo_preview, photo_uploading,
  kyc_pending, kyc_unfinished, kyc_cant_start, kyc_verified
- **Online & the board:** RJM offline, board, board_empty, notifications, board_food_off,
  board_empty_food_off
- **Taking a job:** RJM offer_parcel, RJ offer_sent, RJ picked, RJM offer_food
- **Active job:** RJM active_parcel, RJ job_assigned, job_pickup, job_verify, job_collect,
  job_dropoff, RJM active_food, RJM handoff, RJ job_handoff, job_delivered, RJM pickup_photo,
  pickup_photo_preview
- **Money:** RJM money, RJM gate_topup, RJ topup_amount, topup_wait, topup_success, wallet_low
- **Account & support:** RJM account, RJ bike_docs, history, settings, help, RJM strikes
- **Trust & safety:** RJ sos_idle, sos_confirm, sos_contacts, report, report_done, job_help,
  job_help_sent
- **Exceptions:** RJ missed_order, not_chosen, bid_expired, handoff_wrong, undelivered, job_bail,
  job_offline, job_cancelled, kyc_failed, kyc_expired, photo_failed, gate_out_of_area,
  gate_cooldown, gate_banned, gate_kyc_locked, topup_declined, offline, on_hold, force_update,
  no_gps, generic_error, RJM pickup_photo_failed, RJM strikes_final

**Retired (don't bring back):** RJ wallet and RJ earnings (merged into the Money tab), RJ
home_launcher, the old weekly-15% settlement model, a separate "Go online" toggle, and any
pull-to-refresh or Refresh button.

---

## Part 3: Files to attach to Claude Design (if you can upload files)

From the repo, in priority order:

1. **The new Send UI (the style to match). Attach these first:**
   - `packages/design/handoff/send-compose-v2/README.md`, `PROMPT.md`, and
     `design/Send Compose v2 (standalone).html` + `design/sc2-kit.jsx` (header, step bar, CTA bar,
     fields, price control, notices, toast, map pins).
   - `packages/design/handoff/after-send/README.md`, `BRIEF.md`, `design/as-kit.jsx`,
     `design/After Send (standalone).html` and a few `screens/*.png` (map + sheet, step track, rider
     marker, Help pill, delivery-code card, blocking states).
2. `packages/design/explorations/journey/rider-one-app.jsx`: the current RJM rider mocks (board,
   offers, active jobs, Money, Account). Use these for content and IA, **not** for style.
3. `packages/design/tokens/colors.css`, `typography.css`, `spacing.css`: token source of truth.
4. `packages/design/handoff/home-8c/`: the mint top card used on the tab roots.
5. `packages/design/explorations/journey/All Screens Gallery.html`: every current screen, rendered.
6. `packages/design/RIDER-ONE-APP-PLAN.md` and `RIDER-JOURNEY-AUDIT.md`: the reasoning behind the
   current model and the known gaps.
7. Screenshots of today's app: phone screenshots, or the PNGs from the `parity-render` CI job.

---

## Part 4: After Claude Design returns (for us, not for Claude Design)

Per `CLAUDE.md`, a redesign lands like `send-compose-v2` and `after-send` did:

- Export to `packages/design/handoff/rider-v2/` (README, BRIEF, design/, screens/).
- The Account/Settings part supersedes ledger entries **D-15, D-16, D-22, D-25 and D-26**. Retire
  them in the new entry. They were approved by you, so the new handoff replaces them, not the code.
- Add a **`docs/DESIGN-DEVIATIONS.md`** ledger entry (the next free D-number) that marks which
  `RJM`/`RJ` gallery screens the handoff supersedes. The design-freeze CI job requires this.
- Add a CLAUDE.md line: "The rider app follows its own handoff (`handoff/rider-v2/`)".
- Then align `app/rider/**`, `app/wallet/top-up.tsx` and the rider half of `app/settings` to it, and
  update `tools/parity` targets.
