# LC-D report — 2026-08-03b (journey & soundness sweep)

Seventh LC-D firing. Every Confirmed Day-0 defect (D-D0a…D-D0f) is now FIXED, so per §5 Lane D's
mode-select rule this firing moves into AUDIT MODE and sweeps the first unchecked audit territory,
**D-T1: admin console journey sweep** (`apps/admin` — actions, cash, customers, issues, merchants,
orders, riders, sos — silent failures, missing states, unpaginated tables, stale-after-mutation).

Ran the `lane-bug-hunt` workflow with a custom D-T1 lane (four lenses: silent-failures,
missing-states, unpaginated-tables, stale-after-mutation) over those surfaces. Note for whoever
resumes this transcript: the first attempt silently ran the **default `wallet` lane instead of the
custom one** — the workflow harness passes `args` to the script as a JSON **string**, not a live
object, and the generated script's `resolveLane()` only special-cased an actual object, so the
custom lane object fell through to `LANES.wallet`. Patched `resolveLane()` to `JSON.parse` a
string arg that looks like a JSON object before falling back to the built-in-key lookup, then
re-ran from the same run id. The corrected run: 4 lenses → 3 candidates → all 3 confirmed by the
adversarial panel (3/3 REAL-high each) → sibling-sweep. Zero silent-failures or
stale-after-mutation findings this pass (a clean result, not a skipped lens).

## Fixed — LC-D08 (MEDIUM): `/merchants` subtree + rider KYC review ship with no route-level loading state

**Defect.** Every other list/detail surface in the D-T1 scope (cash, customers, issues, orders,
riders, sos) has its own `loading.tsx` colocated next to its `page.tsx`, wrapping the shared
`PageSkeleton` with a title/column-count matched to that page — an established pattern specifically
because each page is an async server component `await`-ing `adminFetchResult` before it can render
anything, so on a slow/weak connection it otherwise shows a blank screen for the full round trip.
`apps/admin/app/merchants/page.tsx`, `merchants/[id]/page.tsx`, and `merchants/disputes/page.tsx`
had **zero** `loading.tsx` anywhere in the `merchants` subtree despite doing the identical
`await adminFetchResult(...)` fetch. Because the root layout has no per-route Suspense boundary
beyond each segment's own `loading.tsx`, Next.js fell back to the **root** `app/loading.tsx` —
title "Overview", 4 columns — a flash of a completely unrelated page's identity, not merely a
generic/blank state. The sibling-sweep found a fourth, less-severe instance of the same shape:
`apps/admin/app/riders/[id]/kyc/page.tsx` (the KYC document-review screen) had no `loading.tsx`
either, falling back to the sibling `riders/[id]/loading.tsx` ("Rider profile", 3 cols) — a
table-shaped skeleton flashing ahead of a review screen that isn't a table at all.

**Fix.** Added four `loading.tsx` files following the existing convention exactly (title matches
the page's own `<h1>`, `cols` matches the page's primary table):
- `apps/admin/app/merchants/loading.tsx` — "Merchants", 6 cols (Merchant/Cash rule/Pilot/
  Orders/Open debt/Joined).
- `apps/admin/app/merchants/[id]/loading.tsx` — "Merchant profile", 3 cols (detail-page
  convention, matching `orders/[id]/loading.tsx`/`riders/[id]/loading.tsx`).
- `apps/admin/app/merchants/disputes/loading.tsx` — "Food disputes", 7 cols (the frozen-
  handshakes table's column count).
- `apps/admin/app/riders/[id]/kyc/loading.tsx` — "KYC review", 3 cols (detail-page convention).

Also added `apps/admin/app/loading-coverage.test.ts`, a structural invariant test (not tied to
these four files specifically) that walks every `page.tsx` under `apps/admin/app`, and for every
one that's an async server component (not `"use client"`, has `export default async function`)
asserts a sibling `loading.tsx` exists in the exact same directory. This makes the defect class
itself fail CI going forward instead of relying on every future page author remembering the
convention — confirmed it fails against the pre-fix tree (the four missing files) and passes now.

## Fixed — LC-D09 (MEDIUM): merchant debt ledger + disputes queue hard-cap with no disclosure/paging

**Defect.** Two related gaps in the merchant vertical, both instances of the "admin money/ops
queue silently stops at a hardcoded cap" shape `D-D0f`/`LC-D07` fixed for the rider wallet ledger:

1. `AdminMerchantsService.getMerchantDetail`'s debt-ledger query (`admin-merchants.service.ts:130`
   pre-fix) hardcoded `take: 30` with no cursor and no `nextCursor` — a merchant with more than 30
   lifetime debt events (routine for an active collect-and-return merchant) permanently lost
   visibility into older entries, with the page's own doc comment claiming it renders "the full
   audit history of every debt this merchant has opened/settled" while silently truncating it.
