# LC-D report — 2026-08-02 (journey & soundness sweep)

First LC-D increment. Per §5 Lane D's priority order, the Confirmed Day-0 defects list (fix
first, one per firing, before the audit territories) had six unchecked boxes; this run fixes the
first — D-D0a / LC-D02 — and leaves D-D0b..f for subsequent firings.

## Fixed — D-D0a / LC-D02 (CRITICAL): the second of two simultaneous orders was unanswerable

**Defect.** `NewOrderTakeover` (`apps/merchant/app/components/queue/NewOrderTakeover.tsx`) is
the full-viewport NEW ORDER alarm takeover the kitchen tablet renders for `groups.awaitingAccept[0]`.
`submitAccept`/`submitReject` set `submitting` to `true` before calling `onAccept`/`onReject`, but
only reset it back to `false` in the `catch` branch — never on success. `QueueBoard` rendered
`<NewOrderTakeover active={active} .../>` with **no `key`**, so when the first order's accept
succeeded and `refetch()` advanced `active` to the second queued order, React reconciled it as an
update to the *same* component instance rather than mounting a fresh one. The stale
`submitting === true` from the first order's successful accept therefore carried straight into the
second order's render — disabling both the Accept and "Can't take it" buttons. **The second of two
simultaneous orders was physically unanswerable** until the tablet was reloaded. The same missing
`key` also leaked `unavailable` (item-level accept selections) and `showReject` (the reject sheet's
open/closed state) across the order boundary. The sibling `NoRiderHoldTakeover` had the identical
`submitting`-never-reset-on-success shape (flagged in the same audit finding).

**Fix (matches the audit's prescribed fix exactly).**
- `NewOrderTakeover.submitAccept`/`submitReject` and `NoRiderHoldTakeover.run` now call
  `setSubmitting(false)` on the success path too, not only in `catch`.
- `QueueBoard` now renders `<NewOrderTakeover key={active.id} .../>` and
  `<NoRiderHoldTakeover key={holdToShow.id} .../>` — a full remount at the order boundary, which
  resets every per-order piece of local state (`submitting`, `unavailable`, `showReject`) by
  construction instead of relying on each one being reset by hand.

**Regression test.** The merchant app (`apps/merchant`) previously had zero component-rendering
tests — only pure-logic tests under a `node` vitest environment (see
`apps/merchant/vitest.config.ts`'s prior comment). Wiring an actual regression test for this defect
class (React state surviving a prop change with no `key`) requires rendering the component tree, so
this PR adds `jsdom` + `@testing-library/react`/`@testing-library/dom` as merchant devDependencies
and a `// @vitest-environment jsdom` per-file opt-in (`.test.ts` files stay on `node`, unaffected).
The new `apps/merchant/app/components/queue/QueueBoard.test.tsx`:
- Renders `QueueBoard` inside a small harness that mimics the real page (`orders` state owned by the
  parent, `refetch` removing the just-accepted order — the same contract `QueueBoard` itself relies
  on).
- Mocks `../../lib/orders-api` so `acceptOrder` resolves without a network call.
- Simulates two queued `awaiting_accept` orders, clicks Accept on the first, waits for the
  refetch-driven re-render onto the second order, and asserts the second order's Accept button is
  **not** disabled.
- Verified this test fails on the pre-fix code (`AssertionError: expected true to be false`, i.e.
  the button stayed disabled) and passes after the fix — confirmed by temporarily stashing the three
  fix files and re-running.

**Verification:** `pnpm --filter @lynia/merchant typecheck` clean; `pnpm --filter @lynia/merchant
lint` 0 warnings/errors; `pnpm --filter @lynia/merchant test` 87/87 (86 pre-existing + 1 new)
green. Full workspace `pnpm run typecheck` (6 packages) and `pnpm run lint` (5 packages) also
green after a clean `pnpm install --frozen-lockfile=false` (matching CI's install step).

## Not done this run (Lane D's remaining Day-0 defects + audit territories)

D-D0b (`QueueBoard.tsx:128` fire-and-forget mutations), D-D0c (admin `ConfirmModal.tsx:118`
wallet-credit double-apply — sensitive-money, 4-question treatment), D-D0d (`reachability.ts:98`
dead offline discipline), D-D0e (`hours/page.tsx:408` swallowed errors), D-D0f (admin ledger
silent truncation), and the D-T1..T5 audit territories + D-O1/D-O2 optimization checklist all
remain on the Lane D checklist (`docs/plans/2026-08-01-low-connectivity-program.md` §5 Lane D) for
the next firing.
