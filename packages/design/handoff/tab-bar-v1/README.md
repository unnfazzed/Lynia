# LyniaGo — Bottom tab bar v1 (floating pill)

Source of truth: `components/shell/TabBar.jsx` (copy in `reference/TabBar.jsx.txt`). Prototype: `Tab Bar Prototype.html`. Live board: `Board.html`.
Implementation brief for Claude Code: **`CLAUDE_CODE_PROMPT.md`**.

**Signed off (v1.3):** a floating pill bar with **3D illustrated** tab art (`glyphStyle="illustrated"`, now the default). The active pill uses the Home tile tints (Calm Mint v2), and the live badge matches the Home live bar.
The solid-vector variant is documented below as a fallback for low-end or high-glare builds. Build it only if asked.

## v1.4 overrides (read first — these win over any conflicting line below)
**Default build: the illustrated variant with the glass material.**

### Bar
- Fill: `--bg` at **72%** opacity (`color-mix(in srgb, var(--bg) 72%, transparent)`), with a backdrop filter of `blur(24px) saturate(180%)`.
- **No** `--shadow-float` and **no** 1px `--line` ring. The bar has no edge treatment.
- Geometry is unchanged: 60 tall, 12 from the sides and bottom (+ inset), padding 4, pill radius.

### Accessibility fallback
Switch to solid `--bg` when **any** of these is true:
- reduced transparency is requested,
- increased contrast or high-contrast text is on,
- forced colours are active,
- backdrop blur isn't supported,
- (Android) the API level is below 31, `isLowRamDevice()` is true, or power-save mode is on.

Never show a translucent bar without blur. Without blur, the 72% fill fails label contrast over busy content.

### Contrast rationale
Label and icon contrast is judged against the tint, not the backdrop. The blur flattens what's behind into soft colour, and the 72% `--bg` tint keeps the 700-weight `--muted` labels legible. The bar's shape is read from its fill alone. On solid-white screens the solid bar has no visible edge, which is intended.

### Active indicator
- Fill: `--tile-mint` for **every** tab, both roles.
- No ring and no shadow.
- Pressed (solid-glyph fallback only): `--cta-fill-pressed`.

### Label
Always 700, so the text doesn't reflow. Colour: idle `--muted`, active `--ink`.

### Motion
One curve everywhere: `cubic-bezier(0.32, 0.72, 0, 1)`. No overshoot and no keyframes.
- **Indicator:** translateX over 420ms; background over 300ms.
- **Icon:** the active icon transitions to `translateY(-2px) scale(1.08)` over 420ms, and back to rest when deselected. There's no pop sequence.
- **Colour:** label and glyph fills, 300ms ease.
- **Press:** scale 0.97 over 160ms. Release over 360ms. Idle cells get a `--surface` fill while pressed.
- **Badge pop:** unchanged.
- **Reduce motion:** all of the above becomes instant.

### Badges
Unchanged, including the 2px `--bg` ring and `--shadow-badge`.

### Dock
The bar inside the CTA dock is the same glass bar. The dock panel itself is solid `--bg`, so the glass just reads as white there.

## Layout contract
**Bar reserve = 72px** (60 bar + 12 float gap), plus the bottom safe-area inset. Scroll content pads by **72 + inset + 16**.
With a CTA dock: reserve = **148px** + inset (12 + 52 + 12 + 60 + 12); content pads by 148 + inset + 16.

## Bar
- Position: absolute; left 12, right 12, bottom 12 + inset (gesture nav inset 24 → bottom 36; 3-button nav inset 0 → bottom 12).
- Height 60, box-sizing border-box, padding 4 (all sides).
- Background `--bg`. Radius `--radius-pill`.
- Edge: 1px `--line` drawn as an inset ring (`inset 0 0 0 1px`, takes no space) + **`--shadow-float`** (new token). The ring keeps the edge visible in sun; the shadow lifts it off content.
- Content scrolls behind the bar and shows through the 12px side and bottom gaps. No blur, no scrim.
- z-index 20.
- Width at 360: 336. At 320: 296.

