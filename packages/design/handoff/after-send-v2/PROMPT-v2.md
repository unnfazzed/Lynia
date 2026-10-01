# Prompt: LyniaGo "After Send" v2 — corrections + the states v1 didn't draw

## What you've been given (all attached, nothing to fetch)
- `after-send-v1/` — the v1 handoff you produced: `README.md` (spec), `BRIEF.md` (product decisions,
  final), `design/as-kit.jsx` (shared parts + the `A` copy object), `design/as-screens.jsx` (one function
  per stage), `design/sc2-kit.jsx` (Send v2 kit, reused), `design/After Send (standalone).html` (every
  v1 state, open it offline).
- `v1-screens/` — your v1 renders, state by state (01-finding … 19-offline, plus 320-* re-checks).
- `current-app/` — what the shipped Android app renders today for the same states, same file names.
  The map is grey in these renders (no tiles in the test renderer) — ignore the map half; judge the
  header, sheet, CTA bar and toasts.
- `tokens/` — the design tokens (colors, typography, spacing, fonts, icons). Use only these.

## Context
LyniaGo is a cash, name-your-price parcel marketplace in Harare (Expo/React Native, Android, low-end
phones, patchy data, many low-literacy users). After "Send to riders" the customer stays on ONE screen:
a full-bleed map, the Send-flow header (‹ Back · title · red Help on live trips), and a bottom sheet
whose content follows the order stage. v1 is implemented and shipping. Keep everything in v1 unless this
prompt changes it; BRIEF.md decisions remain final.

## Deliverable
1. An updated standalone HTML with every new or changed state at 360×720, key ones also at 320×640,
   each cell labelled with its number below (keep v1 numbers for v1 states; new states use 2.x ids).
2. An updated `A` copy object with every new string, verbatim-ready.
3. A README changelog: exactly what changed vs v1, per state.
Same tokens, components and type scale as v1. No new tokens.

---

## Part 1 — Corrections (v1 drew these wrong for the real product)

### 1.1 The delivery code is 6 digits, not 4
The server issues a 6-digit code (e.g. 418290). Compare `v1-screens/08-handoff-code.png` with
`current-app/08-handoff-code.png`: the app had to shrink the boxes to fit. Redraw every place the code
appears with 6 digits:
- **Code card** (states 6, 7, 9, 19): "DELIVERY CODE" + digits + white "Share code" on one row. Six
  digits at 30/800 with .2em tracking don't fit beside "Share code" at 320px. Choose: smaller digits,
  the button under the digits, or another layout. Draw at 360 AND 320.
- **Code big** (state 8, hand-off): six boxes must fit inside 300px (360 − 32 sheet padding − 28 card
  padding), 260px at 320. Choose box size, gap and digit size — or group as 3+3 ("418 290"). It must
  stay the biggest thing on the sheet and be readable at arm's length.
- The share message (`A.shareMsg`) and "Handed over at 09:31 with code 418290."

### 1.2 The grabber must clear the 44px tap-target floor
v1 says "drag or tap the grabber" but draws a 16px row; our rule is every tap target ≥ 44px. Either
draw a ≥ 44px grabber hit area (the visible bar can stay 36×4) and show how the sheet top changes, or
make it drag-only and drop the tap. Pick one and draw it.

### 1.3 Peek heights with the real CTA bar
Re-check every stage's peek so the first meaningful block (headline + countdown, first offer card,
ETA line, the code) is fully visible above the CTA bar at 320×640 with system font scale 1.3. Adjust
the peek table if needed.

---

## Part 2 — States the app needed that v1 never drew
Same screen and header for each; only the sheet, CTA, map mode and title change. Calm, short, final copy.

**Loading & errors**
- 2.1 Opening an order: header (Back, no title) + map + sheet skeleton before data arrives.
- 2.2 Couldn't load (network): message + "Try again" (primary) + "Back to home".
- 2.3 Not found / not yours (permanent): message + "Back to home" only.
- 2.4 Offline cold start with a saved copy: last-known route + price, ink "Reconnecting…" banner, "Try again".

**Finding / offers**
- 2.5 "+ $0.50" in flight (spinner in the button; price not changed yet).
- 2.6 "+ $0.50" failed: toast "Couldn't update the price. Try again." with a "Try again" action; price reverts.
- 2.7 Price raised while offers are already showing — where the success note sits relative to the list.
- 2.8 "Notify me" tapped: confirmed state (the link must not stay tappable) + the "can't take reminders
  right now" fallback.
