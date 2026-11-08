# LyniaGo shop share links: design brief for Claude Design (v1, 2026-11-08)

> **How to use this:** paste **Part 1 (the prompt)** into Claude Design as your first message, then
> paste **Part 2 (the reference)** right after it, or attach this whole file. Then attach the files in
> **Part 3** in that order (the first group is the "send these first" set if you're uploading from a
> phone). Claude Design can't see the repo, so this file carries everything it needs.
>
> Every decision below was already taken by the owner (plan `docs/plans/2026-11-07-shop-share-links.md`,
> design review DR1–DR16 and eng review D2–D6, 2026-11-07/08). They are **final**, not suggestions.
> What Claude Design owns is the look, the layout inside those decisions, and the final copy.

---

## Part 1: The prompt (paste this first)

You are designing **shop share links** for **LyniaGo**, a delivery app in Harare, Zimbabwe. One Android
app (Expo / React Native) serves customers and bikers. There is also a customer **web app**
(`app.lyniago.com`, used by iPhone owners until the App Store release) and a **merchant app** (a phone
web app for restaurants, shops and pharmacies). Customers order food, shop items and over-the-counter
pharmacy items, and pay cash at the door. Restaurants, shops and pharmacies are all live.

**The feature in one line:** a restaurant, shop or pharmacy shares a link to its shop, e.g.
`lyniago.com/s/7KQ2MX`, mostly on WhatsApp (Status, groups, chats). Customers can share the same link
with friends. Whoever taps it **downloads LyniaGo, signs up, lands on that shop**, and buys through the
checkout that already exists. Nobody sees a shop's menu before signing in.

**Who the users are:** people in Harare on cheap Android phones, patchy 2G/3G data, bright sun, mixed
literacy (UI language is English). The person tapping the link has often **never heard of LyniaGo**;
all they know is "my favourite chicken place sent this". Every screen between the tap and the shop must
keep answering *"am I still on my way to that place?"*

**What I want from you:** one coherent, high-fidelity design for the whole share journey, as a
handoff package (deliverables below). It **extends existing screens**; it does not redesign them:

1. **Merchant: "Share your shop"** — a row on the merchant **Shop front** tab, and the **share sheet**
   it opens.
2. **Customer: the share button** on the store page (restaurant, shop and pharmacy).
3. **The landing page** `lyniago.com/s/<CODE>` and the **WhatsApp preview card**.
4. **The way in:** the "Taking you to <Shop>" chip across sign-in, code, profile and permission screens.
5. **Arrival:** the store page opened from a link, with its loading, no-address, out-of-area,
   not-found, busy-user and biker states.

### Decisions already made (final)

