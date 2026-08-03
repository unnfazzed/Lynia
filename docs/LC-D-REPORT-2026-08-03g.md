# LC loop D report — 2026-08-03g — D-O1 (optimize mode)

Territory: `docs/plans/2026-08-01-low-connectivity-program.md` §5 Lane D, first unchecked
**Optimization checklist** item — D-O1: "Low-connectivity state pattern for both web apps:
standard error/retry/stale components where D-T1/T2 find gaps."

All five Lane D audit territories (D-T1–D-T5) and all Day-0 defects are already closed (see the
program doc's Lane D section), and no unmerged `claude/lc-d*` PR existed at Phase 0, so this
firing moved to OPTIMIZE MODE and took the first unchecked checklist item.

## How this ran

A read-only research agent surveyed `apps/admin` and `apps/merchant` for existing error/retry/
stale-data UI to find the actual duplication before writing any code (per the item's own framing
— "standard ... components where D-T1/T2 find gaps"). Findings:

- **apps/admin** already had one genuinely shared whole-page-failure component
  (`components/states.tsx`'s `OfflineBanner`/`EmptyState`/`Conn`, consistently used by all 14
  route pages) and a shared loading-skeleton pattern (`components/skeletons.tsx`, all 14
  `loading.tsx` files). The real gaps were narrower: `app/error.tsx` hand-rolled its own
  banner+retry-button markup instead of a shared component (the one spot in admin with an actual
  retry action), and the rider-detail page's wallet-ledger sub-widget (a best-effort side query
  that can fail independently of the rest of an otherwise-loaded page) rendered its failure as
  unstyled inline text with no icon, no banner styling, and no reuse of `reasonLine`/
  `OfflineBanner` — there was no shared component for a partial-widget failure at all.
- **apps/merchant** had FIVE near-identical hand-copies of the same "failed initial load + Retry"
  block across `queue`/`statement`/`shop`/`menu`/`hours`, all sharing the identical `LoadState`
  union and the identical markup (`background: var(--danger-wash)` card + `Retry` button). One
  divergence: `queue/page.tsx` had drifted to its own locally-defined `ghostButtonStyle` (a
  pill shape) instead of the shared one in `components/queue/styles.ts` that the other four
  pages already imported.
- Neither app shares a UI component package today — `packages/shared` exports only data/logic,
  and `packages/design`'s reference components (`EmptyState.jsx`, `OfflineBanner.jsx`, etc.) are
  not imported anywhere in either app. Forcing admin and merchant onto one cross-app component now
  would be new design work, not extraction, so each app got its own minimal addition instead of a
  new shared package.

## What shipped

- **`apps/merchant/app/components/RetryableError.tsx`** (new): the dominant 5×-duplicated
  message+Retry-button block, extracted verbatim and importing the shared `ghostButtonStyle` from
  `components/queue/styles.ts`. All five pages (`queue`, `statement`, `shop`, `menu`, `hours`) now
  render `<RetryableError message={...} onRetry={...} />` instead of their own copy — this also
  fixes queue's drifted local button style for free, with zero effect on the auto-retry-on-
  reachable behavior that's specific to that page (left as page-level logic, not folded into the
  shared component, since it depends on a reachability *transition* rather than the component's
  own mount/unmount lifecycle — folding it in would have changed when it fires).
- **`apps/admin/app/components/states.tsx`** (additions): `RetryableError({ message, onRetry })`
  for client components needing an in-place retry, and `SubsectionUnavailable({ noun })` for a
  sub-resource failure on an otherwise-loaded page — the one state genuinely missing before this
  run. `app/error.tsx` now composes `RetryableError` instead of hand-rolling the banner+button.
  `app/riders/[id]/page.tsx`'s wallet-ledger card now shows `SubsectionUnavailable` when the
  best-effort wallet fetch returns null, replacing the old plain-text inline note.

## Verification

New tests: `apps/merchant/app/components/RetryableError.test.tsx`,
`apps/admin/app/components/states.test.tsx` (both new components), and
`apps/admin/app/error.test.tsx` (the page had zero coverage before this run). All five merchant
pages' existing `page.test.tsx` suites (which already exercise their Retry button end-to-end)
pass unchanged, confirming the extraction preserved behavior exactly.

Full monorepo `pnpm typecheck && pnpm lint && pnpm test` green (`@lynia/api` typecheck required a
one-time local `prisma generate` — the generated client wasn't present in this fresh checkout;
unrelated to this change and not itself a repo defect).

## Not done / scoped out

- No new `packages/` UI module — see "what shipped" above for why.
- The riders/[id] and merchants/[id] pagination link markup (`Load older →` / `↺ Back to latest`)
  is duplicated between the two files but isn't an error/retry/stale state — left alone as
  out-of-scope for this item.
- `menu/page.tsx`'s separate post-load `listError` banner (a different, narrower style for
  action-mutation errors, not initial-load errors) was left as-is — it's a distinct state (an
  already-loaded page reporting a follow-up mutation failure) from the `RetryableError` case
  (initial load never succeeded), so folding it into the same component would have conflated two
  different meanings under one name.