## Cell (×3)
- Width: (bar width − 8) / 3 → 109.33 at 360, 96 at 320. min-width 0.
- Height 52 (drawn; ≥ `--target-min`). Radius `--radius-pill`.
- Column, centred, gap 4: glyph 24 + label 16 = 44, leaving 4 top / 4 bottom.

## Active indicator
- One element shared by all cells, sliding between them.
- Position: top 4, left 4, width = cell width, height 52, radius `--radius-pill`.
- Fill `--cta-fill`. Pressed: `--cta-fill-pressed`.
- Shadow **`--shadow-active`** (new token): a green under-glow plus a 1px top inner highlight, so the pill reads as a raised key.
- Greyscale check: a dark solid pill and a 700 label against white idle cells, so the active tab still reads without colour.

## Glyph (vector, replaces Lucide icons in the bar only)
- 24×24, viewBox 0 0 24 24, solid single colour. Knockouts are real transparency (SVG mask), not painted.
- Set: `home` (house + door cut), `orders` (receipt with zig-zag foot + 3 line cuts), `account` (head + shoulders), `jobs` (cargo scooter: box, deck, stem, 2 wheels with hub cuts), `money` (wallet + flap + clasp cut + dot).
- Colour: idle `--muted`, single tone, knockouts transparent.
- Active: **two-tone**. The body is `--on-accent` and the knockouts are filled with `--accent`: the house door, the receipt lines, the collar notch, the box tape and wheel hubs, the wallet clasp. The wallet dot stays `--on-accent` on top. `--accent` is used only as a large-graphic fill inside a white shape, never as text.
- Gold (`--highlight`) is never used inside glyphs. It is reserved for the attention badges.
- Customer: home / orders / account. Rider: jobs / money / account.
- Lucide stays the icon system everywhere else. These five glyphs are only for the tab bar.

## Variant: 3D illustrated (`glyphStyle="illustrated"`)
This variant swaps the solid glyphs for faux-3D colour illustrations. It uses the same three-face recipe as `assets/service-icons/v2`.
- **Illustration:** 28×28, viewBox 0 0 32 32. It may overhang its box by up to 2px (`overflow: visible`).
- **Cell stack:** illustration 28 + gap 2 + label 16 = 46, leaving 3 top / 3 bottom in the 52 cell.
- **Faces:** top `--illus-light`, front `--illus-mid`, side `--illus-dark`. Details use `--illus-gold`, `--illus-coral` and `--illus-mint`; labels and tags use `--bg`.
- **Idle:** the same drawing in neutrals. Light faces, gold and mint become `--illus-idle-light`; mid faces and coral become `--illus-idle-mid`; dark faces become `--illus-idle-dark`. The colour "switching on" is the active cue.
- **Drawings:**
  - Home: house with a coral roof, gold door and mint window.
  - Orders: shopping bag with a gold handle and a white order tag.
  - Account: person bust, shaded right, with a mint collar.
  - Jobs: parcel box with gold tape and mint speed lines.
  - Money: wallet with a mint note, gold coin and dark clasp.
- **Active pill (aligned with Home, Calm Mint v2):** the pill takes the matching Home tile tint, with a 2px inset ring in that tint's ink. Each ink clears 3:1 on its tint, so the shape survives greyscale and glare.
  - Home: `--tile-mint` / `--accent-illus`
  - Orders: `--tile-peach` / `--coral-ink`
  - Account: `--tile-lilac` / `--rider-accent`
  - Jobs: `--tile-mint` / `--accent-illus`
  - Money: `--tile-sun` / `--sun-ink`
