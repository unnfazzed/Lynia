# Lynia — UX & Usability Codebase Review

**Date:** 2026-07-26 · **Reviewer:** senior UX-engineering pass (routine) · **Scope:** shipped feature set. No new features, no architecture changes.

> **How this was run.** Phase 0 read `docs/KNOWN_BUGS.md` in full and the most recent
> `docs/UX-USABILITY-REVIEW-2026-07-21.md`. `mcp__github__list_pull_requests` (state=open) returned
> `[]` — zero open `claude/*` PRs — so dedup rested entirely on the ledger read. `main` had moved on
> since the 2026-07-25 night bug-hunt consolidation: `origin/main` includes that PR's merge (#388),
> a Cloudflare terraform-lock fix (#390), and PR #391 (`claude/bird-mcp-agent-skills`), which — despite
> its branch name — also folded in two same-day auth commits, `65350ff` ("close the per-device
> signup-cap bypass") and `e2d8d36` ("fail-safe the recycle check"). Those two commits turned out to be
> the root cause of this run's HIGH finding (UX26-01) — a fresh-eyes read of `git log` was what surfaced
> them, since neither `docs/KNOWN_BUGS.md` nor any dated report yet mentioned them.
>
> **Phase 0.5** rotated to the three cluster headers the UX lane has checked least recently — UX21
> (2026-07-21) already re-verified Money-fraud/Data-integrity/Ship-infra-correctness, and UX19/UX20
> covered Auth-identity/Notifications-FCM/Edge-abuse and KYC/Object-authz-IDOR/Mobile-journey-dead-ends
> between them — the oldest re-check by run count was **KYC**, **Object-authz/IDOR**, and
> **Mobile-journey-dead-ends** (last touched 2026-07-19). Re-opened ≥2 named members of each against
> current code:
> - **KYC → intact.** `apps/api/src/kyc/kyc.controller.ts:71-72`: the webhook fail-closed guard
>   (`if (!secret && (NODE_ENV === "production" || KYC_PROVIDER === "didit")) throw
>   ServiceUnavailableException(...)`) is present and unchanged.
> - **Object-authz/IDOR → intact.** `apps/api/src/offers/offers.service.ts:38`: the wash-trade rejection
>   (`if (order.customerId === riderId)`) is present.
> - **Mobile-journey-dead-ends → intact.** `apps/mobile/src/logic/gates.ts:110-113`: the rider cooldown
>   gate's copy and gate key are present, matching the ledger's claim.
>
> 3/3 sampled members confirmed intact — no fresh findings from this pass.
>
> **Model note.** The Agent/Task subagent tooling in this session does not expose a `model` parameter
> for per-phase overrides (no `fable`/`opus` split was available), so the mandated
> `Workflow({name: 'lane-bug-hunt'}, args: 'ux')` hunt ran its 16 sub-agents (4 find, 6 verify, 3 sweep,
> plus retries) on the session's resolved model throughout, and the fix/write-up stage ran directly on
> the orchestrating session (same model). Noted per the routine's instruction to record which model
> produced each phase when a split isn't available.
>
> **Environment note.** Fresh session with no installed dependencies — `pnpm install`, `pnpm exec prisma
> generate` (in `apps/api`), and `pnpm --filter @lynia/shared build` all had to run before `pnpm
> typecheck`/`pnpm test` would resolve `@lynia/shared`/`@prisma/client` imports. Once installed,
> typecheck, lint, and the full test suite were clean on baseline `main` before any fix work started.
>
> **Correction to a prior report's stated fact.** `docs/UX-USABILITY-REVIEW-2026-07-21.md` states
> `@lynia/admin` "has no test harness" and its fixes are typecheck/lint/build-verified only. That is no
> longer true (and may not have been true even then) — `apps/admin/package.json`'s `"test": "vitest run"`
> script is wired into the root `pnpm test` via `turbo run test`, and `apps/admin/app/{orders,riders,
> issues}/actions.test.ts` + `lib/{console-auth,iap-jwt}.test.ts` already exist and run. This run's admin
> fixes are covered by the full `pnpm test` run below, not a separate typecheck-only path.

---

## 1. Summary — the highest-impact fixes

1. **A same-day commit (`65350ff`) made `x-device-id` mandatory for new-account creation to close a
   fraud-control bypass, but the mobile client's own header-attachment code silently omits that header
   on ANY keystore failure — turning a documented, real-world `expo-secure-store` failure mode
   (low-end Android after an OS update, keystore corruption, resource pressure) into a permanent,
   misleadingly-labelled onboarding dead end.** The 400 fires after the OTP is already consumed
   server-side, so a same-code retry falls into the generic "Code expired or never requested" 401 and
   loops the user into "Send a fresh code" forever — a resend can never fix a broken keystore, and
   nothing in the UI ever says the real problem is device storage. *(HIGH — FIXED: `getDeviceId()` now
   falls back to a process-lifetime-only id on a keystore failure instead of throwing, so the header is
   always sent and the anti-abuse gate stays satisfied for that request, just without cross-restart
   dedup on the one broken device)*
2. **Every admin-console write action (10 of them, across 5 files) collapsed the API's real rejection
   reason — a business-rule message, a stale-CAS conflict, an expired session — into one hardcoded
   "check API_BASE_URL / admin token" string**, sending the operator to debug infra for what's usually a
   stale row or an expired session. The 2026-07-16 UX pass (UX16-04) fixed exactly this class for the
   SOS-acknowledge action alone; it never made it to any of the other 10 sites. *(MEDIUM — FIXED: a
   single shared classifier, `describeAdminPostFailure`, now backs every write action including the SOS
   one it was modeled on — retiring the class instead of leaving another instance fix for the next
   sweep to re-find)*
3. **`adjustFare`'s rider notification carried no order-status field**, so a rider still on the exact
   `assigned` job (fare corrected right after assignment) got routed to the generic order screen instead
   of straight to their job screen — one avoidable extra tap, the same gap `notifyIssueResolved` has for
   a rider-raised issue. *(MEDIUM — FIXED, and deliberately scoped to the rider's own
   push/feed row only: stamping the same field on the customer's push would have introduced a NEW
   misrouting bug, since `pushDestination`'s generic status check isn't gated by recipient the way its
   feed-row equivalent is)*

---

## 2. Findings table

| # | Journey / Area | Lens | File:line (at time of audit) | What the user experiences | Fix | Impact | Status |
|---|---|---|---|---|---|---|---|
| UX26-01 | New customer/rider sign-up on a device with a failing keystore | Recoverability | `apps/api/src/auth/auth.service.ts:332-334`; `apps/mobile/src/auth/session.ts` (`getDeviceId`); `apps/mobile/src/api/client.ts:150-153` | `verifyOtp` now throws `BadRequestException("A device id is required to create an account.")` for any brand-new account with no `x-device-id` header (added same-day, commit `65350ff`, to close a per-device signup-cap bypass). `client.ts` attaches the header via `getDeviceId().catch(() => null)` — silently `null` on failure. `getDeviceId()` calls `SecureStore.setItemAsync`, which the same file's `loadSession` comment documents as throwing on "low-end Android after OS updates / keystore corruption / resource pressure." On such a device every verify attempt 400s; because the OTP is deleted server-side (`store.del(phone)`) BEFORE the device check runs, a same-code retry lands in `verifyViaGrace`, finds no profile (none was ever created), and returns a generic 401 the client's `isOtpExpiredOrLocked` matches — sending the user into an infinite "Send a fresh code" loop that can never actually fix a broken keystore. | `getDeviceId()` now wraps its whole body in try/catch; on any failure (read OR write) it falls back to a `randomUuidV4()` cached only for the process lifetime (not persisted — a relaunch mints a new one), instead of propagating the throw. `client.ts`'s call site comment updated to reflect this is now a last-resort backstop, not the primary defense. | High | **Fixed** — `apps/mobile/src/auth/__tests__/session.test.ts`: 3 new tests (write-failure fallback, read-failure fallback, healthy-keystore caching unchanged) |
| UX26-02 | Admin console — every write action's error path | Error/empty states | `apps/admin/app/orders/actions.ts` (×3), `apps/admin/app/riders/actions.ts` (×4), `apps/admin/app/customers/actions.ts` (×1), `apps/admin/app/issues/actions.ts` (×1), `apps/admin/app/actions/audit.ts` (×2), `apps/admin/app/lib/api.ts` | All 10 write actions called `adminPost()`, a boolean-collapsing wrapper over `adminPostResult()` that discards the response body and the failure `reason` entirely. Every one threw the identical `Failed to X ... (check API_BASE_URL / admin token).` regardless of whether the real cause was a genuine business rejection (e.g. `AdminOrdersService.adjudicateDelivered`'s "Only an undelivered order can be adjudicated", a stale-CAS "refresh and try again"), an expired session (401/403), or an actual infra problem. `sos/actions.ts`'s `acknowledgeSos` had already been fixed for this exact class in the 2026-07-16 UX pass (UX16-04) but the fix was never generalized to its 10 siblings. | `apps/admin/app/lib/api.ts`: `adminPostResult` now parses the response body on a non-2xx and extracts Nest's standard `message` field (string or string[]) into the result; a new exported `describeAdminPostFailure(res)` classifies unconfigured/unreachable/401-403/http-with-message/generic-http into operator-actionable text, preferring the API's own message when present. All 10 call sites switched from `adminPost` to `adminPostResult` + `describeAdminPostFailure`; `sos/actions.ts` refactored onto the same shared function (retiring its standalone duplicate of the same logic) so the classification lives in exactly one place going forward. | Medium | **Fixed** (`@lynia/admin` — covered by the existing `vitest` suite via `pnpm test`; typecheck+lint also clean) |
| UX26-03 | `adjustFare` / `notifyIssueResolved` rider push+feed routing | Notification-coherence | `apps/api/src/admin/admin-orders.service.ts` (`adjustFare`); `apps/api/src/notifications/notifications-feed.service.ts` (fare-adjust + resolved-issue rows); `apps/api/src/issues/issues.service.ts` (`resolve`); `apps/api/src/notifications/notifications.service.ts` (`notifyIssueResolved`) | Both pushes/feed rows carried `kind: "order"`/`"issue"` with no `status` field, so `push.ts`'s `pushDestination`/`notificationRowDestination` fell through to the generic `/order/:id` route for every recipient, every time — including a rider still on the exact `assigned` job the push is about, who should land on `/rider/job` directly per the established `RIDER_JOB_SCREEN_STATUSES` convention every other `assigned`-status touchpoint follows. (Independent re-verification found the hunt's initial description overstated this as a "dead-control detour" with "no live tracking" — `/order/:id` already renders `LiveTrackingCard` [map, ETA, ride stepper, one-tap call, SOS] plus an "Open your job" link for an active rider viewer, so the real user cost is one avoidable extra tap, not a blocker. Severity corrected from the hunt's MEDIUM description to a narrower, still-real MEDIUM.) | Stamped `status` (the order's current status) on the RIDER's push/feed row only, for both `adjustFare` and `notifyIssueResolved`(when the issue opener is the rider) — **never** on the customer's, and this scoping is load-bearing: `pushDestination`'s generic `RIDER_JOB_SCREEN_STATUSES`/`RIDER_BOARD_STATUSES` checks aren't gated on the `to` field the way `notificationRowDestination`'s feed-row equivalent already is (it trusts that a status-carrying push is only ever sent to the party `STATUS_NOTICES` designates), so stamping the same field on the customer's push would have misrouted them to `/rider/job` (on `assigned`) or `/rider` (on `completed`) — a strictly worse, NEW bug. The feed-row fix derives current status from `order.events.at(-1)?.status` (the projection has no top-level `status` column); the resolved-issue feed row leaves `to`/`status` unset when the order has aged out of the feed's lookback window rather than guessing. | Medium | **Fixed** — 4 new regression tests: `admin-orders.service.spec.ts` (rider push carries status, customer push doesn't), `notifications.service.spec.ts` ×2 (`notifyIssueResolved` customer vs. rider), `notifications-feed.service.spec.ts` ×3 (fare-adjust row status, resolved-issue row with/without the order in view) |

