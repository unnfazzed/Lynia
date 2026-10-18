# Claude Code prompt: Shop front v1 (Merchant, 2026-10-18)

Paste this file into Claude Code from the root of `unnfazzed/Lynia`.

---

## Setup
1. Read `CLAUDE.md` first. It sets the pixel-parity rules and the merge-on-green policy.
2. Copy this folder into the repo at `packages/design/handoff/shop-front-v1/`.
3. In `docs/DESIGN-DEVIATIONS.md`, **replace** the D-48 row "Shop front not redrawn" (line ~2264) with the entry at the end of `README.md`.

## Sources of truth, in order
1. `README.md`: layout, sizes, every interaction, and where Save lives. If the README and a drawing disagree, the README wins.
2. `Shop front v1 - all screens.html`: open it in a browser (or the standalone copy, which works offline). Each frame has a `data-screen-label`. Add `?s=0` to `?s=6` to the URL to show one section. The `screens/` PNGs are the same frames as images.
3. `copy.ts`: every string, word for word. Replace the hard-coded strings in `shop-page.tsx`, `PhotoPicker.tsx` and `PhotoCropSheet.tsx` with these keys. Strings marked `NEW` are new.
4. `types.ts`: the screen's state model and the API change.
5. `tokens/`: no new values. Map every `var(--x)` to an existing theme token.

Rebuild with the app's own components (`AppBar`, the bottom sheet, `Field`, `InfoStrip`, `Toast`), under `apps/merchant/app/shop/**` and `apps/merchant/components/menu/**`. **Don't port the HTML.** The drawn keyboard is a system stand-in; don't build it.

## Work, one PR per group
Each PR must be green on `pnpm typecheck && pnpm test`. Attach a screenshot sheet at 360×720 and 320×640 for every frame the PR touches.

### 1. Screen shell and Save
- **Remove:** the "Shop profile" heading, `cardStyle` wrapper, `kitchen-split`/`kitchen-aside`, and the developer placeholders (`cover banner · 1200×400`, `logo · 1:1`).
- **New order on the page:** intro (or the not-live strip) → WHAT CUSTOMERS SEE → Shop name → One line → tags → Price level. Use a 16px screen edge and 24px between groups.
- **Pinned bottom bar with a 52px Save.**
  - **Dirty:** compare values against the last loaded or saved profile. Don't use a sticky `dirty` flag.
  - **Disabled when:** clean, uploading, saving, or the name is empty (red field and `SF.nameErr`).
  - **Saved:** the first-run-v2 toast (`SF.saved` / `SF.savedNotLive`). **Delete the inline "Saved" span.** Keep `primeBusiness` and `refreshBranches` (MJ-RL19).
  - **Failed:** the danger strip in the bar; keep everything that was typed.
  - **Saving:** spinner in the button, form at 50% opacity, back disabled.
- **Unsaved-changes sheet** when leaving by AppBar back or the Android back gesture.
- **Keyboard:** hide the bar while the keyboard is open, using a `visualViewport` resize of more than 150px. Scroll the focused field to 16px above the keyboard.
- **Loading:** a skeleton. **Couldn't load:** the T14b centred layout.
- **Staff:** the read-only storefront card plus the lock strip.

### 2. Storefront card as the photo editor
- A `ShopFrontCard` with:
  - a banner at 3:1 of the card width;
  - a 64px logo with a 3px ring, overlapping 32px at the left;
  - name + "· $$" (nowrap), the line, and tag pills.
- **Props:** `editable`, `banner` / `logo` (`PhotoSlot`, see `types.ts`), live `name` / `description` / `tags` / `priceLevel`.
- **Editable:** the whole banner and the whole logo are buttons (aria `SF.changeBannerA11y` / `SF.changeLogoA11y`). Draw the 44px "Change" chip on the banner and the 26px camera badge on the logo.
- **Empty slots** are drawn as specified, with no placeholder text.
- **Reuse the same card** in the crop sheet's LIVE PREVIEW and in the staff view.

