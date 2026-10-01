# Prompt: Redesign the LyniaGo "Send a parcel" compose screen (v2, 2026-10-01)

You are designing a redesign of the LyniaGo **Send a parcel** flow. This is an Android app (Expo/React Native) for a cash, name-your-price parcel marketplace in Harare, Zimbabwe. Customers build a delivery request and **broadcast it to nearby riders, who bid on it** (an auction). LyniaGo only connects the two sides.

## What's in this folder
- `Send Compose - Current (standalone).html` and `screens/*.png`: **the current app, as a reference only.** It reflects the earlier round. Where it disagrees with this prompt, **this prompt wins**. In particular, these are all gone:
  - the separate address-search screen (`04`)
  - the confirm-pin screen with its landmark field (`05`)
  - the landmark second line in the address rows
  - the Declared value collapsible
  - the disclaimer
- `PROMPT.v1.md`: the previous brief, superseded by this file.

## Decisions (final, do not reopen)

### 1. Address is edited inline, on the map screen. Never on another screen.
- The PICKUP / DROP-OFF rows sit on the map screen. **Tapping a row turns that row into a text box in place**, with the keyboard up and the cursor in the row.
- **Suggestions drop down directly under the row**, while the map stays visible above or behind it.
- Picking a suggestion fills the row, closes the list, and **moves that pin on the same map**. The map then re-fits to show both pins and the route.
- There is **no address-search screen and no confirm-pin screen**.
- Tapping the map still drops or moves the active pin, and the row text updates from the map (reverse geocode).
- **"Use my location"** is offered both as the first suggestion in the dropdown and as the map pill.
- **Pickup is auto-filled from GPS** on open. The pickup row is still editable the same way.
- Draw the row states: idle (filled), idle (empty, placeholder "Set pickup location" / "Where to?"), editing with suggestions, editing with no results, and searching on slow data.
- **No Places key or offline:** the dropdown still offers "Use my current location" and "Tap the map to set the pin". Typed text is matched with the device geocoder.

### 2. Landmarks are removed entirely.
- There is no landmark field anywhere: no confirm-pin landmark, no second line under the address.
- The **address name is the label riders see** (e.g. "14 Glenara Ave, Avenues").
- Gate, floor or "ask for Rita" details belong in **"Note for the rider (optional)"**.

### 3. The disclaimer is removed entirely.
- There is no disclaimer sheet, no consent checkbox and no "Agree & broadcast".
- Do not add risk or consent copy anywhere in this flow.

### 4. Declared value is removed.
- There is no field or link for it. It is sent as $0.

### 5. Stepped flow.
**Step 1: Where.** The map is large here. It holds:
- both address rows (editable inline, per decision 1)
- "Use my location"
- the route

CTA: "Next".

**Step 2: What and who.** The map shrinks to a small route strip, or hides. This step holds:
- **"What are you sending?"**: item cards (description + Qty − / +), "Add another item", and at 10 items the copy "Up to 10 items per order."
- **"Note for the rider (optional)"**: placeholder "Ask for Rita at the pharmacy counter; keep it upright."
- **"Your phone (sender)"**: a **full field, prefilled** from the last order or the account. Hint: "Shared with your rider only during the delivery."
- **"Recipient phone"**: recent-recipient chips while it's empty. Hint: "So the rider can reach them at drop-off."

CTA: "Next".

**Step 3: Price.**
- A **big suggested fare** (e.g. **$3.36**) with **− / + buttons in $0.50 steps**. Tap the number to type an exact amount.
- Under it: "Riders usually accept around $2.96–$3.80" and the trip distance (e.g. "3.1 km").
- Below the band: "That's below what riders usually take — they may pass. Nudge it up for a faster match."
- Far above the band: "That's a lot more than usual for this trip — double-check you didn't add a digit by mistake."
- These are soft hints, never a block.

CTA: "Review".

**Step 4: Summary** (replaces the disclaimer). A compact review of:
- the route (pickup → drop-off)
- items and quantities
- the note
- both phones
- the price, with "Cash to your rider"

Each block has an **"Edit"** link that jumps back to its step. Primary CTA: **"Send to riders"**. It goes straight to the live auction ("Finding riders near you…").

**Navigation and progress:**
- Show progress with a step indicator, labelled e.g. "1 Where · 2 What · 3 Price".
- Each step's CTA is disabled until that step is valid. The indicator or the fields make clear what's missing, with no wall of text.
- Back moves one step back, and from step 1 it leaves the flow.
- Entered data is kept when moving between steps.

### 6. Fixed visual language
- Pickup is a **green dot** and drop-off is a **red square**, app-wide.
- **Cash only.** There is no card or wallet payment.

## Required data and validation
| Field | Step | Required | Rule |
|---|---|---|---|
| Pickup point + address name | 1 | yes | Inside the Harare service corridor. The address name (1–160 chars) is the stop's label. |
| Drop-off point + address name | 1 | yes | Same rules as pickup. |
| Items | 2 | yes | 1–10 rows. Description required (≤140 chars). Qty 1–99. |
| Note for the rider | 2 | no | ≤280 chars. |
| Sender phone | 2 | yes | Valid ZW phone (0771234567 / +263…), prefilled. |
| Recipient phone | 2 | yes | Valid ZW phone. |
| Price (USD) | 3 | yes | Must be > 0. Starts at the suggested fare and is re-suggested when a pin moves. The band is soft. |

## Constraints
- **Frame:** 360×720 canonical, and it must also work at **320×640**.
- **Users:** everyday customers on low-end Android with patchy data, many with low literacy. **Every icon gets a text label.**
- **Tap targets:** at least 44px, and 52px for the primary CTA, including the price − / + buttons. Draw them at that size, because the app won't inflate them.
- **Tokens only:**
  - Colours: `--accent #00b14f` (fills/CTAs only), `--accent-text #006630`, `--accent-wash #e9f8ef`, `--ink #14181b`, `--muted #5b6670`, `--line #e2e6ea`, `--bg #fff`, `--surface #f6f7f8`, `--danger #c0392b`.
  - Shapes and type: `--radius-input 12px`, `--radius-pill 999px`, `--text-label 12px`.
- **Fonts:** Inter for UI, Fredoka for the wordmark only.
- **Copy you draw ships verbatim.** Write final strings in plain, short English.

## States to draw (360×720)
1. Step 1, open: GPS pickup filled, drop-off empty
2. Step 1, editing the drop-off row inline, with the suggestion dropdown over the map and the keyboard up
3. Step 1, no results / slow data / no Places key (the dropdown fallback)
4. Step 1, both pins set (map fitted to the route, Next enabled)
5. Step 1, out of service area. Calm notice: "We don't cover that pickup or drop-off yet. Move your pins closer to Harare to send your parcel, or check back as we expand."
6. Step 2, empty
7. Step 2, filled, keyboard open on the item description
8. Step 2, max items (10)
9. Step 2, invalid recipient phone ("That doesn't look like a phone number")
10. Step 3, suggested price
11. Step 3, below the band
12. Step 3, far above the band
13. Step 4, summary
14. Sending (CTA loading) and the send-failed toast
15. Offline (any step)
16. "Send again" prefill: opens at the summary with the past order filled in
17. Account on hold (blocking)

Re-check states 1, 2, 7, 10 and 13 at **320×640**.

## Deliverable
- Hi-fi screens for every state above, side by side, labelled with the state name.
- A short changelog versus the current design: what moved, what was removed, and why.
- Final copy strings listed per state.
