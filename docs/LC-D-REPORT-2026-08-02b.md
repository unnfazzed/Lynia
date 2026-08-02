# LC-D report — 2026-08-02b (journey & soundness sweep)

Fifth LC-D firing on 2026-08-02. Per §5 Lane D's priority order (Confirmed Day-0 defects fix
first, one per firing, before the audit territories), the two remaining unchecked Day-0 boxes
were D-D0e and D-D0f. This firing fixes D-D0e / LC-D05 (remaining scope), leaving D-D0f for the
next firing.

## Fixed — D-D0e / LC-D05 (MEDIUM, remaining scope): starter-category quick-create swallowed its error

**Defect.** `MenuPage.onCreateStarterCategory` (`apps/merchant/app/(app)/menu/page.tsx`) — the
"+ Mains" / "+ Sides" / "+ Drinks" / "+ Breakfast" quick-create chips shown on the empty-menu
"Start with a category" card — wrapped `createCategory` in a bare `try { … } catch { /* comment
*/ } finally { … }` with a comment explicitly documenting the swallow as deliberate ("a failure
here just leaves the starter chip tappable again"). On a network drop, the merchant sees the chip
re-enable with **zero indication anything failed** — no error banner, no toast, nothing — unlike
every sibling mutation on the same page (`onSaveCategory`/`onSaveDish` via `withSheet`'s
`sheetError`, and `onClearOos`'s `listError`, fixed under D-D0d/LC-D04 earlier today). LC-D05's
other two named sites — `HoursPage.onToggleBusy` and `MenuPage.onClearOos` ("back in stock") —
were already fixed by D-D0d, narrowing this item to the starter-category tap alone.

**Fix.** `onCreateStarterCategory` now clears `listError` before the attempt and, on a caught
error, writes `err instanceof ApiError ? err.message : "Couldn't create the category — try
again."` into the existing `listError` state — the same state (and rendering) `onClearOos`
already uses, so no new UI surface is introduced. The `listError` banner was previously rendered
only inside the `state.categories.length > 0` branch (it could never fire from a code path reached
before any category exists); it's now hoisted to render whenever `state.status === "ready"`,
regardless of category count, so it's visible on the empty-menu starter-category card too.

**Regression test.** `apps/merchant/app/(app)/menu/page.test.tsx`: a new `describe` block mocks
`createCategory` to reject with an `ApiError`, renders `MenuPage` with an empty category/dish list
(so the starter-category card is showing), clicks the "+ Mains" chip, and asserts the same
error-message text renders. Confirmed it fails against the pre-fix code (the message never
appears — the catch block swallows it silently).

**Verification:** `pnpm typecheck` (6/6 packages, after `pnpm install` + `prisma generate` to
match a fresh checkout), `pnpm lint` (5/5, only the one pre-existing unrelated
`admin-orders.service.spec.ts` warning noted in every prior report this run), `pnpm test` (6/6
packages — 1511 API + 671 mobile + merchant/admin/design/shared) all green.

## Not done this run (Lane D's remaining Day-0 defect + audit territories)

D-D0f (admin rider-detail money ledger silently truncates at the server cap, no paging
affordance) and the D-T1..T5 audit territories + D-O1/D-O2 optimization checklist all remain on
the Lane D checklist (`docs/plans/2026-08-01-low-connectivity-program.md` §5 Lane D) for the next
firing.