---

## 3. Phase 0.5 — cluster-claim re-verification

Rotated to **KYC**, **Object-authz/IDOR**, and **Mobile-journey-dead-ends** (the three headers least
recently re-checked by the UX lane — see the "How this was run" note above for the full rotation
history and the exact evidence read for each). 3/3 sampled members confirmed intact against current
code. No fresh findings from this pass.

---

## 4. Sibling-sweep

**UX26-01 (a `getDeviceId()`/`x-device-id` failure mode).** This finding is a single client-side
function's contract, not a repeated pattern across call sites — `getDeviceId()` has exactly one call
site (`client.ts:150`), confirmed by:

```
grep -rn "getDeviceId" --include=*.ts apps/mobile/src
```

2 hits: the definition (`session.ts`) and the one call site (`client.ts`). No siblings to sweep; the fix
is at the source of truth.

**UX26-02 (`adminPost()` — a write action that discards the real failure reason).**

```
grep -rln adminPost /home/user/Lynia --include=*.ts
```

Pre-fix: 3 files already used the safer `adminPostResult` pattern (`sos/actions.ts`, `actions/audit.ts`
— though `audit.ts`'s own error text still hardcoded a truncated `HTTP {status}`/`API unreachable`
detail rather than the API's real message, a milder instance of the same class) and 5 files used the
boolean-collapsing `adminPost`. Full disposition of all 10 write call sites found:

- `apps/admin/app/orders/actions.ts:20,32,51` (`cancelOrder`, `adjudicateDelivered`, `adjustFare`) —
  **fixed**, switched to `adminPostResult` + `describeAdminPostFailure`.
- `apps/admin/app/riders/actions.ts:14,35,67,102` (`setKyc`, `decideKyc`, `mutateRider`,
  `creditRiderWallet`) — **fixed**, same switch.
- `apps/admin/app/customers/actions.ts:29` (`mutateCustomer`) — **fixed**, same switch.
- `apps/admin/app/issues/actions.ts:31` (`resolveIssue`) — **fixed**, same switch. This was a sibling
  the hunt's own agentic sweep surfaced (not in its original candidate's file list).
