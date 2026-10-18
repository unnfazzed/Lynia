# Handoff: Shop front v1 (Merchant), 2026-10-18

**Replaces:** D-48 deviation "Shop front not redrawn" (DESIGN-DEVIATIONS.md:2264).
**Extends:** merchant-v2 (D-77). Same AppBar, tokens, sheets, info strips, pinned CTA bar and toast.
**Fidelity:** high. Copy is final apart from the open items at the end.

## Contents
- `CLAUDE-CODE-PROMPT.md`: paste into Claude Code. The work is split into PRs.
- `Shop front v1 - all screens.html`: every state, each frame tagged with `data-screen-label`. Add `?s=0`…`?s=6` to the URL to show one section.
- `Shop front v1 (standalone).html`: the same file, self-contained, for offline use.
- `screens/`: a PNG of each of the 30 viewport frames, numbered in page order (the two full-length frames are only in the HTML). These are reduced-scale previews; the HTML is the reference for exact sizes.
- `copy.ts`: every string verbatim. Strings marked `NEW` didn't exist before.
- `types.ts`: the state model, the `canSave` rule and the additive API change.
- `sf-screens.js`, `sf-copy.js`: what draws the frames (design reference, not production code).
- `tokens/`: the kit's tokens, unchanged. No new tokens.

**Fidelity: high.** Final colours, type, spacing and copy. Recreate pixel-for-pixel with the app's components.

## Screen index (`data-screen-label`)
- **Filled:** Restaurant filled · Restaurant filled · scrolled · Shop filled · not live yet · Pharmacy filled · Restaurant filled · full length
- **First time, loading, staff:** Empty / first time · Empty / first time · 320 · Loading · Couldn't load · Staff (not owner)
- **Save:** Unsaved changes · Unsaved · leaving · Saving… · Saved · Save failed · Name missing
- **Photos:** Photo · choosing · Photo · Shrinking… · Photo · Uploading… · Photo · upload failed · Photo · couldn't prepare (logo) · Photo · has photo (replace / remove) · Photo · removed
- **Crop sheet:** Crop banner · 360 · Crop logo · 360 · Crop banner · 320 · Crop logo · 320
- **Tags:** Tags · typing (keyboard up) · Tags · limit of 3 reached · Tags · duplicate ignored
- **320:** 320 · 40-character name, 3 long tags · 320 · long content · full length

These are design references. Rebuild them with the merchant app's own components (`AppBar`, the sheet, fields, `Toast`). Take values and copy from here; don't port the markup.

## Layout (360 × 720; works at 320 × 640)
Top to bottom, on a 16px screen edge (`--space-screen`), with 24px (`--space-xl`) between groups:
1. **AppBar** (52px): 44px back target with the chevron in `--accent-text`, then "Shop front" at 17/700.
2. **Intro**, 14 `--muted`. For a shop that isn't live yet it becomes a neutral info strip with the `store` icon and `introNotLive`.
3. **WHAT CUSTOMERS SEE**: a section label (12/700, .06em, `--muted`), then the storefront header. **This card is also the photo editor.**
   - Card: 1px `--line`, radius 16 (`--radius-card`).
   - Banner: full card width at 3:1 (328 × 109; 288 × 96 at 320).
   - Logo: a 64px circle with a 3px `--bg` ring, 14px from the left. It overlaps the banner's bottom edge by 32px. That's why the tip says to keep the left edge clear.
   - Text block (padding 40/14/14): name 18/700, then price 14/700 `--muted`; the line 14 `--muted`; tags as 12/700 mint pills (display only).
   - With a photo: a 44px **Change** chip (`--bg`, `--shadow-card`, `camera` 16, 14/700) sits bottom-right on the banner. The logo gets a 26px camera badge. **Tap targets:** the whole banner and the whole 64px logo.
   - Empty: the banner is `--accent-wash` with a 2px dashed `--accent` box inset 8px, holding `camera`, "Add a banner photo" and the sub line. The content is padded 76px from the left so it clears the logo. The logo is a dashed mint circle with `camera` + "Logo".
   - Photo status shows in a strip directly under the card (see Photos).
4. **Shop name**: label 14/600; field 52px tall, radius 12, 1px `--line`, text 16/400. Focus is a 2px `--accent` border; error is a 2px `--danger` border. Max 120. The counter "n / 120" appears from 100 characters.
5. **One line customers read**: a multi-line field that grows with its text, min 52. Helper "Shows under your name." Max 500. The counter appears from 450.
6. **What you cook / What you sell**, with "n of 3" on the right.
   - Chips: 44px, radius 999, `--accent-wash` / `--accent-text` 15/700, padding-left 14, then a **44 × 44 remove target** with `x` 16 (aria "Remove {tag}").
   - Below the chips: the tag field (flex) plus a 52px **Add** pill. Add is `--surface`/`--muted` when the field is empty, and `--accent-wash`/`--accent-text` when it has text.
   - Then "Or tap one" and 44px outline suggestion chips (`plus` 16 in `--accent-text`, 14/700).
