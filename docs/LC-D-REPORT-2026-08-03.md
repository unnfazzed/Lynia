# LC-D report — 2026-08-03 (journey & soundness sweep)

Sixth LC-D firing. Per §5 Lane D's priority order (Confirmed Day-0 defects fix first, one per
firing, before the audit territories), the last remaining unchecked Day-0 box was D-D0f. This
firing fixes it, closing out every Day-0-confirmed Lane D defect.

## Fixed — D-D0f / LC-D07 (MEDIUM): admin rider money ledger silently truncated at the server cap

**Defect.** `AdminRidersService.walletView` (`apps/api/src/admin/admin-riders.service.ts`) fetched
the prepaid-wallet ledger with a hardcoded `take: 20` and no cursor — a rider with more than 20
lifetime ledger entries (routine for anyone active a few weeks: one commission debit per delivered
order plus every top-up/credit) permanently lost visibility into older entries once the console
loaded, with **zero on-screen signal** anything was missing. `apps/admin/app/riders/[id]/page.tsx`
rendered `wallet.ledger` directly with no cap disclosure and no way to page back — unlike the
`orders`/`customers`/`issues` list pages, which at least note "showing the latest N". For ops
reconciling a dispute or a manual-credit audit trail, an entry silently missing from the ledger is
worse than an obviously-truncated list: there's no indication a reconciliation might be incomplete.

**Fix.** Mirrors the cursor-pagination shape `WalletService.getLedger` already uses for the
rider-facing mobile wallet ledger (itself the fix for the mobile sibling of this same truncation
shape, `LC-B-SIB-2`): `walletView(profileId, cursor?)` now fetches `PAGE_SIZE + 1` rows ordered by
`[{ createdAt: "desc" }, { id: "desc" }]` (the tie-break on `id` makes the ordering — and therefore
the cursor — stable when multiple entries share a `createdAt`), slices to 20, and returns
`nextCursor` (the last returned row's id) when a 21st row proved more exist. The admin controller's
`GET /admin/riders/:profileId/wallet` route now accepts an optional `?cursor=` query param and
passes it straight through. `WalletView`'s type gained `nextCursor: string | null`.

The rider-detail page reads a `?walletCursor=` search param, forwards it as `?cursor=` to the API,
and renders a footer under the ledger table whenever there's something to page through: "Load
older →" (links to `?walletCursor=<nextCursor>`) when older entries exist, and "↺ Back to latest"
(links back to the bare rider URL) when a cursor is already applied. This is server-rendered
link-based navigation, matching the app's existing convention (`FilterNav` on the orders/customers
pages) rather than introducing a client-side pagination component — the app has no other precedent
for one, and a rider's ledger is read rarely enough that a full page load per "load older" click
is the right cost/complexity tradeoff.

**Regression tests.** `apps/api/src/admin/admin-riders.service.spec.ts`
(`AdminRidersService.walletView`): updated the existing "returns balance + ledger" test to assert
the new `take: 21` / tie-broken `orderBy` / cursor-omitted-on-first-page shape, and added two new
cases — a 21-row fixture that must yield exactly 20 ledger entries with `nextCursor` set to the
20th row's id (asserting the 21st fetched-for-detection row never leaks into the page), and a
cursor-supplied call that must pass `{ cursor: { id: "l20" }, skip: 1 }` to Prisma and return the
next page with `nextCursor: null` once fewer than `PAGE_SIZE + 1` rows come back. Confirmed the new
"more than 20 entries" test fails against the pre-fix code (it returned all 21 rows with no
`nextCursor` field at all).

**Verification:** `pnpm install` + `prisma generate` (fresh checkout — Prisma client wasn't
generated), `pnpm typecheck` (6/6 packages), `pnpm lint` (5/5 — only the one pre-existing unrelated
`admin-orders.service.spec.ts` `no-shadow` warning, noted in every prior LC-D report this program),
`pnpm test` (6/6 packages — 1513 API tests incl. the 2 new + 1 updated wallet cases, 671 mobile,
53 admin, merchant/design/shared) all green.

## Ledger

`docs/KNOWN_BUGS.md` LC-D07 row updated from OPEN to FIXED with this report's detail.

## Not done this run (Lane D's audit territories + optimization checklist)

Every Confirmed Day-0 defect for Lane D (D-D0a through D-D0f) is now FIXED. The next LC-D firing
moves into AUDIT MODE and takes the first unchecked audit territory, D-T1 (admin console journey
sweep), per §5 Lane D's mode-select rule.
