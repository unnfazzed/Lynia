# Handoff: Empty states v2 (minimal) — 6 Oct 2026

## Overview
Replaces all 7 current empty-state patterns in LyniaGo (customer + rider, React Native app `apps/mobile`) with **one quiet component**: a small tinted mark, a short title, at most one line, at most one soft action. No mint cards, no grey 56/72/84/88 discs, no `TrustTrackingArt` pin illustration in empty states.

## About the design files
`Empty States Minimal v2.html` is a **design reference built in HTML**, not production code. Recreate it in the existing RN codebase using its tokens, `Text`, Lucide icons and pressable patterns. Open it in a browser — it is a pan/zoom canvas with 17 frames at 360×720 and a "Proposed copy changes" list at the bottom.

## Fidelity
**High fidelity.** Colours, type, sizes and spacing below are final.

---

## 1. The component — `EmptyState`

One component, two sizes, three tones.

### Anatomy (size L, centred)
```
        ┌───── halo ring 88 ─────┐
        │   ● disc 64  (+dot)    │     mark
        └────────────────────────┘
                 8  (mark margin-bottom)
                16  (title margin-top)
            Title 18/600            max-width 264
                 4
       One line 14/20.3 muted       max-width 264  (optional)
                20
          [ Soft pill 44 ]          primary (optional)
                 4
           Text button 44           secondary (optional)
```

| Part | Spec |
|---|---|
| Container | column, `alignItems:center`, `textAlign:center`, horizontal padding **40** (24 inside sheets) |
| Disc | **64×64**, radius 999, bg = tone wash, icon centred |
| Icon | Lucide, **24px, strokeWidth 2**, colour = tone icon |
| Halo ring | circle **88×88** concentric with disc (inset −12), **1px border**, colour = tone wash, no fill |
| Accent dot | **8×8** circle, positioned `top:4, right:2` of the 64 disc, with a **3px white ring** (render as 14×14 white circle + 8×8 inner, or `borderWidth:3 borderColor:#FFFFFF`). Colour per tone; error has none |
| Mark → title | mark marginBottom 8 + title marginTop 16 (= 24 from disc edge, 12 from halo) |
| Title | Inter **18 / 600**, letterSpacing −0.18 (−0.01em), colour ink `#14181B`, maxWidth 264, balanced wrap (max 2 lines) |
| Line | Inter **14 / 400**, lineHeight **20.3** (1.45), muted `#5B6670`, marginTop 4, maxWidth 264. Optional — omit when the title says it all |
| Actions block | marginTop **20**, column, centred, gap 4 |
| Primary — soft pill | height **44**, paddingH **20**, radius 999, bg `#E9F8EF`, label Inter 14/600 `#006630`, optional 16px Lucide icon left, gap 8. No border, no shadow |
| Secondary — text button | height **44**, paddingH 16, transparent, Inter 14/600 `#006630` |
| Pressed state | soft pill bg `#D4F2E0`; text button opacity 0.6 |

Max one primary + one secondary. Never a filled `#00812F` CTA inside an empty state.

### Tones
| Tone | Disc + halo | Icon | Dot | Use |
|---|---|---|---|---|
| `empty` (default) | `#E9F8EF` | `#00B14F` (graphic green — icon only, never text) | `#FFD23F` | nothing here yet |
| `info` | `#F6F7F8` | `#7D8790` | `#AEB6BD` | no results, offline, nothing to do |
| `error` | `#FAEDEB` | `#8F2418` | none | load failed |

### Size S — inline row
For a state that sits under live content, inside a sheet section, or in a list header.
- Row, `alignItems:center`, gap **12**, Inter 14/20.3 `#5B6670`.
- Leading: Lucide **20**, colour `#AEB6BD`. Optional **36×36** disc `#F6F7F8` behind it (used on rider Money history).
- Optional trailing text button (44 high, paddingH 4, 14/600 `#006630`), row `justifyContent:space-between`.
- Centred note variant (no icon): text centred, 14 muted.