7. **Price level · optional**: three equal 44px chips. Unselected is `--surface`; selected is an `--ink` fill with `--bg` text (K2 "Ready in" style). Tap the selected one again to clear it; the helper says so.
8. **Bottom bar**, pinned: padding 12/16/16, shadow `0 -4px 16px rgba(20,24,27,.06)`, 52px primary.

The "Shop profile" heading, the outer card, the developer placeholders and the half-width preview are gone.

## Where Save lives
- **Always in the pinned bar**, except while the keyboard is open (see below).
- **Clean:** `--line` fill, `--muted` text, disabled (C7 pattern).
- **Dirty:** `--cta-fill`. Dirty means the form differs from the last loaded or saved profile. Compare values, so undoing an edit by hand clears dirty.
- **Held:** stays disabled while a photo is shrinking or uploading, and while the name is empty (field error "Your shop needs a name.").
- **Saving:** spinner + "Saving…" in the button; form at 50% opacity and not editable; back is disabled.
- **Saved:** the first-run-v2 toast (`--forest`, radius 14, padding 14/16, 14/600 `--on-accent`, 20px `check` in `--accent`). It sits 96px from the bottom for 2.5s. Copy is `saved` when the shop front is live and `savedNotLive` when it isn't. The button goes back to clean. Keep the MJ-RL19 side effects: `primeBusiness`, and `refreshBranches` after a rename.
- **Failed:** a danger strip above the button (`danger-wash`, 1px `--danger`, `alert` 16). It shows the API message, or `saveFail` when there is none. The button stays enabled. Nothing is cleared.
- **Leaving with unsaved changes** (AppBar back or the system back gesture): a sheet with "Leave without saving?". The primary is "Keep editing"; the 48px secondary "Leave" (`--danger-ink`) drops the changes.

## Keyboard
- Android resizes the visual viewport. When a text field is focused and `visualViewport.height` drops by more than 150px, **hide the bottom bar**, and scroll the focused field to sit 16px above the keyboard. The bar comes back when the keyboard closes.
- Name and line: `enterkeyhint="done"`, which closes the keyboard.
- **Tag field**: `enterkeyhint="enter"`, `autocapitalize="words"`, maxlength 24. A tag is added by:
  - the **Add** button;
  - the keyboard's action key: handle `beforeinput`/`keydown` `Enter`, **including** `keyCode 229` with `inputType: insertLineBreak`, since Gboard often sends no `key`;
  - typing a comma;
  - tapping a suggestion (no keyboard needed).
