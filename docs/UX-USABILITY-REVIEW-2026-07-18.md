# Lynia — UX & Usability Codebase Review

**Date:** 2026-07-18 · **Reviewer:** senior UX-engineering pass (routine) · **Scope:** shipped feature set. No new features, no architecture changes.

> **How this was run.** Phase 0 read `docs/KNOWN_BUGS.md` and the most recent
> `docs/UX-USABILITY-REVIEW-2026-07-17.md`, plus the one open sibling PR at the time (`#295`,
> bug-hunt routine — mobile profile-setup dead end (BH-15), `advanceM` 409 reconciliation (BH-16),
> pickup-checklist sign-out wipe (BH-17); no overlap with the UX lane, no findings claimed here).
> Phase 0.5 re-verified a rotating sample of three "→ FIXED / MOOT" cluster headers against current
> code (see below). Phase 1 ran the mandated agentic-loop hunt engine (`Workflow({name:
> 'lane-bug-hunt'}, args: 'ux'`) — 4 finder lenses → 3-skeptic adversarial verify → per-finding
> sibling-sweep, 24 sub-agents total. Phase 3 independently re-verified every cited file:line against
> current code before writing each fix (no fix was written from the hunt's description alone).
>
> **Environment note.** This was a fresh session with no installed dependencies — `pnpm install`,
> `prisma generate`, and `pnpm --filter @lynia/shared build` all had to run before `pnpm typecheck`
> would resolve `@lynia/shared`/`@prisma/client` imports. Once installed, typecheck and the full test
> suite were clean.
>
> **Model note.** The Agent/Task tool's `model` parameter was available; per this routine's own
> model-fallback instruction the hunt (Find/Verify/Sibling-sweep, 24 sub-agents) ran on the session's
> default model (Sonnet 5) via the `Workflow` tool, and the fix stage ran directly on the orchestrating
> session (also Sonnet 5) rather than via separate implementation subagents, given the fixes' modest
> per-file scope (small copy/logic changes, ≤2 files each) once independently verified.
>
> **✅ Execution status (2026-07-18).** All 5 distinct findings below are **implemented** on this
> branch. `pnpm typecheck` clean across all 5 packages; `@lynia/api` 1021/1021 tests (+9 new),
> `@lynia/mobile` 415/415 tests (untouched — no mobile changes this run), `@lynia/admin` has no test
> harness so its 404-reason and copy-honesty fixes are `pnpm --filter @lynia/admin typecheck && pnpm
> --filter @lynia/admin lint`-verified only (both clean), matching this repo's established precedent.

---

## 1. Summary — the highest-impact fixes

1. **The admin console told operators to wait for an unshipped feature when the real story was "this
   record doesn't exist."** `adminFetchResult` collapsed every HTTP 404 — whether the route simply
   doesn't exist yet, or the route matched and correctly reported a missing order/rider/customer/issue
   — into the same "this endpoint hasn't shipped yet" banner. A stale bookmark, a purged record, or a
   typo'd id on any of the 5 admin detail pages left the operator with false and actively misleading
   guidance. *(MEDIUM — FIXED, a new `not-found` reason distinguishes the two cases via the response
   body)*
2. **Two admin confirmation modals made money/discipline claims the code doesn't back up.** The
   fare-adjust modal said commission netting to the rider "isn't live yet" when it already happens
   automatically in the same transaction; the cancel-order modal implied a reason-conditional rider
   strike that the code never applies under any reason. *(MEDIUM × 2 — FIXED, copy-honesty)*
3. **A held/lifted customer got zero signal of any kind — no push, no feed row.**
   `AdminCustomersService` had no `NotificationsService` dependency at all, unlike its rider-standing
   counterpart. The same "money/standing action, zero notification" gap recurred in three siblings: a
   manual wallet credit, a fare correction, and a rider ban's missing self-notification. *(MEDIUM —
   FIXED, all four sites now push + have a durable feed fallback)*
