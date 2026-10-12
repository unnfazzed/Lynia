# Prompt for Claude Code: ship the 2026-10 website screens + "biker" copy

Paste everything below into Claude Code from the repo root.

---

Update the LyniaGo marketing site (`apps/website/site/`) with the 2026-10 design handoff in `packages/design/handoff/lyniago-website/`.

**Read `packages/design/handoff/lyniago-website/README.md` first**, especially the section "Update 2026-10".

**Ground rules**
- The handoff's `site/` is the source of truth. Copy it over; don't hand-edit `apps/website/site/` beyond that. The `website` CI job fails on any difference from the handoff.
- Don't re-encode, resize or recompress the WebP files.
- Don't change layout, CSS values, class names, anchors (`#riders`) or file names.

**What changed in the handoff**
1. **New app screens** in `site/assets/screens/`, under **new file names with a `-2026-10` suffix**. `assets/*` has a one-year immutable cache, so a changed image must never reuse an old name. The old-named files (`step-1-phone.webp`, `app-send.webp`, etc.) are deleted from the handoff and must be removed from `apps/website/site/assets/screens/` too:
   - `step-1-phone-2026-10.webp` (500×605), `step-2-phone-2026-10.webp` and `step-3-phone-2026-10.webp` (500×537). These are the bare app screen with rounded phone-style corners (radius 54) on a transparent background. **There is no phone frame or notch any more.** The existing `.shot .sp` drop-shadow follows the rounded edge, so no CSS change is needed.
   - `step-1-hl-2026-10.webp` (600×228), `step-2-hl-2026-10.webp` (600×233), `step-3-hl-2026-10.webp` (600×234). The `height=""` attributes in `index.html` are already updated to match.
   - `app-splash-2026-10.webp`, `app-send-2026-10.webp`, `app-tracking-2026-10.webp`, `app-rider-2026-10.webp` at 265×530, plus 2× files `app-*-2026-10-2x.webp` at 530×1060. The hero `<img>` tags have `srcset="….webp 1x, …-2x.webp 2x"` with the new names. Every `src` and `srcset` in `index.html` already uses the new names.
2. **Hero collage frames removed.** A CSS block at the end of `<style>` in `index.html` ("hero collage: no phone frames") removes the coloured frame fill, padding and inner ring from `.phones .ph`. Each phone is now the bare screen (1:2 ratio) with **square corners** (`border-radius:0` on `.phones .ph` and `.phones .ph img` at every breakpoint), plus the same tilt, position, z-order and drop shadow. Don't re-add the frame colours or the radius.
3. **Copy: "rider" becomes "biker"** in visible text and alt text only: nav, hero alt text and chip, card 2 headline and alt text, business and riders alt text, the "For bikers" eyebrow, the "Become a biker" buttons (nav, section, footer), "Verified bikers", and the phone 4 alt text "Biker app: jobs nearby". Keep "Ride with LyniaGo. Earn on your terms."

**Tasks**
1. Copy `packages/design/handoff/lyniago-website/site/` into `apps/website/site/`, replacing what's there. Include all 14 `*-2026-10*.webp` files.
2. Delete the 10 old-named screen files from `apps/website/site/assets/screens/` (`step-{1,2,3}-phone.webp`, `step-{1,2,3}-hl.webp`, `app-{splash,send,tracking,rider}.webp`). Check that nothing still references them, and that the host serves `.webp` as `image/webp` with the existing long-cache headers on `assets/*`.
3. If the CI allow-list of approved launch edits (the Play Store link etc.) touches the "Become a rider" buttons, update those entries to match "Become a biker".
4. Run the site locally and send me screenshots at 390px and 1440px of:
   - "Send in three steps"
   - the "Everything you send, in your pocket" phone collage
   
   Confirm the step phones show rounded screen corners with no frame, the 4 app-section phones are square with no frame, and that the highlight cards aren't stretched.
5. Run the `website` CI job and report the result.

Source of the screens (for reference only, nothing to build): `screens-src/Website Screens.html` renders every export at its exact size from the app kits. The PNG masters are in `screens-src/png/`.
