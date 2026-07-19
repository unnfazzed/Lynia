# Lynia — UX & Usability Codebase Review

**Date:** 2026-07-19 · **Reviewer:** senior UX-engineering pass (routine) · **Scope:** shipped feature set. No new features, no architecture changes.

> **How this was run.** Phase 0 read `docs/KNOWN_BUGS.md` and the most recent
> `docs/UX-USABILITY-REVIEW-2026-07-18.md`. `mcp__github__list_pull_requests` (state=open) returned only
> the standing `release-please` bot PR (#324) — zero open `claude/*` sibling PRs at Phase 0 (the 23:00
> bug-hunt routine's PR, #323/BH-18..20, had already merged into `main`). Phase 0.5 re-verified a rotating
> sample of three "→ FIXED / MOOT" cluster headers against current code (see below). Phase 1 ran the
> mandated agentic-loop hunt engine (`Workflow({name: 'lane-bug-hunt'}, args: 'ux')`) — 4 finder lenses →
> 3-skeptic adversarial verify → per-finding sibling-sweep, 20 sub-agents total. Phase 3 independently
> re-read every cited file:line against current code before writing each fix (no fix was written from the
> hunt's description alone).
>
> **Environment note.** Fresh session with no installed dependencies — `pnpm install`, `pnpm exec prisma
> generate` (in `apps/api`), and `pnpm --filter @lynia/shared build` all had to run before `pnpm
> typecheck`/`pnpm test` would resolve `@lynia/shared`/`@prisma/client` imports. Once installed, typecheck
> and the full test suite were clean.
>
> **Model note.** The Agent/Task tool's `model` parameter was available; per this routine's own
> model-fallback instruction, the hunt (Find/Verify/Sibling-sweep, 20 sub-agents) ran on the `Workflow`
> tool's default agent model (Sonnet 5), and the fix stage ran directly on the orchestrating session (also
> Sonnet 5) rather than via separate implementation subagents, given the fixes' modest per-file scope
> (small copy/logic changes, ≤4 files each) once independently verified.
>
> **✅ Execution status (2026-07-19).** All 4 distinct findings below are **implemented** on this branch.
> `pnpm typecheck` clean across all 5 packages; `@lynia/api` 1065/1065 tests (+1 new — the other 3 fix
> sites share existing test files whose assertions were rewritten to check the corrected copy, not net-new
> cases), `@lynia/mobile` 449/449 tests (+4 new), `@lynia/admin` has no test harness so its empty-state and
> confirmation-copy fixes are `pnpm --filter @lynia/admin typecheck && pnpm --filter @lynia/admin
> lint`-verified only (both clean), matching this repo's established precedent.

---

## 1. Summary — the highest-impact fixes

1. **The admin issues queue told operators "No open issues" when open issues existed — just filtered to
   another tab.** `issues/page.tsx`'s empty state was a single hardcoded message regardless of the active
   status filter, unlike its sibling `orders`/`riders` pages (already fixed in earlier UX passes). The
   sibling-sweep also caught `customers/page.tsx` in the same unfixed state. *(MEDIUM — FIXED, both pages
   now use filter-aware empty-state copy)*
2. **Three surfaces told a customer their contest window was "48 hours" — a deadline nothing in the
   backend enforces.** `IssuesService.raise()` (the actual "report a problem" path an adjudicated-delivery
   contest goes through) has zero time-based gating; a customer who read the copy literally and waited 5
   days would wrongly believe they'd lost the right to dispute. *(MEDIUM — FIXED, the push/feed/admin copy
   across all 4 call sites now makes no time claim)*
