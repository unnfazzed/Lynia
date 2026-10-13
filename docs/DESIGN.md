# Lynia — Design system & UX rules

This file is the short map of where the design lives, the token values, and the few UX rules the
code depends on. It is not a screen spec. Each screen's look comes from a design handoff in
`packages/design/handoff/`, and `CLAUDE.md` → "Pixel parity" is the full rulebook.

Direction: **Grab-style clean utility**. Light theme, data-light, white cards on soft shadows, a
bright green fill with a dark text-green for legibility. Built for a cash market, cheap Android
phones and bright sunlight.

## Where the design lives

| Layer | Source | Notes |
|---|---|---|
| **Look, per screen** | the handoff that owns the screen (table below) | Each handoff has a ledger entry in [`DESIGN-DEVIATIONS.md`](./DESIGN-DEVIATIONS.md). |
| **Look, everything else** | `packages/design/explorations/journey/All Screens Gallery.html` | Only where no handoff has replaced the screen. |
| **Interaction** | `packages/design/ui_kits/` | The gallery wins on look and IA. The mobile kit is stale for the rider. |
| **Values** | `packages/design/tokens/*.css` | Never hardcode a value a token defines. Mirrors: see [`DESIGN-SYSTEM.md`](./DESIGN-SYSTEM.md). |
| **Sanctioned differences** | [`DESIGN-DEVIATIONS.md`](./DESIGN-DEVIATIONS.md) | Owner-approved only. A code comment is not a deviation. |

`packages/design/` mirrors the design tool. Do not edit it to match the app. CI fails a PR that
touches `packages/design/**` without a `DESIGN-DEVIATIONS.md` entry (`scripts/check-design-freeze.mjs`).

### Which handoff owns which screen

| Area | Code | Handoff (`packages/design/handoff/…`) | Ledger |
|---|---|---|---|
| Send a parcel | `app/send.tsx` | [`send-compose-v2/`](../packages/design/handoff/send-compose-v2/) | D-52 |
| Order screen (parcel and merchant orders) | `app/order/[id].tsx` | [`after-send-v2/`](../packages/design/handoff/after-send-v2/) + [`order-flow-v2/`](../packages/design/handoff/order-flow-v2/) | D-53, D-59 |
| Rider app, top-up, both Account tabs, Settings, Job history | `app/rider/**`, `app/wallet/top-up.tsx`, `app/settings/index.tsx`, `app/history/index.tsx` | [`rider-v2/`](../packages/design/handoff/rider-v2/) | D-54 |
| Home, customer onboarding (C1–C5), rider first run (R1–R3) | `app/(tabs)/home.tsx` and onboarding | [`calm-mint-v2-2026-10/`](../packages/design/handoff/calm-mint-v2-2026-10/) | D-55 |
| Tab bar (both sides) | `src/ui/shell/TabBar.tsx`, the `(tabs)` layouts | [`tab-bar-v1/`](../packages/design/handoff/tab-bar-v1/) | D-56 |
| Restaurants, Shops, Pharmacy browse and search | `app/food/index.tsx`, `app/food/[id].tsx`, `app/food/search.tsx`, `app/shops/*`, `app/pharmacy/*` | [`browse-v2/`](../packages/design/handoff/browse-v2/) | D-57, D-58 |
| Review & place, merchant order screens, rider merchant jobs | `app/food/checkout.tsx`, `app/order/[id].tsx`, merchant and rider job screens | [`order-flow-v2/`](../packages/design/handoff/order-flow-v2/) | D-59 |
| Orders tab | `app/(tabs)/orders.tsx` | [`orders-v2/`](../packages/design/handoff/orders-v2/) | D-63 |
| Cold-start splash | `src/boot/splash/BootSplash.tsx` | [`splash-v1/`](../packages/design/handoff/splash-v1/) | D-64 |
| Notifications (both sides) | `app/notifications/index.tsx` | [`notifications-v1/`](../packages/design/handoff/notifications-v1/) | D-66 |
| Every empty, nothing-found and couldn't-load state | `src/ui/EmptyState.tsx` | [`empty-states-v2-2026-10/`](../packages/design/handoff/empty-states-v2-2026-10/) | D-78 |
| Permission asks, update screens, rider details and documents, ID-check outcomes, rider entry | `app/permissions.tsx`, `app/order-updates.tsx`, `src/ui/firstrun/*` | [`first-run-v2/`](../packages/design/handoff/first-run-v2/) | D-82 |
| Merchant app (kitchens, shops, pharmacies) | `apps/merchant` | [`merchant-v2/`](../packages/design/handoff/merchant-v2/) (its `BRIEF.md` wins); screens it does not redraw keep [`merchant-mobile/`](../packages/design/handoff/merchant-mobile/) | D-77, D-48 |
| Late-cancel rider contact, venue note, code changed, remove an Rx page | states on existing screens | [`customer-briefs-06-09/`](../packages/design/handoff/customer-briefs-06-09/) | D-97 |
| Marketing website | `apps/website/site/` | [`lyniago-website/`](../packages/design/handoff/lyniago-website/), shipped as-is | D-42 |

Strings come from each handoff's copy file, verbatim. One standing exception: user-visible
**"rider" reads "biker"** app-wide (D-101). Code, routes and data keep `rider`.

**Viewports.** Customer and rider phone: 360×720, plus a 320×640 check. Merchant is a phone app too:
360×720 plus 320px. Admin: 1440×900.

**Retired screens** are listed in `packages/design/EXPORT-README.md`. Never align to them.

## Design tokens

