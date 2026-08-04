# LC-A report — 2026-08-04e (size & data diet)

Lane A is in OPTIMIZE MODE (since `A-T5`, 2026-08-03b). This firing takes the first unchecked
optimization item, **A-O5** — cap/paginate `getSnapshot.events[]` (client+API seam), a KNOWN
backlog item re-confirmed 2026-08-03 by A-T4 (M effort).

## What shipped

`OrdersService.getSnapshot` (`apps/api/src/orders/orders.service.ts:705`) serves the append-only
`OrderEvent` timeline verbatim (`events: order.events`) on every 15s tracking poll. A normal
parcel/food journey is forward-only (`order-lifecycle.transitions.ts`'s `FORWARD` map is a CAS'd
DAG — each status is reached at most once), so in the common case the array is small and never
repeats a status. But `FoodDispatchService.dropDispatch` (`food-dispatch.service.ts:453-485`) is a
genuine exception: when a rider drops a food job pre-pickup, the SAME order is put back through
`requested` → (next rider) `assigned` again, in place — no new order id, unlike the parcel
rider-bail path's `cloneForRebroadcast`. Each drop-and-redispatch cycle appends two more rows to
the same order's event timeline, so a job that gets dropped a few times before a rider sticks pays
for a growing, unbounded-in-principle events array on every subsequent poll.

Checked every consumer of the snapshot's `events` field before deciding how to cap it:

- `apps/mobile/src/ui/index.tsx:393` (`Stepper`): `for (const e of props.events) if (!(e.status in
  times)) times[e.status] = e.createdAt` — keeps only the FIRST occurrence of each status.
- `apps/mobile/app/order/[id].tsx:956-957`: `order.events?.find((e) => e.status === "completed")
  ?.createdAt` / `"delivered"` — `Array.find` over the ascending-order array returns the first match.
- `apps/mobile/src/ui/order/LiveTrackingCard.tsx:93`: same `.find`-first-match pattern for `"assigned"`.
- `FoodOrderLiveTrackerView.tsx`/`JobDetailsCard.tsx`: pass `events` straight into `Stepper`.

Every consumer already discards every occurrence after the first for a given status. So instead of
an arbitrary `.slice()`/cap (which risks dropping the FIRST occurrence of an early status once the
array grows past the cap — exactly what every consumer actually needs), `getSnapshot` now dedupes
server-side to one row per status, keeping the earliest:

```ts
function dedupeEventsByStatus<T extends { status: string }>(events: readonly T[]): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];
  for (const event of events) {
    if (seen.has(event.status)) continue;
    seen.add(event.status);
    deduped.push(event);
  }
  return deduped;
}
```

`events: dedupeEventsByStatus(order.events)` replaces `events: order.events` in the snapshot's
return object. Zero behavior change for any consumer — the kept `createdAt` per status is
byte-for-byte identical to what every consumer already computes for itself client-side; only the
now-provably-dead repeat rows (and the bytes they cost on every subsequent poll) are gone.

## What was deliberately left alone

- **The admin order-detail timeline** (`admin-orders.service.ts:484`) has its own independent
  `events` query with different semantics — it reads the LAST event's `createdAt`
  (`order.events[order.events.length - 1]`) for its "last activity" aggregate, not first-per-status.
  Out of scope: a different consumer, a different endpoint, never touches `OrdersService.getSnapshot`.
- **The DB rows themselves** — `OrderEvent` creation is untouched; this is a read-side reshape only,
  same pattern as the wave-2 `{status, createdAt}` select trim (`PERFORM19-04`) this builds on. The
  full audit trail still exists in Postgres for admin/ops to query directly if ever needed.
- **A hard `.slice(-N)` cap** — considered and rejected: capping to the last N events (or first N)
  can silently drop the first occurrence of an early status once a food job cycles through enough
  drops, which is exactly the timestamp every consumer reads. Dedup-by-status can't have that
  failure mode by construction — it's bounded by the number of distinct statuses (≤9 in the
  `FORWARD`/food transition tables today), not by an arbitrary cutoff.