- `apps/admin/app/actions/audit.ts:37,68` (`submitAdminAction`, `logOrderFollowUpNote`) — **fixed**.
  This is a SECOND sibling this run's independent code read found that the hunt's own sweep missed —
  both already used `adminPostResult` (so they had the `reason`/`status` available) but built their own
  truncated `HTTP {status}`/`API unreachable` string instead of the API's real message; switched to
  `describeAdminPostFailure` for the same message quality and to collapse the duplicated classification
  logic into one function.
- `apps/admin/app/sos/actions.ts:18` (`acknowledgeSos`) — **refactored** (was already correct
  standalone logic from UX16-04; now calls the shared `describeAdminPostFailure` instead of duplicating
  its own copy of the same classification, so the two can't drift apart again).

Post-fix: `grep -rn "check API_BASE_URL / admin token" apps/admin --include=*.ts` returns 0 live
matches (2 hits remain, both doc-comments describing the fix, not executable strings). **10/10 call
sites now funnel through one shared classifier — the class is retired, not just instance-patched.**

**UX26-03 (a push/feed `kind` whose destination routing has no `status`-aware path for the recipient's
own screen).**

```
grep -rn 'kind:' apps/api/src --include='*.ts' | grep -v '\.spec\.'
grep -n 'kind ===' apps/mobile/src/push/push.ts
```

Cross-checked every `kind` value emitted server-side against `push.ts`'s branch list:

- `kind: "order"` (`adjustFare`) — THE CONFIRMED BUG, **fixed** (rider-only `status` stamp).
- `kind: "issue"` (`notifyIssueResolved`) — a confirmed SIBLING (same missing-status shape, and the
  opener can genuinely be either party), **fixed** the same way (rider-only, via a new
  `riderOrderStatus` parameter threaded from `IssuesService.resolve`).
- `kind: "broadcast"` — rider-only by construction (`STATUS_NOTICES` never targets a customer with this
  kind), routes to `/rider` unconditionally; no status-aware routing needed, not a sibling.
- `kind: "sos"`, `kind: "riders_available"`, `kind: "account"`, `kind: "rebroadcast"` — each already has
  its own dedicated, correct branch in `pushDestination` (pre-existing, unrelated to this class).
- The generic, kind-less `notifyOrderStatus`/`STATUS_NOTICES` path (used for genuine order-lifecycle
  transitions like `assigned`/`confirmed`/`cancelled`) already stamps `status`+`to` correctly — it's the
  reference implementation this fix brings `order`/`issue` in line with.

**Result: both siblings found by the sweep were fixed this run. No new ledger OPEN rows from this
finding.**

---

## 5. Notes on scope and process

- The hunt (`Workflow` lane `"ux"`) ran 4 finder lenses (error-empty-states, copy-honesty,
  recoverability, notification-coherence — 1 of 4 returned zero findings) → a 3-skeptic adversarial
  panel per candidate → a repo-wide sibling-sweep per survivor. 3 candidates found; all 3 survived
  verification (REAL/REAL/REAL for UX26-01 and UX26-02; REAL/refuted/REAL — 2-of-3 majority — for
  UX26-03).
- **UX26-03 was independently re-verified and its scope narrowed before being fixed**, per this
  routine's evidence rules (never fix from the hunt's description alone). The refuting skeptic's
  reasoning was checked against the actual code (`apps/mobile/app/order/[id].tsx`'s `LiveTrackingCard`
  render conditions, `push.ts`'s `RIDER_JOB_SCREEN_STATUSES`) and found correct: the hunt's "bare
  dead-control screen" characterization was factually wrong (the screen has live tracking + a one-tap
  link to the job screen already), so the finding was fixed as the narrower, still-real "one avoidable
  extra tap on `assigned`" gap rather than the broader claim as originally written.
