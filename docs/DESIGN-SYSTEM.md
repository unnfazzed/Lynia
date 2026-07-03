# LyniaGo Design System — Adoption

The LyniaGo design system is vendored into this repo at **[`packages/design/`](../packages/design/)**. This doc
records how it was adopted, the token reconciliation, what is already wired into the apps, and the follow-ups that
still need a device/build to land. For the system's own docs read `packages/design/readme.md` (the full design
guide) and `packages/design/HANDOFF.md` (engineering handoff, structure, how to run the kits).

## What lives where

| Path | Role |
|------|------|
| `packages/design/` | **Visual source of truth.** CSS-variable tokens (`tokens/*.css`, entry `styles.css`), reusable React primitives (`components/`), brand assets (`assets/brand` — the Paper Dove, app-icon set, self-hosted Inter/Fredoka `assets/fonts`), the Lucide subset (`assets/lynia-icons.js`), and the mobile/admin/support UI kits + guideline specimens. |
| `packages/shared/src/design-tokens.ts` | **The app token contract.** A TypeScript mirror of `packages/design/tokens/*.css`, consumed by `apps/mobile` and `apps/admin` so the running apps can't drift from the design. Keep it in sync with the CSS tokens. |
| `docs/DESIGN.md` | The living design/UX spec. Its token tables now reflect the LyniaGo values. |

> `packages/design/_ds_bundle.js`, `_ds_manifest.json`, `_adherence.oxlintrc.json` are **generated** by the design
> tooling (the UI-kit previews load the bundle). They're committed so the kits render, but don't hand-edit them.

## The re-direction (why this wasn't a drop-in)

The uploaded system is a deliberate shift to **Grab-style clean utility**. The clean-utility neutral base is
unchanged; the brand green, typeface, and shape language changed. The token source was reconciled as follows:

| Aspect | Before | After (LyniaGo) | Notes |
|--------|--------|-----------------|-------|
| Typeface | Manrope | **Inter** 400/600/700 (+ Fredoka 600 wordmark) | Self-hosted, system fallback |
| Green (fill) | `#1E7A46` | `accent` **`#00B14F`** | Fills / graphics / map pins **only** |
| Green (pressed) | `accent700 #16633A` | `accentPressed` **`#009D3B`** | `accent700` kept as a deprecated alias |
| Green (text/icon) | — (reused `accent`) | `accentText` **`#006630`** | ≈7:1 on white — all green **text** uses this |
| Green (CTA fill) | — (reused `accent`) | `cta` **`#00812F`** (`ctaPressed #006B27`) | White label ≈4.7:1 (AA large), sunlight-tuned |
| Selected wash | — | `accentWash` **`#E9F8EF`** | Mint |
| Card radius | 12 | **16**, borderless + soft shadow | Emphasis cards still pass an accent border |
| Input radius | 8 | **12** | |
| Buttons | pill (52/44) | **full pill** via `radius.button` | unchanged intent |
| Icons | emoji | Lucide subset (see follow-ups) | |
| Neutrals (ink/muted/bg/surface/line), gold, danger, 8pt spacing | — | **unchanged** | |

### The accent split (the important part)

`accent` used to serve as fill *and* text. The DS forbids green text in the bright fill green (`#00B14F` ≈ 2.9:1).
The token source now separates the three roles — **`accent`** (bright fill), **`cta`** (CTA fill, AA-legible), and
**`accentText`** (green text/icons, ≈7:1). When styling green: fills/graphics → `accent`; a button fill → `cta`;
anything a user reads → `accentText`.

## What is already wired

- **Token source** (`packages/shared/src/design-tokens.ts`) rethemed to the values above. All existing keys are
  preserved (back-compatible) and the new ones added: `accentText`, `accentPressed`, `accentWash`, `cta`,
  `ctaPressed`, `success`, `radius.button`, `font.wordmark`/`font.size`, `shadow`, `space.screen`,
  `touchTargetPrimary`.
- **Mobile primitives** (`apps/mobile/src/ui/index.tsx`): `Button` fills with `cta` and presses to `ctaPressed`,
  full-pill radius; `Card` is borderless with a soft shadow (emphasis cards still render a passed accent border);
  `StatusPill` and `Stepper` render green **text** in `accentText`.
- **Mobile screens**: every green **text** usage (delivery code, draft-restored chip, "delivered" / KYC-pending /
  "photo added" lines, profile status) moved from `accent` → `accentText`; fills/borders/map pins stay `accent`.
- **Notification accent** (`app.config.ts`, `push.ts`) updated `#1E7A46` → `#00B14F`.
- **Admin** (`apps/admin`): self-hosted **Inter** `@font-face` (files in `public/fonts`) + `font-family: Inter`;
  palette vars updated; active tabs / KYC-approve fills use `cta`; live/count text uses `accent-text`; the retired
  "L" monogram replaced by the Paper Dove mark (`public/brand/lyniago-mark.svg`); favicon + app icon wired via
  the app router (`app/favicon.ico`, `app/icon.png`); metadata rebranded to LyniaGo.
- **`docs/DESIGN.md`** token/type/radius/icon sections rewritten to the LyniaGo values.

## Remaining follow-ups (need a native dependency and/or on-device QA)

These were intentionally **not** done blind — they change native builds or need a device to verify, and this
environment can't build/run the RN app. Each is a small, well-scoped ticket.

1. **Mobile Inter font.** The DS ships `.woff2` (used by admin/web); React Native needs `.ttf`. Add Inter 400/600/700
   `.ttf`, load them with `expo-font` in `app/_layout.tsx`, and set the primitives' `fontFamily` to `Inter` (+
   Fredoka for the wordmark). Until then mobile renders in the system font (Roboto) — the design is built to read in
   the fallback, so this is a polish upgrade, not a blocker.
2. **Mobile emoji → Lucide.** `EmptyState` and screens still pass emoji (`icon="📦"`), which the brand disallows.
   Add a native icon renderer (`lucide-react-native` + `react-native-svg`, or Feather/MaterialCommunity via
   `@expo/vector-icons`), introduce an `Icon` primitive mirroring `packages/design/components/core/Icon`, map the
   house set (bike/inbox/id-card/banknote/package/wifi-off/triangle-alert/…), and swap the `EmptyState` icon prop.
3. **On-device QA.** Verify `cta` (#00812F) white-label contrast in real sunlight (re-tune `cta`/`ctaPressed` only if
   needed), and the Card shadow → content reflow on a cheap Android.
4. **Brand polish.** Wire `packages/design/assets/brand/icon/` into the mobile app icon/splash; outline the Fredoka
   wordmark to vector before production (drop the font dependency for the logo).

## Repo-side product tickets carried by the design (from `packages/design/ALIGNMENT-REVIEW.md`)

The design shows the intended UX; these are **app-logic** changes it can't make. See
`packages/design/HANDOFF.md` for the full P0/P1 list — highlights: enforce both contact phones on submit (P0),
bounded request timeouts + error states on every async action, select-offer 409 rollback copy, delivery-OTP
401/403 lockout + re-issue, one-round-per-rider board hiding, and phone-reveal gated to the active window.

## Keeping tokens in sync

`packages/design/tokens/*.css` and `packages/shared/src/design-tokens.ts` are two faces of one system. When a token
changes, update both (CSS var + TS key) and reflect it in `docs/DESIGN.md`. The apps import only from
`@lynia/shared`; a future web surface can `@import "@lynia/design/styles.css"` directly.
