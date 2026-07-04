# CHANGES — what to reconcile

This handoff is a **propagation** task, not a redesign. Below is what to check and how to
confirm the apps match the refreshed `packages/design/`.

## Tokens — verified in sync ✅

This project's `tokens/*.css` and the repo's `packages/shared/src/design-tokens.ts` match
value-for-value as of 2026-07-04. Spot-check confirmed:

- `--accent #00b14f` = `accent "#00B14F"`
- `--cta-fill #00812f` = `cta "#00812F"` · `--cta-fill-pressed #006b27` = `ctaPressed "#006B27"`
- `--accent-text #006630` = `accentText "#006630"` · `--accent-wash #e9f8ef` = `accentWash "#E9F8EF"`
- `--accent-700 #009d3b` = `accentPressed "#009D3B"` (+ `accent700` deprecated alias)
- radii 12/16/999 · spacing 4/8/12/16/24/32/48 + screen 16 · targets 44/52
- type scale 28/24/20/18/20/16/14/12/12/10 · weights 400/400/600/700/700

**If Claude Code's diff shows no token deltas, that's expected — skip token edits and go
straight to component/kit → app-primitive parity.**

## Where the real reconciliation is

The design source of truth is the React primitives + UI kits. Confirm the app primitives
match `packages/design/components/`:

| Design (`packages/design/components/`) | App primitive to keep in parity |
|---|---|
| `core/Button.jsx` | `apps/mobile/src/ui` Button, `apps/admin` button styles |
| `core/Card.jsx` | Card (borderless + soft shadow; emphasis card keeps accent border) |
| `core/StatusPill.jsx` | StatusPill (green text = `accentText`) |
| `core/Icon.jsx` + `assets/lynia-icons.js` | `apps/mobile/src/ui/Icon.tsx` Lucide subset |
| `journey/Stepper.jsx` | Stepper (ring graphic uses bright `accent`; text `accentText`) |
| `forms/Field.jsx` | Field (input radius 12) |
| `feedback/{EmptyState,OfflineBanner,Skeleton,SkeletonList}.jsx` | matching mobile primitives |
| `typography/{Heading,Label,Sub}.jsx` | type usage in both apps |

## Confirm the accent split held (highest-risk regression)

- White-on-green fills (buttons, earnings hero, order toggle on-state) → `cta`, never `accent`.
- Green text/icons (delivery code, "delivered", KYC-pending, profile status) → `accentText`.
- Bright `accent` only on non-text fills (map pins, stepper ring).
- Selected chips → `accentWash` bg + `accentText` text/border, never CTA fill.
- Gold `highlight` = border/star only; its text → `highlightInk`.

## App-logic follow-ups (out of scope for the visual refresh — track as tickets)

From `packages/design/HANDOFF.md` / `ALIGNMENT-REVIEW.md`: both-contact-phones on submit
(P0); request timeouts + async error states; select-offer 409 rollback copy; delivery-OTP
401/403 lockout + re-issue; one-round-per-rider board hiding; phone-reveal gated to the
active window. Put these in the PR body as separate follow-ups — don't fold them into the
design PR.

## Verify

```bash
pnpm install && pnpm build   # clean
pnpm typecheck && pnpm lint  # pass
```