- 2.9 "Choose" in flight: spinner in that card's button, others disabled; slow variant after ~5s.
- 2.10 Countdown hits 0 while a late offer arrives — still choosable briefly, or straight to No match?
- 2.11 Offer card variants: with photo; without (initials); new rider ("New · 3 trips"); very long name;
  offer equal to the customer's price.
- Note: the best-match ranking is computed by the app (price, ETA, rating), so any card can be first —
  `current-app/03-offers.png` shows Farai ranked first. Make sure the layout works whichever is first.

**Matched / tracking**
- 2.12 Matched, no GPS fix yet: no rider marker, no ETA. What replaces "Arriving at pickup in 6 min"?
- 2.13 Rider card variants: no plate on file; not verified (no Verified tag); no photo; long name +
  plate wrapping at 320px.
- 2.14 Code being issued (~1s): what the code card shows meanwhile. No "Re-issue" button (v1 removed it).
- 2.15 Call / WhatsApp when the rider's number isn't available yet.
- 2.16 Pickup-photo viewer (full screen from "View"): image, Close, who/when.
- 2.17 Report a problem (from Get help): issue form as a sheet over the trip — types Wrong item ·
  Damaged · Rider behaviour · Payment · Other, optional "Tell us more", "Send to our team"; then
  "Thanks — our team will look into it".
- 2.18 Emergency tapped: the dialer opens AND the LyniaGo safety team is alerted in the background. Is
  any confirmation needed when the user returns to the app?
- 2.19 Share my trip: no live link exists yet, so it shares text ("I'm sending a parcel with LyniaGo
  from … to …. My rider is Tendai M. (bike ABH 4721)."). Write the final share text.

**Retry / cancel**
- 2.20 Rider cancelled before pickup: the server has ALREADY reopened the order to other riders at the
  same price. State 13 stays, but should its copy say riders are already being asked? "Send again at
  $3.86" raises the price on that reopened order. Redraw 13 to be honest about this.
- 2.21 "Send again at $X" in flight, and failed (toast + retry).
- 2.22 Cancel in flight (spinner on "Cancel order" / "Yes, cancel") and failed.
- 2.23 Cancel reasons: v1 pre-selected the first chip. Confirm the default is none selected.

**Delivered / completed**
- 2.24 Rating submit failed after the undo window (toast + retry; keep stars and tags).
- 2.25 Trip complete opened later when the customer did NOT rate — what replaces "You rated Tendai
  ★★★★"? Can they still rate?
- 2.26 Trip complete when they did rate.
- 2.27 Receipt variants: several items; very long address; no pickup time recorded.
- 2.28 "Send again" on Trip complete / Not delivered / Cancelled opens the Send flow at step 2 with the
  "Copied from your order" banner. Confirm, or draw a one-tap variant.

**Not delivered / cancelled**
- 2.29 Every rider reason verbatim with "· N tries": Recipient didn't answer · Recipient refused the
  parcel · The address was wrong · Bike broke down.
- 2.30 Cancelled by the customer with no reason given.
- 2.31 Cancelled by LyniaGo: a specific ops reason vs the generic default.

**Global**
- 2.32 System font scale 1.3 at 320×640: states 3, 6, 8, 14a, 17. Text may wrap; nothing may overlap or
  truncate a button label or the code.
- 2.33 The Home "live-order bar" that reopens this screen ("Rider on the way · 6 min") per stage:
  finding · choose · on the way · arriving · delivered-unrated.
- 2.34 Push-notification copy for each stage change that opens this screen: offer arrived, matched,
  picked up, arriving, delivered, not delivered, cancelled.

---

## Part 3 — The gallery
The app's All Screens Gallery still holds the old LJ order screens (auction_finding, auction_live,
auction_counter, no_riders, select_race, auction_expired, rider_cancelled, track_active, track_code,
track_paused, track_dark, cancel, cancelled, undelivered, delivered_rate, rate_undo, completed).
Replace them with the v2 After Send states and map each old id to its new state number in the README.

## Constraints (unchanged, non-negotiable)
- Tokens only (`tokens/`): --accent #00b14f for fills only; --accent-text #006630 for green text;
  --accent-wash, --ink, --muted, --line, --bg, --surface, --danger; radius 12 / pill; 12px labels.
- Inter only; tabular numerals for money, codes, times and countdowns.
- Tap targets ≥ 44px, primary CTA 52px, drawn at size.
- Every icon has a visible text label. Cash only — no card/wallet UI.
- Pickup = green dot, drop-off = red square, rider = ink bike disc + name pill.
- Copy ships verbatim: final strings, short and plain.
- Frames 360×720; key states also 320×640.
