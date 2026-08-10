# LyniaGo — Design System

**LyniaGo** is an on-demand **motorbike courier for Zimbabwe** — an inDrive-style "offer loop" where the **customer names a price**, nearby riders **accept or counter** (one round), and the **customer selects** the rider, then tracks the delivery live. The MVP is a point-to-point parcel courier launching in one Harare corridor; the longer vision is the operating system of the informal economy — parcels → bike leasing → credit → microfinance — on the same logistics spine. (**Lynia Finance** is the parent company behind the licensed financial arm; **LyniaGo** is the single consumer-facing brand.)

The design direction is **Grab-style clean utility** — trust through clarity, tuned for a **low-trust cash market on cheap Android phones in bright sunlight**. Light theme, data-light, white cards floating on soft shadows, bright Grab-green fills with a dark text-green for legibility, and a single sparing gold marker.

## Products in this system

- **Mobile app** (Expo / React Native, Android-first) — customer **and** rider in one app behind a role toggle. Screens: phone+OTP auth, send-a-parcel home, the live offer auction, the 7-step delivery tracking window, ratings; rider KYC/onboarding, online board, offer compose, active job + delivery-OTP hand-off; plus trip history, earnings and profile.
- **Admin ops console** (Next.js) — a **monitor & support** tool (no manual dispatch): live-order/rider KPIs and an automated-KYC review queue.

## Sources

Built from the Lynia monorepo on GitHub: **https://github.com/unnfazzed/Lynia**

Explore it further to build higher-fidelity Lynia designs — the most useful files:
- `docs/DESIGN.md` — the living design system & UX spec (tokens, components, screen IA, interaction-state matrix, the §5c stepper).
- `docs/CONCEPT.md` — product concept, the inDrive offer-loop model, identity/privacy rules, copy and tone.
- `packages/shared/src/design-tokens.ts` — the single token source consumed by mobile + admin.
- `apps/mobile/src/ui/index.tsx` — the real UI primitive library recreated here.
- `apps/mobile/app/*` — the actual screens (`home.tsx`, `order/[id].tsx`, `rider/*`, `history`, `earnings`, `profile`).
- `apps/admin/app/*` — the ops console.

Nothing here assumes you have repo access; the code values were lifted directly into the tokens, components and UI kits.

---

## CONTENT FUNDAMENTALS

How Lynia writes copy:

- **Second person, always.** "Send a parcel", "Your trips", "Rate your rider", "You're free for the next job." The app talks *to* the user about *their* delivery.
- **Sentence case everywhere.** No Title Case buttons, no ALL-CAPS shouting. The only uppercase is a tiny overline marker: `★ RECOMMENDED`.
- **Calm, honest, never blaming.** Errors state what happened plainly and hand back an action: *"That rider was just taken — choose another."* A transient reconnect is *"Live paused — reconnecting…"*, never a red alarm.
- **Every dead-end becomes an action.** Empty states pair a warm line with one primary button: *"No riders took this price yet."* → **Send another request**; *"No open orders near you right now — you're online and first in line."*
- **Utilitarian, not salesy.** Short declarative sentences. Explains the *consequence* of a control ("Go online to see and bid on nearby orders"), not marketing adjectives.
- **Trust-building specifics for a cash market.** Copy names the mechanism so a stranger feels safe: *"Give this code to the recipient — the rider enters it at hand-off"*, *"A record of work done — not a payout balance."*
- **Money & numbers.** USD with a `$` prefix, two decimals for fares (`$2.50`), always in **tabular numerals**. ETAs in minutes ("ETA 7 min"), ratings as `★ 4.8 · 132 trips`. A brand-new rider shows `★ new`, never a fake score.
- **Emoji-free.** Iconography is Lucide line icons paired with text labels; emoji are not part of the visual language.
- **Public names** are always **first name + last initial** ("Tendai M.") — a privacy rule baked into the copy. Phone numbers appear only during an active ride.

## VISUAL FOUNDATIONS

