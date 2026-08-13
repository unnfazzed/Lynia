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
| Green (pressed) | `accent700 #16633A` | `accentPressed` **`#009D3B`** | the `accent700` alias was kept for back-compat, then removed once it had zero consumers |
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

## Mobile fonts, icons, brand — implemented

The native-dependency work is now done (Expo SDK 52):

- **Inter + Fredoka fonts.** Added `expo-font`, `@expo-google-fonts/inter` (400/600/700) and
  `@expo-google-fonts/fredoka` (600). `app/_layout.tsx` loads them with `useAppFonts()` and holds the native splash
  until they register (`src/ui/fonts.ts`). Because Android matches font families by exact name, each weight is a
  distinct family; `fonts.ts` patches `Text`/`TextInput` once to inject the weight-correct Inter family app-wide
  (dropping the redundant `fontWeight` so Android doesn't double-synthesise bold), leaving explicit families — the
  Fredoka wordmark — untouched. The patch is guarded per render and falls back to the system font on any mismatch.
- **Lucide icons.** Added `lucide-react-native` + `react-native-svg`. `src/ui/Icon.tsx` is the `Icon` primitive
  (rounded 2px line icons, the house set only — bike/inbox/id-card/banknote/package/wifi-off/triangle-alert/…);
  `EmptyState` now renders it and all seven emoji call sites pass Lucide names. The kept Unicode glyphs (`★` ratings
  / recommended marker, `✓` completed step) stay — those are part of the visual language, emoji are not.
- **Paper Dove + wordmark.** `src/ui/Brand.tsx` draws the dove with `react-native-svg` (creases/hidden-cross only at
  ≥ 32px, silhouette below) and the "LyniaGo" wordmark in Fredoka 600 ("Go" in the deep green). `BrandLockup` is on
  the auth entry screen (`app/phone.tsx`).
- **Contrast.** Every green that carries text now uses a legible token: white-on-green fills (buttons, earnings hero
  card, order toggle on-state) use `cta` (#00812F ≈ 4.7:1); green text/icons use `accent-text` (#006630 ≈ 7:1). The
  bright `accent` (#00B14F) is left only on non-text fills (map pins, the stepper ring graphic).

## Decisions & clarifications (post-adoption review)

- **Hero / large-display fills that carry white text use `--cta-fill`, never `--accent`.** The bright green fails
  white-text contrast (≈2.9:1); the earnings hero card in the mobile kit was corrected to match the app (both now
  use `cta`). Same rule as buttons: white text on green → CTA green.
- **Gold `#F2B705` is border/star only.** Recommended-marker **text** uses `--highlight-ink` (`#6B5600`); the gold
  itself never carries text. App and kit agree.
- **Selected states are `--accent-wash` background + `--accent-text` text/border** (`--surface-selected`) — never
  the CTA fill. CTA green means "the one primary action on this screen"; a selected chip is not that. The kit's
  sort chips were corrected to demonstrate this.
- **CSS ↔ TS token naming map** (same values, two spellings): `--cta-fill` ↔ `cta`, `--cta-fill-pressed` ↔
  `ctaPressed`, `--accent-700` ↔ `accentPressed`, `--space-2xl`/`--space-3xl` ↔ `space.xxl`/`space.xxxl`. The RN
  `shadow` tokens are documented **approximations** of the layered CSS shadows — RN can't render multi-layer
  box-shadows, so they match the visual weight, not the literal values.
- **RN font patch.** `fonts.ts` patches `Text`/`TextInput` once to inject the weight-correct Inter family; caveat:
  a nested `Text` inherits the parent's resolved family, so set the weight on the innermost span that needs it.

## Done since (pre-production items closed in code)

- **Wordmark outlined.** "LyniaGo" now ships as kerned vector paths extracted from Fredoka SemiBold
  (harfbuzz-shaped GPOS kerning): `packages/design/assets/brand/lyniago-wordmark.svg` +
  `apps/mobile/src/ui/wordmark-paths.ts` consumed by `Brand.tsx`. No Fredoka font file loads at
  runtime any more (the `@expo-google-fonts/fredoka` dependency was removed). Regenerate both files
  together via fonttools/uharfbuzz if the mark ever changes.
- **Font patch unit-proven.** `apps/mobile/src/ui/__tests__/fonts.test.tsx` (jest-expo) verifies the
  genuine RN 0.76 `Text`/`TextInput` modules expose the patchable shape and exercises the patch
  end-to-end through a real forwardRef component: weight→family mapping (500→400, 800→700),
  explicit-family passthrough, fontWeight dropped from the injected style, exactly-one render call
  even when style computation throws, and the no-double-wrap guard.

## Design System v3 drop (4 Jul 2026)

The refreshed package (`Lynia_Design_System_3.zip`) was synced into `packages/design/`. It adds the
7-screen admin ops console kit (`ui_kits/admin/` + `admin.css`), the 2026 customer/rider journey
flows (`ui_kits/mobile/new-flows.html`, `explorations/journey/`), four new audit docs
(`INTERFACE-AUDIT.md`, `RIDER-JOURNEY-AUDIT.md`, `CUSTOMER-JOURNEY-AUDIT.md`, `BACKLOG-PLAN.md`) and
the `handoff/` bundle.

**Precedence rule.** The updated design system is the source of truth for design decisions and edge
cases, so `packages/design/` is synced from DS3 — **except where the design carries an objective
violation**, in which case the corrected code file overrules it (and only the violation is corrected).
Four DS3 files carry a violation: `tokens/colors.css` `--action-primary`, the kit's earnings-hero and
toggle-chip on-states (all three white-on-`--accent`, ≈2.9:1 — below AA-large), and `Skeleton.jsx`
(dropped `prefers-reduced-motion`). Their corrected versions were kept; each differs from DS3 by only
the contrast/motion fix. The fixes must be **back-ported into the design tool** so the next export
stops re-introducing them (the design's own brand rules already require `--cta-fill` for white-on-green
and a wash for selected states — the token file and kit just drifted). `--danger-wash #FAEDEB` was
promoted from an `admin.css` literal to a real token (the DS3 handoff itself requested this) across
CSS + `dangerWash` in `design-tokens.ts` + admin `globals.css` + `docs/DESIGN.md`. The full
inconsistency register and phased execution plan live in
**[`docs/plans/DESIGN-SYSTEM-3-IMPLEMENTATION-PLAN.md`](plans/DESIGN-SYSTEM-3-IMPLEMENTATION-PLAN.md)**.

## Remaining (genuinely needs a device)

1. **Sunlight check.** The contrast math is verified (`cta` #00812F carries white at ≈4.7:1, AA-large;
   green text #006630 ≈7:1) — what no remote environment can judge is panel brightness + glare on a
   cheap Android outdoors. If it reads dim in the field, re-tune `cta`/`ctaPressed` (one line, options
   documented in `design-tokens.ts`).
2. **Physical QA.** Card shadow → content reflow and the rendered Inter faces on a real build — the
   font patch is unit-proven, but pixels on glass still deserve one look.

## Repo-side product tickets carried by the design (historical)

The design's original alignment review carried a P0/P1 app-logic ticket list — highlights: enforce
both contact phones on submit (P0), bounded request timeouts + error states on every async action,
select-offer 409 rollback copy, delivery-OTP 401/403 lockout + re-issue, one-round-per-rider board
hiding, and phone-reveal gated to the active window. These predate the current code — see
`docs/plans/DESIGN-SYSTEM-3-IMPLEMENTATION-PLAN.md` for what shipped; the review itself is retired
to git history.

## Keeping tokens in sync

`packages/design/tokens/*.css` and `packages/shared/src/design-tokens.ts` are two faces of one system. When a token
changes, update both (CSS var + TS key) and reflect it in `docs/DESIGN.md`. The apps import only from
`@lynia/shared`; a future web surface can `@import "@lynia/design/styles.css"` directly.

## Error surfaces — the four kinds, and which one you're allowed to build

Owner instruction, 2026-08-12 (from a device photo of the rider board, then generalised): **"I don't
want error cards that confuse customers or riders or get in the way of app use. Error cards must just
display once and go — which is when an action is attempted and there is an error."**

That rule sorts every failure surface in the app into four kinds. Three are legitimate; the fourth is
banned and has been removed.

| Kind | What it is | Treatment | Primitive |
|---|---|---|---|
| **Action error** | The user tapped something and it failed | Speaks **once**, auto-dismisses after 4s, never persists | `useActionError()` / `useActionErrorEffect()` |
| **Field validation** | The value in *this* input is wrong | Stays inline until fixed — it must be readable while you correct it | `Field`'s own `error` prop |
| **Content-slot state** | You opened a screen and its data didn't load | Calm `EmptyState` + Retry, **in the content area**, never red | `EmptyState` (default `accent` tone) |
| **Connection status** | Network/socket is down | Calm strip, self-clears on reconnect — a state, not an error | `OfflineBanner` |
| ~~**Background-poll error card**~~ | A poll the user never triggered failed | **BANNED — do not build this** | *(none — deleted)* |

**Why the fourth kind is banned.** It fires on work the user didn't ask for, on a timer, so it
re-raises indefinitely on a flaky link and camps over a screen that is otherwise working. Two shipped
instances proved it in the field and both are gone: the rider board's `ActiveJobCheckFailedBanner`
(photographed stacked over the KYC gate, where an unverified rider *cannot* have an assigned job) and
the customer's `ActiveOrderCheckFailedBanner` (Home/Orders/Send). Note that the second one had already
been narrowed once, in 2026-08-05, by gating it behind persisted evidence — that refinement was not
enough, because the category itself is the problem, not its hit rate. The queries behind both self-heal
on their own poll plus reconnect/foreground refetch, so a failed check simply shows nothing and the
real card returns when the data does.

**`ErrorText` is deleted.** It rendered a persistent red line under a button that nothing cleared but a
later success — the same get-in-the-way problem in miniature. Every former call site now raises the
*same curated copy* through `useActionError`, so the screen-specific wording each `onError` computes
("That request's window just closed — someone else may already have it.") is preserved exactly; only
the delivery changed.

**If you are adding a failure surface, the test is: did the user just tap something?** If yes, it's an
action error — toast it. If no, it belongs in the content slot or it doesn't exist.

**Implementation note for action errors.** `useActionError` returns a `(message: string | null) => void`
with the same shape as the `setError` setters it replaced, so call sites read unchanged and a
`setError(null)` "clear" is a harmless no-op. It raises **unconditionally per call** — deliberately.
A `useState`-backed version silently swallows a second failure carrying identical copy (React bails out
when the value is unchanged, so the effect never re-runs), which is precisely the retry the user most
needs to hear about. For failures derived from a mutation's own `error` object rather than held in
state, use `useActionErrorEffect(mutation.error)`: it keys on the Error **object**, and React Query
mints a fresh one per attempt, so identical-copy retries still speak. Both are pinned by
`src/ui/__tests__/action-error.test.tsx`. Being hooks, they must be declared above a screen's early
returns — the old `<ErrorText>` was plain JSX and could sit anywhere in the render body.

**The design kit never drew a persistent error line or a toast** — `packages/design/components/feedback/`
carries only `EmptyState`, `OfflineBanner`, `Skeleton`/`SkeletonList` and `SystemState`. `ErrorText` and
both check-failed banners were app inventions, so removing them needs no `docs/DESIGN-DEVIATIONS.md`
entry; "not drawn ⇒ not rendered" argues for their removal. The kit's `Field` error caption is drawn and
is kept.