3. **A rider's own "assigned"/"cancelled" feed-row tap detoured through a dead-control screen the
   equivalent push never visits.** `pushDestination` special-cases a rider's own `assigned` push straight
   to the live job screen (the only place with pickup/confirm/bail controls) and routes a rider's own
   `cancelled` push to the same screen (the only place with the "you still have the parcel, call the
   sender" hand-back guidance) — but `notificationRowDestination`, the feed's analogue, had no status
   awareness at all and always fell back to `/order/:id`, a screen with neither. *(MEDIUM — FIXED, the feed
   row now carries the viewer's per-order role + raw status so the client can replicate both special cases)*
4. **The same adjudication push thanked a rider "for adding the evidence" on orders where no evidence was
   ever submitted.** `adjudicateDelivered` has no precondition on proof-of-drop evidence existing — the
   admin console's own confirmation modal explicitly supports and warns about a zero-evidence override —
   yet the push and its feed mirror unconditionally claimed the team "reviewed your proof." *(LOW — FIXED
   as part of the same edit as #2, since both false claims live in the same push bodies)*

---

## 2. Findings table

| # | Journey / Area | Lens | File:line (at time of audit) | What the user experiences | Fix | Impact | Status |
|---|---|---|---|---|---|---|---|
| UX19-01 | Admin issues/disputes queue + customers directory | Error/empty states | `apps/admin/app/issues/page.tsx:66-80`; sibling `apps/admin/app/customers/page.tsx:91-105` | `issues/page.tsx` has a `FilterNav` (all/open/investigating/resolved) that changes the fetched rows via `?status=...`, but the connected-empty `EmptyState` was one static "No open issues" / "Disputes opened from the app land here with the order attached." for every filter value. Filtering to `resolved` with zero resolved rows — while OPEN issues sit elsewhere in the queue — told the operator "No open issues," a literally false claim on the safety/dispute desk. `customers/page.tsx` had the identical gap: `FilterNav` (all/active/on_hold/flagged) genuinely changes the query, but the empty state never varied with it. | Both pages: when a real filter is active, swap to filter-aware copy ("No issues in this view" / "Try a different status filter." and "No customers in this view" / "Try a different filter."), matching the pattern `orders/page.tsx`/`riders/page.tsx` already use. The reassuring unfiltered message is kept for `active === "all"`. | Medium | ✅ Fixed (no admin test harness — typecheck+lint clean) |
| UX19-02 | Customer contest / rider adjudication notice | Copy-honesty | `apps/api/src/admin/admin-orders.service.ts:204,275` (`adjudicateDelivered`); siblings `apps/api/src/notifications/notifications-feed.service.ts:256`, `apps/admin/app/orders/[id]/OrderActions.tsx:86` | The customer push, its feed-row mirror, and the admin confirmation modal all said the customer "can contest within 48 hours" / "report a problem within 48 hours." `IssuesService.raise()` (`issues.service.ts:55-87`) — the actual mechanism behind "report a problem" — never reads `completedAt` or any elapsed-time value; a report at day 30 succeeds identically to one at hour 1. A customer who took the stated deadline literally and waited would wrongly believe the option had expired. | Dropped the fabricated deadline from all 4 sites: customer push now reads "...open the app to report a problem." (no time bound); the admin modal reads "...can report a problem via the app at any time."; the JSDoc and feed mirror updated to match. Regression tests assert the corrected copy AND assert the "48 hours" string is absent. | Medium | ✅ Fixed (`@lynia/api` — 2 spec files updated) |
| UX19-03 | Rider "assigned"/"cancelled" in-app feed tap | Notification-coherence | `apps/mobile/src/push/push.ts:126-127,187,200-203` (`notificationRowDestination` vs. `pushDestination`); siblings same function, `status:"cancelled"` branch | `pushDestination` special-cases a rider's own `assigned` push to `/rider/job` (the only screen with pickup/confirm/bail controls — `/order/:id` shows only a ghost "Open your job" button) and a rider's own `cancelled` push to `/rider/job` (the only screen rendering `CancelledHandback`'s "you still have the parcel — call the sender" guidance; `/order/:id`'s `LiveTrackingCard` call button never renders for `cancelled`). `notificationRowDestination`, the feed's own destination function, took no `status` parameter at all, so tapping the identical feed row for either event always fell back to `/order/:id` — the dead-control screen the push deliberately avoids, on the two highest-stakes rider notifications ("you got a job, go do it" / "you're holding a parcel with nowhere to hand it back"). | `NotificationRow` (API + mobile) gained `to`/`status` fields on order-status rows, stamped from the same per-order voice (`isCustomerView`) already used to pick copy, and the raw `event.status`. `notificationRowDestination` now mirrors `pushDestination`'s two rider-only branches before falling back to `/order/:id`. | Medium | ✅ Fixed (`@lynia/api` 1 new test, `@lynia/mobile` 4 new tests) |
| UX19-04 | Rider adjudication push/feed | Copy-honesty | `apps/api/src/admin/admin-orders.service.ts:273-281`; sibling `apps/api/src/notifications/notifications-feed.service.ts:261` | `adjudicateDelivered` sends the rider "Our team reviewed your proof and confirmed this delivery. Thanks for adding the evidence." — and the customer "Our team reviewed the rider's proof..." — unconditionally, with no check on `deliveryProofKey`/proof-of-drop existing. Proof-of-drop capture is optional (IR16-11) and the admin console's own modal explicitly supports and warns about a zero-evidence override ("No proof-of-drop evidence was submitted for this order — you're overriding based on the reason and note alone"). A rider (or customer) reading either push after a no-evidence override is told a review of evidence that never happened. | Both pushes (and the feed mirror) reworded to "Our team reviewed the delivery and marked it complete" / "...confirmed it as complete" — accurate regardless of whether evidence was attached, since it's the same edit site as UX19-02. | Low | ✅ Fixed (same edit + tests as UX19-02) |

---

## 3. Phase 0.5 — cluster-claim re-verification

Rotated to three clusters not sampled by the two most recent runs (07-18 UX picked Notifications/FCM,
Money-fraud, Ship/infra correctness; 07-18 night bug hunt picked Auth/identity, Data-integrity,
Money-fraud) — **KYC**, **Object-authz/IDOR**, **Mobile journey dead-ends**. Two members each, re-opened
against current code:

- **KYC cluster:** the replay/reorder monotonic `kycResolvedAt` guard — `apps/api/src/riders/rider.service.ts:434`,
  `updateMany({ where: { kycRef, OR: [{ kycResolvedAt: null }, { kycResolvedAt: { lt: eventAt } }] } })`,
  confirmed present and exercised by `rider.service.spec.ts:740,854` — intact.
- **Object-authz/IDOR cluster:** the self-dealing wash-trade guard — `apps/api/src/offers/offers.service.ts:38`,
  `if (order.customerId === riderId) { ... }` — and the offer-assignment TOCTOU guard —
  `offers.service.ts:106`, `Prisma.sql\`SELECT status FROM orders WHERE id = ${input.orderId}::uuid FOR UPDATE\`` —
  both confirmed present, the latter exercised by `offers.service.spec.ts:126`'s FOR-UPDATE re-check test.
- **Mobile journey dead-ends cluster:** the `markUndelivered` flow (present across `apps/mobile/app/rider/job.tsx`,
  `apps/api/src/orders/order-lifecycle.service.ts`, `apps/api/src/admin/admin-riders.service.ts`,
  `apps/api/src/riders/reliability.ts`) and the rider bid-draft persistence / sign-out wipe
  (`apps/mobile/src/logic/rider-bid-draft.ts`, `apps/mobile/src/auth/session.ts` clearing both the job key
  and the bid-draft key) — both confirmed present.

0/6 sampled members regressed. No fresh findings from this pass.

---

## 4. Sibling-sweep

**UX19-01 (filter-blind empty state).**

```
grep -rln "EmptyState" apps/admin/app --include=*.tsx
grep -rln "FilterNav" apps/admin/app --include=*.tsx
grep -rn "searchParams" apps/admin/app --include=*.tsx -l
grep -rln "FilterNav" apps/admin/app --include=*.tsx | grep -v components/FilterNav.tsx
```

4 hits: `orders/page.tsx`, `riders/page.tsx` (both already filter-aware from earlier UX passes — no
action), `issues/page.tsx` (fixed this run), `customers/page.tsx` (fixed this run). Re-run post-fix:
all 4 pages now vary their empty-state copy with the active filter.

**UX19-02/04 (fabricated deadline + unconditional evidence-thanks — same push bodies, fixed together).**

```
grep -rn "within 48 hours\|48-hour\|48h contest" apps/api/src apps/admin/app apps/mobile
grep -rniE "reviewed (the|your|rider's) proof|thanks for (submitting|providing|adding)" apps/api/src apps/admin/app
```

Pre-fix: 4 live-code hits for the "48 hours" claim (`admin-orders.service.ts:204,275`,
`notifications-feed.service.ts:256`, `OrderActions.tsx:86`) and 3 for the evidence claim
(`admin-orders.service.ts:273-277,278-281`, `notifications-feed.service.ts:261`) — all in the SAME
`adjudicateDelivered`/feed-mirror code path, fixed in one edit each. Post-fix: 0 live-code hits for either
phrase (2 residual hits are the routine's own explanatory code comments referencing the fixed history, not
user-facing copy — verified by reading both lines).

**UX19-03 (status-blind feed routing).**

```
grep -rn "notificationRowDestination\|pushDestination" apps/ --include="*.ts" --include="*.tsx"
grep -n 'return "/rider\|toRider ?\|RIDER_JOB_SCREEN_STATUSES\|RIDER_BOARD_STATUSES' apps/mobile/src/push/push.ts
grep -rln "CancelledHandback\|still have the parcel" apps/mobile
grep -n 'isActive || order.status ===' apps/mobile/app/order/[id].tsx
```

The hunt's sibling-sweep identified the `cancelled` branch as a confirmed NEW sibling of the anchor
`assigned` bug (both share the single `notificationRowDestination` call site, so one fix — adding
`status`-aware routing mirroring `pushDestination`'s two branches — closes both). Checked whether
`completed` (routed by `pushDestination` to `/rider`, the board) is a third sibling: `/order/:id` DOES
render a valid summary for a rider-viewed `completed` order (unlike the dead-control `assigned`/`cancelled`
cases), so it was deliberately left routing to `/order/:id` from the feed — not a dead end, just a
different-but-valid landing spot — and is not fixed here. Verified by a new test
(`leaves every other rider-voiced status routed to /order/:id`).

**Result: every sibling identified was fixed this run (or explicitly evaluated and left as a non-bug —
`completed`). No new ledger OPEN rows.**

---

## 5. Notes on scope and process

- The hunt (`Workflow` lane `"ux"`) ran 4 finder lenses (error-empty-states, copy-honesty, recoverability,
  notification-coherence) → 3-skeptic adversarial verify per candidate → a repo-wide sibling-sweep per
  survivor. 4 candidates found, all 4 survived verification (11/12 "real" votes — one dissent on severity
  only, not on whether the finding was real); 1 of 4 lenses (recoverability) returned zero findings.
- Every file:line cited by the hunt was independently re-opened and re-read by the orchestrating session
  before writing each fix — the evidence quoted in the findings table above was taken from that
  independent read, not from the hunt's own description.
- UX19-02 and UX19-04 share the exact same push-body code (both false claims live in the same two
  `notifyProfiles` calls inside `adjudicateDelivered`, plus the same feed-mirror block), so they were fixed
  in one coordinated edit rather than two separate patches — kept as two ledger rows since they are
  independently-verified, independently-severed defects (a fabricated deadline vs. a false evidence claim).
- This was a fresh session with no installed dependencies. `pnpm install`, `pnpm exec prisma generate` (in
  `apps/api`), and `pnpm --filter @lynia/shared build` all had to run before `pnpm typecheck`/`pnpm test`
  could resolve `@lynia/shared` and `@prisma/client` imports across the monorepo — done once, up front,
  before any fix work.

## 6. Needs-human-confirmation

None this pass — every finding was verified directly against current code with quoted evidence before
being fixed.

## 7. Deferred / not fixed

None. All 4 findings from this pass were fixed in this run, along with every sibling the sweep found.
