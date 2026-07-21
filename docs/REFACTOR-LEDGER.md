# REFACTOR-LEDGER.md — refactoring-routine memory

**Purpose.** The recurring refactoring routine (see `docs/ROUTINES.md` → "Refactoring
routine") reads this file FIRST on every run and writes back to it in the same PR as its
changes. It carries four things between runs: the hotspot map, the debt register, in-flight
multi-run migrations, and the completed-refactor log. Without this file the routine
re-analyzes from scratch; with it, each run resumes where the last one stopped.

**Last updated:** 2026-07-21 (fourth run executed — see `docs/REFACTOR-2026-07-21.md`).

## Hotspot map

Ranked churn × complexity candidates (45-day window, recomputed 2026-07-19). Recompute each run
and reconcile against this table — a hotspot that was refactored should drop off; a persistent
riser is the next target.

| Rank | File | Churn (45d commits) | Why it's hot | Status |
|---|---|---|---|---|
| 1 | `apps/api/src/riders/rider.service.ts` | 9 | 559+ lines, KYC + rider-standing logic | SENSITIVE — avoided (KYC gating); needs characterization before any future touch |
| 2 | `apps/api/src/orders/order-lifecycle.service.ts` | 8 | 874+ lines, order assignment/lifecycle | SENSITIVE — avoided (order assignment) |
| 3 | `apps/api/src/admin/admin-orders.service.ts` | 9 (rose from 7) | 584 lines, `adjustFare` mutates agreed-price + `adjudicateDelivered` is KB-POD-DISPUTE adjudication | SENSITIVE-ADJACENT — avoided (agreed-price/dispute adjudication); not yet scoped |
| 4 | `apps/api/src/admin/admin-riders.service.ts` | 8 (spec) | 630→~525 lines pre-this-run, mixed KYC-review reads + standing mutations | **RF-06 DONE this run** (2026-07-19) — see completed log. The read-side (`getKycReview` + duplicate-ID collision + photo-URL signing) is now `AdminKycReviewService`; the sensitive mutation core (`suspendRider`/`liftRider`/`banRider`/`clearHold`) stays in `AdminRidersService`, untouched, still SENSITIVE (KYC/standing gating) |
| 5 | `apps/mobile/src/auth/session.ts` → `device-state.ts` (589→65 lines + new ~527) | 4, steady riser pre-this-run | mixed the real auth session with ~10 unrelated per-order/per-flow SecureStore groups | **RF-10 DONE this run** (2026-07-21) — see completed log. Non-auth groups (delivery codes, confirmItemsPending, pendingRating, riderJobTerminal, senderRatingPending, pendingTopup, rolePreference, onboarding/permissions/disclaimer flags, handback acks, `clearDeviceState()`) moved verbatim to `device-state.ts`; `session.ts` now holds only `Session`/`getDeviceId`/`load-/save-/clearSession` and re-exports the rest |
| 6 | `apps/api/src/privacy/privacy.service.ts` | 6 (+6 spec) | 441 lines; `eraseAccount` alone is a 300-line method (preflight → CAS anonymise → rider scrub → PII sweep → GCS purge) | OPEN — RF-11, scoped this run (see debt register), sensitive-adjacent (erasure has dense defect history DS15/18/19) — mechanical extraction only, queued for next run |
| 7 | `apps/api/src/tracking/tracking.gateway.ts` | grew to 784 lines (was 770) | mixes socket handlers/heartbeat/emit-coalescing over shared mutable state | SCOPED — RF-05 design pass done (`docs/RF-05-WS-GATEWAY-STATE.md`, roadmap 3.6); 3 sequenced PRs planned, none landed yet |
| 8 | `apps/mobile/app/rider/index.tsx` | 955 lines, cooled out of top-40 churn | bid-compose screen | OPEN — bid-adjacent, needs a design pass; not scoped |
| 9 | `apps/admin/app/lib/adminTypes.ts` | 303 lines | duplicates API response shapes vs `packages/shared` | OPEN — not scoped; promoting to `packages/shared` is a public-surface/contract design question, not a mechanical move |
| — | `apps/api/src/settlements/settlements.service.ts` (189 lines), `apps/api/src/issues/issues.service.ts` (313 lines), `apps/api/src/admin/admin-audit.service.ts` (84 lines) | cooled / healthy size | — | no concern found 2026-07-19 |
| — | `packages/shared/src/policy.ts` | cooled to 3 (was 6) | public surface, no `any` | skip — cooled and clean |
| — | `apps/api/src/tracking/tracking.service.ts` | fell out of top 40 (was 8) | 648 lines, mixes presence-escalation/geo/notify-wait concerns | RF-04 DEPRIORITIZED — churn went cold; re-promote only if it heats up again |
| — | `apps/mobile/app/order/[id].tsx`, `apps/mobile/app/rider/job.tsx` | — | bid-selection/execution screens | SENSITIVE — avoided (bid acceptance UI) |
| — | `apps/api/src/matching/matching.service.ts` | — | order-assignment ranking | SENSITIVE — avoided (order assignment) |
| — | `apps/api/src/orders/orders.service.ts` | — | agreed-price/bid logic | SENSITIVE — avoided (agreed-price/bid acceptance) |
| — | `apps/api/src/admin/admin-riders.service.ts` → `admin-kyc-review.service.ts` (630→~525 + new ~113 lines) | 8 | KYC-review read-side split from rider-standing mutations | DONE — RF-06 |
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
| RF-05 | `apps/api/src/tracking/tracking.gateway.ts` | oversized | Bundles socket-event handlers, presence-heartbeat scanning, and position-emit coalescing over shared mutable maps/sets (`positionEmit`, `customerPresence`, `staleNotified`) | L | SCOPED — design pass done (`docs/RF-05-WS-GATEWAY-STATE.md`, roadmap 3.6): 3 sequenced PRs; only the `customerPresence`-authority check can change behaviour, the rest is behaviour-preserving extraction | — |
| RF-06 | `apps/api/src/admin/admin-riders.service.ts` → new `admin-kyc-review.service.ts` | misplaced | Mixed `getKycReview` (KYC review, read-only) with `suspendRider`/`liftRider`/`banRider`/`clearHold` (rider-standing mutations). **Deliberately extracted the read-side, not the mutations**: `getKycReview` (duplicate-ID collision query + signed photo-URL minting) had zero shared state with the mutation methods (only `prisma`; `pii`/`storage` deps used nowhere else in the file) and touching it can't affect the sensitive suspend/ban/clear-hold core at all — same RF-06 outcome, strictly lower risk than moving the tested-but-sensitive mutations. | M | **DONE** (2026-07-19) | this PR (`claude/quirky-tesla-y06g9q`) |
| RF-07 | `packages/shared/src/design-tokens.ts` (`accent700`) | dead-code | Deprecated alias, zero importers in app code — but it's an exported symbol of `packages/shared`, and this routine's public-surface-diff rule requires that package's exports stay byte-identical across a refactor PR. Needs its own explicitly-labeled "remove deprecated public export" PR, not a bundled refactor. | XS | WONT-DO (this routine) | — |
| RF-08 | `packages/shared/src/offer-ranking.ts` | dead-code (false positive) | `DEFAULT_OFFER_WEIGHTS`/`RankedOffer`/`OfferRankInput`/`OfferRankWeights` looked unused by raw import-count grep but are legitimate (default param value / `rankOffers` signature types) | — | WONT-DO | — |
| RF-09 | `apps/admin/app/components/StatusPill.tsx` vs `apps/mobile/src/ui/index.tsx` | duplication (not mechanical) | Status→category maps share shape but deliberately diverge in copy/category per platform; merging risks an accidental user-visible copy change | — | WONT-DO | — |
| RF-10 | `apps/mobile/src/auth/session.ts` → new `device-state.ts` | oversized | Moved the non-auth groups (delivery-code trio, confirmItemsPending, pendingRating, riderJobTerminal, senderRatingPending, pendingTopup, rolePreference, onboarding/permissions/disclaimer flags, handback acks, `clearDeviceState()`) verbatim into a new `device-state.ts`; `session.ts` re-exports them via `export * from "./device-state"` so none of its 17 importers changed. Added 3 characterization tests first (`session.test.ts` had only 4 cases) pinning `clearDeviceState()`'s exact wiped-key set, including the oddities (device id / onboarding-seen / permissions-primed survive sign-out; session token cleared separately). Also had to regenerate `.dependency-cruiser-known-violations.json`: 3 pre-existing session.ts circular-import entries now route through the new file's `export *` hop (same underlying cycles, confirmed via a clean-main-vs-branch baseline diff in a fully-installed workspace — nothing new). | M | **DONE** (2026-07-21) | PR #375 (`claude/refactor-2026-07-21`) |
| RF-11 | `apps/api/src/privacy/privacy.service.ts` | oversized (function) | `eraseAccount` is a single ~300-line method (preflight standing gate → in-tx CAS anonymise → rider scrub incl. raw-SQL `geog` → PII column sweeps → post-commit GCS purge). Scoped plan: split into named private helpers (`preflight`, `anonymiseProfileTx(tx,…)`, `scrubRiderTx(tx,…)`, `postCommitPurge`) with all CAS/TOCTOU comments carried verbatim, tx client threaded explicitly, no reordering. Strong existing coverage (494-line spec + enforcing PII-erasure manifest test) — no characterization needed. Sensitive-adjacent (erasure has dense defect history: DS15/18/19) — mechanical extraction only. | M | OPEN — scoped 2026-07-19, next run if capacity (2 PRs is this routine's normal cadence; only 1 PR fit this run) | — |

Statuses: `OPEN` (found, not started), `BLOCKED-NO-TESTS` (needs characterization tests
first — say which behaviors to pin), `IN-PROGRESS` (multi-run; see migrations below),
`DONE` (link PR), `WONT-DO` (say why — e.g. cold code, style-only churn).

**Note on `KB-SETTLEMENT-DROP` (`docs/KNOWN_BUGS.md`):** that ledger tags this routine as the
owning lane for dropping the dormant `Settlement` table + `Refund.settlementId` FK. Re-checked
2026-07-19: the drop is a Prisma **schema** migration, which this routine's own hard rules
explicitly forbid ("no Prisma schema changes"). It is NOT a valid target for a normal refactor
PR under this routine's constraints — `KNOWN_BUGS.md` should read "blocked on a dedicated
maintenance-window migration (out of the refactor routine's behavior-preserving remit)" rather
than "owned by the refactor lane." No code or doc change made here beyond this note; the
`KNOWN_BUGS.md` row itself is owned by the bug-ledger dedup protocol, not this file.

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
| 2026-07-21 | PR #375 (`claude/refactor-2026-07-21`) | RF-10 | Extracted the non-auth SecureStore groups (delivery codes, confirmItemsPending, pendingRating, riderJobTerminal, senderRatingPending, pendingTopup, rolePreference, onboarding/permissions/disclaimer flags, handback acks, `clearDeviceState()`) out of `apps/mobile/src/auth/session.ts` into a new `device-state.ts`; `session.ts` keeps only the real auth `Session` + `getDeviceId` and re-exports the rest | `pnpm typecheck && pnpm build && pnpm test` green pre+post (1169 api + 520 mobile tests, +3 net new characterization tests — none removed/weakened), `pnpm lint` 0 new warnings, `pnpm run depcruise` 0 new violations (known-violations baseline regenerated for the 3 pre-existing session.ts cycles that now route through the new file), all 17 importers unchanged (named-import grep confirmed `export *` compatibility), 1126 raw changed lines across 2 commits (over the ~400 guideline — same "byte-identical single-concern move" exception the ledger already granted RF-02/RF-06) |
| 2026-07-19 | (this PR, `claude/quirky-tesla-y06g9q`) | RF-06 | Extracted `AdminKycReviewService.getKycReview` (KYC-review read model: duplicate-ID collision query + signed photo-URL minting) out of `AdminRidersService`, leaving the sensitive standing-mutation core (`suspendRider`/`liftRider`/`banRider`/`clearHold`) untouched; moved its 2 describe blocks (9 tests) to a new `admin-kyc-review.service.spec.ts`; fixed a positional-DI test fixture (`admin-authz.e2e.spec.ts`'s manual `design:paramtypes` array) that the new constructor param shifted | `pnpm typecheck && pnpm build && pnpm test` green pre+post (1070 api + 449 mobile tests, same count — tests moved, not added/removed), `pnpm lint` 0 new warnings (1 pre-existing unrelated warning in `admin-orders.service.spec.ts`), `packages/shared` export surface + API route (`GET /admin/riders/:profileId/kyc`) + response shape byte-identical, 7 files / ~606 raw changed lines (over the ~400 guideline — same "byte-identical single-concern move" exception the ledger already granted RF-02; nothing rewritten, only relocated + one DI-wiring fix forced by the move) |
| 2026-07-17 | (this PR) | RF-02 | Extracted `NotificationsFeedService` (read-only in-app feed model) out of `NotificationsService` (push write-path); moved the 18-case feed spec block into its own spec file | `pnpm typecheck && pnpm build && pnpm test` green pre+post (1010 api + 410 mobile tests, same count — tests moved, not added/removed), `pnpm lint` 0 new warnings, `packages/shared` export surface + API route (`GET /notifications/feed`) + response shape byte-identical, 6 files / 832 insertions / 800 deletions |
| 2026-07-15 | (prior PR) | RF-01, RF-03 | Removed 2 orphaned mobile helper functions; typed the Text/TextInput font-patch (`fonts.ts`) end to end, eliminating all `any` | `pnpm typecheck && pnpm build && pnpm test` green pre+post (872 api + 375 mobile tests unchanged), `pnpm lint` 0 warnings/errors, `packages/shared` export surface untouched, 3 files / 39 insertions / 27 deletions across 2 commits |