Values are in `packages/design/tokens/*.css`. These are the core ones; the files hold the rest
(semantic roles, tile tints, illustration palette, shadows).

**Colour (light theme):**

| Token | Value | Use |
|-------|-------|-----|
| `--ink` | `#14181b` | body text |
| `--muted` | `#5b6670` | secondary text, captions |
| `--bg` | `#ffffff` | page background |
| `--surface` | `#f6f7f8` | sheets, chips, sunken areas |
| `--line` | `#e2e6ea` | borders, dividers |
| `--accent` | `#00b14f` | brand green: **fills, graphics, map pins only** (≈2.9:1, never text) |
| `--accent-700` | `#009d3b` | pressed fill |
| `--accent-text` | `#006630` | green **text and small icons** (≈7:1 on white) |
| `--accent-wash` | `#e9f8ef` | mint wash: selected states, chips |
| `--cta-fill` | `#00812f` | primary-button fill; white label ≈4.7:1 |
| `--cta-fill-pressed` | `#006b27` | pressed primary button |
| `--highlight` | `#ffd23f` | gold, sparing: ETA chip, unread dot, star fill (was `#f2b705` before D-55) |
| `--highlight-ink` | `#6b5600` | gold-family text on `--highlight-wash` |
| `--danger` | `#c0392b` | errors, destructive |
| `--danger-wash` | `#faedeb` | soft red wash |
| `--danger-ink` | `#8f2418` | danger text on `--danger-wash` |
| `--success` | `#00b14f` | confirmation fills (use `--accent-text` for success text) |
| `--on-accent` | `#ffffff` | text and icons on a green or danger fill |

**Never set text in `--accent`.** Green text uses `--accent-text`; white text on green sits on
`--cta-fill`. The semantic role layer (`--text-*`, `--surface-*`, `--action-*` …) in `colors.css`
maps onto these raw values; prefer role names in new UI.

**Type:** Inter 400/600/700, tabular numerals for fares, ETAs and ratings (the `tabular` helper in
`apps/mobile/src/ui/index.tsx`). Scale from `typography.css`: display 28, h1 24, h2 20, title 18,
body-lg 16 (inputs, button labels), body 14, caption 12, micro 10. The "LyniaGo" wordmark ships as
outlined paths (`apps/mobile/src/ui/wordmark-paths.ts`), not a font.

**Spacing:** 4 / 8 / 12 / 16 / 24 / 32 / 48. Screen edge 16px.

**Radius:** input 12, card 16, buttons and pills full.

**Icons:** the Lucide line set, always paired with a text label. No emoji.

**Data-light:** cache map tiles, throttle marker renders, lazy-load images, skeletons over spinners.

## Responsive & accessibility

- Android-first, designed at 360px width; touch targets **≥ 44px** (52px for primary) — from the
  token, never a literal — `--target-min` / `--target-primary` in the kit, `touchTargetMin` /
  `touchTargetPrimary` (`packages/shared/src/design-tokens.ts`) in the app.
- **Sunlight contrast** (AA+) — riders use the app outdoors.
- Icon + text label everywhere; logical screen-reader order; visible focus.
- Easy error recovery (retry, edit, go back).

### Who wins when a mock draws a target below the floor

Settled by **D2 (owner, 2026-08-20)**:

| | Rule |
|---|---|
| **App** | Never inflates a drawn target. Silently resizing a mock is how the app stopped looking like the design. |
| **Kit** | Must draw one that clears the floor. A below-floor mock is an **upstream defect**: fix it in `packages/design/**` with a `DESIGN-DEVIATIONS.md` entry, and report it upstream. |

"Mock wins" is scoped to parity. It is not licence for the design to draw an unusable control.

### Screen classes — what "no back arrow" actually means

`back={false}` removes a drawn chevron. On its own it says nothing about Android's hardware back
button. So the two intentions have names (**N-04**; scope settled by **D1**):

| Class | Drawn back | Hardware back | Members |
|---|---|---|---|
| **dismissible** | yes | allowed | every ordinary pushed screen |
| **directed** | no | allowed | `gate_topup` (M2), the KYC walls, the active job |
| **held** | no | **blocked** | Review & place (`app/food/checkout.tsx`) while the order is being placed — and nothing else |

**`held` is deliberately almost empty.** Blocking the OS back gesture is justified only while an
order is in flight and leaving would risk a double order or a lost one. `usePlacingGuard` is the
only implementation and `app/food/checkout.tsx` its only caller. The test
`apps/mobile/src/logic/__tests__/screen-classes.test.ts` pins this.

**Active jobs are `directed`, not `held` (D1).** A rider in trouble must always have an exit, and
the tab bar leaves anyway.

### Back and skip idioms — why they are not all the same word

The words for leaving a step differ on purpose. The difference is what the tap costs.

| Affordance | Where | Meaning |
|---|---|---|
| **Drawn chevron** ("Back") | any dismissible pushed screen | Ordinary, reversible navigation. |
| **"Not now"** | permission asks (`app/permissions.tsx`, `app/order-updates.tsx`) | A real decline that can be asked again. It never blocks the next step. |
| **"Type an address"** | the location sheet (`src/ui/firstrun/CustomerLocationSheet.tsx`) | Not a decline. It is the other way to the same result: a pickup point. |
| **"Skip"** | optional steps such as rating | A step with no consequence. |

So: **one word per meaning, not one word everywhere.** The handoffs encode this. Changing the app to
one word would add drift.

## Not in scope

- Dark mode.
- Written comments on profiles (ratings show score and count only).
