# Handoff: LyniaGo "After Send" — one order screen

## Overview
This covers everything a customer sees in the LyniaGo Android app (Expo / React Native) after tapping **Send to riders**: finding a rider, choosing from offers, live tracking, hand-off with a delivery code, delivery and rating, and every failure (no match, rider cancelled, cancel, not delivered, cancelled, GPS paused, offline).

It all happens on **one screen**: a full-bleed map on top and a bottom sheet whose content changes with the order status. It follows **Send a parcel v2** (4 steps: Where · What · Price · Review), which has already shipped, and reuses its header, CTA bar, buttons, notices, toasts, pins and tokens.

`BRIEF.md` is the product brief and its decisions are final. If this README and the brief disagree, the brief wins.

## About the design files
The files in `design/` are **design references built in HTML/React-DOM**. They are prototypes that show the intended look, copy and behaviour. They are **not production code to copy**. Rebuild them in the existing Expo/React Native app with its own components, navigation, map library (react-native-maps or whatever is in use), bottom-sheet library, icon set and theme tokens.

- `design/After Send (standalone).html` opens offline in any browser. It has a prototype player (← → keys), every state at 360×720, the key states at 320×640, the navigation rules and the copy per state.
- `design/as-kit.jsx` holds the shared parts and **the `A` object with every user-facing string**.
- `design/as-screens.jsx` has one function per stage. Read it for the exact composition.
- `design/sc2-kit.jsx` is the Send v2 kit, reused as-is (Status, Btn, Notice, MapBox, MapPin, Dot, Sq, `lbl`).
- `screens/*.png` are 2× renders of every state (720×1440 for 360×720 frames, 640×1280 for 320×640).

## Fidelity
**High fidelity.** Colours, type, spacing, radii, tap-target sizes and copy are final. Match them with the app's primitives. **The copy ships verbatim**: take strings from `A` in `as-kit.jsx`. Names, prices, times, addresses and plates are sample data.

## Global constraints
- Frames are **360×720** (canonical) and **320×640** (must work). The sheet content scrolls, and nothing may sit under the CTA bar.
- **Tap targets ≥ 44 px. Primary CTA = 52 px.** Build them at those sizes rather than inflating them with hitSlop.
- **Every icon has a visible text label.** Users are often low-literacy, on low-end Android with patchy data.
- **Pickup = green dot, drop-off = red square, app-wide. Rider = dark bike disc** (new, see Map).
- **Cash only.** No card or wallet UI anywhere.
- **Inter** for all UI. Use tabular numerals for money, the code, times and countdowns.

## Design tokens (use only these)
| Token | Value | Use here |
|---|---|---|
| `--accent` | `#00b14f` | Fills only: primary CTA, route line, progress bars, stars, "Choose" button, finding rings |
| `--accent-text` | `#006630` | Green text/icons, Best match border, step circles (done/current), selected tag border |
| `--accent-wash` | `#e9f8ef` | Delivery code card, Best match tag, Verified tag, avatar initials bg, selected tags, success note, toast action |
| `--ink` | `#14181b` | Primary text, rider marker + name pill, toast bg, offline banner, plate border |
| `--muted` | `#5b6670` | Secondary text, icons in calm notices, paused rider marker |
| `--line` | `#e2e6ea` | Borders, dividers, ghost button border, empty stars, upcoming step line, sheet grabber |
| `--bg` | `#ffffff` | Surfaces |
| `--surface` | `#f6f7f8` | Map base, countdown pill, calm notices, "over your price" strip, reason box, suggested-price box |
| `--danger` | `#c0392b` | Drop-off marker, Help button, warn notice border+icon, destructive button text, not-delivered icon ring |
| `--radius-input` | 12 px | Cards, notices, toasts, offer cards |
| `--radius-pill` | 999 px | Buttons, tags, pills |
| `--text-label` | 12 px | Uppercase labels: 600, letter-spacing .04em, line-height 16, `--muted` (or `--accent-text` on the code card) |

Shadows: `--shadow-card` `0 1px 4px rgba(20,24,27,.08), 0 2px 12px rgba(20,24,27,.06)` (pins, map pills); `--shadow-sheet` `0 -2px 16px rgba(20,24,27,.08)` (CTA bar); `--shadow-menu` `0 4px 16px rgba(20,24,27,.1)` (toast, rider marker). Sheet: `0 -2px 16px rgba(20,24,27,.10)`. Help scrim: `rgba(20,24,27,.45)`. Dim map overlay: `rgba(255,255,255,.45)`.

