# Handoff: LyniaGo Rider v2 (rider app + joint Account/Settings)

## Overview
This is a redesign of the **rider side** of the LyniaGo Android app (Expo / React Native, Harare). It also redesigns the **Account tab on both sides and the shared Settings screen**. Five areas:

1. **Jobs board:** map-first, with job pins, demand zones, the parcel offer flow, and every gate.
2. **Active job:** the rider-side mirror of the customer's After Send screen. Parcel and food, one primary action per stage, and every exception behind one "Problem with this job?" sheet.
3. **Money:** earnings first (today / this week), commission balance second, top-up.
4. **Account + Settings:** sibling Customer / Rider Account tabs with a visible **Customer | Rider** toggle, a reliability/strikes card, and sectioned Settings.
5. **Food offer:** a full-screen, 60-second accept/decline.

`BRIEF.md` holds the product decisions (final). `PROMPT.md` is the original design brief, which includes the current-state reference and the full screen inventory (§6).

## About the design files
The files in `design/` are **design references built in HTML/React-DOM with inline styles**. They are prototypes that show the intended look, copy and behaviour. They are **not production code**. Rebuild every screen in the app's existing React Native environment (`app/rider/**`, `app/wallet/top-up.tsx`, `app/settings/**`, `src/ui/**`), using its components, theme tokens, navigation (expo-router), bottom-sheet library, map library and icon set. Lift exact values (sizes, colours, copy) from the JSX; don't port the JSX.

Open `design/Rider v2 (standalone).html` in any browser. It's self-contained and works offline. It has:
- a **prototype player**: rail of every state, ← → keys, and a **320 × 640** toggle;
- every state at 360 × 720, grouped;
- the key states again at 320 × 640;
- a **Keep / redesign / merge / retire** table for the current screens;
- **final copy per state**: click "Show copy per state" and it lists each `R` key that renders on that frame.

`design/Rider v2.html` is the same file, unbundled. It only renders inside the design-system repo, because it needs `../../../styles.css` and `assets/lynia-icons.js`. A single state can be opened with `?only=J1,A8&w=320&z=1`.

## Fidelity
**High-fidelity.** Colours, type sizes, spacing, radii, tap-target sizes and copy are final. Map tiles are faux (token-coloured roads). Use the app's real map with the marker/route styling specified below. Photos are striped placeholders.

---

## Global rules (hard constraints)
- **Frames:** design at 360 × 720 dp; every screen must also work at 320 × 640. Content scrolls. Nothing may sit under a pinned CTA bar or the tab bar. Build bottom padding = bar height + 16.
- **Tabs:** rider `Jobs · Money · Account`; customer `Home · Orders · Account`.
- **Always online:** no Online/Offline toggle. Passing every gate means online. Connection state is text in the mint top card ("● Online" / "Reconnecting…"), never a control.
- **No manual refresh:** no pull-to-refresh, Refresh or Retry buttons anywhere. Socket + polling + refetch on `AppState` active. Empty, stale and error states say what the app is doing ("Trying again in 10 s").
- **One job at a time.** Parcel cards have no countdown. Only the food offer is timed (60 s).
- **Targets:** ≥ 44 dp for everything, 52 dp for the one primary CTA per screen. Draw them at that size (`minHeight`, not hit-slop). Every icon has a visible text label.
- **Map conventions:** pickup = green dot, drop-off = red square, rider = dark bike disc.
- **Money:** USD, tabular numerals. Credits are `--accent-text` green with a "+" sign; debits are `--ink` with "−" (U+2212). **Never red text on white**: danger = `--danger-wash` fill + `--danger-ink` text.
- **Vocabulary:** Job (anything a rider carries), Order (what the customer placed), Fare (what the rider earns), Collect (money taken at a door), Delivery code (6 digits), LyniaGo (never "Lynia"), SMS, WhatsApp.
- **Font scale:** text grows like Android sp. Buttons use `minHeight` and labels wrap rather than truncate. Only the delivery-code digits are capped (`maxFontSizeMultiplier` 1.15).
- **Reduced motion:** slow spinners down (2.4 s per turn); never remove them.

## Design tokens (no new tokens)
| Token | Value | Use |
|---|---|---|
| `--ink` | `#14181b` | body text, rider disc, toasts, selected fare pill, strike bars |
| `--muted` | `#5b6670` | secondary text, idle icons |
| `--bg` | `#ffffff` | screens, cards, sheets, bars |
| `--surface` | `#f6f7f8` | map ground, facts boxes, cash strips, segmented track, FOOD tag, gate discs |
| `--line` | `#e2e6ea` | borders, dividers, upcoming step circles, band track, disabled fill |
| `--accent` | `#00b14f` | **fills only**: pickup dots, route, primary CTA fill, progress, step connectors, busy-zone stroke |
| `--accent-text` | `#006630` | green text and small icons, Back, done/current step circles, selected borders, credits |
| `--accent-wash` | `#e9f8ef` | mint top card, PARCEL tag, selected chips, earnings banner, ok notices, active tab pill |
| `--cta-fill` | `#00812f` | **selected segment** in segmented controls (white label ≈4.7:1) |
| `--highlight` | `#f2b705` | unread dot, sun/moon sticker only |
| `--danger` | `#c0392b` | drop-off square, Help pill, warn-notice border, low-balance border, 999 button fill |
| `--danger-wash` / `--danger-ink` | `#faedeb` / `#8f2418` | gate facts (hold / suspended / top-up), below-floor and owes balance, strike-final warning, alerts/location off, SOS rows |
| `--shadow-card` | `0 1px 4px rgba(20,24,27,.08), 0 2px 12px rgba(20,24,27,.06)` | map pills, markers |
| `--shadow-sheet` | `0 -2px 16px rgba(20,24,27,.08)` | CTA bars |
| `--shadow-menu` | `0 4px 16px rgba(20,24,27,.1)` | toasts, rider disc |
| Radius | input 12 · card 16 · pill 999 | inner cards and fields 12; Account/Settings cards, sheets and Money cards 16; buttons, chips, tags 999 (tags 6) |
| Spacing | 4 · 8 · 12 · 16 · 24 · 32 · 48; gutter 16 | default stack gap 12 |