4. **`liftRider` never told the customer the "we're reviewing this trip" alarm was resolved.**
   `suspendRider`/`banRider` push the customer on the rider's active order that something's under
   review; `liftRider` — the direct undo, most likely to fire on that SAME still-active order — left
   that notice permanently unresolved. *(MEDIUM — FIXED, a resolved-copy variant + a distinct feed row)*

---

## 2. Findings table

| # | Journey / Area | Lens | File:line (at time of audit) | What the user experiences | Fix | Impact | Status |
|---|---|---|---|---|---|---|---|
| UX18-01 | Admin order/rider/rider-KYC/customer/issue detail | Error/empty states | `apps/admin/app/lib/api.ts:47-58` (`adminFetchResult`), `apps/admin/app/components/states.tsx` | `adminFetchResult` mapped ANY HTTP 404 to `reason:"not-implemented"`. But `GET /admin/orders/:id`, `/admin/riders/:profileId`, `/admin/riders/:id/kyc`, `/admin/customers/:id`, `/admin/issues/:id` all deliberately `NotFoundException` a well-formed-but-missing id (`admin.controller.ts:109-114,127,135,152`; `admin-issues.controller.ts:28`) — so a stale link, purged record, or typo told the operator "This endpoint hasn't shipped yet… it will show live data once the endpoint lands" instead of "record not found." | 404 now parses the response body: Nest's own unmatched-route 404 always reads `Cannot <METHOD> <path>` (no controller matched anywhere) — anything else is a real domain 404, mapped to a new `"not-found"` `AdminReason` with honest "record not found — check the id or go back to the list" copy in `OfflineBanner`/`connOffLabel`/`reasonTitle`/`reasonLine`. All 5 detail pages already route through these shared helpers, so one fix covers all 5. | Medium | ✅ Fixed (no admin test harness — typecheck+lint clean) |
| UX18-02 | Admin "Adjust fare / record refund" | Copy-honesty | `apps/admin/app/orders/[id]/OrderActions.tsx:34-39` (`FareAdjust`) | Claimed "automatic netting off the rider's settlement arrives with the commission/billing infra (not yet live)." False for this action: `AdminOrdersService.adjustFare` (`admin-orders.service.ts:291-372`) already auto-debits/credits the rider's real prepaid COMMISSION wallet in the SAME transaction via `wallet.adjustCommissionInTx` whenever the order is completed with a charged `ride_commission` ledger row (shipped WD-001/WD-012…015). The identical sentence is accurate on the sibling issue-refund modal, which really doesn't touch the wallet — it was copy-pasted onto `FareAdjust` during the UX17-06 fix without checking the two paths differ. | Copy corrected: "this only corrects the recorded fare... if the order is already completed, the rider's prepaid commission balance is adjusted automatically in the same step to match the corrected fare." | Medium | ✅ Fixed (no admin test harness — typecheck+lint clean) |
| UX18-03 | Admin "Cancel order" | Copy-honesty | `apps/admin/app/orders/[id]/OrderActions.tsx:108-113` (`CancelOrder`) | Claimed "the rider gets no strike if the reason is not theirs" — implying a reason-conditional consequence. `AdminOrdersService.cancelOrder` (`admin-orders.service.ts:114-186`) never inspects `input.reason` and never touches `Rider.cancelStrikes` under any reason; the only writer of `cancelStrikes` is the rider-initiated `OrderLifecycleService.cancel`, a completely separate code path gated on `isRider`. | Copy corrected: "This action never strikes the rider — a strike is only recorded when a rider cancels their own job, never from an ops-initiated cancellation." | Medium | ✅ Fixed (no admin test harness — typecheck+lint clean) |
| UX18-04 | Customer hold/lift, wallet credit, fare-adjust, rider ban | Notification-coherence | `apps/api/src/admin/admin-customers.service.ts:142,163`; siblings `apps/api/src/wallet/wallet.service.ts:464` (`creditManual`), `apps/api/src/admin/admin-orders.service.ts:291` (`adjustFare`), `apps/api/src/admin/admin-riders.service.ts:354` (`banRider`) | `holdCustomer`/`liftCustomerHold` had NO `NotificationsService` dependency at all — a held customer's only signal was a 403 the next time they tried to broadcast; lifting a hold gave zero signal either. `wallet.creditManual` had the identical gap (no push when a rider's balance changes). `adjustFare` had a `NotificationsService` but never called it (unlike its siblings `cancelOrder`/`adjudicateDelivered` in the same file). `banRider` pushed the affected customers but — unlike `suspendRider`/`liftRider`/`clearHold` in the same file — never pushed the banned rider themselves. | `NotificationsService` (optional, mirroring the existing admin-orders/admin-riders pattern) injected into `AdminCustomersService` + `WalletService`; `holdCustomer`/`liftCustomerHold`/`creditManual` push post-commit; `customer.hold`/`customer.lift`/`wallet.credit` added to `ACCOUNT_FEED_COPY` (durable feed fallback — all three audit rows already target the profile id, so no new audit write needed); `adjustFare` now pushes both parties; `banRider` now also pushes the rider themselves. | Medium | ✅ Fixed (6 new cases across 5 spec files) |
| UX18-05 | Rider standing restored mid-delivery | Notification-coherence | `apps/api/src/admin/admin-riders.service.ts:293-348` (`liftRider`); contrast `:275-285` (`suspendRider`) | `suspendRider`/`banRider` both call `notifyCustomersOfRiderStandingChange` — best-effort push + a durable `order.rider_standing_notice` audit row telling the customer "there's a change with your assigned rider… our team is reviewing this trip." `liftRider` — the direct undo, most likely to fire while the SAME rider is still assigned to the SAME active order — never calls it, leaving that alarming notice permanently unresolved in the customer's feed/push history even after the rider clears review and the delivery continues normally. | `notifyCustomersOfRiderStandingChange` takes a `resolved` flag (default `false`); `resolved=true` (called only from `liftRider`) swaps in "your delivery is back on track — the review of your assigned rider is complete" copy and writes a distinct `order.rider_standing_resolved` audit action (added to `RESERVED_AUDIT_ACTIONS`) so the two notices read as separate rows instead of one that silently repeats. `feedForUser` synthesizes the resolution row the same way as its notice sibling. | Medium | ✅ Fixed (3 new cases across 2 spec files, plus an extended existing `admin-audit.service.spec.ts` case) |

