# Handoff: LyniaGo "Send a parcel" — v2 (stepped flow, inline address)

## Overview
This is a redesign of the customer **Send a parcel** compose flow in the LyniaGo Android app (Expo / React Native). LyniaGo is a cash, name-your-price parcel marketplace in Harare. The customer builds a request and broadcasts it to nearby riders, who bid on it.

v2 replaces one long bottom sheet with **4 steps: 1 Where · 2 What · 3 Price · 4 Review**. Addresses are **edited inline on the map screen**. These are removed: the address-search screen, the confirm-pin screen, landmarks, declared value and the disclaimer.

`PROMPT.md` is the product brief, and its decisions are final. If this README and the brief disagree, the brief wins.

## About the design files
The files in `design/` are **design references built in HTML/React-DOM**. They show the intended look, copy and behaviour. They are **not production code to copy**. Rebuild them in the existing Expo/React Native app, using its components, navigation, map library and theme tokens.

- Open `design/Send Compose v2 (standalone).html` in any browser. It works offline, and every state is shown side by side at 360×720 and 320×640. The changelog and copy-per-state are at the bottom.
- `design/sc2-kit.jsx`: shared parts (status bar, header, step bar, CTA, address row, suggestion row, field, item card, chips, route strip, notice, toast, keyboard, faux map), plus the **`S` object holding every user-facing string**.
- `design/sc2-step1.jsx`: Step 1 (Where), all modes.
- `design/sc2-steps.jsx`: Steps 2–4, sending, failed, offline, send-again, account on hold.
- `design/Send Compose v2.html` is the non-bundled source. It expects the design-system root at `../../`, so use the standalone file for viewing.

## Fidelity
**High fidelity.** Colours, type, spacing, radii, tap-target sizes and copy are final. Match them using the app's existing primitives. **The copy ships verbatim**: take the strings from the `S` object in `sc2-kit.jsx` (also listed under "Copy" below).