- After adding, the field clears and keeps focus, so the next tag can be typed straight away.
- Suggestions filter by prefix as you type, and hide when nothing matches.
- **Duplicates:** trim the text and compare case-insensitively. A duplicate is ignored: the field clears, the existing chip gets an inset 2px `--accent` ring for 2s, and the helper `tagDup` shows.
- **Third tag:** the field and suggestions are replaced by `tagFull`, the field blurs and the keyboard closes. Removing a chip brings the field back.
- Blurring the field with text in it adds the tag (today's behaviour).
- The drawn keyboard is a system stand-in, not a design.

## Photos
- **Choosing:** tapping the banner or logo opens our sheet: title, then the banner tip (banner) or `logoSub` (logo), then a list card with "Take a photo" and "Choose from your phone". Use two hidden inputs: `accept="image/*" capture="environment"` and `accept="image/*"`. The secondary is "Cancel" (48px). With a photo, the list adds "Remove {banner|logo}" in `--danger-ink` with `trash-2`.
- **Remove** clears the slot until Save, shows a neutral strip ("Banner removed. It goes when you save.") with a 44px **Undo** pill, and makes the form dirty. No confirm, because Save is the commit.
  - API: send `coverPhotoUrl: null` / `logoUrl: null`. **Needs backend support; today's update ignores missing keys.**
- **Crop** comes next (below). Cancel uploads nothing.
- **Shrinking… / Uploading…:**
  - The new crop shows in the preview straight away, under a `rgba(20,24,27,.5)` scrim with a spinner (24 on the banner, 20 on the logo).
  - The strip under the card shows the spinner, the step name, and "Save waits until the photo is done."
  - Uploading also shows a 4px progress bar with a percentage. Use XHR `upload.onprogress`; if progress isn't available, drop the bar and the percentage.
- **Failed:** a danger strip with `uploadFail` / `prepFail`, the sub line, and a 44px **Retry** pill (`--bg`, `--danger-ink`, `rotate-cw`).
  - Retry reuses the compressed blob (MJ-RL21).
  - The rest of the form can still be saved without the photo.
  - On the image, the spinner becomes an `alert` icon.

## Crop sheet
- **Size:** `top: 24px`, so the max height is the viewport minus 24 (the merchant-v2 sheet rule). One snap point. Drag the handle down past 30% of the height, or tap the scrim, to cancel. A drag on the photo always pans and never moves the sheet.
- **Header:** handle, then title 20/700 and sub 14 `--muted`.
- **The body scrolls; the CTA pair is pinned:** primary "Save banner" / "Save logo" (52), then "Cancel" (48 outline).
- **Stage:** full content width, radius 12.
  - Banner: height = width × 0.5. The frame is width − 24 at 3:1, centred.
  - Logo: height = width × 0.72. The frame is a centred square (height − 36), with the circle customers see drawn inside as a dashed `--bg` ring.
  - **The whole photo is drawn**, and everything outside the dashed 2px `--accent` frame is dimmed with `rgba(20,24,27,.5)`. Anything outside is visibly cut off.
  - The banner frame shows a dashed ring where the logo will sit.
  - Ratio badge top-right; the "Drag to move" chip is centred and hides on the first drag.
- **Zoom row:** 44px "Zoom out" and "Zoom in" circles (`minus`/`plus` 16); a range input in a 44px-tall hit area (4px track, `--accent` fill, 24px thumb); the value "1.4×" at 14/700 `--muted`, tabular. Step ±0.2; slider step 0.05.
- **LIVE PREVIEW:** the banner uses the same storefront card as the screen, with the real name and line (`bannerDescFallback` when the line is empty). The logo shows a 56px circle in a list row with the name and `logoPreviewSub`.
- **Under the preview:** the banner tip, or `logoSub` for the logo.
- **Edge states:** `unreadable` replaces the stage with a danger strip and Save is disabled. `alreadyFits` shows under the preview when there's nothing to pan. Keep `cropRectFromView`; the frame size now comes from the stage width.

## Other states
- **Loading:** a skeleton in the real layout (`--surface` blocks, plus the logo ring) under the `loading` line. No bar.
- **Couldn't load (T14b):** centred like T4: a 72px `--surface` circle with `wifi-off`, the title 20/700, the body 15 `--muted`, and a 48px outline "Try again" with `rotate-cw`.
- **Staff:** a neutral strip with `lock` and `staff`, then the storefront card read-only: no Change chip, no badge, no fields, no bar.
- **Vocabulary:** only `tagsLabel`, `tip`, `addBannerSub` and the suggestions change between restaurant, shop and pharmacy.

## Type and spacing
- Type: 20/700 sheet titles, 18/700 store name, 17/700 AppBar, 16 field text and primary label, 15/700 chips and secondary, 14 body and labels (600), 13 helpers, 12/700 section labels.
- Spacing: 16 screen edge, 24 between groups, 8 label to field, 8 between chips.
- Radii: 16 cards, 12 fields and strips, 999 pills, 20 sheet top.
- Every target is at least 44px (`--target-min`); the primary is 52px.
- New icons (Lucide, stroke 2): `image`, `trash-2`, `alert-circle`, `rotate-cw`, `lock`, `wifi-off`, `move`.

## Token values used (from `tokens/`)
- **Colours:**
  - `--ink` #14181b · `--muted` #5b6670 · `--bg` #ffffff · `--surface` #f6f7f8 · `--line` #e2e6ea
  - `--accent` #00b14f · `--accent-text` #006630 · `--accent-wash` #e9f8ef · `--cta-fill` #00812f · `--on-accent` #ffffff
  - `--danger` #c0392b · `--danger-wash` #faedeb · `--danger-ink` #8f2418
  - `--forest` #063b22 (toast)
  - Scrim `rgba(20,24,27,.5)`
- **Logo stand-ins in the drawings only:** `--tile-peach` / `--coral-ink`, `--kind-auto` / `--kind-auto-ink`, `--tile-pharmacy` / `--accent-text`.
- **Shadows:**
  - `--shadow-card` (Change chip)
  - `--shadow-badge` (logo badge, slider thumb)
  - `--shadow-sheet` (sheets)
  - bottom bar: `0 -4px 16px rgba(20,24,27,.06)`
- **Type:** Inter (`--font-sans`), weights 400/600/700 only; tabular numbers for counts.

## Assets
- **No image assets.** The striped banners and initial-disc logos are stand-ins for the merchant's own photos.
- **Icons:** Lucide, stroke 2, 16 inline and 20 in navigation.

## Open items
1. **Restaurant tag suggestions** (`SF.suggest.food`) are proposed; no list exists in code. Shops and pharmacies use `SHOP_STARTERS` for their kind.
2. **Remove photo** needs the API to accept `null` for `coverPhotoUrl` / `logoUrl`.
3. **Upload progress** needs XHR (or a fetch with an upload stream) in `uploadPhotoBlob`.

## DESIGN-DEVIATIONS entry
`2026-10-18 · Merchant shop-front-v1 · Shop front redrawn for phone (replaces D-48 "Shop front not redrawn"). The storefront preview is the photo editor; photo source sheet; full-height crop sheet showing the dimmed outside area; 44px tag chips with Add button and suggestions; pinned Save with toast; unsaved-changes sheet. New icons: image, trash-2, alert-circle, rotate-cw, lock, wifi-off, move. No new tokens.`
