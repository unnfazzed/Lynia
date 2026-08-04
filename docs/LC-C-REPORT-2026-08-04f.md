# LC loop C — offline & 2G resilience — 2026-08-04f

**Mode:** OPTIMIZE (all 5 audit territories C-T1…C-T5 already checked; every Day-0 defect
C-D0a…C-D0e already fixed; C-O5, C-O6, C-O7, C-O8, C-O9, C-O1, C-O2 already done; C-O3 struck as a
duplicate of Lane A's A-O17). First unchecked checklist item: **C-O4** — MicroCache
serve-stale-on-upstream-failure mode (DoorDash lesson 8).

## What was wrong

`MicroCache` (`apps/api/src/common/micro-cache.ts`) has one, uniform failure behavior: "errors are
never cached" — a loader rejection always propagates, so the next caller retries from scratch. That
is the right default for most callers, but for a purely informational read it means a single
transient upstream blip degrades a known-good answer straight to "unknown" with no attempt to fall
back on the value that was correct a moment ago.

The concrete instance: `OrdersService.countNearbyForPickup` (`apps/api/src/orders/orders.service.ts`)
feeds the customer-facing `ridersNearby` count on every 15s open-auction snapshot poll — an
informational supply signal ("no offers yet, riders were pinged" vs. "nobody's here"), never used to
gate money, rider assignment, or auth. Before this change, a single PostGIS blip or a poll landing
mid-dead-zone reconnect collapsed an established "N riders nearby" straight to `null` ("supply
unknown"), even though the previous poll (10s TTL earlier) had a perfectly good count on hand. The
client's fallback for `null` is a generic calm "finding riders" state — not wrong, but a worse answer
than the number the API already knew.

This is exactly DoorDash's lesson 8 (program doc §3): "serve stale-but-valid on upstream failure —
degradation as a cache *feature*." The candidates named in the checklist were nearby-count and the
`/app/bootstrap` aggregate; bootstrap was **not** touched — its payload is `me` (auth) and
`activeOrder` (assignment-adjacent), both explicitly excluded by the same checklist item's own
"NEVER money/assignment/auth" caveat, and there's no MicroCache in front of it today to begin with.

## What shipped

**`MicroCache` gained an opt-in serve-stale mode** (`getOrLoad`'s new `{ staleTtlMs }` option,
default omitted ⇒ byte-for-byte the old behavior — no existing caller changes semantics). On a
loader failure, if a value is on hand and still within `expiresAt + staleTtlMs` of its own freshness
expiry, that value is returned (new outcome `stale`, observable via the existing `onEvent` metrics
tap) instead of throwing. Past that hard bound — or on a cold failure with nothing cached yet — the
original "errors are never cached, the next caller retries" behavior is unchanged. The single-flight
guarantee already in place means every concurrent poller during an outage gets the SAME stale value
from the one flight, not a stampede of independent fallbacks.

**Wired for `nearbyCountCache` only**: `countNearbyForPickup` now passes
`{ staleTtlMs: NEARBY_COUNT_STALE_TTL_MS }` (2 minutes, env-overridable via the new
`MICRO_CACHE_STALE_TTL_MS_NEARBY_COUNT`, bounded to 10 minutes in the env schema so a typo can't pin
staleness indefinitely). A malformed pickup point still short-circuits to `null` immediately (nothing
to be stale about); a geo-query failure now serves the last known count for up to 2 minutes before
degrading to the pre-existing honest-`null` fallback. `pickupPhotoUrlCache` (the other MicroCache
consumer) was deliberately left untouched — a stale *signed URL* past its own validity window is
actively useless (worse than a mint retry), so serve-stale buys nothing there.

## Verification

- `apps/api/src/common/micro-cache.spec.ts`: 5 new cases — stale-serve within bound, hard-bound
  expiry still throws, a cold failure (nothing cached) still throws, omitting `staleTtlMs` keeps the
  exact old behavior, and recovery to a fresh value on the next successful load after a stale serve.
- `apps/api/src/orders/orders.service.spec.ts`: new end-to-end case through `getSnapshot` — a
  successful count, then a geo blip within the 2-minute stale bound still returns the last known
  `ridersNearby`, then a further blip past the bound falls back to the pre-existing `null`. The
  existing "a geo-query failure → null" test (cold cache, first call) is untouched and still passes,
  confirming first-ever-failure behavior is unchanged.
- `pnpm --filter api typecheck && pnpm --filter api lint && pnpm --filter api test` — all green.
- `pnpm typecheck` (full monorepo) — all green.
- `pnpm test` (full monorepo) — API and all other packages green; the one pre-existing mobile
  failure (`app/rider/(tabs)/__tests__/index.test.tsx`, a 5s Jest timeout on a FlatList render,
  unrelated to this change — no mobile file was touched) is a known flake, confirmed by rerunning
  the suite in isolation.

## Ledger

`LC-C16` added to `docs/KNOWN_BUGS.md`. `C-O4` ticked in
`docs/plans/2026-08-01-low-connectivity-program.md` §5 Lane C. Only `C-O10` remains on the Lane C
checklist (its own "needs a >15-minute outage to matter" hardening item, correctly last).