## Global constraints
- **Frames:** 360×720 is canonical, and every screen must also work at **320×640**. Content scrolls; nothing may overlap the CTA.
- **Tap targets:** ≥ 44 px. The primary CTA and the price − / + buttons are **52 px**. Build them at these sizes (don't rely on hitSlop inflation).
- **Every icon has a visible text label** (for example "✎ Change", "🔍 Search", "✕ Clear", "✎ Edit", "‹ Back"). Users are often low-literacy and on low-end Android with patchy data.
- **Pickup = green dot (circle), drop-off = red square, app-wide.** This applies to map pins, row markers, the summary and the route strip.
- **Cash only.** No card or wallet UI.
- Never show risk, consent or disclaimer copy in this flow.
- Fonts: **Inter** for all UI. Fredoka is for the wordmark only, and it doesn't appear in this flow.

## Design tokens (use only these)
| Token | Value | Use |
|---|---|---|
| `--accent` | `#00b14f` | Fills only: primary CTA, step-bar progress, price band, route line, pickup marker |
| `--accent-text` | `#006630` | Green text, links, icons, focused input border (2 px), done/current step circle |
| `--accent-wash` | `#e9f8ef` | Action-icon circles in dropdown, send-again banner, toast retry button, parks on map |
| `--ink` | `#14181b` | Primary text, map hint pill, toast background, price-marker |
| `--muted` | `#5b6670` | Labels, hints, placeholders, disabled CTA text |
| `--line` | `#e2e6ea` | Borders, dividers, disabled CTA fill, inactive step bar, keyboard background |
| `--bg` | `#ffffff` | Surfaces |
| `--surface` | `#f6f7f8` | Map base, calm notices, neutral icon circles |
| `--danger` | `#c0392b` | Drop-off marker, error border/text, "Outside our area", warn notices (border + icon only) |
| `--radius-input` | 12 px | Inputs, cards, notices, toasts |
| `--radius-pill` | 999 px | CTA, chips, map pills |
| `--text-label` | 12 px | Uppercase row labels (600, letter-spacing .04em) |

Shadows (existing DS tokens): `--shadow-card` `0 1px 4px rgba(20,24,27,.08), 0 2px 12px rgba(20,24,27,.06)`; `--shadow-sheet` `0 -2px 16px rgba(20,24,27,.08)` (CTA bar); `--shadow-menu` `0 4px 16px rgba(20,24,27,.1)` (open address card, toast).

**Type scale used:** 56/700 price (48 at width < 340), 22/700 hold title, 22/700 summary-bar price, 16/700 header title and CTA, 15/600 address values and field text, 15/600 section titles, 14/600 suggestion titles, 13/600 field labels, link buttons and chips, 12 hints and secondary, 12/600 uppercase labels. Line-heights sit on a 4 px grid. Use tabular numerals for money and qty.

## Shared components

### Status bar
24 px tall, 12/600, "09:41" left, "3G 84%" right. This is the system bar, so don't build it.

### Header
White, 1 px `--line` bottom border.
- **Row 1** (52 px): Back button (44 px tall; chevron-left 22 px + "Back" 15/600 `--accent-text`) on the left. Title "Send a parcel" 16/700, centred.
- **Row 2: step bar.** Padding 0 12 8. It has 4 equal columns with a 6 px gap. Each column has an 18 px circle (number 11/700, or a check when done) and the label 12 px, with a 3 px progress bar 4 px below.
  - Done: circle `--accent-text` with a white check, label `--accent-text` 600, bar `--accent`.
  - Current: circle `--accent-text` with a white number, label `--ink` 700, bar `--accent`.
  - Upcoming: circle `--surface` with a 1 px `--line` border and `--muted` number, label `--muted` 600, bar `--line`.
  - Full header height is ≈ 89 px. **Row 2 is hidden while an address row is being edited** (the header drops to ≈ 53 px) so the dropdown has room at 320×640.
- Back goes one step back. On step 1 it leaves the flow. Entered data is kept in both directions.

### CTA bar
Fixed to the bottom (or to the top of the keyboard when it's open). White, `--shadow-sheet`, padding 10 16 12.
- Button: 52 px, full width, pill. Enabled: `--accent` fill, white 16/700. Disabled: `--line` fill, `--muted` text. Loading: a white 18 px spinner plus "Sending…".
- An optional one-line hint above the button: 13 px `--muted`, centred, 8 px below. Use it only to say what's missing. No walls of text.

### Address card (step 1)
Floating card, 12 px from the left and right, 8 px below the header. White, radius 14, `--shadow-card` (or `--shadow-menu` while editing). Two rows separated by a 1 px `--line`.
- **Idle row:** min-height 56 px, padding 6 8 6 14, gap 12. Contents: 14 px marker (green circle or red square; outlined 2 px when empty), then the label (12/600 uppercase `--muted`, e.g. "PICKUP · Your location", where the suffix is `--accent-text`), then the value 15/600 on one line with ellipsis. On the right is a 44 px text button: "✎ Change" when filled, "🔍 Search" when empty, 13/600 `--accent-text`.
  - Empty placeholders: "Set pickup location" / "Where to?" in `--muted`.
  - Out of area: add a line "ⓘ Outside our area" 12/600 `--danger` under the value.
  - **No second line for landmarks, ever.**
- **Editing row:** the row turns into an input **in place**, 52 px tall, 2 px `--accent-text` border, radius 12. Inside are the label ("DROP-OFF" 12/600 `--accent-text`) and the typed text 15/600 with the cursor. On the right is a "✕ Clear" text button (44 px) once text exists. The keyboard opens.
- **Dropdown:** this is part of the same card, directly under the editing row. Its rows are 48 px min, padding 0 14, gap 12, with a 1 px `--line` top border.
  - Icon circle 32 px: `--accent-wash` with `--accent-text` icon for actions, `--surface` with `--muted` icon for results.
  - Title 14/600 (actions in `--accent-text`). Sub-line 12 `--muted` for the area (e.g. "Avenues, Harare").
  - Order:
    1. **"Use my current location"** (navigation icon), pinned at the top.
    2. Results, in a scrollable middle area.
    3. **"Tap the map to set the pin"** (map-pin icon), pinned at the bottom.
  - Max height = keyboard top − card top − 44 px, so a strip of live map (with the active pin) always shows between the dropdown and the keyboard.
- Row states to build:
  - idle filled
  - idle empty
  - editing with suggestions
  - editing, no results: a text row "No matches. Check the spelling, or set the pin on the map." (13 px `--muted`)
  - editing, slow data: a 12 px spinner with "Searching… Slow connection, hang on." and 2 skeleton rows
  - editing, no Places key / offline: a "📶✕ Search is limited right now. Type the street and area, or use the map." row, then device-geocoder matches

### Map (step 1)
Full-bleed under the header.
- Pins: pickup is a 22 px `--accent` circle with a 3 px white border and `--shadow-card`. Drop-off is a 20 px `--danger` square (radius 3) with a 3 px white border.
- Under each pin is a white pill label, 12/600: "Pickup" / "Drop-off". Labels are hidden while editing.
- Route: 5 px `--accent` stroke with round caps.
- Map pills: 44 px, white, pill, `--shadow-card`, icon + 13/600 `--accent-text`.
  - "Use my location", bottom-right, 12 px above the CTA bar.
  - When both pins are set: a dark `--ink` pill "3.1 km", bottom-left.
- Hint pill (open state): `--ink` background, white 12/600, "Or tap the map to set your drop-off", centred just under the pickup pin.

### Route strip (steps 2–3)
Card, 1 px `--line`, radius 12, padding 6, gap 10, 16 px margin below.
- A 64×56 mini map with both pins and the route, radius 8.
- Two lines (13/600, one line each): green dot 10 px + pickup name, red square 10 px + drop-off name.
- "✎ Edit" text button, 44 px. It goes to step 1.

### Field
- Label 13/600 `--ink`, 6 px below it.
- Input: 48 px (multiline min 68), 1 px `--line`, radius 12, padding 0 12, 15 px text.
- Focus: 2 px `--accent-text`. Error: 2 px `--danger` plus "ⓘ message" 13/600 `--danger` under the input.
- Hint 12 `--muted`, 6 px below. 14 px between fields.

### Item card
Card, 1 px `--line`, radius 12, padding 10 10 6, 8 px between cards.
- A description field (placeholder "e.g. Documents envelope").
- A row: "Qty" (12/600 `--muted`), a 44 px round "−" button, the value 17/700, a 44 px round "+" button (1.5 px `--line` border, glyph 22/700 `--accent-text`).
- When there's more than 1 item: "🗑 Remove" 13/600 `--muted`, right-aligned.

### Chips (recent recipients)
44 px, pill, 1 px `--line`, history icon + "Rita · 071 555 0090" 13/600. 8 px gap, wrapping. Shown only while Recipient phone is empty. Tapping one fills the field.

### Notice
Radius 12, padding 10 12, 18 px icon + 13/19 text.
- Calm: `--surface` background, `--line` border, `--muted` icon.
- Warn: white background, 1 px `--danger` border, `--danger` icon, `--ink` text. Warn notices are hints, never blocks.

### Toast
Floats 10 px above the CTA, inset 12. `--ink` background, white 13 px, radius 12, `--shadow-menu`. On the right is a 44 px retry button: `--accent-wash` background, "↻ Try again" 700 `--accent-text`.

## Screens / states
Numbers match the labels in the HTML.

**Step 1: Where.** The map is large.
1. **Open.** Pickup is auto-filled from GPS ("PICKUP · Your location", "Eastgate Mall, CBD"). Drop-off is empty ("Where to?"). The map hint pill shows. The CTA "Next" is disabled, with the hint "Add a drop-off to continue."
2. **Editing drop-off.** The step bar is hidden. The drop-off row becomes an input showing "14 Glenara", with the dropdown below it (Use my current location; 14 Glenara Avenue / Avenues, Harare; Glenara Avenue North / Highlands, Harare; Glen Lorne Shops / Glen Lorne, Harare; Tap the map to set the pin). A map strip and the pin are visible above the keyboard. The CTA is hidden behind the keyboard.
3a. **No results** ("14 Glenaraa"). 3b. **Slow data.** 3c. **No Places key / offline fallback.** See the row states above.
4. **Both pins set.** The map fits both pins and the route, with padding that clears the card and the CTA. The "3.1 km" pill shows. "Next" is enabled.
5. **Out of service area.** The row shows "Outside our area". A calm notice floats under the card: "We don't cover that pickup or drop-off yet. Move your pins closer to Harare to send your parcel, or check back as we expand." "Next" is disabled. Both pins stay visible.

**Step 2: What and who.** The map becomes the route strip. The content scrolls between the header and the CTA.
6. **Empty.** One empty item card, then "+ Add another item" (44 px), Note (multiline, placeholder "Ask for Rita at the pharmacy counter; keep it upright."), Your phone (sender) **prefilled** "+263 77 245 1180" with its hint, and Recipient phone (empty) with chips and its hint. "Next" is disabled, with the hint "Still needed: what you're sending, recipient phone".
7. **Typing an item description.** The keyboard is open, the item field is focused, and the CTA bar sits above the keyboard.
8. **Max items (10).** "Add another item" is replaced by a calm notice "Up to 10 items per order." Each card shows Remove.
9. **Invalid recipient phone.** "077 12" shows the error "That doesn't look like a phone number". "Next" is disabled.

**Step 3: Price.**
10. **Suggested.** "Your price", then a big "$3.36" (tap to type an exact amount, decimal keypad; dashed 2 px `--line` underline; hint "✎ Tap the price to type an amount"). Two 52 px ghost buttons "− $0.50" / "+ $0.50". A band bar: 8 px `--line` track over the $0–$6 range, an `--accent` segment from $2.96 to $3.80, and an 18 px `--ink` marker with a 3 px white ring (clamped at the ends). Then "Riders usually accept around $2.96–$3.80" with "3.1 km" right-aligned, and "💵 Cash to your rider". CTA: "Review".
11. **Below the band** (< $2.96): a warn notice "That's below what riders usually take — they may pass. Nudge it up for a faster match."
12. **Far above the band** (pick a threshold, suggested > 3× the band top): a warn notice "That's a lot more than usual for this trip — double-check you didn't add a digit by mistake."
"Review" stays enabled when price > 0.

**Step 4: Review.**
13. **Summary.** Blocks: card, 1 px `--line`, radius 12, padding 0 6 8 12, 6 px gap. Each has a 34 px header with an uppercase label and a "✎ Edit" 44 px text button that jumps to its step.
- **Route · 3.1 km**: pickup and drop-off lines with their markers.
- **Items**: "Documents envelope × 1" etc.
- **Note.**
- **Phones**: "You: …" / "Recipient: …".
- **Price** isn't a scrolling block. It's **pinned in the CTA bar** above the button, so it's never clipped: label "PRICE", "$3.36" 22/700, "💵 Cash to your rider", and "✎ Edit" → step 3.
- CTA: **"Send to riders"**. It goes straight to the live auction ("Finding riders near you…").
14a. **Sending.** The CTA shows a spinner and "Sending…", and is disabled. 14b. **Send failed.** A toast "Couldn't send. Check your data and try again." with "Try again". All data is kept and the CTA is enabled again.
15. **Offline.** A calm banner at the top, "You're offline. What you've entered is saved.", and a CTA hint "Connect to the internet to send." "Send to riders" is disabled. Steps 1–3 stay usable offline: the address dropdown falls back as in 3c.
16. **Send again.** The flow opens directly at step 4 with the past order prefilled. Banner (`--accent-wash`, no border): "Copied from your order on 28 Sep. Check it, then send." Back goes to step 3.
17. **Account on hold (blocking).** The header without the step bar. Centred: a 72 px `--surface` circle with a 32 px ban icon in `--danger`, "Your account is on hold" 22/700, and "You can't send parcels right now. Call us and we'll help you sort it out." 15/22 `--muted`. Bottom, 16 px inset, 10 px gap: primary "📞 Call support", ghost "Back to home". Check this before step 1 opens.

## Interactions & behaviour
- **Inline address editing:**
  - Tap a row: it becomes an input in place, the cursor goes in, the keyboard opens and the step bar collapses.
  - Typing is debounced (~300 ms) into Places autocomplete. Without a key, or offline, use the device geocoder (`expo-location` `geocodeAsync`).
  - Picking a result fills the row, closes the list and keyboard, moves that pin, re-fits the map to both pins and the route, and re-suggests the price.
  - "Use my current location" uses GPS and reverse-geocodes. "Tap the map to set the pin" closes the keyboard and makes the next map tap set this row's pin.
- **Map tap** drops or moves the **active** pin: the row being edited, else the first empty row, else the last edited row. The row text updates from the reverse geocode. **There is no confirm-pin screen.**
- **Pickup** is auto-filled from GPS on open, but stays editable the same way.
- **Service area:** validate each point against the Harare corridor polygon. If either point is outside, show state 5 and disable Next.
- **Step 1 → 2 transition:** the map collapses into the route strip. Use the app's standard screen or shared-element transition, ~250 ms ease-out, and skip it when reduced motion is on.
- **Price:** starts at the suggested fare and is re-suggested whenever a pin moves (if the user had edited the price, replace it and show the new suggestion). − / + step $0.50, floor $0.50. Typing accepts 2 decimals. The band is soft and never blocks.
- **Send:** POST the order (declared value = 0), then navigate to the auction screen. On failure show toast 14b and keep all state. Prevent double submit while loading.

## Validation
| Field | Step | Required | Rule |
|---|---|---|---|
| Pickup point + name | 1 | yes | Inside the corridor; name 1–160 chars (it is the rider-facing label) |
| Drop-off point + name | 1 | yes | Same as pickup |
| Items | 2 | yes | 1–10 rows; description 1–140 chars; qty 1–99 |
| Note | 2 | no | ≤ 280 chars (it holds gate, floor and "ask for…" details) |
| Sender phone | 2 | yes | ZW phone: `07XXXXXXXX` or `+2637XXXXXXXX`; prefilled from the last order or the account |
| Recipient phone | 2 | yes | Same rule; show the error on blur or Next, not on every keystroke |
| Price USD | 3 | yes | > 0 |

A step's CTA stays disabled until that step is valid. Missing items go into the single CTA hint line, or show as inline field errors.

## State
```ts
type Stop = { lat: number; lng: number; name: string; inArea: boolean; source: 'gps'|'search'|'map' };
type Item = { id: string; desc: string; qty: number };
type ComposeState = {
  step: 1|2|3|4;
  pickup?: Stop; dropoff?: Stop;
  editingRow?: 'pickup'|'dropoff'; query: string;
  suggest: { status: 'idle'|'loading'|'slow'|'ok'|'empty'|'limited'; results: {name:string; area:string; lat:number; lng:number}[] };
  items: Item[]; note: string; senderPhone: string; recipientPhone: string;
  price: number; suggested?: { fare: number; bandLow: number; bandHigh: number; km: number };
  sendStatus: 'idle'|'sending'|'failed';
  online: boolean; accountOnHold: boolean; prefillFrom?: string /* order id for Send again */;
};
```
Persist the draft across steps and app backgrounding. Mark `suggest.status = 'slow'` after ~2.5 s without a response.

## Copy (verbatim)
Every string is in the `S` object at the top of `design/sc2-kit.jsx`, and listed per state at the bottom of the HTML. Key strings:
"Back", "Send a parcel", "Where", "What", "Price", "Review", "PICKUP", "DROP-OFF", "Set pickup location", "Where to?", "Your location", "Change", "Search", "Clear", "Use my location", "Use my current location", "Tap the map to set the pin", "Or tap the map to set your drop-off", "Add a drop-off to continue.", "No matches. Check the spelling, or set the pin on the map.", "Searching… Slow connection, hang on.", "Search is limited right now. Type the street and area, or use the map.", "Next", "Outside our area", the out-of-area notice, "What are you sending?", "e.g. Documents envelope", "Qty", "Remove", "Add another item", "Up to 10 items per order.", "Note for the rider (optional)", "Ask for Rita at the pharmacy counter; keep it upright.", "Your phone (sender)", "Shared with your rider only during the delivery.", "Recipient phone", "So the rider can reach them at drop-off.", "That doesn't look like a phone number", "Still needed: what you're sending, recipient phone", "Your price", "Tap the price to type an amount", "− $0.50", "+ $0.50", "Riders usually accept around $2.96–$3.80", the low and high hints, "Cash to your rider", "Route", "Items", "Note", "Phones", "Edit", "You", "Recipient", "Send to riders", "Sending…", "Finding riders near you…", "Couldn't send. Check your data and try again.", "Try again", "You're offline. What you've entered is saved.", "Connect to the internet to send.", "Copied from your order on 28 Sep. Check it, then send.", "Your account is on hold", the hold body, "Call support", "Back to home".

Dynamic values (addresses, $ amounts, km, dates, phones) are sample data.

## Assets
- Icons are Lucide (ISC), already self-hosted in the app's icon subset: ChevronDown (rotated for back), Check, Search, Pencil, X, Navigation, MapPin, CircleAlert, TriangleAlert, WifiOff, Package, Plus, Trash2, History, Banknote, RefreshCw, Phone, Ban. Use `lucide-react-native` or the app's existing icon component.
- The map in the mocks is a placeholder drawing. Use the app's real map component and keep the pin, label and route styling above.
- No images.

## Removed (delete from the codebase)
- The address-search screen and route.
- The confirm-pin screen and the landmark field.
- The landmark second line in rows.
- The Declared value collapsible (send 0).
- The disclaimer sheet, consent checkbox and "Agree & broadcast".
- The single "Broadcast request" CTA.

## Files
- `PROMPT.md`: the product brief (source of truth for decisions).
- `design/Send Compose v2 (standalone).html`: open this to view everything.
- `design/sc2-kit.jsx`, `design/sc2-step1.jsx`, `design/sc2-steps.jsx`: the reference implementation of each part and state.
- `design/Send Compose v2.html`: the unbundled entry (needs the DS root).