### 3. Photo flow (PhotoPicker)
- **Photo sheet.** Rows:
  - "Take a photo": `<input type="file" accept="image/*" capture="environment">`;
  - "Choose from your phone": `accept="image/*"`;
  - "Remove …", only when a photo is set.
- **Remove** sets the slot to `removed` until Save. Show the strip with Undo, and make the form dirty. **API:** send `coverPhotoUrl: null` / `logoUrl: null`.
  - Add this to `updateProfile` and the API DTO. **Additive only.** Run `node scripts/contract-snapshot.mjs --write`.
- **Status strip under the card:** Shrinking… / Uploading… with progress (switch `uploadPhotoBlob` to XHR for `upload.onprogress`; hide the bar if there's no progress), then failed with a 44px Retry.
  - Keep the MJ-RL21 retry, which reuses the compressed blob, and the 60s timeout.
- **While uploading,** the new crop shows in the card under a scrim and spinner.

### 4. Crop sheet (PhotoCropSheet)
- **A phone sheet:** `top: 24px`. The body scrolls; the CTA pair is pinned: primary `Save banner` / `Save logo` (52px), then `Cancel` (48px outline).
- **Delete the tablet geometry** (`frameSize` 430/240, `CROP_PREVIEW_MIN`, the side-by-side row). The frame size comes from the measured stage width:
  - banner: stage = width × 0.5, frame = width − 24 at 3:1;
  - logo: stage = width × 0.72, square frame = stage − 36, with an inscribed circle guide.
- **Draw the whole image.** Dim outside the frame with four `rgba(20,24,27,.5)` rects; don't use a 999px box-shadow, which is slow on cheap Android.
  - On the banner, a dashed ring marks the logo spot.
  - The "Drag to move" chip hides after the first drag.
- **Zoom:** 44px −/+ and a range input in a 44px-tall hit area. Keep `cropRectFromView`, the keyboard nudge and the `unreadable` / `alreadyFits` states.
- **Dismiss:** drag the handle down past 30% of the height, tap the scrim, or Cancel. A drag on the stage never moves the sheet.

### 5. Tags and price level
- **Tag chips:** 44px, each with a 44×44 remove button (aria `SF.tagRemoveA11y(tag)`).
- **Tag field:** `enterkeyhint="enter"`, `autocapitalize="words"`, maxlength 24, plus a 52px Add pill.
- **Adding** is a single `addTag()`, called from:
  - the Add pill;
  - `Enter`, including `keyCode 229` / `inputType === "insertLineBreak"`;
  - a comma;
  - blur;
  - a suggestion tap.
- After adding, clear the field and keep focus.
- **Duplicates:** compare trimmed and case-insensitive. Ignore the tag, clear the field, outline the existing chip for 2s, and show `SF.tagDup`.
- **At 3 tags:** replace the field and suggestions with `SF.tagFull`, and blur.
- **Suggestions:**
  - shops and pharmacies use `vocabulary().starterCategories`;
  - restaurants use `SF.suggest.food` (open item: product to confirm the list);
  - filter by prefix while typing; hide any already added.
- **Price level:** three 44px chips, ink fill when selected. Tapping the selected chip clears it (`priceLevel: null`).

## Tests
- Unit tests:
  - `addTag`: duplicate (case and spaces), limit 3, 24-character slice, comma and Enter (229);
  - dirty comparison: undoing an edit clears dirty;
  - Save disabled while uploading.
- Lint or test: no pressable under 44px on this screen; no input font under 16px.
- 320×640 and font scale 1.3:
  - the 40-character name;
  - three 24-character tags;
  - nothing clips, and the tags counter stays on one line.

## Out of scope
- Opening hours, Branches, Taking orders, Team and Preferred bikers.
- "How bikers pay you" was removed. Don't add it back.
- User-visible copy says "biker", never "rider".

## Done means
- Every frame in `Shop front v1 - all screens.html` matches the app at 360×720, and at 320×640 where drawn.
- No strings remain outside `copy.ts`.
- The D-48 "Shop front not redrawn" row is replaced.
- Every PR has a screenshot sheet.