### Placement
- L sits in the free space below the header, **not vertically centred**: top of the mark at **≈30% of the free height** (min 48). Reference offsets in the mocks: 168 below a 120 mint header; 200 below a 52 back-header; 120 below storefront info.
- On tab roots reserve the floating tab bar: bottom inset **72 + safe-area**; never let the block overlap it.
- No card, no background, no shadow — the block sits directly on the screen background.
- At 320 wide: padding stays 40, text max-width becomes `min(264, width − 80)`; title may wrap to 2 lines; actions never go side by side.

### Props
```ts
type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  body?: string;
  tone?: 'empty' | 'info' | 'error';   // default 'empty'
  primary?: { label: string; icon?: LucideIcon; onPress: () => void };
  secondary?: { label: string; onPress: () => void };
  inSheet?: boolean;                    // paddingH 24
  testID?: string;
};
type EmptyRowProps = {
  icon?: LucideIcon; text: string; disc?: boolean; centred?: boolean;
  action?: { label: string; icon?: LucideIcon; onPress: () => void };
};
```

---

## 2. Screens (designed frames)

| ID | Screen | Size · tone | Icon | Title / line | Actions |
|---|---|---|---|---|---|
| O16 | Orders, all services | L · empty | `receipt` | No orders yet / Your orders will show here. | none |
| O17 | Orders, parcels only | L · empty | `package` | No parcels yet / Parcels you send show here. | none |
| O18 | Orders, running + no history | S centred | — | Past orders show here. | — |
| O21 | Orders, couldn't load | L · error | `circle-alert` | Couldn't load orders / Your orders are safe. | pill: Try again (`refresh-cw`) |
| N8a | Notifications, customer | L · empty | `bell` | No notifications / Order updates show here. | none |
| N8b | Notifications, rider | L · empty | `bell` | No notifications / Job and money updates show here. | none |
| H6 | Home, no location | L · empty | `map-pin` | Where should we deliver? / See who delivers to you. | pill: Use my location (`navigation`) · text: Type an address |
| B9 | Restaurants, none deliver here | L · empty | `utensils` | No restaurants in {area} yet / We're adding kitchens near you. | pill: Change address |
| B7 | Restaurants, no address (above results) | S + action | `map-pin` | Add an address for fees and times | text: Set. Row has 1px `#E2E6EA` bottom border, paddingBottom 4 |
| X4a | Search, no matches | L · info | `search` | No results for "{q}" / Try a shorter word. | none |
| X4b | Search, offline | S | `wifi-off` (16) | Offline · recent searches only | — (no box/banner; gap 8) |
| S13c | Storefront, no items | L · empty | `inbox` | No items yet / Check back soon. | none |
| S8 | Storefront, closed | S + action | `clock` (16, `#7D8790`) | **Closed · opens {time}** (14/600 ink) | text: Remind me (`bell`). Row between 1px `#E2E6EA` top + bottom borders, paddingV 4. Replaces the grey strip + toggle card; tapping toggles the reminder and the label becomes "Reminder on" |
| R9a | Cart empty | L · empty | `shopping-bag` | Your cart is empty | pill: Browse places |
| J4 | Rider jobs board (sheet) | L · empty, `inSheet` | `bike` | No jobs nearby / New jobs appear here on their own. | none. Below, 24 gap: S row centred, `map-pin` 16 in `#00B14F`, "Busier near {place} · {km} km" |
| M9 | Rider Money, history | S + disc | `receipt` | No jobs yet today | — |
| NEW | Rider Job history | L · empty | `bike` | No jobs this week / Finished jobs show here. | none |

Frame-level changes outside the component:
- **J4**: remove the long paragraph and the "Why no jobs?" box. Reconnecting is shown only in the header status line (existing), not as a banner in the sheet.
- **M9**: remove "Your earnings and commission show here after your first job." from the Earnings card. Commission card keeps its amount + Top up.
- **Rider Job history**: summary becomes plain text "This week · **0 jobs · $0.00**" (14, muted + 600 ink) instead of the mint banner.

## 3. Remaining states — apply the same rules
Not drawn, but must move to `EmptyState` so no old pattern survives. Copy is in `copy.ts`.

