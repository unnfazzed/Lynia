# LyniaGo Design System — Engineering Handoff

This folder is the **LyniaGo design system**: the brand, design tokens, reusable UI components, and
high-fidelity UI kits for the LyniaGo motorbike-courier product (customer + rider mobile app, admin
ops console, and the support/onboarding/edge flows). It was built against the `unnfazzed/Lynia`
monorepo (contracts, screens, pricing) and mirrors those real values.

> **What this is / isn't.** These are pixel-accurate, interactive **design** artifacts — not
> production code. UI kits cut corners on functionality (fake data, simulated sockets) but are
> faithful to the intended visuals, states and copy. Lift **values and layouts** from here; wire the
> real data/logic in the app.

---

## Where things live

```
packages/design/                 ← this folder (suggested location in the Lynia monorepo)
├─ styles.css                     ← THE entry point — consumers link only this (an @import list)
├─ tokens/                        ← CSS custom properties (source of truth)
│   ├─ colors.css   typography.css   spacing.css   icons.css   fonts.css
├─ assets/
│   ├─ brand/                     ← logo SVGs, app-icon PNG set, favicon, one-pager
│   │   ├─ lyniago-mark.svg  lyniago-mark-mono.svg  lyniago-icon.svg
│   │   ├─ icon/  (16–1024 PNG, maskable, favicon.ico, site.webmanifest, README)
│   │   └─ LyniaGo One-Pager.html
│   ├─ fonts/                     ← self-hosted Inter (400/600/700) + Fredoka 600 .woff2
│   ├─ lynia-icons.js             ← ~5KB self-hosted Lucide subset (window.lucide shim)
│   └─ icons/                     ← the raw Lucide SVGs the subset is built from
├─ components/                    ← reusable React primitives (see below)
├─ ui_kits/
│   ├─ mobile/    (customer + rider app — the core courier loop, interactive)
│   ├─ admin/     (ops console)
│   └─ support/   (onboarding, permissions, notifications, help, settings, edge states)
├─ templates/app-screen/          ← a starter LyniaGo screen scaffold
├─ guidelines/                    ← Design-System-tab specimen cards (tokens, brand, splash)
├─ explorations/                  ← logo/wordmark design record (not shipped to users)
├─ readme.md                      ← the full design guide (READ THIS FIRST)
├─ DESIGN-IMPROVEMENTS.md         ← gstack design-review response
├─ ALIGNMENT-REVIEW.md            ← design ↔ contract alignment (all P0/P1 resolved)
├─ ITEM-DESIGN-REVIEW.md          ← the "what are you sending?" model decision
├─ COVERAGE.md                    ← screen-by-screen: what's designed vs. out of scope
└─ SKILL.md                       ← one-paragraph brand cheat-sheet
```

The `_ds_bundle.js`, `_ds_manifest.json`, `_adherence.oxlintrc.json` files are **generated** by the
design tooling — you don't need them to consume the system in production (the mobile/support kits use
the bundle only to render their previews). Ship `styles.css` + `components/` + `assets/`.

## Source of truth

- **All design values are CSS custom properties in `tokens/`.** Never hardcode a hex/size that a token
  already defines — reference `var(--…)`. Colors, type scale, spacing (8pt), radii, shadows, icon
  sizes all live there. `styles.css` `@import`s the whole set; link that one file.
- **Components** (`components/<group>/<Name>.jsx` + `.d.ts` + `.prompt.md`) are cosmetic React
  primitives that read the tokens. They're the intended API: `Button`, `Card`, `StatusPill`, `Icon`,
  `Field`, `Heading`/`Sub`/`Label`, `EmptyState`, `Skeleton`/`SkeletonList`, `OfflineBanner`,
  `Stepper`. Each `.prompt.md` has usage + variants; each `.d.ts` has the props contract.
- **Fonts** are self-hosted in `assets/fonts/` (no Google Fonts round-trip): **Inter** 400/600/700 for
  all UI text; **Fredoka 600** for the LyniaGo wordmark only (via `--font-wordmark`).