**Type scale**: 48/800 hand-off code digits (40 under 340 px width) · 30/800 code card digits, letter-spacing .2em, line-height 36 · 28/700 prices in the finding and retry boxes, line-height 34 · 20/700 offer price · 18/700 sheet headline, line-height 24 · 17/700 receipt agreed price · 16/700 header title, CTA, rider name, "How was Tendai?" · 15/700 offer name, help row titles · 15/600 Back · 14/700 small buttons · 14 body (sub-lines on retry, cancel, not-delivered), line-height 20 · 13 secondary, line-height 18 · 12 hints, line-height 16 · 11/700 tags (Best match, Verified).

**Spacing**: sheet padding 4 16 16; vertical gap between sheet blocks **12**; card padding 12; CTA bar padding 10 16 12 with gap 8 between stacked buttons.

## Screen anatomy (shared by every state)
```
┌ Status bar 24 ───────────────────────────┐ system, don't build
├ Header 52 (+1 px --line bottom border) ──┤ total 77
│ [‹ Back]        Title         [Help]     │ grid 1fr auto 1fr, padding 0 8
├ Map (full-bleed, continues under sheet) ─┤
│   pickup ●   route ━━   rider ◉   ■ drop │
├╭ Sheet (radius 16 top) ─────────────────╮┤ top = 77 + (H−77) × peek
││        ▬ grabber 36×4 in a 16 px row   ││
││ content column, gap 12, scrolls        ││
│╰────────────────────────────────────────╯│
├ CTA bar (optional) ──────────────────────┤ pinned, --shadow-sheet
└──────────────────────────────────────────┘
```

### Header
- **Back**: 44 px tall. ChevronLeft 22 px plus "Back" 15/600 in `--accent-text`. Behaviour is under Navigation.
- **Title**: 16/700 `--ink`, centred, one line. Per stage:

| Status | Title |
|---|---|
| open_for_offers, 0 offers | Finding a rider |
| open_for_offers, 0 riders online | No riders online |
| open_for_offers, ≥1 offer | Choose a rider |
| assigned / confirmed / en_route_pickup | Rider on the way |
| picked_up / en_route_dropoff | Parcel on the way |
| en_route_dropoff and rider within ~150 m / arrived | Arriving now |
| expired (no pick) | No rider yet |
| rider cancelled before pickup | Rider cancelled |
| delivered | Delivered |
| completed (opened later) | Trip complete |
| undelivered | Not delivered |
| cancelled | Order cancelled |

  Never show "Order 8f3a91c2" or a raw status.
- **Help** appears on live trips only (matched → delivered). It has a 44 px hit area and a 34 px visual pill: 1.5 px `--danger` border, LifeBuoy 15 px plus "Help" 13/700, all in `--danger`. It opens the Get help panel (state 11).

### Map
- Full-bleed under the header, extending 18 px under the sheet's rounded top. Use the real map component.
- **Pickup**: 22 px `--accent` circle with a 3 px white border and `--shadow-card`. Below it a white "Pickup" pill, 12/600, padding 2 8.
- **Drop-off**: 20 px `--danger` square (radius 3) with a 3 px white border. Below it a "Drop-off" pill.
- **Route**: 5 px `--accent`, round caps.
- **Rider marker (new)**: a 34 px `--ink` circle with a 3 px white border, `--shadow-menu`, and a white Bike icon 17 px. Below it a 3 px gap, then a name pill: `--ink` background, white 12/600, padding 2 8, text = rider first name ("Tendai"). Anchor the circle centre on the GPS point and rotate nothing.
  - **Paused/offline**: the circle turns `--muted` at 85% opacity. The pill turns white with a 1 px dashed `--muted` border and `--muted` text "Last seen 3 min ago".
  - **Heading to pickup**: draw a dotted line from the rider to the pickup (3 px `--ink`, dash 2 / gap 6, round caps).
- **Finding rings**: two 40 px circles with a 2 px `--accent` stroke, centred on the pickup. Each scales from 0.5 to 3.2 while opacity goes from 0.7 to 0 over 2.4 s ease-out, infinite, offset by 1.2 s. With reduced motion, show one static ring at scale 1.6 and opacity .35.
- **Dimmed map** (cancel confirm, retry, cancelled): a white 45% overlay.
- **Fit**: padding = header + sheet peek height, so pins never hide under the sheet. Fit pickup + drop-off while finding; pickup + rider while heading to pickup; rider + drop-off after pickup. Animate re-fits over 400 ms.
- No Expand / Recenter buttons. The sheet does that job.