- **Color.** A light, near-monochrome utility base — ink `#14181B`, muted `#5B6670`, page white, surface `#F6F7F8`, hairline `#E2E6EA` — with the **bright Grab green `#00B14F`** for fills, CTAs and big graphics (pressed `#009D3B`), the **dark text-green `#006630`** (≈7:1 on white) for any green *text or small icons*, and a **mint wash `#E9F8EF`** for selected states. One sparing gold `#F2B705` strictly for the 'recommended' offer marker. Danger `#C0392B`. `onAccent` white is the single inverse. **Never set text in `#00B14F`** — it fails contrast; that's what `--accent-text` is for. Dark mode is deliberately deferred.
- **Type.** **Inter** for everything — the same typeface Grab's app uses in-product (free/open source). Titles bold **700** with slight negative tracking; body 400/500; labels 600. **Grab-dense scale:** 24px screen titles, 18px card/empty-state titles, **14px body, 12px captions/labels**, 16px only for inputs and button labels. **Tabular numerals** on every fare, ETA, rating, timer and count.
- **Spacing.** Strict **8pt scale**: 4 / 8 / 12 / 16 / 24 / 32 / 48.
- **Radius (Grab shape language).** Buttons are **full pills**; cards **16px**; inputs **12px**; chips/status pills full.
- **Elevation.** Cards are white and **float on a soft ambient shadow** (`--shadow-card`) with no visible border — the Grab card look. Hairlines remain for dividers, inputs and chips. The accent-bordered card variant marks emphasis (active job, delivery code).
- **Backgrounds.** Solid fills only — page white, sunken surface grey, mint wash for selected/highlight areas. **No gradients, no patterns.** Maps are one full-bleed surface; the **green brand header** (accent fill behind the status bar, white search floating over the seam) is the second — **root home only**, every other screen keeps white app bars. **Food photography is allowed** on Food surfaces (home cards, restaurant lists, menus): lazy-loaded, ~15–25KB per image, with the tinted-initial block as the first-class no-photo fallback — photos are an upgrade, never a dependency.
- **Cards.** White fill, soft shadow, 16px radius, 16px padding, 12px bottom margin. Green border = emphasis; gold border = recommended offer.
- **Animation.** Minimal and functional, always **reduce-motion aware**. A new bid slides+fades in once (220ms). Skeletons pulse opacity 0.5↔1. The auction timer crossfades muted→danger over the last 20s. **No bounces, no decorative loops.**
- **Hover / press.** Primary buttons press to the darker green `#009D3B`; ghost buttons press to the grey surface; disabled is 0.5 opacity. Inputs draw the deep-green border on focus. Nothing scales on press.
- **Transparency & blur.** Essentially none — sunlight legibility beats glass effects.
- **Layout rules.** Android-first at 360px width. One primary CTA per screen, 52px pill, in the thumb zone (often a bottom sheet). Every touch target ≥ 44px. Icons always paired with a text label. Labels sit *above* inputs, never as placeholders.

## DEVICE & NETWORK CONSTRAINTS (Zimbabwe rules)

Lynia runs on **cheap Android phones, small screens, expensive slow data**. These are hard rules, not preferences:

- **320px-first.** Design at 320px width (entry Androids), verify at 360px. One column, `--space-screen` (16px) edge padding, no side-by-side layouts on phones. The mobile UI kit has a 320px "entry phone" toggle to prove every screen fits.
- **Screen weight budget ~150KB** on first load, everything included. No decorative imagery or gradients; **Food photos are the one exception** — lazy-loaded off the critical path, ~15–25KB each, tinted-initial fallback so a photoless merchant never looks broken.
- **Fonts: 3 weights, self-hosted, instant fallback.** Only Inter 400/600/700 ship as `.woff2` in `assets/fonts/`, `font-display: swap`; text paints immediately in the system font (Roboto on Android) and upgrades. No third-party font round-trip. Never depend on Inter-only metrics; never add weights (800 is aliased to 700).
- **Icons: self-hosted 22-icon subset** (`assets/lynia-icons.js`, ~5KB). Never load a full icon library from CDN. Need a new icon? Import that one SVG from Lucide and regenerate the subset.
- **Skeletons over spinners** — content-shaped placeholders so the layout never jumps when data lands.
- **Data-light runtime:** cache map tiles, throttle GPS marker updates, lazy-load anything heavy, WebSocket with a slow-poll fallback (the app must degrade gracefully to 2G).
- **Offline tolerance:** persist drafts locally (the real app keeps a PII-free order draft); a dropped connection is a muted "reconnecting…" state, never a dead-end.
- **Sunlight + touch:** green text = `--accent-text` (≈7:1), body ≥ 4.5:1, targets ≥ 44px, one 52px primary CTA in the thumb zone.

## ICONOGRAPHY

