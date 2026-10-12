# Handoff: Customer app · briefs 06–09 (2026-10-12)

## Overview
Four small additions to the LyniaGo customer app. All four are **variants of screens that already exist**. Don't build new screens; add states to the existing ones.

| Brief | Existing screen | New states |
|---|---|---|
| 06 · Reach the rider after a late cancel | After Send v2 · 18a/18b (cancelled sheet) | 18d, 18e, 18b (changed), 18f |
| 07 · Venue's own note on rejection | Order flow v2 · D3b (venue couldn't take order) | D3g |
| 08 · Your code changed | After Send v2 · 2.14 (tracking CodeCard) | 2.14b, 2.14c, 2.14d |
| 09 · Remove a prescription page | Order flow v2 · R8a/R8b (Review order, Rx block) | R8c, R8d, R8e |

## About the design files
`Customer briefs.html` is a **design reference built in HTML**, not production code. Rebuild these states in the existing customer app codebase with its components: Header, Sheet, RiderCard, CodeCard, Notice, Toast, Btn, Stepper. Reuse those components and only add props or variants; don't fork them. Where the HTML and an existing component disagree on a pixel value, **the existing component wins**.

## Fidelity
**High fidelity.** Final copy, colours, type and layout. Screenshots are in `screens/`, one PNG per frame.

---

## Shared rules (all four briefs)
- Design widths are 360×720 and 320×640. Support OS font scales 1.0–1.3. Every 320 frame and every font-1.3 frame must keep the primary CTA in the first view; the body scrolls and the CTA bar stays pinned.
- Tap targets are at least 44×44. Primary CTA is 52 high, pill, `--cta-fill`. Secondary is 52 high, pill, 1.5px `--line` border, `--accent-text` label.
- Header is 52 high with a 1px `--line` bottom border. Back is 15/600 `--accent-text` with a chevron. Title is 16/700, centred. On tracking screens, Help is an outlined pill on the right (1px `--danger`, `--danger-ink` label).
- Bottom CTA bar: white, padding 10 16 12, `--shadow-sheet` (0 −4 16 rgba(20,24,27,.08)). No top border.
- Notice / strip: radius 12, padding 12, 18px icon with a 10 gap, 14/400 text with a **bold** first clause and line-height 1.4. Tones:
  - neutral: `--surface` fill, 1px `--line` border, `--muted` icon
  - gold: `--highlight-wash` fill, 1px `--highlight-border`, `--highlight-ink` text
  - warn: white fill, 1px `--danger` border, `--danger` icon, `--ink` text
  - mint: `--accent-wash` fill, `--accent-text`
- Cards: white, 1px `--line` border, radius 16, padding 16, internal gap 12.
- Overline: 12/600, uppercase, letter-spacing .06em, `--muted`.
- Icons: Lucide, stroke 2, 20px (16 inside small text).
- Numbers use `font-variant-numeric: tabular-nums`.
- All copy is in `copy.ts`. Use those keys; don't hardcode strings.

---

## 06 · Reach the rider after a late cancel (After Send v2)
**When:** the order is cancelled **after pickup** (state `cancelled` with `pickedUpAt != null`). Before-pickup cancel stays 18a and is unchanged.

**Layout (18d):**
1. Header: "Send a parcel" + Help.
2. Map, 140 high at 360 and 96 at 320. Dimmed with a 55% white overlay. Rider avatar pin at the rider's **last known position** with the label "Tendai · 09:14" (last seen time). No route line.
3. Sheet overlaps the map by 20. Radius 20 on top, grab handle 36×4.
   - Title 20/700: `lateCancelYouTitle` ("You cancelled this order"). Sub 14 `--muted`: "Nothing to pay."
   - Gold strip with the package icon: "**Tendai still has your parcel.** Call to get it back."
   - RiderCard: 44 avatar (`--rider-wash` / `--rider-accent` initials), name 16/600 + Verified tag, meta 12 `--muted` (rating · trips · plate). Below that, Call and WhatsApp side by side as 44 soft pills (`--accent-wash`). At 320 or font > 1.0 they stack full width.
   - Text link 14/600 `--accent-text`: "Not answering? Call support".
