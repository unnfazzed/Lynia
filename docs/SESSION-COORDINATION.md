# Concurrent session coordination — 2026-08-12

Two Claude sessions are editing the customer home surface at the same time. Because every
Claude-authored PR in this repo **auto-merges on green** (`CLAUDE.md` → merge-on-green policy),
there is no human gate to catch a silent collision: whichever PR merges second overwrites the
first's intent while CI stays green. This note fixes the lane boundary and the merge order.

## The two lanes

| | Session A — boot flash | Session B — home composition |
|---|---|---|
| Branch | `claude/old-ui-flash-startup-ck7wcx` | `claude/home-page-food-parcel-ui-pp8us9` |
| Goal | Stop the flag-off UI painting for ~250ms + 1 RTT on every cold start | Align home to the mock composition in `packages/design/components/home/home.prompt.md` |
| Owns | the **flag layer** | the **home render tree** |

### Session A owns (Session B must not edit)

- `apps/mobile/src/net/use-feature-flags.ts` and its test
- `DEFAULT_FEATURE_FLAGS` and the per-flag fail direction
- `apps/mobile/src/ui/shell/ServiceTiles.tsx` — `getServiceTiles` flag branch
- `apps/mobile/app/onboarding.tsx`, `apps/mobile/app/role.tsx`

### Session B owns (Session A must not edit)

- `apps/mobile/app/(tabs)/home.tsx` — element tree, composition order, live-order slot
- home-facing UI primitives it has to add or reshape for the mock
  (`BrandHeader` / `LiveOrderCard` / `ReorderRail` / `RestaurantCard`)
- `tools/parity/app-targets.mjs`, `tools/parity/screens.generated.json`,
  `docs/PIXEL-PARITY-TRACKER.md`

## Collision points

1. **`apps/mobile/app/(tabs)/home.tsx` — direct.** It is one of the ten `restaurantsEnabled`
   consumers, so it is a candidate for A's app-wide boot-flash sweep; it is also the single file B
   is restructuring. **A does not touch it** — see the handoff rule below.
2. **`apps/mobile/src/ui/shell/ServiceTiles.tsx` — direct.** A has already edited it. B's mock
   composition (`BrandHeader → service tiles (D-01, unchanged) → LiveOrderCard *or* ReorderRail →
   restaurants rail`) marks the tiles **unchanged**, so B has no reason to edit this file. B keeps
   its hands off; if the mock forces a tile change, B says so rather than editing silently.
3. **`restaurantsEnabled` semantics — opposite directions.** A flips the boot default
   `false → true` (restaurants is launched, so the boot frame paints the live layout). B composes
   the "Restaurants near you" rail. If B reasons from the *old* default — "flags come up off, so
   the boot frame is the no-food layout" — B builds structure that reintroduces exactly the flash
   A is removing. **B assumes the rail is present on the boot frame.**
4. **`docs/KNOWN_BUGS.md` — textual.** Both lanes append. Append only, under distinct IDs, never
   reflow or re-number neighbouring entries.

## Merge order — A first

Session A merges before Session B. A is small (6 files), self-contained, and ships a regression
test for the flag contract. Once A is on `main`, B rebases onto it.

This ordering is the enforcement mechanism, not just a preference: after A lands, its
`use-feature-flags.test.tsx` runs inside B's CI, so a B change that reverts the boot default turns
B's build red instead of merging green over the top of it. Rebased in the other order, nothing
catches the regression.

**B: do not open a PR until A has merged and you have rebased onto the resulting `main`.**

## Handoff rule for A's remaining sweep

A's sweep has flag-off UI still to fix in consumers it has not reached, including `home.tsx`,
`orders.tsx`, `food/index.tsx`, `food/search.tsx`, `rider/(tabs)/index.tsx`, and
`rider/food-offer.tsx`. All except `home.tsx` are outside B's lane and A should finish them.

For `home.tsx`: A **leaves the file alone** and records what still needs doing as a `KNOWN_BUGS.md`
entry. B applies it inside the restructured tree it is already writing. A's default flip does most
of the work there anyway — the file reads `restaurantsEnabled` through `useFeatureFlags` and
`getServiceTiles`, both of which A has already corrected upstream.