Iconography is **Lucide** — open-source rounded 2px line icons matching Grab's in-app icon style — **always paired with a text label** (low-literacy + screen readers). **Self-hosted subset only** (data budget):

```html
<script src="assets/lynia-icons.js"></script>  <!-- 22 icons, ~5KB; adjust relative path -->
```

- The raw SVGs live in `assets/icons/`; `assets/lynia-icons.js` exposes a `window.lucide` shim (`icons` + `createIcons`).

- In React, use the design system's `Icon` component (`<Icon name="bike" />`); in plain HTML use `<i data-lucide="bike"></i>` + `lucide.createIcons()`.
- **House set:** `bike` rider / no-offers · `inbox` no-orders · `id-card` KYC · `banknote` earnings · `package` parcels · `wifi-off` network error · `triangle-alert` failed · `map-pin` pins · `phone` call · `clock` ETA · `chevron-right`/`chevron-down` disclosure (+ `star`, `check`, `arrow-right`, `navigation`, `user`, `history`, `search`, `x`, `circle-alert`, `chevron-up`).
- Green icons use `var(--accent-text)` (dark green), never bright `#00B14F`. Icons on green fills are white.
- **Unicode glyphs** still carry inline meaning in text runs: `★` ratings + the recommended marker (gold), `✓` a completed step, `→` route arrows ("Eastgate → Avenues"), `●`/`○` connection dots.
- Emoji are no longer used. Grab's own Duxton icon set is proprietary and was **not** copied — Lucide is the open equivalent in the same style.

## Assets & logo

