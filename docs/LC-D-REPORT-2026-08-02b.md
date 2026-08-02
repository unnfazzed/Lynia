# LC-D report — 2026-08-02b (journey & soundness sweep)

One LC-D increment this firing. Per §5 Lane D's priority order, the Confirmed Day-0 defects list
had two unchecked boxes left after `docs/LC-D-REPORT-2026-08-02.md`'s four fixes: D-D0e and D-D0f.
This firing fixes D-D0e, leaving D-D0f for the next one.

## Fixed — D-D0e / LC-D05 (MEDIUM): starter-category quick-create silently swallowed failures

**Defect.** `MenuPage.onCreateStarterCategory` (`apps/merchant/app/(app)/menu/page.tsx`) is the
handler behind the "+ Mains / + Sides / + Drinks / + Breakfast" quick-create chips shown on the
empty-menu state (a merchant with zero categories yet). It had a bare
`try { … } catch { /* Best-effort quick-create */ } finally { … }` — a deliberate silent swallow,
per its own comment: "a failure here just leaves the starter chip tappable again." On a dropped
2G/3G connection the chip did re-enable, but nothing told the merchant the tap failed at all, so
the only signal was the category never appearing — indistinguishable from the tap simply not
having registered. This is the narrower remainder of the ledgered `LC-D05` finding: its other two
named sites, `HoursPage.onToggleBusy` and `MenuPage.onClearOos` ("Back in stock"), were already
fixed incidentally by `LC-D04` (`docs/LC-D-REPORT-2026-08-02.md`), which named them explicitly.

**Fix.** Mirrors the exact pattern `onClearOos` already uses in the same file (also from `LC-D04`):
`onCreateStarterCategory`'s `catch` now writes `err.message` (via `ApiError`) into the same
`listError` state, and clears it at the start of the call so a fresh attempt doesn't show a stale
error. `listError` was previously only rendered in the "categories.length > 0" branch (as a banner
above the category list); the starter-chip UI lives in the sibling "categories.length === 0" empty
state, so that branch now renders the same banner style above the "Start with a category" copy.
No new state was introduced — this reuses the existing list-level error slot rather than adding a
fourth error state to a page that already has `sheetError`/`listError`/`busyError`-shaped slots
across its Hours/Menu siblings.

**Regression test.** Two new cases in `apps/merchant/app/(app)/menu/page.test.tsx` (`LC-D05`
describe block, alongside the existing `LC-D04` "back in stock" block it mirrors):
- Renders `MenuPage` with an empty category/dish list, clicks the "+ Mains" chip with
  `createCategory` mocked to reject, and asserts the error message renders and the chip is not
  left disabled (so a retry is possible).
- A second case asserts a successful create clears any prior error and the empty-state UI is
  replaced (via `listCategories` returning a populated list on the post-create `refresh()`).
- Verified both new cases fail against the pre-fix code (stashed just `menu/page.tsx`, reran):
  the first times out waiting for the error text (the catch swallowed it), confirming the test
  actually exercises the defect.

**Verification:** `pnpm --filter @lynia/merchant test` 121/121 (119 pre-existing + 2 new) green.

## Not done this run (Lane D's remaining Day-0 defect + audit territories)

D-D0f (admin ledger silent truncation, `apps/admin/app/riders/[id]/page.tsx:269`) and the
D-T1..T5 audit territories + D-O1/D-O2 optimization checklist all remain on the Lane D checklist
(`docs/plans/2026-08-01-low-connectivity-program.md` §5 Lane D) for the next firing.
