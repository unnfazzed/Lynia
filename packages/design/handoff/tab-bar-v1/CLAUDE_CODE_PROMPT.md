# Prompt for Claude Code — LyniaGo tab bar v1.4

How to use it: copy this `tab-bar-v1/` folder into the app repo at `docs/handoff/tab-bar-v1/`. Then run Claude Code from the repo root and paste in everything below the line.

---

You're implementing the redesigned bottom tab bar for the LyniaGo Android app, for both the customer and rider roles. The design is signed off. Build a pixel- and behaviour-faithful native implementation. Don't redesign it.

## Read first, in order
1. `docs/handoff/tab-bar-v1/README.md`. Start with its **"v1.4 overrides"** block: it wins over every conflicting line below it.
2. `CHANGES.md`. v1.4 is the current version.
3. `reference/TabBar.jsx.txt`. This is the web reference implementation: exact geometry, SVG paths for every illustration and glyph, badge logic, screen-reader strings, the glass fallback logic (`useGlass`) and the motion values. Port from it; don't redraw anything. (The `.txt` suffix only keeps it out of the design-system build.)
4. `reference/AppScreen.jsx.txt` shows the content reserve and the CTA dock stacking.
5. `reference/colors.css` and `reference/spacing.css` hold the token values.
6. `Tab Bar Prototype (standalone).html` works offline. Its side panel toggles every state.

Before writing code, explore the repo. Find the current bottom nav, the theme and colour resources, how screens pad for the bar, where order/job/wallet/KYC state lives, and whether the UI is Compose or Views. Match the existing patterns. **Report what you found and your file plan before making large edits.**

## What to build

### 1. Tokens
Add the README tokens to the theme under the same names: `illus-*`, `illus-idle-*`, `illus-sky`, `tile-mint`, `live-bar`, `rider-accent` and `shadow-badge`. Don't hard-code hex values in components. `shadow-float` and `shadow-active` are **not** used any more.

### 2. Tab art
Build 10 vector drawables from the `ILLUS` table (32×32 viewBox): an active and an idle version of home, orders, account, jobs and money. Map the tones with `ILLUS_ON` and `ILLUS_IDLE`. The coordinates convert 1:1 to `pathData`. The bag handle is a 2-unit round-cap stroke. Keep the solid `GLYPHS` set behind a flag, off by default.

### 3. The bar (v1.4)
**Geometry**
- Floating pill: 60 tall, 12 in from the left, right and bottom, plus the system bottom inset.
- Padding 4, full radius.
- Three equal cells, 52 tall.

**Glass material**
- `bg` at **72% alpha**, with a **24dp backdrop blur** and 180% saturation over the content scrolling behind it.
- Compose: real backdrop blur needs either `RenderEffect.createBlurEffect` on API 31+ applied to a captured backdrop layer, or a library such as Haze. **Ask me before adding a dependency.**
- **No shadow, no elevation, no outline** on the bar.

**Solid fallback (opaque `bg`)** — use it when any of these is true:
- API < 31,
- `ActivityManager.isLowRamDevice()`,
- power-save mode is on,
- high-contrast text is enabled,
- the blur can't be rendered.

Never ship a translucent bar without blur.

**Indicator**
- One shared element that slides between cells.
- Fill `tile-mint` for every tab.
- No ring, no shadow.

**Cell content**
- 28 illustration, 2 gap, 16 label.
- Label: Inter 12, **always weight 700**. Colour is `muted` when idle and `ink` when active.
- The active illustration rests at translateY −2dp and scale 1.08.

**Tabs**
- Customer: Home, Orders, Account.
- Rider: Jobs, Money, Account.

### 4. Motion — smooth, no springs, no keyframes
- One easing everywhere: `cubic-bezier(0.32, 0.72, 0, 1)`. In Compose that's `CubicBezierEasing(0.32f, 0.72f, 0f, 1f)`.
- Indicator: translateX over 420ms; colour over 300ms.
- Icon: the new active icon eases to its rest transform over 420ms, and the old one eases back over 420ms at the same time. No pop, and no animation on first composition.
- Label and glyph colour: 300ms.
- Press: scale 0.97 over 160ms, release over 360ms. Idle cells get a `surface` fill while pressed.
- Badge pop: 0.4 → 1.15 → 1 over 160ms when a badge appears or changes.
- Animator scale 0 (reduce motion): all of the above is instant. The press fill stays.

### 5. Badges
Build the four kinds from the README table:
- `dot`: Account, KYC.
- `count`: rider Jobs; shows "9+" above 9 and clears when Jobs is opened.
- `live`: customer Orders; `live-bar` fill with a gold dot.
- `warn`: rider Money, below the balance floor.

Every badge has a 2px `bg` ring and `shadow-badge`, and is anchored to the cell. Wire badges to real app state. If a source doesn't exist yet, expose a parameter and leave a TODO. No fake data.

### 6. Interaction
- Changing tabs plays a light haptic (`CLOCK_TICK`).
- Re-tapping the active tab scrolls that tab's root list to the top, with no haptic. It does nothing if the list is already at the top.

### 7. Layout contract
- Tab-root content pads its bottom by 72 + inset + 16, and scrolls *behind* the glass bar.
- On screens with a pinned CTA, use the dock: one solid `bg` panel with `shadow-sheet`, containing the CTA (52), a 12 gap, the bar, then 12 + inset.
- Hide the bar while the keyboard is open.
- No bar on the screens listed under "Hidden on".

### 8. Accessibility
- The bar is a tab list. Each cell is a tab with a `selected` state and a touch target of at least 48dp.
- Content descriptions are exactly `{Label}, tab, {i} of 3[, {badge}]`, using the README strings.
- Show a focus ring (2px `bg` + 2px `ink`) for D-pad/keyboard focus only.
- The solid fallback rules in section 3 are an accessibility requirement, not an optimisation.

### 9. Performance
Must stay smooth on 2–3GB Android 8+ devices, which get the solid fallback.
- Animate only transform, alpha and colour.
- Don't recompose the whole screen on a tab change.
- Use only one blur layer.

## Done means
- Side-by-side with the standalone prototype at 360dp and 320dp, with both gesture nav (inset 24) and 3-button nav (inset 0), geometry, colours and badge positions match.
- The glass bar visibly blurs content scrolling behind it on API 31+. It's solid on API < 31, on low-RAM devices and with high-contrast text on.
- Every prototype state renders: each tab active in both roles, each badge kind, two badges at once, pressed, focus, the dock, keyboard hidden and reduce motion.
- Tab changes feel continuous: no overshoot, no snap-back on the deselected icon, and labels don't reflow.
- TalkBack reads the exact strings.
- Add screenshot or preview tests for those states, using the repo's setup or Compose previews.
- Once everything is migrated, remove the old bottom bar and its styles, plus the `dot`-only API. List what you removed.

Ask me before changing the navigation architecture, adding dependencies, or touching screens outside the tab roots and the dock.