- **Tint change:** the tint and ring cross-fade over 160ms linear while the pill slides. No `--shadow-active` on this variant.
- **Active label:** 700 `--ink`. Idle label: 600 `--muted`.
- **Live badge (both variants):** `--live-bar` fill with an `--illus-gold` dot and an `--on-accent` count. It matches the dark live-order bar and its gold ETA on Home.
- **Sky accent:** `--illus-sky`, the blue dot from the Home header, is used for the house window, the order-tag line and one speed line.
- **Active illustration:** rests at `translateY(-2px) scale(1.08)`, so it sits slightly raised.
- **Pop on activation:** 0.86 → 1.16 (−4px) → 1.08 (−2px), 200ms, `cubic-bezier(0.2, 0, 0, 1)`. Under reduce motion it goes straight to the rest state.
- **Badges, pressed, focus, dock and layout:** identical to the solid variant. Bar height stays 60, reserve 72.
- **Android:** ship 10 vector drawables (5 drawings × active/idle). No runtime tinting, no Lottie.
- **Trade-off vs solid:** warmer and more "LyniaGo", and it matches the Home service tiles. But the active state is softer in direct sun: it relies on the wash pill, the ring and colour vs grey, where the solid variant uses a dark pill. Build cost is about 2× the drawables.

## Label
- Inter 12px, line-height 16, tracking 0, `white-space: nowrap`.
- Idle 600 `--muted`. Active 700 `--on-accent`.
- Copy: Home · Orders · Account / Jobs · Money · Account. No changes.
- Widest label, "Account" at 700, is 50px. The 320 cell is 96. No truncation.

## Badges
All badges are anchored to the cell, not the glyph. Each has a 2px `--bg` ring (border, inside the box), radius `--radius-pill` and **`--shadow-badge`** (new token). Text: Inter 12/16 700, tabular numbers.

| Kind | Use | Box | Position | Fill / text |
|---|---|---|---|---|
| `dot` | Account: verification or KYC needs attention | 12×12 (8 core + 2 ring) | left = centre + 6, top 4 | `--highlight` |
| `count` | Rider Jobs: new jobs on the board | h 20, min-w 20, padding 0 4 | left = centre + 4, top 0 | `--cta-fill` / `--on-accent` |
| `live` | Customer Orders: 1+ active orders | h 20, padding 0 6 0 5, gap 4; 6×6 `--on-accent` dot + count | left = centre + 4, top 0 | `--cta-fill` / `--on-accent` |
| `warn` | Rider Money: balance below floor, top-up needed | 20×20, "!" centred | left = centre + 4, top 0 | `--highlight` / `--ink` |

- Max: counts above 9 render "9+" (box 28 wide).
- The badge overlaps the glyph's top-right corner. It never reaches the next cell: worst case is centre + 4 + 34 = 38, and the half-cell is 48 at 320.
- On the active cell, the `--bg` ring separates the badge from the `--cta-fill` pill.
- Clearing: `count` clears when Jobs is opened. `live`, `warn` and `dot` persist until the cause is resolved.
- `live` has no looping pulse, only the one-shot pop on appear. The leading dot is what tells it apart from `count`.

## Pressed and focus
- Pressed (any cell): the cell scales to 0.94, 100ms ease-out. On release it returns over 160ms with `cubic-bezier(0.34, 1.36, 0.64, 1)`.
- Pressed idle cell: also a `--surface` fill on the cell (52 tall, pill). Glyph and label colours don't change.
- Pressed active cell: indicator → `--cta-fill-pressed`.
- Plus the platform ripple. The pressed state shows on pointer-down and clears on up, leave or cancel.
- Focus (keyboard or D-pad only): box-shadow `0 0 0 2px --bg, 0 0 0 4px --ink` on the cell. It sits inside the bar's 4px padding.
- Keyboard: the bar is a `tablist`. ←/→ move focus (wraps). Enter or Space activates. Only the active tab is in the tab order (roving tabindex).

## Motion
- Tab change: indicator `transform: translateX`, 200ms, `cubic-bezier(0.34, 1.36, 0.64, 1)` (about 6% overshoot, then it settles). Glyph fill and label colour, 120ms linear.
- Glyph pop (the newly active glyph only): scale 0.82 → 1.12 (60%) → 1, 200ms, `cubic-bezier(0.2, 0, 0, 1)`. It does not play on first mount.
- Badge pop (when a badge appears or changes kind or count): scale 0.4 → 1.15 (65%) → 1, 160ms, origin bottom-left. It does not play on first mount.
- Every animation is one-shot. Nothing loops.
- Haptic: a light tick (`HapticFeedbackConstants.CLOCK_TICK`) on change. None on re-tap of the active tab.
- Re-tap of the active tab: **yes, scroll that tab's root list to the top** (smooth; instant under reduce motion). If it's already at the top, do nothing.
- Reduce motion (`ANIMATOR_DURATION_SCALE = 0` / `reduceMotion` prop): no slide, fades, pops or press scale. The indicator jumps, colours swap instantly, and the `--surface` press fill stays.