4. CTA bar: primary **Call {rider}**, secondary **Send again**.

**18e · number not delivered yet:** same layout. The RiderCard meta line is replaced by `riderNumberPending`. Call and WhatsApp are disabled (`--surface` fill, `--muted` label). The primary becomes **Call support**.

**18b · rider cancelled after pickup (changed):** identical to 18d, but the title is `lateCancelRiderTitle` ("Tendai cancelled the trip").

**18f · 24 h later (proposal, needs server):** no gold strip. The RiderCard has no buttons, and its meta is `numbersHidden`. The link is `stillNeedParcel`. The CTA bar has only primary **Send again**.

**Logic:**
```
if !pickedUp → 18a (existing)
else if now - cancelledAt > 24h → 18f
else if !rider.phone → 18e
else → 18d (or 18b if cancelledBy == rider)
```
Call opens the `tel:` dialer. WhatsApp opens a `wa.me/` deep link with the order ref prefilled. Support uses the existing support number.

---

## 07 · Venue note on D3b (Order flow v2)
**When:** a rejection payload contains `venueNote` (plain text, trimmed, at most 80 characters, no links or HTML). If there's no note, render D3b unchanged.

**Changes vs D3b:**
- The sub line becomes `rejectedSubWithNote` ("Nothing was charged."). The generic reason is dropped because the note replaces it.
- Inside the existing venue card, under a 1px `--line` divider with 12 padding-top: overline `venueNoteLabel` ("Note from Gava's Kitchen"), then the note in 14/600 `--ink`, line-height 1.4, clamped to **3 lines with an ellipsis** and `overflow-wrap: anywhere`. No quote marks.
- Everything else matches D3b: 64 store icon disc, title 24/700 centred, the venue row with "No charge", and the pinned CTA "See other places nearby".
- At 320 / font 1.3 the CTA must stay visible. If needed, the note clamps; the body never pushes the CTA down.

---

## 08 · Your code changed (After Send v2 tracking, 2.14 family)
Lives in the **CodeCard** on the tracking sheet (state 6/7), between the stepper and the RiderCard.

**2.14b · code changed (not yet re-shared):**
- Card border becomes 1px `--highlight`.
- A gold strip at the top of the card with the refresh icon: "**New code · the old one stopped working**" / "Share it again with {recipient}."
- Overline "Delivery code". Digits 28/700, letter-spacing .04em, `white-space: nowrap`, in groups of 3 ("736 051").
- Share code becomes the **filled** pill (`--cta-fill`, white). It's normally soft.
- At 320, Share code wraps under the digits at full width.
- **Exit:** tapping Share code (native share sheet) clears the strip and border. The card returns to normal with a muted line `codeSharedLine` until delivered.
- Hand-off state 8: a gold `codeNewChip` above the big digits until delivered.

**2.14c · new code fetch failed (offline):**
- Six grey digit bars (2.14 placeholder). Share code disabled.
- Neutral strip with the wifi-off icon: `codeNeedsData`.
- Secondary 52 outline **Send a new code** (refresh icon). Show it only after the automatic fetch has failed. While fetching, use the 2.14 loading state with `codeGettingNew`.

**2.14d · re-issue limit reached:**
- No digits.
- Warn strip with the alert icon: "**Too many wrong tries · call us to finish**" / "Your parcel is safe with Tendai."
- Secondary **Call support**. This replaces the old toast.

**Push** (server): title `pushCodeChangedTitle`, body `pushCodeChangedBody`. Never include digits in the push.

**State:** `code: {value, version, sharedVersion, status: 'ok'|'fetching'|'failed'|'limit'}`. Show 2.14b when `version > sharedVersion && status == 'ok'`.

---

## 09 · Remove a prescription page (Order flow v2, Review order)
The Rx card is the existing R8 Prescription block: 1px `--accent-text` border, overline "Prescription", and a muted line "{n}/3 pages · a pharmacist checks it before packing."

