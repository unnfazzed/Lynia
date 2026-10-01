# Prompt for Claude Code: implement the LyniaGo tab bar v1.3

Paste everything below the line into Claude Code, run from the root of the LyniaGo app repo, with this `tab-bar-v1/` folder copied into the repo (e.g. `docs/handoff/tab-bar-v1/`).

---

You're implementing the redesigned bottom tab bar for the LyniaGo Android app (customer + rider roles). The design is signed off. Your job is a pixel- and behaviour-faithful native implementation, not a redesign.

> The files in `reference/` end in `.txt` so the design-system build skips them. They are plain JSX and TypeScript; drop the `.txt` to read them with highlighting.

## Read first, in this order
1. `docs/handoff/tab-bar-v1/README.md`: the spec. Every number in it is final. Where this prompt and the README disagree, the README wins.
2. `docs/handoff/tab-bar-v1/CHANGES.md`: what this supersedes.
3. `docs/handoff/tab-bar-v1/reference/TabBar.jsx.txt`: the web reference implementation. It's the exact geometry, the SVG paths for all illustrations and glyphs, the badge logic and the screen-reader strings. Port from it; don't redraw anything.
4. `reference/AppScreen.jsx.txt`: how screens reserve space and how the CTA "dock" stacks with the bar.
5. `reference/colors.css` and `reference/spacing.css`: the token values. Only the tokens named in the README are needed.
6. Open `Tab Bar Prototype (standalone).html` in a browser. It works offline and shows every state via the side panel (role, width, nav mode, badges, CTA dock, keyboard, reduce motion).

Before writing code, explore the app repo: find the current bottom navigation, the theme/colour resources, how screens pad for the bar, where order/job/wallet/KYC state lives, and whether the UI is Jetpack Compose or Views. Match the repo's existing patterns, naming and architecture. Tell me what you found and your plan (files to add or change) before making large edits.

## What to build
**1. Tokens.** Add the new colours and shadows from the README "New tokens" section and `CHANGES.md` v1.1–v1.3 to the app theme, under the same names:
- `illus-*`, `illus-idle-*`, `illus-sky`
- `tile-mint/peach/lilac/sun`, `coral-ink`, `sun-ink`
- `live-bar`, `rider-accent`
- `shadow-float/active/badge`

Don't hard-code hex values in components.

**2. Tab art as vector drawables.** Use the `ILLUS` table in `TabBar.jsx` (32×32 viewBox). Make one active and one idle drawable per name: home, orders, account, jobs, money (10 total). Map tones with `ILLUS_ON` / `ILLUS_IDLE`. The polygon, rect, circle and path coordinates convert 1:1 to `pathData`. The bag handle is a 2-unit stroke with round caps. Keep the solid `GLYPHS` set (24×24, mask knockouts) as a fallback behind a flag, but don't wire it into the UI by default.

**3. The TabBar component.**
- Floating pill: 60 tall, 12 from the left, right and bottom, plus the system bottom inset. 4 padding, full radius.
- White, with a 1px `line` stroke and `shadow-float` elevation.
- Three equal cells, each 52 tall.
- Cell content: 28 illustration, 2 gap, 16 label (Inter 12, 600 idle `muted` / 700 active `ink`).
- One shared indicator slides between cells:
  - Its fill is the active tab's tile tint, with a 2px inset ring in that tint's ink (table in the README "Variant" section).
  - Slide: 200ms `cubic-bezier(0.34, 1.36, 0.64, 1)`.
  - Tint and ring cross-fade over 160ms.
- The active illustration rests at translateY −2 and scale 1.08. On activation it pops: 0.86 → 1.16 → 1.08 over 200ms. It does not pop on first composition.
- Customer tabs: Home, Orders, Account. Rider tabs: Jobs, Money, Account. Labels are exactly these.

**4. Badges.** Implement the four kinds exactly as in the README table:
- `dot`: Account, KYC/verification.
- `count`: Rider Jobs, new jobs, capped at "9+". Clears when Jobs is opened.
- `live`: Customer Orders, active orders. `live-bar` fill, gold dot, white count.
- `warn`: Rider Money, below the balance floor.

Every badge has a 2px white ring, `shadow-badge`, is anchored to the cell (not the icon), and pops 0.4 → 1.15 → 1 over 160ms when it appears or changes. Wire them to the real app state you found in the repo. If a source doesn't exist yet, expose a parameter and leave a clear TODO. Don't fake data.

**5. Interaction.**
- Press: the cell scales to 0.94 over 100ms, then springs back over 160ms. Idle cells also get a `surface` fill while pressed.
- Tab change: a light haptic (`CLOCK_TICK`).
- Re-tapping the active tab scrolls that tab's root list to the top, with no haptic. It does nothing if the list is already at the top.

**6. Layout contract.**
- Content on tab roots pads its bottom by 72 + inset + 16.
- Screens with a pinned CTA use the dock: one white panel with `shadow-sheet`, holding the CTA (52), a 12 gap, the bar, then 12 + inset. Content never shows between the CTA and the bar.
- Hide the bar while the soft keyboard is open.
- No bar on the screens listed in the README "Hidden on" section.

**7. Accessibility.**
- The bar is a tab list; each cell is a tab with `selected` state and touch target ≥ 48dp.
- Content descriptions use the exact strings in the README "Screen-reader strings" section (format `{Label}, tab, {i} of 3[, {badge}]`).
- The focus ring is shown for D-pad/keyboard only: 2px white + 2px `ink`.
- When the system animator scale is 0 (reduce motion): no slide, pops, press scale or fades. State changes are instant. The press fill stays.

**8. Performance.** Must stay smooth on low-end Android (2–3GB RAM, Android 8+). No blur, no Lottie, no runtime bitmap work. Animate only transform, alpha and colour, and avoid recomposing the whole screen on a tab change.

## Done means
- Side-by-side with the standalone prototype at 360dp and 320dp widths, gesture nav (inset 24) and 3-button nav (inset 0): geometry, colours and badge positions match.
- Every state from the prototype panel renders in the app: each tab active (both roles), each badge kind, two badges at once, pressed, focus, the CTA dock, keyboard hidden, reduce motion.
- "Account" at 700 doesn't truncate at 320dp.
- TalkBack reads the exact strings.
- Add screenshot/preview tests for those states if the repo has a screenshot-testing setup. Otherwise, add Compose previews (or the Views equivalent) for each.
- Remove the old bottom bar, its pill/wash styles and its `dot`-only API once everything is migrated. List what you removed.

Ask me before changing navigation architecture, adding dependencies, or touching screens outside the tab roots and the dock.