| ID | Size · tone | Icon | Actions |
|---|---|---|---|
| O9d (+ parcels/shop/pharmacy) | L · info | `receipt` | pill: Show all orders |
| O10c | L · info | `search` | text: Clear search |
| O20 | L · info | `wifi-off` | none |
| Home both rails empty | L · empty | `store` | none |
| N10 | L · error | `circle-alert` | pill: Try again |
| B6 | L · info | `search` | text: Clear filters |
| B3b | L · empty | `store` | text: See all shops |
| B10b | L · info | `wifi-off` | text: Try again |
| B11 | L · error | `circle-alert` | pill: Try again |
| S12b | L · info | `search` | text: Search all restaurants |
| X idle (Shops/Pharmacy) | L · info | `search` | none |
| Order not found | L · info | `package` | pill: Back to home |
| No active job (rider) | L · empty | `bike` | none |
| Rider offline / errors | L · info / error | `wifi-off` / `circle-alert` | **none** — rider screens never show Retry; line says what the app is doing, e.g. "Trying again in 10 s" |

**Out of scope, leave as is:** rider gates G4/G14/G10 (Blocked tone, facts box), S9 "just closed" modal, F4 food-offer-gone, service-soon bottom sheet, merchant app, admin console.

## 4. Where the code lives (from the brief)
- Shared: `apps/mobile/src/ui/index.tsx:656 EmptyState` ← **rewrite here**; `src/ui/SystemState.tsx`; `src/ui/order/kit.tsx:386 IconDisc`
- Orders: `src/ui/orders/kit.tsx:534 InfoCard`, `:583 EmptyArt`; `app/(tabs)/orders.tsx:192–276`
- Home: `src/ui/home/kit.tsx:527 NoLocationCard`, `:550 ComingSoonCard`, `:558 MintEmptyCard`
- Notifications: `src/ui/notifications/kit.tsx:365 NEmpty`, `:381 NFail`
- Browse: `src/ui/browse/kit.tsx:551 BrowseEmpty`, `:569 ServiceEmpty`, `:591 NoLocationCard`; `ShopListScreen.tsx`, `BrowseSearchScreen.tsx`, `ShopSearchScreen.tsx`
- Cart: `app/food/checkout.tsx:354–373`
- Rider: `app/rider/(tabs)/index.tsx:517–607` (J4 only), `money.tsx:270`, `src/ui/rider/kit.tsx:631 CentreState`, `app/history/index.tsx`, `RiderErrorState.tsx`
- Art: `src/ui/art/TrustTrackingArt.tsx` — stop using it in empty states (keep the file if used elsewhere)

Line numbers are from the brief; verify before editing.

## 5. Tokens used
ink `#14181B` · muted `#5B6670` · bg `#FFFFFF` · surface `#F6F7F8` · line `#E2E6EA` · accent-wash `#E9F8EF` · accent-wash-pressed `#D4F2E0` · accent-text `#006630` · danger-wash `#FAEDEB` · danger-ink `#8F2418` · graphic green `#00B14F` (icons/dots only) · gold `#FFD23F` · idle `#AEB6BD` / `#7D8790`.
Type: Inter 400/600 · 18/600 title · 14/400 body (lh 20.3) · 14/600 actions. Spacing 4, 8, 12, 16, 20, 24, 40. Radius 999. No shadows.

## 6. Review notes
- The primary action is a 44-high soft pill, not the 52 filled CTA — deliberate, to keep empty states quiet. Meets the 44 min tap target.
- Title is 18 (on scale). All inline rows are 14 (on scale).
- Removed actions (need sign-off): O16 "Send a parcel" + "Find food or shops", O17 "Send a parcel", N8a "Send a parcel", B9 "Send a parcel", J4 "Why no jobs?" box.
- All changed copy is listed old → new at the bottom of the HTML canvas and in `copy.ts` comments. Copy must be approved before shipping.

## Files
- `Empty States Minimal v2.html` — the 17-frame reference canvas
- `copy.ts` — every string, verbatim
- `CLAUDE-CODE-PROMPT.md` — paste-ready implementation prompt
