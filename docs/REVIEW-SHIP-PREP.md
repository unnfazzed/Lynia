# Review — Ship-prep increment (gstack eng + design)

> gstack `/review` (engineering) + `/design-review` over branch
> `claude/next-dev-stage-planning-dkw52c` vs `main`. Scope: the four ship-prep/hardening commits
> (x-user-id gate, Cloud Run release workflow, GCS V4 signing, onAccent token + skeletons).
> Date: 2026-06-27.

## Engineering review — verdict: **LAND WITH FIXES** (fixes applied)

Independent staff-engineer audit (SQL safety, auth/trust boundaries, conditional side-effects,
structural/security). Confirmed correct:

- **`x-user-id` gate is unbypassable.** `nodeEnv === "production"` is exact; `NODE_ENV` is Zod-validated
  at boot to `development|test|production`. All six `@CurrentUser` consumers are behind `JwtAuthGuard`;
  the unguarded auth routes (`otp/*`, `refresh`) are correctly pre-auth. Test coverage adequate.
- **`--allow-unauthenticated` on Cloud Run is appropriate** — the service has public auth/health routes;
  protected routes are guarded at the controller layer, not the edge.
- **GCS V4 signing correct** — write vs read action, content-type binding, ms expiry, no network at
  construction; the offline throwaway-RSA-key test genuinely proves the signing path.

| Sev | Finding | Resolution |
|-----|---------|------------|
| **P1** | `release.yml`: armed-but-misconfigured (e.g. `GCP_PROJECT_ID` unset) would fail opaquely mid-run after a build starts. | ✅ **Fixed** — added a *Validate required deploy config* step that fails fast listing every missing var/secret and points at the arming docs. |

## Design review — onAccent **8/10**, skeletons **5/10 → improved** (fixes applied)

Designer's-eye QA against DESIGN.md (clean utility + warm accent, data-light, 8pt).

Confirmed well-done: complete `onAccent` adoption; cream tip-card (`#FFFCF2`) correctly left alone;
skeletons use tokens (no magic numbers), native-driver pulse, `busy` a11y state.

| Sev | Finding | Resolution |
|-----|---------|------------|
| NIT | `onAccent` undocumented in DESIGN.md | ✅ **Fixed** — added to the colour table + a Skeleton row in Components. |
| P2 | White-on-accent contrast ~5.2:1 vs the spec's "≥7:1 for primary actions (sunlight)". | **Deferred / out of scope** — the diff is a *pure token refactor*; contrast is **unchanged** from the prior hardcoded `#fff`, and the spec's 7:1 line is about the green primary CTA, not the admin tabs/logo touched here. Re-tuning the brand accent luminance is a founder-level design call. |
| P1 | Generic card skeleton doesn't mirror row/stepper/summary shapes → reflow when data lands (history, earnings summary, §5c stepper). | ◐ **Partly fixed** — added `SkeletonRow`/`SkeletonRows` (mirrors the right-aligned-value row) and wired **history** to it. Bespoke **stepper** + **earnings-summary** skeletons **deferred to the on-device `/qa` pass** — reflow can only be judged on a real device, which is exactly where BACKLOG always scoped skeleton tuning. |

## Net changes from the reviews

- `.github/workflows/release.yml` — fail-fast config validation (ENG P1).
- `apps/mobile/src/ui/index.tsx` — `SkeletonRow` / `SkeletonRows`; `apps/mobile/app/history/index.tsx`
  uses them (DESIGN P1, partial).
- `docs/DESIGN.md` — `onAccent` colour + Skeleton component documented (DESIGN NIT).

## Carried to `/qa` (on-device polish)

- Per-screen skeleton fidelity: `SkeletonStepper` for the §5c tracking/job screens; a tall accent
  summary skeleton for earnings. Tune the count/heights against real reflow on a device.