Busy-zone fill = `color-mix(in oklab, var(--accent) 16%, transparent)`. In RN that's `--accent` at 16% opacity. This is derived, not a new token.

**Type** (Inter 400/600/700; tabular numerals for all money, codes, times and distances):
56/700 price · 40/700 earnings hero · 28/700 balance, food fare and Done earnings · 22/700 gate/terminal titles and greeting at 360 (18 at < 340) · 20/700 sheet titles, stop names, job fare · 18/700 section headlines · 17/700 identity name and board count · 16/700 header title and CTA labels · 15/600 row labels and values · 14 body · 13 labels, chips, hints · 12 meta, step labels, uppercase labels (12/600, letter-spacing .04em) · 11/700 tags.

**Icons:** Lucide, from the app's subset plus: Settings, LogOut, Globe, FileText, Lock, ArrowLeftRight, Siren, Hourglass, Download, Smartphone, PhoneOff, Delete, MessageCircle, ShieldCheck, LifeBuoy, Camera, Image, Undo2, X, Home. Path data is in `rv-kit.jsx` and `as-kit.jsx` (`addIcons`).

---

## Shared components
Names match the JSX. Build each one once in `src/ui/rider/` (or reuse the existing After Send / Send v2 component where one already exists, flagged ♻).

### MintTop: tab-root header (8c)
- Height **104** including a 24 status bar. Background `--accent-wash`, square bottom edge.
- Row: padding `10 12 0 16`.
  - Left column: greeting "Good morning, Tendai" 22/700 lh 28, one line, ellipsis (18 under 340 dp). It's time-aware: morning < 12, afternoon < 18, evening after.
  - Sub-row (margin-top 6, height 20):
    - Rider side: **Conn** (8 dp `--accent` dot with a 3 dp white ring + "Online" 13/700 `--accent-text`; or a 12 dp `--muted` spinner + "Reconnecting…" 13/600 `--ink`).
    - On Jobs, the Conn is followed by "·" + MapPin 13 + detected street 13/600 `--accent-text`.
    - Customer side: location only.
  - Right: sun sticker 40 dp (moon after 18:00; **hidden under 340 dp**), then a 44 dp white bell circle with an 8 dp `--highlight` unread dot (1.5 white border) at top 10 / right 11.

### TabBar
- Height 60, white, 1 dp `--line` top border.
- Three equal cells: icon 20 inside a 52 × 26 pill (`--accent-wash` when active) + label 12, 600 (700 when active). Active colour `--accent-text`, idle `--muted`.
- Rider icons: Bike / Wallet / User. Customer icons: Home / Receipt / User.

### AHeader ♻ (After Send header): pushed screens
- 24 status + 52 bar, 1 dp `--line` bottom border. Grid: Back | title | right slot.
- Back: ChevronLeft 22 + "Back" 15/600 `--accent-text`, 44 tall.
- Title 16/700, centred, ellipsis.
- Right slot, live jobs only: **Help** pill (34 visual / 44 hit, 1.5 dp `--danger` border, LifeBuoy 15 + "Help" 13/700 `--danger`). On the rider side, Help opens the **Problem sheet** (see X1).
- **FoodHeader** (food offer): same bar with no Back; centred Utensils 17 `--accent-text` + "New food job".
- **FlowHeader** (Top up): AHeader + **step bar** (4 columns: 18 dp circle + 12 label, 3 dp bar under it; done = `--accent-text` circle + check, current = `--accent-text` circle + 700 ink label, upcoming = `--surface` + `--line` border). Total height 115.

### Sheet ♻ (After Send)
- 16 top radius, shadow `0 -2px 16px rgba(20,24,27,.10)`.
- **28 dp grabber row** with a 36 × 4 `--line` bar. Hit area 120 × 44 (row + 16 above the edge). Tap toggles peek/full; drag works.
- Content padding `0 16 16`, gap 12, scrolls.
- Peek = the bottom of the stage's first block + 16, never leaving the map under 96 dp. Peek floors used in the frames (360 × 720):
  - board 50% of the screen (44% empty);
  - food offer 40% (upfront 26%; 20% under 700 dp);
  - active-job sheets are sized to content (sheet height 330–410) above the CTA bar.

### Bar / RBar ♻ (CTA bar)
- Pinned bottom (or `bottom: 60` above the tab bar on gates), white, `--shadow-sheet`, padding `10 16 12`, gap 8.
- Optional one-line hint 13 `--muted` centred above the buttons, saying only what's missing.
- **GBtn** 52 pill, 16/700:
  - primary: `--accent` fill, white;
  - ghost: white, 1.5 `--line` border, `--accent-text`;
  - ghost-danger: ghost with `--danger` text;
  - disabled: `--line` fill, `--muted` text;
  - loading: spinner replaces the icon and the label stays.
- **SmBtn** 44 pill, 14/700, padding 0 14, icon 16: ghost / fill / white.