2. `listDisputes()`'s two queries (frozen handshakes + refund-overdue, `admin-merchants.service.ts:
   130-170`) each hardcode `take: 100` with no cursor, and — unlike every sibling directory in this
   app (customers/orders/riders/merchants/issues, each with a "showing the latest N" banner) — the
   disputes page rendered both arrays with **no disclosure banner at all**. Sibling-sweep also
   confirmed the truncation direction actively works against the operator: the frozen-handshake
   query sorts oldest-first (so once >100 accumulate, the *newest* disputes never appear until
   older ones clear) and the refund-overdue query sorts newest-first (so the rows dropped once
   >100 accumulate are the *oldest/most-SLA-overdue* ones).

**Fix.**
- Debt ledger: mirrors `AdminRidersService.walletView`'s cursor pattern exactly.
  `getMerchantDetail(id, debtCursor?)` fetches 31 rows ordered by
  `[{ createdAt: "desc" }, { id: "desc" }]`, slices to 30, returns `debtLedgerNextCursor`.
  `GET /admin/merchants/:id` accepts an optional `?debtCursor=`. The merchant-profile page reads a
  `?debtCursor=` search param and renders the same "Load older →" / "↺ Back to latest" footer under
  the debt-ledger table that the rider wallet ledger already has.
- Disputes queue: added a disclosure banner to each half (matching the sibling-directory wording
  convention) rather than full cursor pagination — this queue is an operational triage list, not an
  audit trail, and every sibling list page in this app uses the same "showing the latest/oldest N"
  disclosure-only treatment rather than pagination. The banners name the actual truncation
  direction for each half so support knows which rows are missing (oldest-first for handshakes,
  newest-first for refunds).

**Regression tests.** `apps/api/src/admin/admin-merchants.service.spec.ts`: two new cases mirroring
`admin-riders.service.spec.ts`'s wallet cursor tests — a 31-row fixture asserting exactly 30
entries returned with `debtLedgerNextCursor` set to the 30th row's id, and a cursor-supplied call
asserting `{ cursor: { id: "l30" }, skip: 1 }` reaches Prisma. Confirmed the "more than 30 entries"
case fails against the pre-fix code (returned all 31 rows, no `debtLedgerNextCursor` field at all).

## Fixed — LC-D10 (LOW): admin Overview funnel metric ran an unbounded full-table scan for a count

**Defect.** `AdminService.overview()`'s pilot-funnel metric computed `ordersWithOffer` via
`this.prisma.offer.findMany({ distinct: ["orderId"], select: { orderId: true } })` —
no `where`, no `take` — the one query in this method's entire `Promise.all` that wasn't either a
bounded `count()`/`aggregate()` or capped at `take: 20`, despite existing purely to feed
`withOffer.length` into `computeFunnel`. As the pilot's lifetime `Offer` table grows, every load of
the admin Overview page (this query runs uncached, on every page load) triggers a full,
ever-growing scan just to compute one funnel percentage.

**Fix.** Not a pagination/disclosure fix like the other two findings — the caller only ever needed
the *count* of distinct `orderId`s, never the rows themselves, so capping it with `take` would have
silently corrupted `pctBroadcastsWithOffer`'s numerator (a real regression, not a fix). Replaced the
`findMany` with a single DB-side `SELECT COUNT(DISTINCT order_id)::int AS count FROM offers`
(`$queryRaw`, mirroring the existing raw-query convention this same file already uses for
`utilization()`) — same exact number, zero rows transferred over the wire regardless of table size.

**Regression tests.** `apps/api/src/admin/admin.service.spec.ts`: updated the four existing
`overview()` test fixtures' `offer` mocks (dropped the now-dead `findMany` stub, added a
`$queryRaw` stub) and added a dedicated case asserting `pctBroadcastsWithOffer` is computed
correctly from the `$queryRaw` count (7) against `totalBroadcasts` (10) → 70, with an `offer` mock
whose `findMany` is never called (would throw if the code regressed to it, since production code
no longer calls it). Also fixed a **pre-existing, previously-unasserted mock bug** surfaced by
writing this test: the main "adds today throughput..." fixture's `order.count` mock branched on
`Object.keys(where).length === 0` for "totalOrders", but the real `totalBroadcasts` query is
`order.count({ where: { orderType: "parcel" } })` — never empty — so that branch was dead and
`totalBroadcasts` silently evaluated to 0 in every existing test. Nothing caught it because nothing
asserted on `out.metrics` before. Corrected the mock to match the real where-clause shape and added
an assertion on `out.metrics` to the main fixture so this can't regress silently again.

**Verification:** `pnpm install` + `pnpm --filter @lynia/shared build` + `prisma generate` (fresh
checkout), `pnpm typecheck` (6/6 packages), `pnpm lint` (5/5 — only the one pre-existing unrelated
`admin-orders.service.spec.ts` `no-shadow` warning, noted in every prior LC-D report this program),
`pnpm test` (6/6 packages — 1516 API tests incl. all new/updated cases, 679 mobile, 54 admin,
merchant/design/shared) all green.

## Ledger

`docs/KNOWN_BUGS.md`: added LC-D08, LC-D09, LC-D10 as FIXED rows in the Day-0 LC sweep table.

## Not done this run

D-T1's audit territory box is now checked. The next LC-D firing takes the next unchecked audit
territory in order: D-T2 (merchant app journey sweep, tablet lens).
