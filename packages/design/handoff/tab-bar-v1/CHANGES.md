# CHANGES — tab-bar-v1

**This handoff supersedes:**
- the `### TabBar` section of `handoff/design_handoff_rider_v2/README.md` (the 60px flat bar with the 52×26 wash pill), and
- the previous kit `components/shell/TabBar.jsx` (the flat white bar with the `dot` prop).

What changed:
- The bar now floats: a 60px pill, 12px from the sides and bottom (+ safe-area inset). Previously it was full-width and flat.
- The active state is a solid `--cta-fill` sliding pill with a white glyph and label. It was a `--accent-wash` pill.
- The bar uses solid vector glyphs (`TabGlyph`: home, orders, account, jobs, money) instead of Lucide `house` / `receipt` / `user` / `bike` / `wallet`.
- A typed `badges` API replaces `dot`, with four kinds: `dot`, `count`, `live` and `warn`. `dot` still works but is deprecated.
- New props: `role`, `inset`, `hidden`, `reduceMotion` and `onReselect`. `RIDER_TABS` is now exported.
- The content reserve went from 58 to **72 + inset + 16**. `AppScreen` applies it automatically.
- A CTA bar above the tab bar becomes one dock panel (CTA → 12 → bar → 12 + inset). This replaces the RBar at `bottom: 60`.
- `AppScreen` gains `role`, `tabBadges` and `inset`.

### v1.1 ("pop" pass)
- Active glyphs are two-tone: the knockouts are filled with `--accent` inside the white glyph.
- New tokens `--shadow-float` (bar), `--shadow-active` (green under-glow on the pill) and `--shadow-badge`.
- Springier indicator slide: 200ms with overshoot.
- One-shot pops: glyph pop on activation, badge pop on appear, 0.94 press scale. All are removed under reduce motion.
- Account glyph gains a collar notch.

### v1.2 (3D illustrated variant)
- `glyphStyle="illustrated"`: faux-3D colour illustrations (`TabIllus`) on an `--accent-wash` pill with an `--accent-illus` ring. Idle tabs show neutral versions.
- New illustration tokens in `tokens/colors.css`: `--illus-*` and `--illus-idle-*`.
- The solid variant stays the default until product picks one.

### v1.3 (aligned with Home, Calm Mint v2)
- In the illustrated variant, the active pill uses the Home tile tints (mint, peach, lilac, sun), each with its own ink ring. The active label is `--ink`.
- The live badge is now `--live-bar` with a gold dot, matching the Home live-order bar (both variants).
- `--illus-sky` joins the illustration palette.
- New tokens: `--tile-mint/-peach/-lilac/-sun`, `--coral-ink`, `--sun-ink`, `--live-bar`, `--live-bar-ink`, `--rider-accent`, `--rider-wash`, `--illus-sky`.

Older handoff folders still draw the old bar in their own local kits (`rv-kit.jsx` etc.). Treat those drawings as superseded wherever they show the tab bar.