### Map ♻
- Pickup: 22 `--accent` circle, 3 white ring, `--shadow-card`, "Pickup" pill.
- Drop-off: 20 `--danger` square r3, 3 white ring, "Drop-off" pill.
- Route: 5 dp `--accent`.
- **RiderMarker**: 34 `--ink` disc, 3 white border, Bike 17 white, name pill below (`--ink`, white 12/600). On the rider's own map the pill reads **"You"**. Paused = `--muted` disc + dashed white pill "Last seen 3 min ago".
- Heading to pickup: dotted `--ink` 3 dp line (dash 2/6, round caps) from You to the pickup.
- No Expand / Recenter buttons. Re-fit bounds when the sheet snaps so pins never hide under it.

### BoardMap (new)
- **Job pin**: 20 dp `--accent` dot, 3 white ring, + fare pill below (white, 12/700 ink, tabular). The selected pin is 24 dp with a `0 0 0 3px --accent-text` ring and an `--ink` pill with white text. Pin taps select the matching card (and scroll it into view in the sheet); card taps select the pin.
- **Busy zone**: circle of radius 44–62 dp, busy-zone fill (above), 1.5 dp dashed `--accent` stroke. The single busiest zone carries a "Busy now" pill (`--accent-text` fill, white 11/700) on its bottom edge.
- "You" marker at the rider's GPS position.

### JobCard (new)
- Border 1 `--line` (selected: 2 `--accent-text`, padding −1), radius 12, padding 12, gap 8.
- Row 1: **JTag** (`PARCEL`: `--accent-wash` / `--accent-text`; `FOOD`: `--surface` + 1 `--line` border / ink; 20 tall, radius 6, 11/700, letter-spacing .04em) · "0.8 km **to pickup**" (13/600 + 400 `--muted`) · right column: fare 20/700 + "asking" 11 `--muted`.
- Stops: Dot 10 / Sq 10 + name 14/600, one line, ellipsis.
- Meta: "3.1 km trip · Documents envelope" 12 `--muted`.
- Action: full-width SmBtn fill "Make an offer".
- **Offer variant**: fare shows your offer ($3.20) + "offer sent". The action row becomes a spinner + "Waiting for the customer to choose" 13 + ghost SmBtn "✕ Withdraw".

### RSteps: step track ♻ (After Send StepTrack, rider labels)
- 4 columns: **Pickup · Collected · Drop-off · Done**.
- 20 dp circles, 3 dp connectors.
- Done: `--accent-text` circle + white check, `--accent-text` label 600.
- Current: `--accent-text` circle + 4 dp `--accent-wash` halo, label 700 ink.
- Upcoming: `--surface` circle, 1 `--line` border, muted number + label.

### StopCard (new): the current stop
- Marker (Dot/Sq 14) + uppercase label ("PICKUP" / "DROP-OFF", "· FOOD" on food) + name 20/700 (wraps) + distance line 14 `--muted` ("0.8 km · about 4 min") or **"You're here"** 14/700 `--accent-text`.
- Then contact line 13 `--muted` ("Rudo K. · sender").
- Then a row of three equal 44 SmBtns: **Call · WhatsApp · Navigate**. Navigate is hidden when you're here. It opens the app chosen in Settings (Google Maps / Waze).

### Cash
- **CashLine**: `--surface` r12, padding 10 12, Banknote 18 `--accent-text` + 14/600 text.
- **CashSplit**: `--surface` r12; optional title 13/600; two halves split by a 1 dp `--line` divider: "YOURS" label `--accent-text` + 20/700 `--accent-text`; "OWED TO KITCHEN" label `--muted` + 20/700 ink.

### ProblemLink
A 1 dp `--line` top border, then a centred 44 dp row: CircleAlert 16 `--muted` + "Problem with this job?" 14/600 ink + ChevronRight 16.

### Gate (blocking state)
- Body between MintTop and the CTA bar, centred column, padding 0 24, gap 12, text centred.
  - 72 dp disc. Tones: calm = `--surface` + `--muted` icon; ok = `--accent-wash` + `--accent-text`; danger = `--surface` + 1.5 `--danger` ring + `--danger` icon. Icon 33.
  - Title 22/700 lh 28 (balance).
  - Body 15/22 `--muted`.
  - Optional **facts box**: full width, r12, padding 4 14, rows of label 13 + value 15/700 tabular, right-aligned, 1 `--line` dividers. Default `--surface`; `danger` = `--danger-wash` with `--danger-ink` text.
- RBar above the tab bar: primary + ghost + optional bridge ghost "⇄ Order food and send parcels".
- Force update: no tab bar.

### Row / Card (Account, Settings)
- **Card**: 1 `--line` border, r16, overflow hidden.
- **Row**: min height 56, padding `8 12 8 14`, gap 12, 1 `--line` top divider (except the first).
  - 36 dp icon disc: `--surface` / `--muted`; ok = `--accent-wash` / `--accent-text`; danger = `--danger-wash` / `--danger-ink`.
  - Label 15/600 (danger rows `--danger`), sub 12 `--muted`.
  - Right value 13/600 `--muted`: ok = `--accent-text`; warn = a `--danger-wash` pill with `--danger-ink`.
  - ChevronRight 18 where the row navigates.
  - Rows can hold inline children (test buttons, segmented control, warnings).

### Seg: segmented control
- `--surface` track, 1 `--line` border, pill, padding 3.
- Height **48** for the role toggle, 44 elsewhere.
- Selected segment: `--cta-fill` fill, white 15/700. Unselected: ink. Optional icon 17.

### IdentityCard
- Card, min height 72, padding `12 12 12 14`. **Tappable** → profile sheet (name, phone, photo).
- Avatar 52 + name 17/700 + **Verified** tag (rider only: `--accent-wash` pill, ShieldCheck 13, 11/700).
- Line 2, 13 `--muted`: rider "★ 4.9 · 312 jobs"; customer "+263 77 245 1180".

