# REFACTOR-LEDGER.md — refactoring-routine memory

**Purpose.** The recurring refactoring routine (see `docs/ROUTINES.md` → "Refactoring
routine") reads this file FIRST on every run and writes back to it in the same PR as its
changes. It carries four things between runs: the hotspot map, the debt register, in-flight
multi-run migrations, and the completed-refactor log. Without this file the routine
re-analyzes from scratch; with it, each run resumes where the last one stopped.

**Last updated:** 2026-07-17 (second run executed — see `docs/REFACTOR-2026-07-17.md`).

## Hotspot map

Ranked churn × complexity candidates (45-day window, recomputed 2026-07-17). Recompute each run
and reconcile against this table — a hotspot that was refactored should drop off; a persistent
riser is the next target.

| Rank | File | Churn (45d commits) | Why it's hot | Status |
|---|---|---|---|---|
| 1 | `apps/api/src/riders/rider.service.ts` | 9 | 559+ lines, KYC + rider-standing logic | SENSITIVE — avoided (KYC gating); needs characterization before any future touch |
| 2 | `apps/api/src/orders/order-lifecycle.service.ts` | 10 | 874+ lines, order assignment/lifecycle | SENSITIVE — avoided (order assignment) |
| 3 | `apps/api/src/orders/orders.service.ts` | 8 | 778+ lines, agreed-price/bid logic | SENSITIVE — avoided (agreed-price/bid acceptance) |
| 4 | `apps/api/src/admin/admin-riders.service.ts` | 8 | 522+ lines, mixes KYC review + standing mutations | OPEN — RF-06 (upgraded from BLOCKED-NO-TESTS: `admin-riders.service.spec.ts` is now 720 lines/42 tests covering all mutations); still SENSITIVE (KYC gating) — do conservatively, next run |
| 5 | `apps/mobile/src/auth/session.ts` | 8 | auth/session lifecycle, cross-app | OPEN — new riser 2026-07-17, not yet scoped for a concrete refactor target |
| 6 | `apps/api/src/privacy/privacy.service.ts` | 8 | new riser 2026-07-17 | OPEN — not yet scoped |
| 7 | `apps/api/src/admin/admin-orders.service.ts` | 7 | new riser 2026-07-17 | OPEN — not yet scoped |
| 8 | `apps/mobile/app/rider/index.tsx` | 7 | new riser 2026-07-17 | OPEN — not yet scoped |
| 9 | `apps/api/src/tracking/tracking.gateway.ts` | 6 (was 8) | 708 lines, mixes socket handlers/heartbeat/emit-coalescing over shared mutable state | OPEN — RF-05, needs design pass (too large for one PR) |
| 10 | `apps/api/src/settlements/settlements.service.ts`, `apps/api/src/issues/issues.service.ts` | 6 each | new risers 2026-07-17 | OPEN — not yet scoped |
| 11 | `packages/shared/src/policy.ts` | 6 | new riser 2026-07-17 | OPEN — not yet scoped; any change here is a public-surface change, extra scrutiny required |
| — | `apps/api/src/tracking/tracking.service.ts` | fell out of top 40 (was 8) | 648 lines, mixes presence-escalation/geo/notify-wait concerns | RF-04 DEPRIORITIZED — churn went cold; re-promote only if it heats up again |
| — | `apps/mobile/app/order/[id].tsx`, `apps/mobile/app/rider/job.tsx` | — | bid-selection/execution screens | SENSITIVE — avoided (bid acceptance UI) |
| — | `apps/api/src/matching/matching.service.ts` | — | order-assignment ranking | SENSITIVE — avoided (order assignment) |
| — | `apps/api/src/notifications/notifications.service.ts` (612→~370 lines) + new `notifications-feed.service.ts` (~370 lines) | 6 | push write-path split from the feed read-model | DONE — RF-02 |
| — | `apps/mobile/src/logic/saved-recipients.ts` / `apps/mobile/src/net/history-store.ts` | — | orphaned `clear*` wrappers | DONE — RF-01 |
| — | `apps/mobile/src/ui/fonts.ts` | — | `any`-heavy render patch | DONE — RF-03 |

## Debt register

Every distinct refactoring opportunity found gets a row, whether or not it was done in that
run. IDs are `RF-NN`. Kind is one of: `dead-code`, `duplication`, `oversized`, `misplaced`,
`type-safety`, `test-health`, `migration`.

| ID | File(s) | Kind | Description | Effort | Status | PR |
|---|---|---|---|---|---|---|
| RF-01 | `apps/mobile/src/logic/saved-recipients.ts`, `apps/mobile/src/net/history-store.ts` | dead-code | Removed orphaned `clearRecipients()`/`clearHistorySnapshot()` — sign-out already clears the same keys directly in `auth/session.ts` | XS | DONE | this PR (`bd83cae`) |
| RF-02 | `apps/api/src/notifications/notifications.service.ts` → `notifications-feed.service.ts` | oversized/misplaced | Extracted `feedForUser` + `NotificationRow`/`FEED_*`/`ACCOUNT_FEED_*`/`ISSUE_RESOLUTION_FEED_COPY` constants (~386 lines) into a new `NotificationsFeedService`; wired into `notifications.module.ts` providers/exports and `notifications.controller.ts` (now injects both services, `feed()` calls the new one). The 18-case "derived in-app feed" spec block moved verbatim into a new `notifications-feed.service.spec.ts` (its own `makeDeps()` needs only a `PrismaService` mock, not the push adapter). The 2026-07-15 ~470-line estimate was stale — the feed slice had grown 612→763 lines of the source file since (4 features landed on it in the two days between runs: UX17-01/02/03, UX-2026-07-16 issue-resolution rows) — actual diff is ~830 changed lines (extraction + full-fidelity test move), over the routine's ~400 guideline. Went ahead anyway: it's a byte-identical single-concern move (nothing rewritten, only relocated), the ledger had already sanctioned exceeding the cap for this specific extraction, and splitting it further would leave "one concern" half-moved across two PRs, which is a worse trade than a larger single mechanical diff. | M | DONE | this PR (`claude/refactor-2026-07-17`) |
| RF-03 | `apps/mobile/src/ui/fonts.ts` | type-safety | Replaced all `any` usages (`patchRenderable`/`applyInterToTextComponents`/Fast-Refresh guard markers) with a named `PatchedRenderFn`/`Patchable` type pair | S | DONE | this PR (`b44e6db`) |
| RF-04 | `apps/api/src/tracking/tracking.service.ts` | oversized | Bundles presence-escalation (SOS-adjacent) tokens, rider geo/position tracking, and the notify-when-available waiting list over shared state | L | DEPRIORITIZED (2026-07-17: churn fell out of the top 40 in the 45d window — no longer a hotspot; re-promote if it heats up again) | — |
| RF-05 | `apps/api/src/tracking/tracking.gateway.ts` | oversized | Bundles socket-event handlers, presence-heartbeat scanning, and position-emit coalescing over shared mutable maps/sets (`positionEmit`, `customerPresence`, `staleNotified`) | L | OPEN (churn 8→6, still hot enough to keep) | — |
| RF-06 | `apps/api/src/admin/admin-riders.service.ts` | misplaced | Mixes `getKycReview` (KYC review) with `suspendRider`/`liftRider`/`banRider`/`clearHold` (rider-standing mutations) | M | OPEN (2026-07-17: upgraded from BLOCKED-NO-TESTS — `admin-riders.service.spec.ts` now 720 lines/42 tests across 6 describe blocks, covering listRiders/getKycReview/getRiderDetail/all 4 standing mutations/standing-change notification; characterization is no longer the blocker). Still SENSITIVE (KYC gating) — take conservatively, next run. | — |
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
| 2026-07-17 | (this PR) | RF-02 | Extracted `NotificationsFeedService` (read-only in-app feed model) out of `NotificationsService` (push write-path); moved the 18-case feed spec block into its own spec file | `pnpm typecheck && pnpm build && pnpm test` green pre+post (1010 api + 410 mobile tests, same count — tests moved, not added/removed), `pnpm lint` 0 new warnings, `packages/shared` export surface + API route (`GET /notifications/feed`) + response shape byte-identical, 6 files / 832 insertions / 800 deletions |
| 2026-07-15 | (prior PR) | RF-01, RF-03 | Removed 2 orphaned mobile helper functions; typed the Text/TextInput font-patch (`fonts.ts`) end to end, eliminating all `any` | `pnpm typecheck && pnpm build && pnpm test` green pre+post (872 api + 375 mobile tests unchanged), `pnpm lint` 0 warnings/errors, `packages/shared` export surface untouched, 3 files / 39 insertions / 27 deletions across 2 commits |