**R8c · thumbnails with remove:**
- Thumbnails are 64×80, radius 12, in a row with **gap 16**. Wraps, max 3 items (pages + add tile).
- ✕ badge: 24 disc, `--ink` fill, 2px white ring, ✕ icon 14 / stroke 2.5. Centred on the thumb's top-right corner, 8px inside. **Hit area 44×44** (dashed outline in the 320 frame = hit area, not drawn in product).
- A page that's still uploading shows a spinner overlay (white 70%) and is removable too; removing it cancels the upload.
- Tapping the thumb (not the badge) opens R8e.
- a11y: badge `Remove page {n}`, thumb `Page {n}, open`.

**R8d · after removing:**
- Remove instantly, with no confirm dialog. Remaining pages reflow and the dashed add tile (64×80, 1.5px dashed `#aeb6bd`, plus icon) returns when pages < 3.
- Toast above the CTA bar (left/right 12): `--ink` fill, radius 12, check icon, "Page removed", and an **Undo** button (44 high, `--accent-wash` / `--accent-text`, radius 10). It lasts **4 s**, longer than the default 2.5 s, because it holds an undo.
- Undo restores the page at its original index. If pages drop to 0, Place order disables and the R8a hint returns.

**R8e · page viewer:**
- Full screen, `--ink` background, no header border. A Close pill on the left (44, `#2a3036`, ✕ + "Close"). Centre title "Page {n} of {total}" 16/700 white.
- The image is fit-to-width with pinch zoom and swipe between pages.
- Bottom actions: **Remove** (52, `--danger` fill, trash icon) and **Retake** (52 outline, `#5b6670` border, white label). Remove closes the viewer and fires the R8d toast. Retake opens the camera and replaces the page in place.
- Android back = Close.

**Not drawn (needs backend):** if the pharmacist refuses one specific page, a server page index would let us ring only that thumb (2px `--danger`) and show a "Retake page {n}" strip.

---

## Design tokens (from `tokens/colors.css`, no new tokens)
| Token | Hex |
|---|---|
| --ink | #14181b |
| --muted | #5b6670 |
| --bg | #ffffff |
| --surface | #f6f7f8 |
| --line | #e2e6ea |
| --accent | #00b14f |
| --accent-text | #006630 |
| --accent-wash | #e9f8ef |
| --cta-fill | #00812f |
| --highlight | #ffd23f |
| --highlight-wash | #fffcf2 |
| --highlight-border | #ffd23f66 |
| --highlight-ink | #6b5600 |
| --danger | #c0392b |
| --danger-wash | #faedeb |
| --danger-ink | #8f2418 |
| --rider-accent | #4b2fbf |
| --rider-wash | #ece8ff |
| --tile-food | #ffd9cc |

- **Type:** Inter (app font). Sizes: 24/700 page title, 20/700 sheet title, 16/600–700 body-strong, 14 body, 12 meta / overline, 10 tag.
- **Spacing:** 4, 8, 12, 16, 20, 24.
- **Radius:** 6 tag, 10 toast button, 12 input / strip / toast / thumb, 16 card, 20 sheet, pill 999.
- **Shadows:** card `0 2px 6px rgba(20,24,27,.15)` on map pins; sheet / CTA bar `0 -4px 16px rgba(20,24,27,.08)`.

## Assets
- Lucide icons: chevron-left, life-buoy (Help), phone, message-circle (WhatsApp), package, share-2, refresh-cw, wifi-off, alert-circle, x, plus, camera, store, trash-2, rotate-ccw, check.
- Rider avatar uses the existing initials fallback. Venue and pharmacy tiles use the existing category tiles.
- The map is the app's existing map component. The HTML grid is a stand-in.

## Files
- `Customer briefs.html` — every frame on one canvas. Open in a browser and pan.
- `copy.ts` — all new strings.
- `screens/*.png` — one per frame, named `{id}-{variant}.png`.

## Engineering dependencies
1. 06: expose the rider phone to the customer after a post-pickup cancel only; add a 24 h hide timer (18f).
2. 08: the code `version` field and the "code changed" push.
3. 09: a delete-page endpoint (cancels an in-flight upload); a refusal page index (future).
