# 2a home → system-wide merge plan

The 2a customer home (green brand header + floating search, order-again rail, photo-led
"Restaurants near you" cards) is now the source of truth. Phase 0 shipped this turn; each later
phase is a self-contained turn with its own regression pass.

## Phase 0 — components + docs (DONE this turn)
- `components/home/` — **BrandHeader**, **LiveOrderCard**, **ReorderRail**, **RestaurantCard**
  (+ `home.card.html` specimen, `home.prompt.md` usage rules).
- readme amended: green header = second sanctioned full-bleed surface (root home only);
  Food photo policy (lazy-load, ~15–25KB, tinted-initial fallback).
- Already live: `explorations/restaurants/` home screens use the 2a layout (local markup).

## Phase 1 — one shared home in the shipped app (ui_kits/mobile) — DONE
Express + Food get ONE home: BrandHeader → service tiles → LiveOrderCard | "Send again" rail →
RestaurantCard rail. The map composer moved to view "send" (Send tile / search / edit-order all
land there); the launcher is the root after login. Photo policy added to the guidelines
data-budget card. Food tile is static in this kit (the vertical lives in explorations/restaurants/).

## Phase 2 — Restaurants vertical consumes the components — DONE
- `r-customer-a.jsx` home screens now compose BrandHeader / LiveOrderCard / ReorderRail /
  RestaurantCard from the bundle; photo ids `hxp-*` preserved.
- Restaurant LIST is photo-led: hero 16:9 card for the top row, 96px photo thumbs below,
  tinted-initial fallback for photoless merchants (RESTAURANTS-UX-REVIEW fix).

## Phase 3 — journeys & galleries — DONE
`home_launcher` (2a) added to the customer journey map (node 0·9, perm_notif → launcher → send
composer; completed returns to the launcher) and to the All Screens Gallery Act 0. The old
"Map home" nodes are relabelled "Send composer" — behaviour unchanged.

## Phase 4 — rider + merchant language — DONE (judgement calls, challenge these)
- Rider ROOT (online board, ui_kits/mobile) now opens with the green brand header variant
  (`showSearch={false}`, "RIDING IN · Harare · CBD corridor"). Inner rider screens: white bars.
- Merchant tablet keeps the white KitchenBar; the menu editor's dish rows are photo-led
  (drop-slots `hxp-m-*`, tinted-initial fallback).

## Regression checklist (run each phase)
- Gallery phones are 300×600: card meta must clear the tab bar (top = 543); reorder circles 44px
  on dense screens.
- 320px-first: no horizontal overflow at 320; rails clip as scroll affordance, never wrap.
- Green text never `--accent` on white — always `--accent-text`; on green fills, white only.
- Icon subset only (no new Lucide names without regenerating `assets/lynia-icons.js`).
- image-slot sidecar: keep existing `hxp-*` ids; never duplicate an id across files in the same dir.
- Photos lazy-load and never block first paint; every photo surface has the tinted-initial fallback.
- `check_design_system` clean after every phase.
