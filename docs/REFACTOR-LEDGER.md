# REFACTOR-LEDGER.md — refactoring-routine memory

**Purpose.** The recurring refactoring routine (see `docs/ROUTINES.md` → "Refactoring
routine") reads this file FIRST on every run and writes back to it in the same PR as its
changes. It carries four things between runs: the hotspot map, the debt register, in-flight
multi-run migrations, and the completed-refactor log. Without this file the routine
re-analyzes from scratch; with it, each run resumes where the last one stopped.

**Last updated:** 2026-07-15 (first run executed — see `docs/REFACTOR-2026-07-15.md`).

## Hotspot map

Ranked churn × complexity candidates (45-day window, computed 2026-07-15). Recompute each run
and reconcile against this table — a hotspot that was refactored should drop off; a persistent
riser is the next target.

| Rank | File | Churn (45d commits) | Why it's hot | Status |
|---|---|---|---|---|
| 1 | `apps/api/src/riders/rider.service.ts` | 11 | 559 lines, KYC + rider-standing logic | SENSITIVE — avoided (KYC gating); needs characterization before any future touch |
| 2 | `apps/mobile/app/order/[id].tsx` | 10 | 1190 lines, customer bid-selection/tracking screen | SENSITIVE — avoided (bid acceptance UI) |
| 3 | `apps/api/src/orders/orders.service.ts` | 10 | 778 lines, 14 `any`, agreed-price/bid logic | SENSITIVE — avoided (agreed-price/bid acceptance) |
| 4 | `apps/api/src/orders/order-lifecycle.service.ts` | 10 | 874 lines, order assignment/lifecycle | SENSITIVE — avoided (order assignment) |
| 5 | `apps/mobile/app/rider/job.tsx` | 9 | 817 lines, rider job/bid-execution screen | SENSITIVE — avoided (bid acceptance UI) |
| 6 | `apps/api/src/tracking/tracking.service.ts` | 8 | 648 lines, mixes presence-escalation/geo/notify-wait concerns | OPEN — RF-04, needs design pass (too large for one PR) |
| 7 | `apps/api/src/tracking/tracking.gateway.ts` | 8 | 708 lines, mixes socket handlers/heartbeat/emit-coalescing over shared mutable state | OPEN — RF-05, needs design pass (too large for one PR) |
| 8 | `apps/api/src/notifications/notifications.service.ts` | 8 | 612 lines, push write-path + feed read-model bundled | OPEN — RF-02, extraction plan ready, next run |
| 9 | `apps/api/src/admin/admin-riders.service.ts` | 7 | 522 lines, mixes KYC review + standing mutations | BLOCKED-NO-TESTS — RF-06, sensitive (KYC gating) |
| 10 | `apps/mobile/src/push/push.ts` | 6 | 188 lines, small | cold enough to skip |
| 11 | `apps/api/src/sos/sos.service.ts` | 6 | 179 lines, small | cold enough to skip |
| 12 | `apps/api/src/matching/matching.service.ts` | 6 | 336 lines, order-assignment ranking | SENSITIVE — avoided (order assignment) |
| — | `apps/mobile/src/logic/saved-recipients.ts` / `apps/mobile/src/net/history-store.ts` | — | orphaned `clear*` wrappers | DONE — RF-01 |
| — | `apps/mobile/src/ui/fonts.ts` | — | `any`-heavy render patch | DONE — RF-03 |

## Debt register

Every distinct refactoring opportunity found gets a row, whether or not it was done in that
run. IDs are `RF-NN`. Kind is one of: `dead-code`, `duplication`, `oversized`, `misplaced`,
`type-safety`, `test-health`, `migration`.

| ID | File(s) | Kind | Description | Effort | Status | PR |
|---|---|---|---|---|---|---|
| RF-01 | `apps/mobile/src/logic/saved-recipients.ts`, `apps/mobile/src/net/history-store.ts` | dead-code | Removed orphaned `clearRecipients()`/`clearHistorySnapshot()` — sign-out already clears the same keys directly in `auth/session.ts` | XS | DONE | this PR (`bd83cae`) |
| RF-02 | `apps/api/src/notifications/notifications.service.ts` | oversized/misplaced | Extract `feedForUser` + `NotificationRow`/`FEED_*` constants (~220 lines) into a new `NotificationsFeedService`; wire into `notifications.module.ts` providers/exports and `notifications.controller.ts`'s `feed()` handler. Well-covered by the existing 13-test "derived in-app feed" spec block. Estimated ~470 changed lines (extraction + wiring) — do as its own PR next run, don't stack with other targets. | M | OPEN | — |
| RF-03 | `apps/mobile/src/ui/fonts.ts` | type-safety | Replaced all `any` usages (`patchRenderable`/`applyInterToTextComponents`/Fast-Refresh guard markers) with a named `PatchedRenderFn`/`Patchable` type pair | S | DONE | this PR (`b44e6db`) |
| RF-04 | `apps/api/src/tracking/tracking.service.ts` | oversized | Bundles presence-escalation (SOS-adjacent) tokens, rider geo/position tracking, and the notify-when-available waiting list over shared state | L | OPEN | — |
| RF-05 | `apps/api/src/tracking/tracking.gateway.ts` | oversized | Bundles socket-event handlers, presence-heartbeat scanning, and position-emit coalescing over shared mutable maps/sets (`positionEmit`, `customerPresence`, `staleNotified`) | L | OPEN | — |
| RF-06 | `apps/api/src/admin/admin-riders.service.ts` | misplaced | Mixes `getKycReview` (KYC review) with `suspendRider`/`liftRider`/`banRider`/`clearHold` (rider-standing mutations) | M | BLOCKED-NO-TESTS | — |
| RF-07 | `packages/shared/src/design-tokens.ts` (`accent700`) | dead-code | Deprecated alias, zero importers in app code — but it's an exported symbol of `packages/shared`, and this routine's public-surface-diff rule requires that package's exports stay byte-identical across a refactor PR. Needs its own explicitly-labeled "remove deprecated public export" PR, not a bundled refactor. | XS | WONT-DO (this routine) | — |
| RF-08 | `packages/shared/src/offer-ranking.ts` | dead-code (false positive) | `DEFAULT_OFFER_WEIGHTS`/`RankedOffer`/`OfferRankInput`/`OfferRankWeights` looked unused by raw import-count grep but are legitimate (default param value / `rankOffers` signature types) | — | WONT-DO | — |
| RF-09 | `apps/admin/app/components/StatusPill.tsx` vs `apps/mobile/src/ui/index.tsx` | duplication (not mechanical) | Status→category maps share shape but deliberately diverge in copy/category per platform; merging risks an accidental user-visible copy change | — | WONT-DO | — |

Statuses: `OPEN` (found, not started), `BLOCKED-NO-TESTS` (needs characterization tests
first — say which behaviors to pin), `IN-PROGRESS` (multi-run; see migrations below),
`DONE` (link PR), `WONT-DO` (say why — e.g. cold code, style-only churn).

## In-flight strangler migrations

Multi-run refactors only. Each entry tracks: target, the new path introduced, callers moved
so far / remaining, and the deletion condition for the old path. A migration entry with no
movement across 3 consecutive runs must be either finished next run or downgraded to
`WONT-DO` with a reason — no zombie migrations.

_(none yet — RF-02/RF-04/RF-05 are single-PR-sized extractions once undertaken, not strangler
migrations; promote to a migration entry only if a future run finds it needs to span >1 PR.)_

## Completed-refactor log

One line per merged refactor PR, newest first: date, PR, RF-IDs, one-line summary,
before/after evidence (e.g. "exports diff clean, 14 tests green pre+post").

| Date | PR | RF-IDs | Summary | Evidence |
|---|---|---|---|---|
| 2026-07-15 | (this PR) | RF-01, RF-03 | Removed 2 orphaned mobile helper functions; typed the Text/TextInput font-patch (`fonts.ts`) end to end, eliminating all `any` | `pnpm typecheck && pnpm build && pnpm test` green pre+post (872 api + 375 mobile tests unchanged), `pnpm lint` 0 warnings/errors, `packages/shared` export surface untouched, 3 files / 39 insertions / 27 deletions across 2 commits |