## Stacking with the CTA bar ("dock")
- On screens with a pinned CTA and the tab bar, the CTA panel becomes the dock. It's one white panel pinned to `bottom: 0`, full width, `--bg`, `--shadow-sheet`.
- Panel padding: 12 16 (12 + 72 + inset) → the 52px CTA, then a 12 gap, then the floating bar inside the panel, then 12 + inset.
- Separation between the CTA and the bar: **nothing** besides the bar's own ring and shadow. The gap is exactly 12.
- Content never shows between the CTA and the bar. This replaces the old RBar at `bottom: 60`.

## New tokens (in `tokens/spacing.css`)
- `--shadow-float`: `0 8px 24px rgba(20,24,27,.12), 0 2px 6px rgba(20,24,27,.08)`. A floating bar needs more lift than a card to read as above the scrolling content.
- `--shadow-active`: `0 4px 12px rgba(0,129,47,.32), inset 0 1px 0 rgba(255,255,255,.16)`. Makes the active pill read as raised.
- `--shadow-badge`: `0 1px 3px rgba(20,24,27,.16)`. Lifts badges off the glyph.
- `--illus-light / -mid / -dark / -gold / -coral / -mint` and `--illus-idle-light / -mid / -dark` (in `tokens/colors.css`). These name the raw colours already used in the service illustrations, so the tab art and the tiles share one palette.
- Android: use elevation with these as the closest ambient/spot shadow. No blur views.

## Hidden on
- Soft keyboard open: the bar is removed (`hidden`). Confirmed.
- No tab bar on: the force-update gate; the Send a parcel composer; the order screen (full-bleed map + sheet); rider active job; camera / proof-of-pickup; OTP / auth; onboarding. Also every pushed detail screen with a back arrow.

## Role identity
The two bars are **identical in chrome**. The role cue comes from the tab set itself: the scooter and wallet glyphs and the Jobs / Money labels.
No tint, marker or hairline. A tinted or labelled bar risks reading as an error state or a different app. A rider switching via "⇄ Order food and send parcels" should feel they're in the same LyniaGo.

## Screen-reader strings (final)
Format: `{Label}, tab, {i} of 3[, {badge}]`.
- "Orders, tab, 2 of 3, 1 active order" / "…, 3 active orders"
- "Jobs, tab, 1 of 3, 3 new jobs" / "…, 1 new job"
- "Money, tab, 2 of 3, top-up needed"
- "Account, tab, 3 of 3, action needed"
- "Home, tab, 1 of 3"

## Why floating, at this size
- **Sunlight:** a solid `--cta-fill` pill with a white glyph and 700 label is the highest-contrast active state possible (≈4.7:1 white on fill; the dark pill vs white idle cells is distinct in greyscale). Vector glyphs are solid masses, not 2px strokes, so they survive glare and low-DPI screens.
- **Low literacy:** each tab is a big, distinct silhouette with its label. The selected tab is a filled shape you can point at.
- **320 fit:** 96px cells, the widest label 50px, badges stay within the half-cell.
- **Build cost:** one `View` with a rounded background and elevation, one translating indicator, five vector drawables. No blur, no Lottie.

## Kit API
```jsx
<TabBar role="rider" active="jobs" inset={24}
  badges={{ jobs: { kind: "count", n: 3 }, money: { kind: "warn" } }}
  onTab={setTab} onReselect={scrollToTop} hidden={keyboardOpen} reduceMotion={rm} />
```
Default is `glyphStyle="illustrated"`. Pass `glyphStyle="solid"` for the fallback.
Exports: `TabBar`, `TabGlyph`, `TabIllus`, `APP_TABS`, `RIDER_TABS`, `TAB_BAR_H` (60), `TAB_BAR_GAP` (12), `TAB_BAR_SPACE` (72).