**The Paper Dove is the LyniaGo logo** (founder decision) — **LyniaGo is the single consumer brand** across the app, the web / ops console, splash, icon and all marketing. **Lynia Finance** is only the parent company (the licensed entity behind the microfinance arm); it stays in the background — regulatory filings, contracts, legal footers — and is **not** a customer-facing brand. Whenever a mark is shown to a user, it is LyniaGo. The dove is a folded paper dart that is also a dove: the universal send glyph; the messenger bird (Noah's dove — the first confirmed delivery); folded from the paper of the informal economy. The fold lines cross at the upper third — **the crease is a cross**, hidden in plain sight.

**Usage rule:** small placements (≤ ~32px — buttons, favicons, avatars) use the **mark alone with no crease lines** (silhouette only); from ~32px the creases (and the cross) appear; large placements use the **full lockup** — dove + "LyniaGo" in **Fredoka 600** ("Go" in `--accent-700`). Load Fredoka only where the lockup appears; production ships the wordmark **outlined** so no extra font loads.

Files in `assets/brand/`: `lyniago-mark.svg` (master), `lyniago-mark-mono.svg` (one-colour), `lyniago-icon.svg` (app tile). Exploration record: `LyniaGo Paper Dove.html`, `LyniaGo Dove Cross.html`. The wordmark is **"LyniaGo" in Fredoka 600** ("Go" in `--accent-700`), via the `--font-wordmark` token. The old "L" monogram tile is retired.

## Fonts

**Inter** — the same typeface Grab uses in its app (chosen by Grab after testing 40+ typefaces; free, SIL OFL). **Self-hosted** in `assets/fonts/` — only three Latin weights (400/600/700, ~135KB total) with `font-display: swap`, so text paints instantly in the Android system font and upgrades, with no Google Fonts round-trip. Declared via `@font-face` in `tokens/fonts.css`.

**Fredoka 600** — the **brand wordmark face only** (the "LyniaGo" lockup; never body/UI text). Also **self-hosted** (`assets/fonts/fredoka-600.woff2`, ~16KB, one Latin weight) so the logo never needs a Google Fonts round-trip and can't fail on a weak network. Used via the `--font-wordmark` token (`"Fredoka", "Baloo 2", "Trebuchet MS", var(--font-sans)` — rounded-sans fallback so the lockup still reads if the font is slow). Interim measure until the wordmark is shipped as vector outlines; when outlined, the wordmark stops depending on this file entirely.

> Style provenance: the visual direction follows **Grab's in-app style** (green #00B14F, Inter, pill CTAs, soft floating cards, rounded line icons) per the founder's request — applied to Lynia's own brand name, monogram and copy. Grab's proprietary assets (Duxton icons, logo, Sanomat) were not copied.

---

## Index / manifest

**Root**
- `styles.css` — the single entry point consumers link (`@import` list only).
- `tokens/` — `colors.css`, `typography.css`, `spacing.css`, `fonts.css`.
- `guidelines/` — foundation specimen cards (Colors, Type, Spacing, Brand incl. the device & data budget).
- `assets/` — `lynia-icons.js` (self-hosted 22-icon subset), `icons/` raw SVGs, `fonts/` (self-hosted Inter 400/600/700 woff2).
- `components/` — reusable React primitives (below).
- `templates/` — starting-point scaffolds consuming projects begin from (`app-screen/` — a Lynia phone screen built from the components).
- `ui_kits/` — `mobile/` (customer + rider app), `admin/` (ops console), and `support/` (onboarding, permission priming, notifications, help, settings, edge/system states).
- `SKILL.md` — Agent-Skill entry point.
- `HANDOFF.md` — engineering handoff: structure, how to run, source-of-truth, repo-side tickets.
- `COVERAGE.md` — screen-by-screen map of what's designed vs. out of scope.
- `DESIGN-IMPROVEMENTS.md` — the gstack design-review response: findings → shipped changes → how Lynia out-crafts inDrive/GrabBike.
- `ALIGNMENT-REVIEW.md` — design ↔ functionality alignment vs. the repo contracts (all P0/P1 resolved).
- `ITEM-DESIGN-REVIEW.md` — the "what are you sending?" model decision (multi line-items: description + quantity).
- `RESTAURANTS-DECISIONS.md` — the Restaurants vertical: numbers picked, design decisions, interaction notes, screen inventory, open questions.
- `HOME-2A-MERGE-PLAN.md` — the phased plan merging the 2a customer home across the app, journeys, rider and merchant surfaces.
- `explorations/restaurants/` — the Restaurants vertical itself: `Restaurants Vertical.html` (80 static screens across customer / merchant tablet / rider) and `Restaurants Journey Maps.html` (three actor flows with every exception branch).

**Components** (React, consumed via `window.LyniaDesignSystem_94c56a`):
- `components/core/` — **Button**, **Card**, **StatusPill**, **Icon**, **Money** (every price renders through Money: tabular numerals, one weight vocabulary)
- `components/forms/` — **Field**
- `components/typography/` — **Heading**, **Sub**, **Label**
- `components/feedback/` — **EmptyState**, **SystemState**, **Skeleton**, **SkeletonList** (+ `SkeletonCard`; variants card/row/stepper/summary), **OfflineBanner** — **SystemState** is the full-screen blocking state (permissions, offline, suspended, force-update, hard error); **EmptyState** is for an empty list inside a working screen
- `components/journey/` — **Stepper** — the one 7-step delivery timeline for every vertical: the event API (`events` + `currentStatus` + `view`) for Send, the plain API (`steps`/`step`/`times`/`failAt`, e.g. `RESTAURANT_STEPS`) for verticals with their own step copy
- `components/shell/` — **AppScreen**, **AppBar**, **StatusBar**, **TabBar** — the phone scaffold every screen sits in (status bar → banner → body → sticky footer → root tab bar Home · Orders · Account), plus the pushed-screen header, so chrome never drifts between journeys.
- `components/home/` — **AppHome**, **BrandHeader**, **ServiceTiles**, **LiveOrderCard**, **ReorderRail**, **RestaurantCard** — the customer-home language. **AppHome** is the whole root screen and the source of truth for its dimensions (brand header → service tiles → one live-order card per running job, rides and food alike → venue rail); the mocks and the running prototype all render it.

These mirror `apps/mobile/src/ui/index.tsx` — the source's real primitive inventory.

### Intentional additions
- **Icon** — added when the system moved from emoji to Lucide iconography; a thin wrapper that renders Lucide line icons from the self-hosted subset.
- **OfflineBanner** — added per the ship review's "pre-auth loading discipline / global offline banner" follow-up (see `DESIGN-IMPROVEMENTS.md`).
- **Home set (BrandHeader, LiveOrderCard, ReorderRail, RestaurantCard)** — promoted from the customer-home exploration (option 2a, Uber Eats/DoorDash/Glovo-informed); `HOME-2A-MERGE-PLAN.md` tracks the screen-by-screen merge.

## Caveats

- The **live map** is a cosmetic placeholder in the kits — the real app uses Google Maps Platform (native map, tap-to-pin, live rider tracking).
- **No logo asset** exists; the wordmark + L monogram stand in. Provide a real mark to replace them.
- The mobile kit **simulates** the offer stream and step advances with timers/buttons for demo purposes; the real flow is socket-driven.