### Standing: reliability card (rider)
- Border 1 `--line` (at risk: 1 `--danger`), r16, padding 14, gap 10.
- Header: "YOUR STANDING" label + a status pill (Good: `--accent-wash` / ShieldCheck; at risk: `--danger-wash` / `--danger-ink` / TriangleAlert, "One strike from a pause").
- Three tiles (`--surface` r12, padding 8 10): Acceptance "92%", Rating "4.9 ★", Strikes (3 segmented 8 dp bars, used = ink, or `--danger` at risk; "1 of 3" 12/700). At risk, the Strikes tile turns `--danger-wash` with `--danger-ink` text.
- Plain-words rule, 13/19 ink: "Strikes come from cancelling after you accept. 3 in 30 days pauses jobs for 24 hours. Your oldest strike clears on 19 Oct."

### MSheet: modal bottom sheet
`rgba(20,24,27,.45)` scrim over the whole screen, then a sheet with 16 top radius, padding `0 16 12`, gap 12. Contents in order: grabber, optional 56 disc, title 20/700, body 15/22 `--muted`, children, stacked buttons. Android Back / scrim tap closes it (except Picked, which must not close on a scrim tap).

### CodeBoxes + Numpad
- 6 boxes, **3 + 3** with an extra 8 dp before box 4. Boxes are 42 × 56 at 360 (36 × 50 under 340), r10, 1.5 `--line`; focused box 2 `--accent-text` with a 2 × 26 caret. Digits 26/700 tabular.
- Error: every box 2 `--danger` + "ⓘ Wrong code. 4 tries left." 13/600 `--danger` centred.
- Locked: `--surface` boxes with a Lock 16 `--muted` icon.
- Use the OS numeric keyboard (`keyboardType="number-pad"`, `textContentType="oneTimeCode"`). The frames draw a 216 dp keypad for layout only. The code is a **string**.

### LRow: ledger / history row
Min height 56. 36 disc (`--accent-wash` / `--accent-text` for credits, `--surface` / `--muted` otherwise) + title 14/600 (ellipsis) + meta 12 `--muted` tabular + amount 15/700 (credit `--accent-text` "+$3.20", debit ink "−$0.32").

### Chips
44 tall pills, padding 0 16, 13/700. Selected: `--accent-wash` + 1.5 `--accent-text` border. Idle: white + 1 `--line`.

### Notices / toast ♻
- Calm: `--surface` + 1 `--line`, r12, padding 10 12, icon 18 `--muted`, 13/19 ink.
- Warn: white + 1 `--danger`, icon `--danger`. Warn notices are hints, never blocks.
- Ok variant: `--accent-wash`, no border.
- **AToast**: `--ink` r12, 13/18 white, icon 18; optional action button (44, `--accent-wash` / `--accent-text`, r10, e.g. "↻ Try again", "↶ Undo"). Sits 10 dp above the bar or tab bar.
- **Countdown pill**: 28 tall, `--surface`, Timer 14 + "0:42 left" 13/700. Paired with a 4 dp progress bar (`--line` track / `--accent` fill).

---

## Screens
Ids match the prototype. Copy keys reference the **`R` object in `design/rv-kit.jsx`**; ship every string verbatim and keep dynamic parts as formatters. "Replaces" maps to the current gallery ids.

### 1 · Jobs board (`app/rider/(tabs)/index.tsx`)
Layout: MintTop (Conn + location) → BoardMap (top 104 → sheet top + 18) → Sheet (peek 50%; full = top 120) → TabBar.

Sheet content, top to bottom:
1. Optional warn/calm notice (J6–J8).
2. "YOUR OFFERS" group (J9).
3. Count row: "4 parcels near you" 17/700 + "Nearest first" 12 `--muted`.
4. Demand line: MapPin 15 + "Busier near Copacabana Rank · 2.1 km from you" 13/600 `--accent-text`.
5. Food line (**food dispatch on only**): Utensils 15 + "Food jobs ring full screen. Keep LyniaGo open." 13 `--muted`.
6. JobCards, gap 10, nearest first. The nearest is selected by default.

| Id | State | Notes | Replaces |
|---|---|---|---|
| J1 | Board, parcels + food | default | RJM board |
| J2 | Sheet full | | |
| J3 | Parcels only | `merchantDispatchAutoEnabled = false`: no food line; no copy mentions food | RJM board_food_off |
| J4 | Empty | No pins. Sheet peeks at 44%: Inbox disc 48 + "Nothing in range yet", `emptyB` + `emptyFood`, a `--surface` box "Why no jobs?" + `whyQuietB`, demand line. No button | RJM board_empty |
| J5 | Empty, parcels only | `emptyB` only | RJM board_empty_food_off |
| J6 | Reconnecting | Conn = Reconnecting; calm notice `staleB`; list at 60% opacity, still tappable | RJ offline |
| J7 | Couldn't load | Calm notice `loadFail` (auto-retry 10 s with backoff); two skeleton cards | RJ generic_error |
| J8 | Notifications off | Warn row: Bell + `notifOff` + SmBtn fill "Turn on" → OS notification settings. Shown whenever the OS permission is denied | — |
| J9 | Your offers | "YOUR OFFERS" label → JobCard offer variant → "NEARBY JOBS" label → the rest | RJ offer_sent |
| J10 | Offer withdrawn | Toast `withdrawn` + "Undo" for 5 s; the withdraw API call fires after the undo window | — |
| J11 | A customer picked you | MSheet: CircleCheck ok disc, `picked`, `pickedB`, primary "Open job →" → A1. Plays the job ping | RJ picked |
| J12 / J13 / J14 | Not chosen / taken first / expired | Ink toast `notChosen` / `taken` / `bidExpired`; the card and pin leave the list | RJ not_chosen · missed_order · bid_expired |