- **Icons** come only from `assets/lynia-icons.js` (a ~5KB self-hosted Lucide subset) — never pull the
  full CDN library. Add a new icon by importing that one SVG and regenerating the subset.

## Running the kits locally

They're plain static HTML — no build step. Serve the folder and open:
- `ui_kits/mobile/index.html` — the interactive courier app (use the 360/320 + Riders/Network demo
  chips to reach every state).
- `ui_kits/admin/index.html` — the ops console.
- `ui_kits/support/index.html` — the support/onboarding/edge gallery.

```bash
npx serve packages/design      # or any static server; then open the paths above
```

(React/Babel load from a pinned CDN in the kit HTML — internet needed to *view* the previews, not to
use the design system in production.)

## Brand quick rules

- One green: **#00B14F** for fills/graphics; **CTA buttons use #00812F** (`--cta-fill`, white text
  ≈4.7:1 for sunlight); green **text/icons** use **#006630** (`--accent-text`). Gold **#F2B705** only
  for the 'recommended' marker.
- Logo = the **Paper Dove** (`assets/brand/`). Full lockup ≥32px (crease-cross shows); silhouette
  below 32px. Wordmark **ships as outlined vector paths** (`assets/brand/lyniago-wordmark.svg` +
  `apps/mobile/src/ui/wordmark-paths.ts`) so the logo never depends on a font file; the Fredoka 600
  woff2 remains only as a fallback for the HTML kits.
- Voice: second person, sentence case, calm, honest; every dead-end offers an action; no emoji.
- Device rules: 320px-first, ~150KB/screen, skeletons over spinners, touch targets ≥44px.

---

## Repo-side engineering tickets (design can't fix these — app code must)

**This doc is the single canonical owner of the repo-side ticket list.** (`ALIGNMENT-REVIEW.md` and
`docs/DESIGN-SYSTEM.md` point here rather than keeping their own copies.) The design shows the intended
UX; these wire it to the backend.

**Closed on this branch** — the app now implements them; kits already showed the UX:

- **P0-1 · Both contact phones enforced on submit** — `home.tsx` blocks Broadcast while either
  `contactPhone` is empty (`min(6)`), so the client can't send `contactPhone: ""`.
- **P1-2 · Bounded timeout + error state on every async action** (send code, broadcast, select, KYC,
  confirm delivery) — 15s AbortController → friendly retry via `Field.error` / `OfflineBanner`.
- **P1-3 · Select-offer race (409)** — optimistic assign, roll back on 409 with the muted
  "That rider was just taken — choose another."
- **P1-4 · Delivery-OTP 401 retry + 403 lockout + re-issue** — 5 wrong → lockout; customer
  "Re-issue delivery code" calls `rotateDeliveryCode`.
- **P1-6 · Bidirectional phone reveal** gated to `assigned`→`completed` (`PHONE_REVEAL_STATUSES`), hidden after.
- **P1-7 · Reconnecting connection chip** (the glanceable state).

**Still open:**

- **P1-5 · One round per rider on the board.** After an offer, hide that order (`bidIds`); a job starts
  only when the customer selects. Kit shows this — wire the real board mutation.
- **P1-7b · Rider heartbeat + cooldown-403.** Auto-flip to offline with a reason on cooldown 403; the
  reconnecting chip exists but the heartbeat loop + cooldown wiring is still device-gated.

**On-device checks (can't judge from a screen):**

- CTA green (#00812F) contrast in real sunlight — re-tune `--cta-fill` if needed (one line).
- Skeleton→content reflow on a real device; bottom-sheet drag physics on the map home.

## Before production
- ~~Outline the Fredoka wordmark to SVG (drop the font dependency for the logo).~~ **Done** —
  `assets/brand/lyniago-wordmark.svg` (kerned outlines) + `apps/mobile/src/ui/wordmark-paths.ts`;
  the app no longer loads a Fredoka file.
- Wire `assets/brand/icon/` into the app + web `<head>` (snippet in `assets/brand/icon/README.md`) —
  the Expo launcher icon/adaptive-icon/splash are wired in `app.config.ts`; the web `<head>` snippet
  applies to any future web surface.
- Decide payment display copy when/if it moves beyond cash.