---

## 3. Phase 0.5 — cluster-claim re-verification

Rotated to three clusters not sampled by the three most recent runs (07-17 UX picked Object-authz/IDOR,
KYC, Edge/abuse; 07-17 deep sweep picked Auth/identity, Data-integrity, Money-fraud; 07-17 bug hunt
picked Notifications/FCM, Edge/abuse, Mobile journey dead-ends) — **Notifications/FCM**, **Money-fraud**,
**Ship/infra correctness**. Two members each, re-opened against current code:

- Notifications/FCM: dead-token pruning (`notifications.service.ts:78,368-370`, `deviceToken.deleteMany`
  fires on an explicit `invalidToken` result, confirmed by `notifications.service.spec.ts` asserting it
  does NOT prune on a transient throw) and the `sendEach` ≤500-per-batch chunking (`fcm.push.ts:109-146`,
  comment + chunking loop present) — both intact.
- Money-fraud: `settlements.service.ts` re-read in full — confirmed still a read-only view over the
  prepaid-per-ride model (`SettlementsService` docblock: "this console stays read-only by design"); no
  `recordPayment`/`adjustFare`-driven settlement, refund-netting, or auto-pause mechanics exist anywhere
  in the file.
- Ship/infra correctness: the Cloud Run request-timeout note (`infra/terraform/lb.tf:66`, "the Cloud Run
  service's OWN request timeout, set via `--timeout 3600`") and the WIF/keyless-deploy files
  (`infra/terraform/wif.tf`, referenced from `.github/workflows/release.yml` and three other workflows)
  — both present.

0/6 sampled members regressed. No fresh findings from this pass.

---

## 4. Sibling-sweep

**UX18-01 (404 mislabeling).** Enumerated every `adminFetchResult<...>(...)` call site:

```
grep -rn "adminFetchResult<" apps/admin/app --include=*.tsx
grep -rn "NotFoundException(" apps/api/src/admin/admin.controller.ts apps/api/src/issues/admin-issues.controller.ts
```

15 call sites total. 5 front an endpoint with a genuine per-record `NotFoundException` — orders, riders,
riders/:id/kyc, customers, issues detail — all 5 share the single `adminFetchResult`/`states.tsx` code
path, so one fix at the source closes all 5. The remaining 10 (list/overview/sos/cash-settlements reads)
never throw a domain 404 today — `"not-implemented"` stays the correct, accurate reason for those.

**UX18-02/03 (false-consequence copy).**

```
grep -rEzo "commission/billing\s*\n?\s*infra \(not yet live\)" $(git ls-files apps/admin/app | grep -E '\.(tsx|ts)$')
grep -rn "cancelStrikes" apps/api/src | grep -v spec
grep -n "consequence=" -A3 -r apps/admin
```

The "not yet live" phrase appears exactly twice — the `FareAdjust` modal (false, fixed) and the sibling
issue-refund modal (already accurate, unchanged). `cancelStrikes` has exactly one writer
(`order-lifecycle.service.ts`'s rider-initiated `cancel()`) — confirming `cancelOrder` truly never
touches it. The broader `consequence=` sweep (17 blocks across 6 admin files, carried over from
UX17-05/06/07's full pass) found no further false claims this run.

**UX18-04 (money/standing action with no notification).**

```
grep -n "NotificationsService\|notifyProfiles\|constructor" apps/api/src/wallet/wallet.service.ts apps/api/src/admin/admin-orders.service.ts apps/api/src/admin/admin-riders.service.ts apps/api/src/admin/admin-customers.service.ts
grep -n "ACCOUNT_FEED_COPY\|ACCOUNT_FEED_ACTIONS" -A20 apps/api/src/notifications/notifications-feed.service.ts
```

Of the four admin/wallet services that mutate money or standing, `AdminCustomersService` and
`WalletService` had zero `NotificationsService` dependency; `AdminOrdersService.adjustFare` and
`AdminRidersService.banRider` had the dependency but left it unused for this specific action. All four
fixed this run; `RESERVED_AUDIT_ACTIONS` already listed `customer.hold`/`customer.lift`/`wallet.credit`
(from DS16-01/WD-002), so only `ACCOUNT_FEED_COPY` needed the three new entries — no new audit write, no
migration.

**UX18-05 (unresolved standing notice).**

```
grep -rn "notifyCustomersOfRiderStandingChange" --include="*.ts" .
```

4 hits: the method definition, `suspendRider`, `banRider`, and (after the fix) `liftRider`. `clearHold`
is not a sibling of this gap — it only ever applies to a never-suspended, always-`active` rider, so no
`order.rider_standing_notice` could exist for that rider to resolve.

**Result: every sibling identified was fixed this run. No new ledger OPEN rows.**

---

## 5. Notes on scope and process

- The hunt (`Workflow` lane `"ux"`) ran 4 finder lenses (error-empty-states, copy-honesty,
  recoverability, notification-coherence) → 3-skeptic adversarial verify per candidate → a
  repo-wide sibling-sweep per survivor. 5 candidates found, all 5 survived verification unanimously
  (15/15 "real" votes); 1 of 4 lenses (recoverability) returned zero findings.
- Every file:line cited by the hunt was independently re-opened and re-read by the orchestrating
  session before writing each fix — the evidence quoted in the findings table above was taken from
  that independent read, not from the hunt's own description.
- This was a fresh session with no installed dependencies. `pnpm install`, `pnpm exec prisma
  generate` (in `apps/api`), and `pnpm --filter @lynia/shared build` all had to run before
  `pnpm typecheck`/`pnpm test` could resolve `@lynia/shared` and `@prisma/client` imports across the
  monorepo — done once, up front, before any fix work.

## 6. Needs-human-confirmation

None this pass — every finding was verified directly against current code with quoted evidence
before being fixed.

## 7. Deferred / not fixed

None. All 5 findings from this pass were fixed in this run, along with every sibling the sweep found.