| # | Decision |
|---|---|
| DR1 | Merchant entry is a **"Share your shop" row at the top of the Shop front tab**, beside the cover and logo they already edit. **Not** on the mint top card. |
| DR2 | Merchant share sheet, top to bottom: (1) a **preview of what customers will see** (cover, logo, name), (2) **Share on WhatsApp**, the primary button, opening WhatsApp's chat/Status picker, (3) **Copy link**, (4) **QR for the counter**, (5) the link as text. |
| DR3 | Customer **share button: a third 44px round button beside Search** on the store cover (and the no-cover tint band) and in the scrolled compact bar. Back left; Search, Share right. On restaurants, shops **and** pharmacies. Opens the phone's own share menu. |
| DR4 | **Every visitor passes through the landing page** (D7), Android too. Phones with Google Play continue to Play / the app by themselves; phones without Play (Huawei etc.) get **"Order on the web"**. Four states: Android with Play, Android without Play, iPhone, desktop (QR). |
| DR5 | Unknown / not-live / paused code → a **full-screen empty state** (the app's one EmptyState: 64 mark in an 88 halo, title, ≤1 line, ≤1 soft pill), e.g. "This shop isn't on LyniaGo right now" + "Browse restaurants". Never reveals which reason. |
| DR6 | The merchant row is **hidden until the shop is live** (approved, not paused). No disabled sheet. |
| DR7 | Arrival shows the **existing store skeleton** at once; no network or no answer after ~10 s → the standard "Can't reach LyniaGo" empty state with **Try again** (the shop is kept). |
| DR8 | Arrival draws two address states: **no delivery address** → a "Set where to deliver" line in place of the time and fee cells, opening the address picker; **outside the delivery area** → a strip "<Shop> doesn't deliver to <area> yet", prices and photos visible, + buttons off. |
| DR9 | A link never interrupts. With a cart at another shop, the existing **"Start a new cart?"** sheet (I3) handles it when they add, naming both shops. Over a live-order screen the shop opens on top; Back returns to the order. |
| DR10 | The preview card never looks broken: no cover/logo → a card from the service tint + initial; dead code → a **generic LyniaGo card** naming no shop. |
| DR11 | **Shortest path:** a link visitor **skips the intro (onboarding) screens** and goes straight to phone sign-in. A small chip **"Taking you to (logo) <Shop>"** sits on the phone, code, profile and permission screens. If the name can't load, it reads "Taking you to the shop". |
| DR12 | iPhone uses the **web app** until the App Store release, same chip, same skip. The **Add to Home Screen tip waits until after the first order** from a link. |
| DR13 | A **biker** who taps a shop link gets a small sheet: "This is a shop link. Open as a customer?" [Open as customer] [Stay on jobs]. |
| DR14 | The landing page is **shop-first, in lyniago.com's visual language**: the shop's own cover and logo as the hero, its name, one line, **one** primary button for the visitor's device, a quiet secondary. **No** feature boxes, store-badge rows or marketing copy. |
| DR15 | Every screen and state at **360×720 and 320×640** (landing also at desktop). Share button label "Share <shop name>"; the chip announced once; the QR always has the link as text beside it; targets ≥ 44 (52 primary); shop names wrap to two lines then ellipsis (test a 40+ character name). |
| DR16 | Before sign-in, only a live shop's **name, logo and cover** are public (for the preview card and the chip). No menu, prices or hours. |

### Hard constraints. Don't break these.

- **Extend, don't redraw.** The store page is Browse v2 (S1/S3/S4), sign-in is Calm Mint v2 / First Run
  v2, the merchant app is Merchant v2 + Shop front v1, empty states are Empty States v2. Reuse their parts
  exactly; add only what this feature needs. Not drawn ⇒ not built, so draw every new element.
- **Frames:** customer app and merchant app **360×720**, with **320×640** for every state. The landing
  page at **360×720, 320×640 and 1440×900** (desktop).
- **Tokens:** use only the attached token sets (Calm Mint v2 for the apps, the website's own for D7/D8).
  Zero shadows in the apps. If you need a new token, name it, give its value and justify it.
- **Targets:** ≥ 44px (`--target-min`) for everything, 52px (`--target-primary`) for the one primary CTA.
  Draw them at that size.
- **Copy:** final copy, not lorem. **"Biker", never "rider"** in anything a user reads. Say **LyniaGo**.
  Help goes to WhatsApp. Never red text on white; green text is `#006630`, never the brand fill green.
- **Honest data only:** no delivery time, fee or distance without the customer's address (DR8).
- **No confetti, no badges, no invented headings.** The share journey is quiet: it gets people to a shop.

### Deliverables (same package shape as Own bikers v1 and Shop front v1)

1. `README.md`: screen + state list with ids (Part 2 §5), navigation rules (what each tap opens), a
   component spec with exact sizes at 360 and 320 (share row, share sheet, QR card, share button, chip,
   landing hero, preview card, biker sheet, address strips), a token table, and **NEEDS BACKEND** and
   **Retires** sections. Its rules win over the drawings.
2. A standalone HTML prototype showing **every state**, with a single-screen view per id (`?screen=SH-M2`).
3. `copy.ts`: **one object with every user-facing string** (call it `SH`), final copy. It ships verbatim.
4. 2× PNG renders of every state.
5. A `DESIGN-DEVIATIONS-entry.md` draft for the ledger (next free number **D-129**), listing what this
   adds to Browse v2, First Run v2, Merchant v2 / Shop front v1 and Empty States v2.

---

## Part 2: Reference (paste after the prompt)

### 1. The journey

```
Merchant (Shop front) ── Share your shop ──► share sheet ──► WhatsApp Status / group / chat
Customer (store page) ── Share button ────► phone share menu ─┘
                                                              │ lyniago.com/s/7KQ2MX
                                                              ▼
                      landing page (shop card) ── Android + Play ──► app installed? open it on the shop
                                    │                                 not installed? Play → install
                                    ├── Android, no Play ──► "Order on the web" (web app)
                                    ├── iPhone ───────────► web app
                                    └── desktop ──────────► QR to the same link
                                                              ▼
              sign in (no intro screens) — phone → code → profile → permissions, chip on each
                                                              ▼
                       the shop (store page) → cart → Review & place → order (existing checkout)
```

### 2. The storyboard (what the person feels)

| Step | They do | They feel | Design job |
|---|---|---|---|
| 1 | See the preview in WhatsApp | "That place!" | D8: their shop's face, never a broken card |
| 2 | Tap → landing → Play | Mild friction: an install | D7: shop-first, one obvious button |
| 3 | Open the app → sign in | "Why am I signing up?" | Chip names the shop; no intro screens |
| 4 | Code, profile, permissions | Patience running out | Chip on each screen |
| 5 | Land on the shop | Relief: the right one | Skeleton, then the store; address states |
| 6 | Add, Review & place | Confident | Existing checkout (don't redraw) |
| 7 | Done | May share it on | Share button |

### 3. Sample data (Harare)

- **Restaurant:** Chicken Inn Avondale (cover + logo, ★4.6 (120), open). Long-name test: *Mbuya's Traditional
  Kitchen & Grill Borrowdale Village* (45 characters).
- **Shop:** Avondale Fresh (Grocery). **No-photo shop:** Kensington Hardware (tint + initial).
- **Pharmacy:** Belgravia Pharmacy.
- **Link:** `lyniago.com/s/7KQ2MX` (6 characters, no 0/O/1/I/L).
- **Customer:** Rudo, 12 Lanark Rd, Belgravia. **Out of area:** Ruwa. **Biker:** Tendai.
- **Merchant owner:** Farai, Chicken Inn Avondale (one branch of three; each branch has its own link).

### 4. Copy starting points (yours to finalise; keep the meaning)

| Where | Starting point |
|---|---|
| Merchant row | "Share your shop" · "Customers who open your link can order from you" |
| Sheet | "Share on WhatsApp" · "Copy link" · "Show QR for your counter" · toast "Link copied" |
| WhatsApp pre-filled text | "Order from Chicken Inn Avondale on LyniaGo: lyniago.com/s/7KQ2MX" |
| Customer share text | "Chicken Inn Avondale is on LyniaGo: lyniago.com/s/7KQ2MX" |
| Chip | "Taking you to (logo) Chicken Inn Avondale" / "Taking you to the shop" |
| Landing primary | Android: "Open in LyniaGo" / no Play: "Order on the web" / iPhone: "Order on the web" / desktop: "Scan to order on your phone" |
| DR5 empty state | "This shop isn't on LyniaGo right now" · pill "Browse restaurants" |
| DR8 | "Set where to deliver" · "Chicken Inn Avondale doesn't deliver to Ruwa yet" |
| DR13 | "This is a shop link. Open as a customer?" · "Open as customer" · "Stay on jobs" |
| Generic preview | "LyniaGo · Food, shops and pharmacy, delivered by bike" |

### 5. States to cover (ids are yours to keep)

**Merchant (SH-M)** — on Merchant v2's shell and Shop front v1
- SH-M1 · Shop front with the "Share your shop" row (live shop). And the same tab when not live (row absent).
- SH-M2 · Share sheet open (preview, WhatsApp, Copy, QR, link text).
- SH-M3 · Link copied (toast).
- SH-M4 · QR card for the counter (full screen or sheet; must read from 1 m; link text beside it; a way to save/print).
- SH-M5 · Owner with several branches: which branch's link (the preview names the branch).
- SH-M6 · 320×640 and the 45-character name.

**Customer share (SH-C)** — on Browse v2
- SH-C1 · Restaurant store top (S1) with Back · Search · Share on the cover.
- SH-C2 · Scrolled compact bar with Search · Share.
- SH-C3 · No-cover tint band (S11) with the three buttons; shop (S3) and pharmacy (S4) variants.
- SH-C4 · The phone's share menu over the store (Android system sheet, drawn simply).

**Landing + preview (SH-W)** — lyniago.com's style
- SH-W1 · Android with Play (auto-continue: what shows for the second before the hand-off, and if it stalls).
- SH-W2 · Android without Play ("Order on the web").
- SH-W3 · iPhone ("Order on the web").
- SH-W4 · Desktop 1440×900 (QR + link).
- SH-W5 · Dead or not-live code (generic, names no shop).
- SH-W6 · No-photo shop (tint + initial).
- SH-W7 · WhatsApp preview cards (1200×630 image + title + description): normal, no-photo, generic.

**The way in (SH-S)** — on Calm Mint v2 / First Run v2 sign-in screens
- SH-S1 · Phone screen with the chip ("What's your number?").
- SH-S2 · Code screen with the chip.
- SH-S3 · Profile screen with the chip.
- SH-S4 · Permission ask (PC1 location / PC8 notifications) with the chip.
- SH-S5 · Chip without a name ("Taking you to the shop").
- SH-S6 · Web app (iPhone) phone screen with the chip.

**Arrival (SH-A)** — on Browse v2 + Empty States v2
- SH-A1 · Skeleton while the link resolves.
- SH-A2 · Store, no delivery address ("Set where to deliver").
- SH-A3 · Store, outside the delivery area (strip, + off).
- SH-A4 · Shop not available (DR5 full-screen empty state).
- SH-A5 · Can't reach LyniaGo (Try again).
- SH-A6 · Cart at another shop → "Start a new cart?" naming both shops.
- SH-A7 · Biker sheet "Open as a customer?".
- SH-A8 · Closed shop arriving from a link (existing closed strip + "Schedule for …").

### 6. What already exists (reuse, don't reinvent)

- **Store page** (Browse v2): cover 196 with 44px white discs (Back left, Search right), no-cover tint band
  150, logo, name, open line, info strip, sticky tabs, store skeleton, closed strip, I3 "Start a new cart?".
- **Sign-in** (Calm Mint v2 C4–C5): "What's your number?", 52px field with +263, "Send code"; code entry.
- **Permission asks** (First Run v2): PC1 location, PC8 notifications, full screen.
- **Merchant**: Merchant v2 shell (4 tabs, mint top card with the open pill), Shop front v1 (cover/logo editor).
- **Own bikers invite sheet** (OB-M6): the closest existing sheet — "Share on WhatsApp", "Copy link", copied
  toast, no-network state. Match its structure.
- **Empty State** (D-78): one component for every empty / not-found / couldn't-load state.
- **lyniago.com**: Inter + Fredoka wordmark, its own palette and illustration set.

---

## Part 3: Files to attach to Claude Design

**Send these first** (if uploading from a phone):

1. **This file.**
2. **Store page, the screens the share button sits on:**
   `packages/design/handoff/browse-v2/screens/S1.png`, `S1-320.png`, `S3.png`, `S4.png`, `S11.png`, `I3.png`.
3. **Merchant Shop front, where the share row goes:**
   `packages/design/handoff/shop-front-v1/screens/01 Restaurant filled.png`, `03 Shop filled - not live yet.png`,
   `30 320 - 40-character name- 3 long tags.png`.
4. **The closest existing share sheet (Own bikers invite):**
   `packages/design/handoff/own-bikers-v1/screens/17-ob-m6-invite-link-ready.png`,
   `18-ob-m6-invite-link-copied.png`, `21-ob-m6-invite-no-network.png`.
5. **Permission ask the chip sits on:** `packages/design/handoff/first-run-v2/screenshots/PC1.png`.

**Then:**

6. **App style + tokens (Calm Mint v2):** `packages/design/handoff/calm-mint-v2-2026-10/`
   (`README.md`, `Calm Mint v2 - all screens.html`, `fonts.css`, `assets/`). The phone and code screens are in the HTML.
7. **Browse v2 spec:** `packages/design/handoff/browse-v2/README.md` and `browse-kit.js` (store header, discs, skeleton).
8. **Merchant spec:** `packages/design/handoff/merchant-v2/README.md`, `packages/design/handoff/shop-front-v1/README.md`,
   `packages/design/handoff/merchant-v2/tokens/`.
9. **Empty states:** `packages/design/handoff/empty-states-v2-2026-10/README.md`, `copy.ts`,
   `Empty States Minimal v2.html`.
10. **Website style for the landing page:** `packages/design/handoff/lyniago-website/README.md` and
    `site/index.html` (plus `site/assets/brand/`, `site/assets/fonts/`).
11. **First Run v2 spec:** `packages/design/handoff/first-run-v2/README.md` (permission asks, copy rules).
12. **Own bikers v1 spec:** `packages/design/handoff/own-bikers-v1/README.md` (the invite sheet and the `/j/` link
    behaviour this mirrors).
13. **The plan, for background only:** `docs/plans/2026-11-07-shop-share-links.md`.

---

## Part 4: After Claude Design returns (for us, not for Claude Design)

- Export to `packages/design/handoff/shop-share-v1/` (README, copy.ts, prototype, screens, this PROMPT).
- Add the **D-129** entry to `docs/DESIGN-DEVIATIONS.md` (the design-freeze CI job requires it) and a CLAUDE.md
  line: "Shop share links follow their own handoff (`handoff/shop-share-v1/`)".
- Then build per the plan's §11.8 lanes: API first (share code, resolve, public card), then the website, the
  app's pending-shop flow and arrival states, and the share buttons, in parallel.