### Sheet
- White, radius 16 on the top corners. A 16 px grabber row holds a 36×4 `--line` bar, radius 2.
- **Peek** = share of (H − 77) given to the map:

| Stage | Map share | Sheet top at 720 / 640 |
|---|---|---|
| Finding (1, 1b, 2, 5) | 34% | 296 / 267 |
| Tracking, cancel (6, 7, 9, 10, 11, 19) | 30% | 270 / 244 |
| Cancelled (18) | 30% | 270 / 244 |
| Retry (12, 13) | 26% | 244 / 222 |
| Not delivered (17) | 22% | 218 / 199 |
| Completed (16) | 20% | 206 / 189 |
| Hand-off (8) | 17% | 186 / 171 |
| Offers (3, 4) | 16% | 180 / 166 |
| Delivered / rated (14, 15) | 14% | 167 / 157 |
- **Snaps**: peek ↔ full. At full, the map keeps a 96 px strip under the header. Drag or tap the grabber. Content scrolls inside the sheet at either snap.
- The sheet content area ends at the top of the CTA bar.

### CTA bar
This is the Send v2 bar: white, `--shadow-sheet`, padding 10 16 12, buttons 52 px tall with a pill radius, 16/700.
- **Primary**: `--accent` fill, white text.
- **Ghost**: white, 1.5 px `--line` border, `--accent-text` text.
- **Ghost-danger**: the same with `--danger` text.
- Icons are 18 px, in the label colour, 8 px gap.
- **Stacked** (two buttons, 8 px gap) for: Keep order / Cancel order, Send again at $X / Edit order, Call rider / Send again, Send again / Call support.
- **Side by side** for: Yes, cancel / Keep looking (with a hint line above); Skip (flex 1) / Submit rating (flex 2).
- **Hint line**: 13 px `--muted`, centred, 8 px above the buttons.
- Bar height: 74 for one button, 134 for two stacked, 100 for one row with a hint.

## Shared components
### Small button (`SmBtn`)
44 px, pill, padding 0 14, 14/700, icon 16 px with a 6 px gap.
- **ghost**: white, 1.5 px `--line` border, `--accent-text`.
- **fill**: `--accent`, white.
- **white**: white with no border, used on the code card.

### Countdown pill
28 px, pill, `--surface`, padding 0 10. Timer icon 14 px `--muted`, then "1:24 left" 13/700 tabular. Under the finding headline sits a 4 px bar showing how much of the offer window is left (track `--line`, fill `--accent`, radius 2).

### Offer card
- Container: 1 px `--line` border, radius 12, padding 12, white. The **Best match** card has a 2 px `--accent-text` border instead, with padding 11.
- Layout: a row with align-items flex-start and gap 10, containing:
  1. **Avatar** 44: rider photo, or initials 15/700 `--accent-text` on an `--accent-wash` circle.
  2. **Info** column, flex 1, gap 2:
     - Best match tag (first card only): 11/700 `--accent-text` on `--accent-wash`, pill, padding 1 8, 2 px bottom margin.
     - Name 15/700, line-height 20.
     - Star (13 px, filled `--ink`) + "4.8 · 132 trips", or "New · 3 trips" when unrated. 13 `--muted`.
     - Clock 13 px + "ETA 6 min", 13 `--muted`.
  3. **Right** column, align-items flex-end, gap 6: price 20/700 tabular, then a **Choose** SmBtn fill.
- **Above the customer's price**: a full-width strip below the row: `--surface`, radius 8, padding 6 10, 12/600 `--ink`, "+$0.64 over your price. Choose to accept $4.00."
- The best-match score weighs price, ETA and rating, and the list sorts by it. **No sort chips. No Decline.**

### Step track
- Four equal columns: Matched · Picked up · On the way · Delivered.
- Each column has a 20 px circle (11/700) with the label 12/16 4 px below it, centred and on one line.
- 3 px connector lines run behind the circles at y = 8. A segment is `--accent` up to the current step and `--line` after it.
- **Done**: `--accent-text` circle with a white 12 px check (stroke 3). Label 600 `--accent-text`.
- **Current**: `--accent-text` circle with a white number and a 4 px `--accent-wash` halo (box-shadow). Label 700 `--ink`.
- **Upcoming**: `--surface` circle with a 1 px `--line` border and a `--muted` number. Label 600 `--muted`.
- Status → current step:

| Status | Current step |
|---|---|
| assigned, confirmed, en_route_pickup | Matched (0) |
| picked_up | Picked up (1) |
| en_route_dropoff, arriving | On the way (2) |
| delivered | Delivered (3) |

### Rider card
- 1 px `--line` border, radius 12, padding 12, column gap 10.
- Row (gap 12):
  - **Photo** 48 circle. Placeholder: `--surface` with a User icon.
  - **Info** column, gap 3:
    - Name 16/700 plus the Verified tag: 20 px, pill, `--accent-wash`, ShieldCheck 13 px + "Verified" 11/700 `--accent-text`, padding 0 7 0 5.
    - A wrapping row (gap 10, 13 `--muted`): star "4.8 · 132 trips", then "Bike" and the plate chip "ABH 4721" (12/700, letter-spacing .08em, 1.5 px `--ink` border, radius 4, padding 0 6, line-height 18).
- **Buttons** row (gap 8, each flex 1): ghost SmBtn Phone "Call", ghost SmBtn MessageCircle "WhatsApp".
  - Call opens the dialer with the rider phone.
  - WhatsApp opens `https://wa.me/<E.164 without +>`.
- **Masked** (after the trip ends): hide the buttons and show "+263 7• ••• ••80" 13 `--muted` under the rating row.

### Delivery code card (states 6, 7, 9, 19)
- `--accent-wash` background, radius 12, padding 12 12 12 14, column gap 6.
- Row: on the left, the label "DELIVERY CODE" (`--accent-text`) above the digits "4182" (30/800, letter-spacing .2em, tabular). On the right, a white SmBtn Share2 "Share code".
- Help line, 13/18 `--ink`: "Give this code to the recipient. The rider enters it at hand-off." When offline, prefix it with "Your code works without data. ".
- **Share code** opens the Android share sheet (SMS/WhatsApp) with `A.shareMsg`: "Your LyniaGo parcel is on its way with Tendai (bike ABH 4721). Give the rider this code at hand-off: 4182"

### Code big (state 8, hand-off)
- `--accent-wash` background, radius 16, padding 14 14 16, centred column, gap 10.
- Label, then 4 digit boxes with an 8 px gap. Each box is 64×80 (54×70 under 340 px width), white, 2 px `--accent-text` border, radius 12, with the digit 48/800 (40) tabular.
- Then "The recipient tells the rider this code. Only then is your parcel handed over." 14/20, centred.
- Share code moves into the CTA bar as the primary button.

### Google Maps row
- min-height 56, 1 px `--line` border, radius 12, padding 6 10 6 12, gap 12.
- 32 px `--accent-wash` circle with Navigation 16 px `--accent-text`.
- "Follow route in Google Maps" 14/600 over "The same route your rider is using" 12 `--muted`.
- ChevronRight 18 `--muted` on the right.
- Opens `google.navigation:` or a maps URL with origin = rider and destination = current leg.

### Pickup photo row (state 7 onwards)
- 1 px `--line` border, radius 12, padding 8, gap 10.
- 52×52 thumbnail, radius 8.
- "Pickup photo" 14/600 over "Taken by Tendai at 09:12" 12 `--muted`.
- Ghost SmBtn Camera "View" opens a full-screen image viewer.

### Notice (from v2)
Radius 12, padding 10 12, an 18 px icon and 13/19 text.
- **calm**: `--surface` background, `--line` border, `--muted` icon.
- **warn**: white background, 1 px `--danger` border, `--danger` icon, `--ink` text.

### Tags
- 44 px, pill, padding 0 14, 13/600.
- **Off**: 1 px `--line` border, `--ink` text.
- **On**: 1.5 px `--accent-text` border, `--accent-wash` background, `--accent-text` text, and a 14 px check.
- Wrap with an 8 px gap. Multi-select.

### Stars
- Five 44×44 targets, each holding a 36 px star (stroke 1.6). Filled = `--accent` fill and stroke; empty = `--line` stroke.
- The rating word sits 6 px to the right, 15/700 `--accent-text`: 1 Bad · 2 Poor · 3 OK · 4 Good · 5 Great.