Rules:
- Sort by distance to pickup.
- Remove taken jobs instantly (socket).
- A job you skipped stays hidden for that job id.
- Pins and cards are a 1:1 mapping.
- With no GPS, show gate G8 instead.

### Make an offer (new pushed route, e.g. `app/rider/offer/[jobId].tsx`)
- AHeader "Make an offer", no Help.
- Scroll body (padding 12 16 24):
  - **RRoute** strip: 64 × 56 mini-map + two stops 13/600 + "0.8 km to pickup · 3.1 km trip" 12 `--muted`. No Edit.
  - "Rudo is asking **$3.00**" 14.
  - "Your fare" 15/600.
  - Fare 56/700 (48 under 340), 2 dp dashed `--line` underline. Tap to type, numeric keyboard, 2 dp `--accent-text` focus.
  - "✎ Tap the fare to type an amount" 12 `--muted`.
  - Two ghost GBtns "− $0.50" / "+ $0.50".
  - **Band bar** (8 dp `--line` track, `--accent` band = the usual range, 18 dp ink thumb with a 3 white ring) + `band`.
  - "You'll be there in" 13/600 + **ETA chips** 5 / 10 / 15 / 20 min (44 tall, equal width; 10 preselected) + `etaHint`.
  - Calm notice `oneOffer`.
- RBar stacked: primary "Send offer · $3.20" (echoes the fare) + ghost "Skip this job".

| Id | State | Notes |
|---|---|---|
| O1 | Default | fare prefilled with the asking price + suggestion |
| O2 | Fare well above the band | Warn notice `overB` above the ETA; sending is still allowed |
| O3 | Sending | Primary spinner + "Sending…"; Skip disabled |
| O4 | Send failed | Toast `sendFail` + "↻ Try again"; inputs kept |

Rules: the minimum fare is $0.50; the server sets the band (`TODO(backend)` if missing). On send success, go back to the board, where the card shows in "Your offers".

### Gates (G1–G15)
Built from the Gate component, with data in the `GATES` table in `rv-board.jsx` (icon, tone, title, body, facts, factTone, primary, ghost, bridge).

| Id | Gate | Facts | Actions | Replaces |
|---|---|---|---|---|
| G1 | Not a rider | — | Become a rider → KYC · bridge | — |
| G2 | KYC under review | Sent: Today, 08:12 | bridge | RJ kyc_pending |
| G3 | KYC unfinished | — | Finish verifying · bridge | RJ kyc_unfinished |
| G4 | KYC failed | Tries left 1 of 2 | Try again (Camera) · WhatsApp support | RJ kyc_failed |
| G5 | KYC failed twice | — | WhatsApp support · bridge | RJ gate_kyc_locked |
| G6 | ID expired | — | Re-verify my ID · bridge | RJ kyc_expired |
| G7 | Can't open ID check | — | Try again · WhatsApp support | RJ kyc_cant_start |
| G8 | No GPS | — | Open location settings · I've turned it on | RJ no_gps |
| G9 | Out of area | Nearest edge | bridge | RJ gate_out_of_area |
| G10 | Cooldown | Clears at 14:20 · 1 h 12 min left (live) | Job history · bridge | RJ gate_cooldown |
| G11 | On hold | Reason (danger box) | Call support · bridge | RJ on_hold |
| G12 | Suspended | Until (danger box) | Call support · bridge | — |
| G13 | Banned | — | Call support · bridge | RJ gate_banned |
| G14 | Balance too low | Balance $0.60 · Top up at least $1.40 (danger box) | Top up now → T1 | RJM gate_topup |
| G15 | Force update | — | Update now (no tab bar) | RJ force_update |

