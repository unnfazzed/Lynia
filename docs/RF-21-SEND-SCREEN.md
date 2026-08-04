# RF-21 — `apps/mobile/app/send.tsx` compose screen: design pass

**Status:** design decision, first pass (2026-08-03). Scopes the RF-21 refactor-ledger item —
"958-line customer parcel-request compose screen, needs an RF-18-style design pass before any
extraction, not attempted yet" — into executable, ledger-sized work items, following the same
method RF-05b/RF-18 used: read every seam before proposing a split, and only sanction a PR-sized
extraction where props stay bounded and the move is genuinely prop-driven, not a relocation of the
same complexity behind a wider interface.

## Why this isn't an RF-18 repeat

RF-18 (`food/order/[orderId].tsx`) split cleanly because the component was **structurally a
switch**: ~9 mutually-exclusive `merchantPhase`/`status` branches, each already a self-contained
JSX block, most of them pure functions of `order`/`now`/`error`/`busy` props with no cross-branch
state sharing (only one branch renders at a time).

`send.tsx` has no such switch. It is **one continuous compose form** (aside from a single
`accountOnHold` early-return, see below) backed by ~25 pieces of component-local state that are
mutually entangled through three cross-cutting concerns that touch nearly all of them:

1. **Debounced draft persistence** (`useEffect` at line 281) — its dependency array is 8 of the
   state variables (`pickupPoint`, `pickupLandmark`, `dropPoint`, `dropLandmark`, `items`, `note`,
   `declaredValue`, `proposedFare`, `idempotencyNonce`); any of them changing re-arms the 500ms
   SecureStore-write timer.
2. **The idempotency key** (`useMemo` at line 438) — derived from the same 8 fields plus the
   nonce, and is what `submit()` sends on create.
3. **`submit()`/`canSubmit`** (lines 397-559) — reads essentially every piece of form state to
   validate, build the request payload, and drive the three post-submit outcomes (success
   navigate, on-hold wall, out-of-area state).

A structure that reduces to "which fields feed the derived idempotency key and draft save" cannot
be split along a JSX seam without also deciding where that combined derived state lives — moving a
JSX section out of the component does not remove its fields from these three dependency lists.
This is the same shape RF-05b hit: the seams that *look* like natural boundaries (map hero vs.
compose sheet) are crossed by logic that has to run somewhere, and moving the JSX without moving
the logic just relocates props, not complexity.

## Inventory: what's genuinely separable vs. what isn't

**Cleanly separable (one, this run's recommended first extraction):**

- **`accountOnHold` wall** (lines 590-608) — a full early-return, structurally identical to RF-18's
  first-extraction candidates: purely a function of `activeOrder`, `activeOrderQ.isError`,
  `activeOrderQ.isFetching`, `activeOrderQ.refetch`, `meQ.isFetching`, `meQ.refetch`, plus the
  already-shared `ActiveOrderBanner`/`ActiveOrderCheckFailedBanner` components. No local state of
  its own, no draft/idempotency/submit involvement (a held account can't reach submit at all — the
  wall replaces the whole screen). This is the RF-18-shaped seam: an entire alternate return with a
  bounded, already-enumerable prop list (~6 props).

**Presentational sub-blocks with a bounded prop set (candidates for later, smaller PRs — NOT this
run, to keep one concern per PR):**

- **Landmarks & details collapsible** (lines 902-950) — reads/writes only
  `detailsOpen`/`toggleDetails`, `landmarksOk`, `declaredValueOk`, `pickupLandmarkFromMap`/
  `dropLandmarkFromMap`, `pickupLandmark`/`dropLandmark` + their `edit*` callbacks, `declaredValue`/
  `setDeclaredValue`. None of these feed back into any *other* JSX block — a clean ~10-prop
  extraction, same shape as RF-18's pure-prop branches.
- **Items list** (lines 787-830) — `items`, `updateItem`, `addItem`, `removeItem`, `MAX_ITEMS`. Six
  props, no coupling to anything outside the list itself.
- **Recipient-phone block** (lines 840-870) — `pickupPhone`/`setPickupPhone`/`pickupPhoneError`,
  `recipients`, `dropPhone`/`setDropPhone`/`dropPhoneError`. Self-contained.
- **Price/quote block** (lines 871-900) — `quote`, `priceBand`, `belowBand`, `farAboveBand`,
  `proposedFare`/`setProposedFare`. Self-contained given the already-computed derived values.

Each of these is real (a future run can extract them one at a time, same as RF-18's four-branch
second pass), but bundling all four into one PR would exceed one refactoring concern, and
extracting only one this run ahead of the design note itself would be starting the "any extraction"
work priority order (a) says the design note must precede.

**NOT separable without relocating complexity (WONT-DO as a single extraction, same reasoning as
RF-05b):**

- **The map hero + floating chrome** (lines 610-714) — already thin (delegates to `ComposeMap`,
  `MapHomeTopBar`, `AddressRows`, `AddressSearch`, which are the real presentational units); what's
  left in `send.tsx` is mostly wiring those to `activePin`/pin-setters/reverse-geocode callbacks
  that also feed the draft-persistence and idempotency-key dependency lists. Extracting the wrapper
  JSX alone would save few lines and still leave the callbacks (which must stay near the state they
  close over) in the parent — a cosmetic move, not a complexity reduction.
- **The whole compose-sheet body as one component** — would need ~25+ props (a superset of all four
  bounded sub-blocks above plus `busy`/`error`/`canSubmit`/`outOfArea`/`onBroadcast`/
  `composeCollapsed`/`toggleCompose`), which is exactly the "port nearly as wide as the parent's own
  constructor" failure mode RF-05b's design doc identified. If a future run does all four bounded
  sub-block extractions, what's left in the sheet body becomes small enough that this stops being a
  live question.

## Recommended sequence

1. **This run:** design note only (this document) + ledger update. No code change.
2. **Next actionable RF-21 increment:** extract `accountOnHold` → a new
   `src/ui/send/SendAccountOnHoldView.tsx`, verbatim, ~6 props. Same risk profile as RF-18's first
   extraction (purely prop-driven, no local state, no draft/submit coupling).
3. **Later, one-at-a-time, each its own PR:** Landmarks & details → Items list → Recipient-phone
   block → Price/quote block, in that order (smallest/most self-contained first, mirroring RF-18's
   ordering heuristic). Each should land as its own single-concern PR per the routine's ≤400-line
   guideline — four small PRs, not one large one.
4. **Not recommended at any point:** a single "whole form body" extraction. Revisit only if a
   future structural change (e.g. moving draft-persistence/idempotency derivation into a custom
   hook that owns those 8 fields itself) narrows what the JSX needs from the parent — the same
   "wait for a structural trigger, not calendar time" condition RF-05b's doc set for its own
   deferred boundary.

## Ledger update

RF-21 stays **OPEN**, re-scoped from "needs a design pass" to "design pass done — next increment is
the `accountOnHold` extraction" (item 2 above). Not done this run: per priority order (a), the
design note is its own increment; the extraction itself is next run's actionable row.