### Receipt
- 1 px `--line` border, radius 12, padding 10 14 12.
- Header: "Receipt" 15/700, with "Ref 8F3A-91C2" 12 `--muted` on the right.
- Two stop lines (10 px marker, name 13/600 with ellipsis, time 13 `--muted` on the right).
- Key–value rows, each with a 1 px `--line` top border and padding 8 0. Key 13 `--muted`; value 13/600, right-aligned:
  - Items
  - Rider ("Tendai M. · ABH 4721")
  - Rider phone (masked)
  - Agreed price (value 17/700)
  - A row with Banknote 15 `--accent-text` + "Paid cash to rider"
- "Numbers are hidden now the trip's over." 12 `--muted`.
- A full-width ghost SmBtn Share2 "Share receipt" (shares a text receipt).

### Toast (from v2)
- 12 px from the left and right, sitting 10 px above the CTA bar. `--ink` background, white 13/18, radius 12, `--shadow-menu`, an 18 px icon.
- Optional action: 44 px, radius 10, `--accent-wash`, `--accent-text` 700.
- **Undo variant**: Undo2 + "Undo · 0:09", counting down from 10 s.

### Icon disc
A 56 px (or 40 px) circle with an icon at 46% of its size.
- **calm**: `--surface` background, `--muted` icon.
- **ok**: `--accent-wash` background, `--accent-text` icon.
- **danger**: white with a 1.5 px `--danger` ring and a `--danger` icon.

## States
The numbers match `screens/` and the labels in the HTML. Every state is the same screen; only the title, map mode, sheet content and CTA change.

**1 · Finding, just sent** (`01-finding.png`)
- Title "Finding a rider". The map has the finding rings.
- Sheet:
  - Row: "Finding riders near you…" 18/700 on the left, countdown "1:24 left" on the right.
  - Progress bar.
  - Bike 16 + "3 riders have seen it" (uses the nearby/seen count).
  - Price box (1 px `--line`, radius 12, padding 10 10 10 14): label "YOUR PRICE", "$3.36" 28/700, Banknote + "Cash to your rider" 12 `--muted`, and on the right a ghost SmBtn "+ $0.50".
  - "Offers show here as riders reply." 13 `--muted`, then 1 skeleton offer card.
- CTA: ghost X "Cancel request".

**1b · Cancel request confirm** (`01b-…`)
- The same sheet. The CTA bar becomes the hint "Stop looking for a rider? Nothing to pay." with a row: ghost-danger "Yes, cancel" and primary "Keep looking".
- No modal. Back or Keep looking restores the normal bar.