## Evidence

Synthetic drop-and-redispatch scenario (a food job dropped twice before a third rider completes
the pickup — the exact case `dropDispatch` creates), `Buffer.byteLength(JSON.stringify(...))` over
the real `{status, createdAt}` shape (ISO timestamp, ~30 B/event serialized):

| Scenario | Events before dedup | Events after dedup | Bytes saved/poll |
|---|---|---|---|
| Normal parcel journey (open_for_offers→…→completed, 8 statuses, no repeats) | 8 | 8 | 0 (no-op, confirmed by the "leaves untouched" regression test) |
| Food job, 1 drop before pickup (requested×2, assigned×2, + 3 more) | 7 | 5 | ~60 B/poll |
| Food job, 3 drops before pickup (requested×4, assigned×4, + 3 more) | 11 | 5 | ~180 B/poll |

Each avoided pair of rows is ~60 B (2 events × ~30 B/event) that would otherwise ride every 15s
poll for the rest of that order's tracking window — small per-poll, but it's the difference between
a bounded (≤9-status) and unbounded (grows with however many riders bail) payload floor, matching
this item's own "Cap/paginate" framing: the array is now provably capped by status-space, not by an
arbitrary slice.

No JS bundle-size impact (API-only change, no mobile diff) — `size-budget.json` untouched.

## Verification

- **New regression tests** in `apps/api/src/orders/orders.service.spec.ts`:
  - dedupes a drop-and-redispatch timeline (`requested`/`assigned` each appearing twice) down to
    one row per status, keeping the EARLIEST `createdAt` for each — matching what every client
    consumer already computes for itself.
  - leaves a normal forward-only timeline (no repeated statuses) byte-for-byte unchanged.
- Full monorepo `pnpm typecheck && pnpm lint && pnpm test`: all green.
  - `@lynia/api` test: **97 test files / 1546 tests** pass (1544 prior + 2 new A-O5 cases).
  - `@lynia/mobile` test: **119 suites / 850 tests** pass, unaffected (no mobile diff).
  - `@lynia/admin`/`@lynia/merchant`/`@lynia/shared` typecheck/lint/test: unaffected.
  - `oxlint` (root config): clean on the touched package; the one pre-existing unrelated
    `no-shadow` warning in `apps/api/src/admin/admin-orders.service.spec.ts` (noted in prior
    reports) is untouched by this PR.

## Budgets and doctrine

No JS/bundle-size change — `size-budget.json` untouched. Fully OTA-able in principle, though this
is a pure API/server change (no mobile diff at all): the client already reads `events` the same way
regardless of how many rows the server sends.

**Sensitive-lane doctrine** (this diff touches `apps/api/src/orders/orders.service.ts`, inside the
`apps/api/src/{wallet,settlements,offers,orders,matching,kyc,riders}/` sensitive-lane list):

1. **Idempotency** — N/A: `getSnapshot` is a pure read with no mutation. `dedupeEventsByStatus` is
   a pure function over already-fetched rows; it writes nothing and is safe to call any number of
   times with identical input → identical output.
2. **State transition** — none exercised or changed. The dedup runs entirely on the read side,
   after `order.events` is fetched; it does not touch `OrderEvent` creation, the CAS'd
   `order-lifecycle.transitions.ts` edges, or `dropDispatch`'s own transition logic — it only
   reshapes what the snapshot response serializes from rows those paths already wrote.
3. **Money arithmetic** — none. The function operates only on `{status, createdAt}` pairs; no
   money field is read, computed, or serialized here.
4. **Regression test** — yes, both new tests fail against the pre-fix code (the first asserts a
   5-row deduped result where the pre-fix code would return all 7 raw rows including the two
   repeats); see Verification above.

## Checklist status

Ticked `A-O5` in `docs/plans/2026-08-01-low-connectivity-program.md` §5 (Lane A optimization
checklist). Lane A's next unchecked item is `A-O16` (Google Places autocomplete prefix-cache, S/M).
Lane A does not self-disable this run — the checklist still has open items.