Gate priority (first match wins): force update → not a rider → KYC (unfinished / pending / failed / failed2 / expired / can't open) → banned → suspended → hold → cooldown → out of area → no GPS → balance below floor. Every gate re-evaluates on socket events and app resume; a gate clears without the rider doing anything.

### Food offer (`app/rider/food-offer.tsx`)
- FoodHeader (no Back) → JobMap (pickup stage) → Sheet:
  - Countdown pill "0:42 left" + progress.
  - Title row: FOOD tag, restaurant 20/700, `foodMeta` 13 `--muted`; right side "Your fare" 12 + fare 28/700.
  - Drop-off stop (the pickup stop too when not upfront).
  - **Upfront variant**: two `--surface` tiles, "Pay the kitchen $12.50" / "Collect at the door $15.70", + `payKitchenB`.
- RBar: hint `passHint`, primary "Accept this job", ghost "Not this one".

| Id | State |
|---|---|
| F1 | Default |
| F2 | Pay kitchen upfront (both money tiles must be fully visible at peek at 320 × 640) |
| F3 | 8 s left (bar at 13%) |
| F4 | Expired: blocking state, Clock disc, `expT`, `expB`, "Back to jobs" |

Rules:
- A looping alarm plays until the rider accepts, passes or the offer expires. Use a full-screen intent over the lock screen when it's backgrounded.
- The countdown is driven by the server `expiresAt`.
- Passing or missing doesn't change standing.

### 2 · Active job (`app/rider/job.tsx`, `app/rider/food-job.tsx` → one stage-driven screen)
JobShell = AHeader (stage title, **Help** pill) + JobMap + Sheet (sized to content) + RBar (one primary). The sheet always holds, in order: optional notice → RSteps → StopCard → cash → ProblemLink.

**Parcel**

| Id | Stage | Title | Sheet | Primary | Replaces |
|---|---|---|---|---|---|
| A1 | Heading to pickup | Heading to pickup | steps 0, pickup StopCard, `cashParcel` | I'm at pickup | RJM active_parcel, RJ job_assigned, job_pickup |
| A2 | At pickup, check items | At pickup | steps 0, "Check before you leave", item checkbox row (26 dp box), photo row (56 thumb + `photoNeed` / `photoNeedB` + SmBtn fill "Take photo") | I've collected the parcel (disabled; hint `needPhoto`) | RJ job_verify |
| A3 | Camera | Pickup photo | `--ink` full screen, viewfinder, 72 white shutter + "Take photo" + `photoNeedB` | — | RJM pickup_photo |
| A4 | Preview | Pickup photo | photo + RBar "✓ Use this photo" / ghost "Retake" | | RJM pickup_photo_preview |
| A5 | Saving | | spinner on primary "Saving photo…" | | RJ photo_uploading |
| A6 | Ready to collect | At pickup | item ticked, thumbnail + "Photo saved" + ghost "Retake" | I've collected the parcel | RJ job_collect, RJM pickup_photo_failed |
| A7 | Heading to drop-off | Heading to drop-off | steps 2, drop-off StopCard (recipient) | I'm at the drop-off | RJ job_dropoff |
| A8 | Delivery code | Arriving now | steps 2, `codeT` 20/700, `codeB`, CodeBoxes, cash line; keypad up | Confirm delivery (enabled at 6 digits) | RJM handoff, RJ job_handoff |
| A9 | Wrong code | | error boxes + `triesLeft` | | RJ handoff_wrong |
| A10 | Last try | | `triesLast` | | |
| A11 | Locked (5 wrong) | | `lockedT`, `lockedB`, locked boxes; keypad hidden | "📞 Call Rudo to re-send" + hint `newCodeWait` | |
| A12 | Code while offline | | "Saved. Syncs when you're back online." | | |
| A13 | Delivered | Job done | ok disc 64 + `doneT`; `--accent-wash` banner "You earned +$3.20" 28/700; KV rows (cash collected, commission −$0.32); optional stars | Back to jobs | RJ job_delivered |

Photo upload failure never blocks: the photo is queued locally, A6 shows "Photo saved", and it uploads on reconnect.

**Food**

| Id | Stage | Sheet | Primary |
|---|---|---|---|
| B1 | Heading to the kitchen | steps 0, kitchen StopCard (who = `kitchenReady`), CashLine `payKitchenB` (upfront only) | I'm at the kitchen |
| B2 | At the kitchen (upfront) | "You're here", 1.5 ink-bordered row "Pay the kitchen $12.50 now", `collectFoodB` | I've paid and collected the food |
| B3 | Heading to the customer | drop-off StopCard, CashSplit "Collect $15.70 cash at the door" | I'm at the drop-off |
| B4 | Delivery code (food) | as A8, with CashSplit | Confirm delivery |
| B5 | Return the cash | blocking: Banknote disc, `returnT`, `returnB`, CashSplit "Cash with you now", spinner `returnWait` | ghost "Call the kitchen" |
| B6 | Delivered (food) | as A13, plus the "Returned to kitchen $12.50" row | Back to jobs |

B5 closes automatically when the kitchen confirms receipt in its app (`TODO(backend)` event). Non-upfront kitchens skip B2 and B5.

### Exceptions

| Id | State | Spec | Replaces |
|---|---|---|---|
| X1 | Problem sheet, after pickup | MSheet "What's wrong?" / `probSub`. Card rows: Can't reach the customer · Can't deliver · Get help from LyniaGo · Report the customer. Then a `--danger-wash` row "Emergency? Call 999" (Siren). Ghost "Close". **Also opened by the Help pill** | RJ job_help, sos_idle |
| X2 | Problem sheet, before pickup | Rows: Cancel this job (parcel) / Drop this job (food) · Get help · Report · Emergency | |
| X3 | Can't reach the customer | Sheet: steps 2, PhoneOff disc + `reachT`, `reachB`, `--surface` box "Waited 6:40 of 10:00" + "2 calls · 1 WhatsApp" + progress, SmBtns Call (fill) / WhatsApp. RBar ghost-danger "Mark undelivered", **disabled until 10:00**, hint `undelHint` | |
| X4 | Can't deliver: reason | MSheet `undelT`, single-select chips u1–u5, calm notice `undelNext`, primary "Send" (disabled until a reason is picked) | RJ undelivered |
| X5 | Marked undelivered | Terminal: Package disc, `undelDoneT`, `undelDoneB`, ShieldCheck + `undelNoStrike`; Call Rudo / Back to jobs | |
| X6 | Cancel job | MSheet `cxT`, `cxB`, calm notice `cxStrike`; **primary = "Keep the job"**, ghost-danger "Cancel job" | RJ job_bail |
| X7 | Cancel, one strike from pause | `--danger-wash` box TriangleAlert + `cxFinal` 14/600 `--danger-ink`; ghost-danger "Cancel and pause" | RJM strikes_final |
| X8 | Drop food job | MSheet `dropT`, `dropB`, Keep the job / Drop job (no strike before hand-over) | |
| X9 | Customer cancelled | Terminal: X disc, `custCxT`, `custCxB`, `custCxNoStrike`; Back to jobs / Call Rudo | RJ job_cancelled |
| X10 | Connection lost | calm notice `offlineJob` at the top of the sheet; every action is queued | RJ job_offline |
| X11 | Offline ≥ 4 min | warn notice `offlineLong` | |
| X12 | Job restored | ok notice `restored` after a cold start with a persisted job | |
| X13 | SOS confirm | MSheet, Siren danger disc, `sosT`, `sosB`; a **`--danger`-filled** 52 button "📞 Call 999" + ghost "Not now". On call: open the dialer and fire a safety-alert event with GPS | RJ sos_confirm |
| X14 | Help requested | Toast `helpSent` | RJ job_help_sent |

### 3 · Money (`app/rider/(tabs)/money.tsx`)
MintTop → scroll body (gap 12) → TabBar.
1. Optional pending top-up notice (M10 ok wash / M11 calm Hourglass / M12 calm alert).
2. **Earnings card**:
   - "EARNINGS" label.
   - Seg 44 Today | This week.
   - Amount 40/700 + "6 jobs" 15/600 `--muted`.
   - Two `--surface` tiles, "5 parcels" / "1 food" (hidden when food is off).
   - Week view: a 7-bar strip, 56 tall; today's bar is `--accent` with a 700 label, the others `--accent-wash`.
   - `earnHint` 12.
3. **Balance card** (r16, padding 14):
   - "COMMISSION BALANCE", amount 28/700 + SmBtn fill "+ Top up", explainer 13/19.
   - States:
     - normal: 1 `--line`;
     - low (< floor + $1): 1 `--danger` border, `lowB` 600;
     - below floor / owes: `--danger-wash` fill, `--danger-ink` amount and text (`floorB` / `owesB`);
     - 0% rate: `balanceB0`.
4. Cash: CashSplit "Cash with you now" (YOURS = cash fares collected today and not reconciled; OWED = kitchen cash). Parcels-only: CashLine "Cash with you now: $15.60. It's all yours."
5. "HISTORY" + chips All · Parcels · Food (hidden when food is off) + day groups ("TODAY", "YESTERDAY") of LRows:
   - fare credit "Fare · cash · 09:31" +$3.20;
   - commission "From balance · 09:31" −$0.32;
   - top-up "To balance · 08:02" +$5.00.
   - Infinite scroll with a footer spinner + `loadsMore`.

States: M1 today · M2 week · M3 scrolled · M4 parcels only · M5 low · M6 below floor · M7 owes · M8 0% · M9 empty (`emptyMoneyT` / `emptyMoneyB`) · M10–M12 pending top-up.

### Top up (`app/wallet/top-up.tsx` + `TopUpFlow.tsx`)
FlowHeader "Top up" + step bar **Provider · Amount · Phone · Approve**; RBar primary.

| Id | Step | Spec |
|---|---|---|
| T1 | Provider | "Pay with" + three 64 dp radio cards (EcoCash / InnBucks / O'mari, sub "Approve on your phone", Smartphone icon). Selected: 2 `--accent-text` border, `--accent-wash`, 7 dp `--accent-text` ring dot. Default = Settings › Top-up number provider. CTA Next |
| T2 | Amount | Amount 56/700 tap-to-type; quick chips $2 / $5 / $10 / $20; `amountHint` (computed from the commission rate). CTA Next |
| T3 | Phone | Field (48, r12, focused) prefilled from Settings + `phoneHint`. CTA "Request $5.00" |
| T4 | Approve | Spinner disc 72, `waitT`, `waitB`, Countdown "1:12 left" + progress (90 s) |
| T5 | Done | Terminal ok: `okT`, `okB`; Back to Money / Top up again |
| T6 | Failed | Terminal danger: `failT`, `failB`; Try again / Call support |

If the app closes during T4, Money shows M10–M12 on the next open.

### 4 · Account (both sides) and the role switch
**Rider Account** (`app/rider/(tabs)/account.tsx`): MintTop → IdentityCard → **Seg 48 Customer | Rider** (Rider selected; icons ShoppingBag / Bike) → `switchHint` 12 centred → **Standing** → Card rows:
- Job history ("Jobs you carried, with the fare")
- Notifications (value "3 new", ok tone)
- Help & support
- Settings ("Job alerts, location, top-up number")

**Removed rows:** Money, Bike & documents (moved into Settings), Switch to customer (replaced by the toggle).

**Customer Account** (sibling): MintTop (customer, location) → IdentityCard (customer) → Seg (Customer selected) *or* **BecomeCard** → Card rows: Trip history, Notifications, Help & support, Settings ("Language, payment, privacy").

**BecomeCard** (r16, padding 14): 44 white disc + title 17/700 + body 13/19 + action.

| State | Look | Action |
|---|---|---|
| none | `--accent-wash`, Bike | Start → KYC |
| in progress | `--accent-wash`, IdCard, progress 66% | Continue |
| under review | white + 1 `--line`, Hourglass | — |
| failed | white + 1 `--danger`, IdCard danger | Try again |
| verified | the toggle appears + ok notice "You're verified. Switch to Rider to start taking jobs." | — |

**Switch rules**
- Tap Rider → navigate to Jobs (gates apply). Tap Customer → confirm first:
  - **C4** (able to take jobs): MSheet ArrowLeftRight, `swT`, `swB`, primary "Go to customer view", ghost "Stay online as a rider".
  - **C5** (active job): MSheet Package ok, `swJobT`, `swJobB`, primary "⇄ Go to customer view", ghost "Back to my job". The job keeps running. Customer Home shows a live-job bar ("Job in progress · Heading to drop-off") that returns to it, and job/food pings still sound for the active job.
  - While on the customer side, the rider gets no new jobs or food offers. The server must know the active side (`TODO(backend)` if missing).

| Id | State |
|---|---|
| C1–C3 | Rider Account / scrolled / one strike from pause |
| C4–C5 | Switch confirm sheets |
| C6 | Customer Account, customer + rider |
| C7–C11 | Customer-only: become / in progress / review / failed / verified |
| C12 | **Job history** (rider only): `--accent-wash` summary "This week · 31 jobs · $86.20 earned", chips, day groups; rows show the fare (+green), "You cancelled · strike" rows show "No fare" |
| C13 | **Trip history** (customer only): orders placed, price in ink, status meta |

### Settings and sub-screens (`app/settings/**`)
One screen; AHeader "Settings". Sections (uppercase labels):
1. **YOUR ACCOUNT**: identity row (name + phone, not tappable), Language "English", Privacy notice, Terms & conditions.
2. **CUSTOMER**: Payment "Cash" (no chevron), Order updates On/Off. Off → warn value + sub `sNotifCOff`.
3. **RIDER** (riders only):
   - **Job alerts**: value On (ok) / Off (warn). Sub `sAlertsS`. Inline buttons "🔔 Test ping" / "🔊 Test alarm". Off → `--danger-wash` box `sAlertsOff` + SmBtn fill "Open phone settings".
   - **Location**: "While using" / Off. Sub `sLocS`. Off → danger box `sLocOff`.
   - **Navigation app**: Seg 44 Google Maps | Waze (persist locally; used by Navigate).
   - **Top-up number**: "EcoCash · +263 77 245 1180" → edit sheet (provider + number), prefilled into T1/T3.
   - **Bike & documents**: value Verified (ok), sub "ABH 4721 · ID expires Mar 2028" → S5.
4. A final card: Sign out, **Delete account** (danger, last on screen; sub `sDeleteS`; confirm flow unchanged).

Permission values come from the OS at render time (and on `AppState` active). Never hardcode them. There is no Edit profile row and no "coming soon" items.

| Id | State |
|---|---|
| S1 / S2 | Rider, top / scrolled to the Rider section |
| S3 | Rider, alerts + location off |
| S4 | Customer only (no Rider section) |
| S5 | **Bike & documents**: rows National ID, Rider photo, Bike (Verified, ok), Licence disc (warn "60 days"); warn box `docSoon` + "Update photo"; `bikeChange`; RBar ghost "Re-verify my bike" |
| S6 | **Help & support**: WhatsApp (ok) + Call support; `--danger-wash` safety-line row (24 h); "COMMON QUESTIONS" rows |

---

## State management
- **Rider session**: `side: 'customer' | 'rider'` (persisted + sent to the server), `kycStatus`, `gate` (derived, priority above), `connection: 'online' | 'reconnecting'` (socket + NetInfo), `perm.location`, `perm.notifications` (OS, re-read on resume).
- **Feature flag**: `merchantDispatchAutoEnabled` drives J3/J5/M4 and every food line or chip.
- **Board**: `jobs[]` (socket add/remove), `selectedJobId`, `myOffers[]` (`{jobId, fare, eta, status: 'waiting' | 'chosen' | 'notChosen' | 'expired' | 'withdrawn'}`), `skipped:Set`, `demandZones[]` (`TODO(backend)`: `{lat, lng, radius, level}` from the last 60 min).
- **Offer form**: `fare` (cents, integer), `etaMin ∈ {5,10,15,20}`, `band {min,max}`, `submitting`, `error`.
- **Food offer**: `offerId`, `expiresAt`, `upfront {payKitchen, collect}`; alarm lifecycle.
- **Active job** (persist to MMKV for offline + "Job restored"):
  - `vertical`, `stage`;
  - `checklist`, `photo {localUri, uploaded}`;
  - `code {attempts, locked}`;
  - `cash {yours, owedToKitchen}`;
  - `reach {startedAt, calls, whatsapps}`;
  - `outbox[]` (queued actions).
  - Stage resolver unit-tested for every A/B/X state.
- **Money**: `earnings {today, week, byDay[7], counts}` (`TODO(backend)` if only commission exists), `balance`, `floor`, `rate`, `cashHeld`, `ledger` (cursor pagination), `pendingTopUp`.
- **Standing**: `acceptance`, `rating`, `strikes {used, max: 3, windowDays: 30, oldestClearsAt}`, `pauseHours: 24` (`TODO(backend)`).

## Interactions and motion
- Sheet snap: spring (damping ~20). The map re-fits on snap with 250 ms ease-out.
- Pin ↔ card select: the pin scales 20 → 24 over 150 ms.
- Toasts slide up 200 ms and auto-dismiss after 4 s (Undo toast 5 s).
- Pressed states: primary fill → `--accent-700`; ghost → `--surface` fill. No ripple colour change on map pills.
- Haptics: light on job ping / picked, heavy on food offer, error buzz on a wrong code.
- Use Reanimated for all motion and respect reduced motion.

## Assets
- Icons: Lucide (subset + additions listed above; path data in `rv-kit.jsx` / `as-kit.jsx`).
- Sun/moon stickers: as in `handoff/home-8c`.
- No raster images. Photos and avatars are placeholders.

## Files
- `design/Rider v2 (standalone).html` (open this one)
- `design/Rider v2.html`: unbundled source with the state list `ST`
- `design/rv-kit.jsx`: **R copy object**, sample data, shared rider parts
- `design/rv-board.jsx`: board, offer, `GATES`, food offer
- `design/rv-job.jsx`: active job, problem sheet, exceptions
- `design/rv-money.jsx`: Money, Top up
- `design/rv-account.jsx`: Account (both), switch, histories, Settings, Bike & documents, Help
- `design/as-kit.jsx`, `design/sc2-kit.jsx`: After Send / Send v2 kits (unchanged)
- `tokens/*.css`: token source of truth (copies)
- `BRIEF.md`: decisions + open questions · `PROMPT.md`: original brief · `CLAUDE-CODE-PROMPT.md`: the implementation prompt