**2 · No riders online** (`02-…`)
- Title "No riders online". No rings.
- Line "No riders nearby yet".
- The price box has no "+ $0.50" (a higher price won't help).
- Calm notice with a Clock icon: bold "No riders are online near you right now." followed by "Most riders are online 7–9am and 5–7pm. We'll keep looking until the timer ends."
- Text link with Bell: "Notify me when a rider's online" (44 px, 14/600 `--accent-text`).
- CTA: Cancel request.

**5 · Price raised in place** (`05-…`)
- After tapping "+ $0.50": the price reads "$3.86", followed by "was $3.36" 13 `--muted` with a line-through.
- Below the box, a success note (`--accent-wash`, radius 12, padding 10 12, CircleCheck 18 + 13/600 `--accent-text`): "Price raised to $3.86. Riders have been told." It stays for 4 s, then fades.
- The countdown keeps running. It does not reset.

**3 · Offers** (`03-offers.png`, `320-03-offers.png`)
- Title "Choose a rider". The map is a strip.
- Row: "3 offers" 18/700 with the countdown "0:58 left".
- Row: "Your price **$3.36**" over "Cash to your rider", with "+ $0.50" on the right.
- Offer cards:
  - Tendai M. $3.00 · Best match.
  - Kudzai N. $4.00, with the over-price strip.
  - Farai R. $3.36 · New.
- Footnote 12 `--muted`: "Best match weighs price, how close the rider is, and rating."
- CTA: Cancel request.

**4 · Select race** (`04-…`)
- Tendai's card is removed. The list re-ranks: Farai (Best match), then Kudzai.
- Toast with CircleAlert, no action: "Tendai was just taken by another customer. Pick another rider." It lasts 4 s.

**6 · Matched, to pickup** (`06-…`, `320-06-…`)
- Title "Rider on the way", Help visible.
- Map: rider off-route with a dotted line to the pickup.
- Sheet:
  - "Arriving at pickup in 6 min" 18/700, with a green dot + "Eastgate Mall, CBD" under it.
  - Step track (Matched current).
  - Rider card.
  - Code card.
  - Google Maps row.
  - Centred muted text link X "Cancel order · free until pickup".

**7 · Picked up, to drop-off** (`07-…`)
- Title "Parcel on the way". The rider is on the route.
- "Arriving at drop-off in 12 min", with a red square + "14 Glenara Ave, Avenues".
- Step track (On the way current).
- Pickup photo row, rider card, code card, Google Maps row, then the "Cancel order" link.

**8 · Hand-off** (`08-…`, `320-08-…`)
- Title "Arriving now". The rider is near the drop-off.
- "Tendai is at the drop-off", with the address under it.
- Step track (On the way), Code big, rider card.
- CTA: primary Share2 "Share code".

**9 · GPS paused** (`09-…`)
- Same as 7, but with the paused rider marker.
- A warn notice at the top of the sheet: "Your rider's location hasn't updated — call them to check in."

**19 · Offline** (`19-…`)
- Same as 7 with the paused marker.
- An `--ink` banner directly under the header (padding 10 14, a 16 px white spinner, 13/18 white): "Reconnecting… Showing the last update from 09:24."
- The code card help line is prefixed with "Your code works without data."

**10a · Cancel before pickup** (`10a-…`)
- The map is dimmed. Sheet:
  - "Cancel this order?"
  - CircleCheck 18 `--accent-text` + "It's free. Tendai hasn't picked up your parcel yet." 14/20.
  - "Reason (optional)" 13/600.
  - Tags (single-select): Sending it another way · Rider is too far · Changed my mind · Other. The first is selected in the mock.
- CTA stacked: primary "Keep order", ghost-danger "Cancel order".

**10b · Cancel after pickup** (`10b-…`)
- Warn notice: "Tendai already has your parcel. If you cancel, you arrange getting it back with them directly."
- The destructive button reads "Cancel anyway".

**11 · Get help** (`11-…`)
- The scrim covers the screen. A modal sheet slides up from the bottom (radius 16, padding 0 16 12) with:
  - "Get help" 18/700 over "Your trip keeps running while you're here."
  - Four rows (min-height 60, 1 px `--line` top border, 40 px icon disc, title 15/700, sub 12 `--muted`, chevron):
    1. Emergency, danger style: "Emergency? Call 999" / "Police, ambulance or fire". Opens the dialer.
    2. "Call LyniaGo support" / "We answer 7am–9pm".
    3. "Share my trip" / "Send a live link to someone you trust".
    4. "Report a problem" / "Wrong item, damage, rider behaviour".
  - A ghost "Close" button.

**12 · No match** (`12-…`)
- Title "No rider yet". The map is dimmed.
- Centred: a 56 px calm Clock disc, "No rider took $3.36 this time." 18/700, "Riders nearby usually take a little more for this trip." 14 `--muted`.
- Suggested box: `--surface`, radius 12, padding 10 14. Label "SUGGESTED PRICE" over "$3.86" 28/700, with "$0.50 more than last time" 12 `--muted` right-aligned (max-width 120).
- Check 15 + "Your route, items and phones are kept." 13 `--muted`, centred.
- CTA stacked: primary RefreshCw "Send again at $3.86", ghost Pencil "Edit order".

**13 · Rider cancelled** (`13-…`)
- Same layout, title "Rider cancelled", with a Bike disc.
- "Your rider had to cancel." / "It happens. Send again and we'll find someone new."

**14a · Delivered, rate** (`14a-…`, `320-14a-…`)
- Title "Delivered". The rider sits at the drop-off.
- Row: 40 px ok CircleCheck disc + "Parcel delivered" / "Handed over at 09:31 with code 4182."
- A 1 px divider.
- Row: 36 px photo + "How was Tendai?" 16/700.
- Stars (4 = "Good").
- "What went well? · Optional" 13/600.
- Tags (multi): On time · Careful with parcel · Friendly · Good communication.
- The receipt follows below.
- CTA row: ghost "Skip" (flex 1) and primary "Submit rating" (flex 2). Submit is disabled until a star is chosen.

**14b · Low rating** (`14b-…`)
- 1–2 stars switch the copy to "What went wrong?" and the tags to: Late · Parcel damaged · Rude · Hard to reach.

**15 · Rated** (`15-…`)
- Header row: "Parcel delivered" with "You rated Tendai" and five 14 px stars.
- Receipt.
- Toast: CircleCheck "Thanks — you rated Tendai 4 stars." with the action "Undo · 0:09".
- CTA: primary "Back to home".
- Undo restores 14a with the previous selection.

**16 · Completed** (`16-…`)
- Title "Trip complete". The map shows the route only.
- "Delivered Tue 30 Sep, 09:31" 18/700, then the rated line, the receipt, and a centred LifeBuoy text link "Get help with this order".
- CTA: RefreshCw "Send again".

**17 · Not delivered** (`17-…`)
- Title "Not delivered". The rider is near the drop-off.
- Row: 40 px danger CircleAlert disc + "Tendai couldn't deliver your parcel".
- Reason box (`--surface`, radius 12, padding 10 14): "REASON FROM YOUR RIDER" over "Recipient didn't answer · 3 tries" 15/600.
- "The parcel is still with Tendai. Call to agree how to get it back, or try the drop-off again." 14 `--muted`.
- Rider card without buttons. The number is still visible because the rider has the parcel.
- CTA stacked: primary Phone "Call rider", ghost RefreshCw "Send again".

**18a/b/c · Cancelled** (`18a/b/c-…`)
- Title "Order cancelled". The map is dimmed.
- Centred: a Ban disc, then the headline by who cancelled:
  - "You cancelled this order"
  - "Tendai cancelled this order"
  - "LyniaGo cancelled this order"
- Then "**Reason:** …" 14 `--muted`.
- a / b: Banknote + "Nothing to pay." CTA: "Send again".
- c: no "Nothing to pay". CTA stacked: "Send again" + ghost Phone "Call support".

## Interactions & behaviour
- **Live updates**: subscribe to order status and rider GPS (socket, or a 5 s poll on patchy data). A status change swaps the sheet content. GPS moves the marker with an 800 ms linear tween.
- **Stage transition**: the title cross-fades and the sheet content cross-fades (opacity 0 → 1, translateY 8 → 0) over 250 ms ease-out. The sheet animates to the new peek height. The map re-fits. Under reduced motion, cut instantly.
- **Countdown**: the offer window comes from the server (`expiresAt`). It ticks every second, and at 0 the screen moves to state 12. "+ $0.50" doesn't reset it.
- **+ $0.50**: PATCH `/orders/:id/price` with `{price: current + 0.50}`. Optimistic update plus the success note. On failure, revert and show the v2 toast "Couldn't update the price. Try again." with a retry. Hidden while 0 riders are online.
- **Offers**: new offers insert by best-match score with a 200 ms slide-in. Don't reorder while a finger is down on the list.
- **Choose**: a spinner in that button, and the other Choose buttons are disabled. On success the status → assigned → state 6. On 409 (taken): remove the card and show the select-race toast.
- **Cancel request** (finding): the inline confirm in the CTA bar (1b). Yes → POST cancel → state 18a.
- **Cancel order** (tracking): a sheet panel (10a/10b). The reason is optional. Keep order is the primary button.
- **GPS paused**: no GPS update for 60 s shows state 9's marker and notice. The next fix clears it.
- **Offline**: NetInfo offline shows the banner (state 19). Keep the last state, and the code and phone numbers stay visible. It reconnects silently.
- **Retry**: "Send again at $X" re-posts the same order (route, items, note, phones) at the suggested price (last price + $0.50) and returns to state 1 on this screen. It never re-opens the Send flow. "Edit order" opens Send v2 step 4 (Review) prefilled.
- **Rating**: Submit posts `{stars, tags[]}` and shows a 10 s Undo. After 10 s it's final. Skip posts nothing and shows the receipt (state 15 without the toast).
- **Masking**: after delivered, completed or cancelled, the rider phone is masked and Call/WhatsApp are hidden. Undelivered keeps them.
- **Help**: the header Help button opens the panel. Emergency dials 999 (confirm the number with ops). Share my trip opens the share sheet with a live link.

## Navigation
- **One route**: `/order/:id` (`OrderScreen`). The server status picks the sheet. Stages never push new screens, so Back never walks through old stages.
- **"Send to riders"** does a `navigation.replace('Order', {id})` on the Send flow, so Back can never land on Review for a live order.
- **Back** (header button and Android hardware back, in this order):
  1. If a panel is open (1b cancel confirm, 10a/b, 11 Help, photo viewer), close it.
  2. If the sheet is at full, snap it to peek.
  3. Otherwise go Home. Live orders keep running, and Home shows a **live-order bar** ("Rider on the way · 6 min") that reopens `/order/:id`. End states go Home, or back to Your orders if opened from there.
- **Ways in**: push notifications for each stage change (offer arrived, matched, picked up, arriving, delivered, not delivered, cancelled) deep-link to `/order/:id`. Also the Home live-order bar and Your orders → any order.
- **Edit order** pushes Send step 4 prefilled. Back from there returns to the retry screen.

## State
```ts
type OrderStatus = 'open_for_offers'|'assigned'|'confirmed'|'en_route_pickup'|'picked_up'|'en_route_dropoff'|'delivered'|'completed'|'expired'|'cancelled'|'undelivered';
type Offer = { id: string; riderId: string; name: string; photoUrl?: string; rating?: number; trips: number; etaMinutes: number; price: number; aboveAsk: boolean; score: number };
type Rider = { id: string; name: string; photoUrl?: string; rating?: number; trips: number; plate?: string; verified?: boolean; phone?: string /* masked server-side after trip */ };
type OrderScreenState = {
  order: { id: string; status: OrderStatus; price: number; prevPrice?: number; expiresAt?: string; ridersNearby: number; seenCount: number;
           pickup: Stop; dropoff: Stop; items: Item[]; code?: string; pickupPhotoUrl?: string; etaMinutes?: number;
           cancelledBy?: 'customer'|'rider'|'lyniago'; cancelReason?: string; undeliveredReason?: string; deliveredAt?: string; pickedUpAt?: string };
  offers: Offer[]; rider?: Rider; riderPos?: { lat: number; lng: number; at: string };
  ui: { sheet: 'peek'|'full'; panel?: 'cancelRequest'|'cancel'|'help'|'photo'; choosingOfferId?: string; toast?: { text: string; action?: string };
        priceNote?: boolean; rating?: { stars: number; tags: string[]; submittedAt?: string }; online: boolean };
};
```
Derived values:
- `gpsPaused = now − riderPos.at > 60 s`
- `arriving` = status en_route_dropoff and distance < 150 m
- `stage` = f(status, offers.length, ridersNearby, arriving)

## Needs backend (build the UI; stub if missing)
- PATCH the price on an open order.
- Parcel rating tags.
- Live ETA per leg.
- Rider photo, plate and verified flag on the customer side.
- WhatsApp deep link (needs the rider phone in E.164).
- Share-trip link.
- `seenCount`.

## Assets
- Icons are Lucide (ISC): ChevronDown (rotated for Back), ChevronRight, Timer, Bike, Banknote, Clock, Star, Phone, MessageCircle, ShieldCheck, Share2, Camera, Navigation, LifeBuoy, X, Check, CircleCheck, CircleAlert, TriangleAlert, Bell, RefreshCw, Pencil, Undo2, Ban, User.
  - The app's icon subset is missing MessageCircle, ShieldCheck, Share2, Camera, LifeBuoy, Undo2 and X. Add them (the path data is in `as-kit.jsx` → `addIcons`).
- No images. The rider photo and pickup photo come from the API. When there's no photo, fall back to initials or a User icon.
- The map in the mocks is a drawn placeholder. Use the real map and keep the pin, route and marker styling above.

## Removed vs today's screens
- The "Order 8f3a91c2" title and raw status pills.
- The 7-step vertical timeline.
- Sort chips.
- Full-width "Choose this rider".
- The separate counter card with Decline.
- The phone number as the rider title.
- The small map box with Expand / Recenter.
- The code hidden behind "Re-issue delivery code".
- Separate expired / no-riders / rider-cancelled screens.
- "Raise price & send again" creating a new order.
- The separate "Rate your rider" card.
- The gold rider pin.

## Files
- `CLAUDE-CODE-PROMPT.md`: paste into Claude Code.
- `BRIEF.md`: the product brief (source of truth).
- `design/After Send (standalone).html`: open to view everything.
- `design/as-kit.jsx`, `design/as-screens.jsx`, `design/sc2-kit.jsx`: the reference implementation and the `A` / `S` copy objects.
- `screens/`: 2× PNG of every state, plus 320×640 re-checks.
