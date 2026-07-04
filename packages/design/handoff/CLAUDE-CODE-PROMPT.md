# Claude Code — Lynia design-system refresh

Paste this into Claude Code (web or CLI) with the repo **unnfazzed/Lynia** connected,
on a fresh branch. It refreshes the vendored design system and propagates any changes
into the running apps.

---

## Task

The LyniaGo design system is vendored at `packages/design/` and is the **visual source of
truth**. An updated copy of that package has been placed into the repo (see "Inputs"
below). Reconcile the repo against it and update the consuming apps so the running UI
matches the refreshed design — no drift.

## Inputs

- `packages/design/**` — the refreshed design system: CSS-variable tokens
  (`tokens/*.css`, entry `styles.css`), React primitives (`components/`), brand assets,
  fonts, the Lucide icon subset, and the mobile/admin/support UI kits + guideline
  specimens. The generated `_ds_bundle.js` / `_ds_manifest.json` / `_adherence.oxlintrc.json`
  are build artifacts — **do not hand-edit them**; they exist so the kit previews render.
- `docs/DESIGN-SYSTEM.md` and `packages/design/HANDOFF.md` — the adoption record and the
  engineering handoff (structure, how to run the kits, the P0/P1 app-logic tickets the
  design implies).

## The token contract (read this before touching anything)

`packages/design/tokens/*.css` (CSS vars) and `packages/shared/src/design-tokens.ts`
(TypeScript) are **two faces of one system**. The apps import tokens **only** from
`@lynia/shared` — never from the CSS directly. So:

1. Diff `packages/design/tokens/*.css` against `packages/shared/src/design-tokens.ts`.
2. For **every** token that changed, update **both** the CSS var and the matching TS key,
   keeping the CSS↔TS name map intact:
   `--cta-fill`↔`cta`, `--cta-fill-pressed`↔`ctaPressed`, `--accent-700`↔`accentPressed`,
   `--space-2xl`/`--space-3xl`↔`space.xxl`/`space.xxxl`. The RN `shadow` tokens are
   **visual approximations** of the layered CSS box-shadows (RN can't do multi-layer
   shadows) — match weight, not literal values.
3. Reflect any token change in `docs/DESIGN.md`'s token tables too.

> As of this handoff the CSS tokens and `design-tokens.ts` are already value-for-value in
> sync. If your diff shows no token deltas, the work is entirely in components/kits →
> app-primitive parity (below), not tokens.

## The accent split — do not conflate the three green roles

- `--accent` / `accent` (#00B14F) — bright brand green. **Fills, graphics, map pins ONLY.**
  Never as text (≈2.9:1).
- `--cta-fill` / `cta` (#00812F) — the primary-button **fill**. White label ≈4.7:1 (AA
  large), sunlight-tuned. Any green surface carrying a white label uses this, incl. hero /
  large-display fills — never `--accent`.
- `--accent-text` / `accentText` (#006630) — green **text & small icons** (≈7:1).
- Selected states = `--accent-wash` background + `--accent-text` text/border
  (`--surface-selected`). Never the CTA fill — CTA green means "the one primary action on
  this screen."
- Gold `--highlight` (#F2B705) is **border/star only**; its text uses `--highlight-ink`
  (#6B5600).

## What to update in the apps

Bring the app primitives back to parity with `packages/design/components/`:

- **`apps/mobile/src/ui/`** (React Native, Expo SDK 52) — `index.tsx` primitives
  (`Button`, `Card`, `StatusPill`, `Stepper`, `Field`, `EmptyState`, `OfflineBanner`,
  `Skeleton`…), `Icon.tsx` (Lucide subset), `Brand.tsx` + `wordmark-paths.ts`, and
  `fonts.ts`. Match the refreshed `.jsx` primitives' structure, states (hover/pressed/
  disabled), radii, shadows, and the accent-split colour usage above. Screens under
  `apps/mobile/app/**` should use the primitives, not raw values.
- **`apps/admin/`** (Next.js) — `@font-face` Inter in `public/fonts`, palette CSS vars,
  active-tab / approve fills use `cta`, live/count text uses `accent-text`, Paper Dove
  mark + favicon/app-icon wiring, LyniaGo metadata. Reconcile with the refreshed
  `ui_kits/admin/` kit.
- **`apps/support`** if present — reconcile with `ui_kits/support/`.

Keep every green-on-white text usage on `accentText`; keep white-on-green fills on `cta`;
keep bright `accent` on non-text fills only (map pins, stepper ring graphic).

## App-logic tickets carried by the design (do NOT silently implement — list them)

These are behaviour changes the design implies but shouldn't be bundled into a visual
refresh without review. Surface them as a checklist in your PR body (source:
`packages/design/HANDOFF.md`, `ALIGNMENT-REVIEW.md`): enforce both contact phones on
submit (P0); bounded request timeouts + error states on every async action; select-offer
409 rollback copy; delivery-OTP 401/403 lockout + re-issue; one-round-per-rider board
hiding; phone-reveal gated to the active window.

## Definition of done

1. `pnpm install && pnpm build` clean (Turbo).
2. `pnpm typecheck` and `pnpm lint` pass.
3. Token CSS ↔ `design-tokens.ts` ↔ `docs/DESIGN.md` consistent (no drift).
4. App primitives match the refreshed `packages/design/components/` (states + accent split).
5. PR body: a concise summary of visual deltas + the app-logic ticket checklist above,
   flagged as separate follow-ups.

Do not edit the generated `_ds_*` files. Do not change token *values* unless the design
source changed — this is a propagation task, not a redesign.