- **A safety hazard was caught and avoided while implementing UX26-03's fix**, not by any of the hunt's
  agents: the first draft stamped `status` on BOTH the rider's and the customer's `adjustFare` push. A
  closer read of `push.ts`'s `pushDestination` showed its generic `RIDER_JOB_SCREEN_STATUSES`/
  `RIDER_BOARD_STATUSES` checks are NOT gated on the `to`/recipient field (unlike
  `notificationRowDestination`'s feed-row equivalent, which explicitly checks `row.to === "rider"`
  first) — because every existing caller of that generic path only ever sends a status-carrying push to
  the party `STATUS_NOTICES` designates. Stamping `status: "assigned"` on the customer's push too would
  have silently misrouted a customer to `/rider/job` the next time an admin corrected a fare right after
  assignment — a new, real bug this fix would have introduced. The final fix scopes the `status` stamp
  to the rider's own push/feed row exclusively, with a comment at both call sites documenting why.
- `apps/api/src/admin/admin-orders.service.ts`'s `adjustFare` transaction return type initially caused a
  TypeScript error (`status: string | undefined` not assignable to `string`) because the no-op/replay
  early-return branch didn't carry a `status` field while the main branch did — fixed by adding
  `status: order.status` to the no-op branch too (its value is never read, since the no-op path returns
  before any push is sent, but the two branches now agree on shape).
- This was a fresh session with no installed dependencies. `pnpm install`, `pnpm exec prisma generate`
  (in `apps/api`), and `pnpm --filter @lynia/shared build` all had to run before `pnpm
  typecheck`/`pnpm lint`/`pnpm test` could resolve `@lynia/shared` and `@prisma/client` imports across
  the monorepo — done once, up front, before any fix work. `pnpm typecheck && pnpm test` (all 5
  packages) and `pnpm lint` are all green on this branch; the one pre-existing lint warning
  (`admin-orders.service.spec.ts`'s shadowed `dec` helper) predates this run and is untouched by it.

## 6. Needs-human-confirmation

None this pass — every finding was verified directly against current code with quoted evidence before
being fixed, including independently re-deriving (and in one case narrowing) the hunt's own claims.

## 7. Deferred / not fixed

None. All three findings from this pass were fixed in this run, along with all 4 sibling sites the
mandatory sweep turned up (2 for UX26-02 that the hunt's own sweep had already found, 2 more for
UX26-02 that this run's independent code read found beyond the hunt's list, and 1 for UX26-03).
