# Lynia — UX & Usability Codebase Review

**Date:** 2026-07-17 · **Reviewer:** senior UX-engineering pass (routine) · **Scope:** shipped feature set. No new features, no architecture changes.

> **How this was run.** Phase 0 read `docs/KNOWN_BUGS.md` (764 lines) and the most recent
> `docs/UX-USABILITY-REVIEW-2026-07-16.md`, plus the one open sibling PR at the time (`#285`,
> bug-hunt routine, BH-13/BH-14 — mobile rider-board/active-job invalidation and bid-draft
> expiry; no overlap with the UX lane, no findings claimed here). Phase 0.5 re-verified a rotating
> sample of "→ FIXED / MOOT" cluster headers against current code (see below). Phase 1 ran the
> mandated agentic-loop hunt engine (`Workflow` over `.claude/workflows/lane-bug-hunt.js`, lane
> `"ux"`: 4 finder lenses → 3-skeptic adversarial verify → per-finding sibling-sweep) — one
> pre-requisite fix was needed first (see below). Phase 3 fixed all 7 confirmed findings via two
> parallel opus implementation agents (backend notification-coherence cluster; admin
> copy-honesty/empty-state cluster), each briefed with the verified file:line evidence and a
> concrete fix design so no re-derivation from memory was needed. **Model note:** per this
> routine's own model-fallback instruction, the hunt (Find/Verify/Sibling-sweep) ran on the
> session's default model (Sonnet 5) via the `Workflow` tool (32 sub-agents); the fix stage ran on
> two `opus` implementation agents as the routine's model-usage policy directs.
>
> **Pre-requisite fix.** `.claude/workflows/lane-bug-hunt.js`'s `meta.whenToUse` used string
> concatenation, which the `Workflow` tool's pure-literal validator rejects — this blocked the
> mandated hunt engine from running at all. Fixed to a single string literal (same issue
> independently already fixed on the still-open sibling PR `#285`, confirming this is a real,
> recurring blocker, not routine-specific). Committed first so the hunt could proceed.
>
> **✅ Execution status (2026-07-17).** All 7 distinct findings below are **implemented** on this
> branch (`pnpm typecheck` clean across all 5 packages — API 1003/1003 tests [+5], mobile
> 404/404 tests, admin has no test harness so its 4 copy/UX fixes are covered by
> `pnpm --filter @lynia/admin typecheck && pnpm --filter @lynia/admin lint`, both clean). Zero
> findings deferred.

---

## 1. Summary — the highest-impact fixes

1. **A missed SOS push left the counterparty with zero durable trace their delivery partner ever
   raised an SOS on a live trip.** SOS is the single most safety-critical event in the app; the
   counterparty push (`SosService.raise`) writes a durable `SosEvent` row, but `feedForUser` never
   read that table — so a dropped push (backgrounded app, dead FCM token — the same conditions an
   SOS is most likely to occur under) meant the other party could be told nothing ever happened.
   *(HIGH — FIXED, durable feed fallback)*
2. **A rider suspended/banned mid-delivery pushed the affected customer a best-effort "your rider
   changed" notice with no durable fallback if missed** — the underlying audit trail was targeted
   at the rider's id, not the customer's, so the existing account-status feed synthesis never
   matched. *(MEDIUM — FIXED, new order-targeted audit row + feed synthesis)*
3. **The KB-POD-DISPUTE Phase B "adjudicate delivered" admin override sends bespoke push copy
   (a 48-hour contest window for the customer, a "we reviewed your proof" for the rider) that a
   missed push loses entirely** — the durable feed showed the same generic "Delivery complete"
   copy as an ordinary trip, omitting the one fact that mattered: this was an ops override.
   *(MEDIUM — FIXED, feed now mirrors the actual push per role)*
4. **The admin "Mark delivered (code bypass)" button rendered fully enabled with no warning when
   an undelivered order had zero proof-of-drop evidence** — its own confirmation copy claims the
   override happens "only when the proof above confirms the drop", but the evidence card silently
   vanishes (rather than showing an empty state) when no proof was attached, so a rushed operator
   could bypass the delivery-code security control without realizing there was nothing to review.
   *(MEDIUM — FIXED, honest empty-state card + a warning in the confirmation modal)*
5. **Three admin confirmation modals made consequence claims the code doesn't back up**: the rider
   "Ban permanently" modal claimed bike registration and national ID are "blocked from
   re-registering" (neither is enforced — a duplicate ID only flags for manual KYC review); the
   order fare-adjust modal claimed refunds are "paid out via the rider's next settlement" (no live
   settlement mechanism exists — the sibling issue-refund modal on the same admin already
   describes this honestly); the "Close — no action" issue-resolution modal claimed "both sides
   are notified" when only the issue's opener is. All three corrected to match actual behavior,
   the middle one converging on the same honest wording its own sibling modal already used.
   *(MEDIUM × 3 — FIXED, copy-honesty)*

---

## 2. Findings table

| # | Journey / Area | Lens | File:line (at time of audit) | What the user experiences | Fix | Impact | Status |
|---|---|---|---|---|---|---|---|
| UX17-01 | SOS on a live trip | Notification-coherence | `apps/api/src/sos/sos.service.ts:82-93` (push), `apps/api/src/notifications/notifications.service.ts` `feedForUser` (no `SosEvent` read anywhere) | `SosService.raise` writes a durable `SosEvent` row and best-effort pushes the counterparty ("SOS on your delivery — the other party raised an SOS on this trip"). `feedForUser` never reads `SosEvent`, so a dropped push left zero durable in-app trace an SOS was ever raised — on the single most safety-critical event in the app. | New batched `sosEvent.findMany({ orderId: in orderIds, raisedByProfileId: not userId })` in `feedForUser`, synthesizing a row for the counterparty only (mirrors the push's own targeting — the raiser already knows), copy verbatim-matching the push. | High | ✅ Fixed (3 new cases in `notifications.service.spec.ts`) |
| UX17-02 | Rider standing change mid-delivery | Notification-coherence | `apps/api/src/admin/admin-riders.service.ts:194-214` (`notifyCustomersOfRiderStandingChange`, called from `suspendRider`/`banRider`) | Suspending/banning a rider with an active order best-effort pushes the affected customer ("An update on your delivery"). The durable audit row for the underlying `rider.suspend`/`rider.ban` action is targeted at the RIDER's id, so `feedForUser`'s existing account-status synthesis (`target: userId`) never matches for the customer — a dropped push left zero trace. | `notifyCustomersOfRiderStandingChange` now also writes an `AuditLog` row per active order (`target: orderId`, action `order.rider_standing_notice`, added to `RESERVED_AUDIT_ACTIONS`) in the same best-effort path as the push; `feedForUser` synthesizes from it for the customer view only (the rider already gets their own `rider.suspend`/`ban` account row). | Medium | ✅ Fixed (2 new cases in `admin-riders.service.spec.ts`, 1 in `admin-audit.service.spec.ts`) |
| UX17-03 | KB-POD-DISPUTE Phase B adjudication | Notification-coherence | `apps/api/src/admin/admin-orders.service.ts:222,248-267` (`adjudicateDelivered`) vs. `feedForUser`'s generic `completed` handling | `adjudicateDelivered` writes a plain `OrderEvent{status:"completed"}` (indistinguishable from an ordinary completion) then pushes bespoke copy — customer: "marked complete after review… report a problem within 48 hours"; rider: "we reviewed your proof". `feedForUser`'s generic `FEED_NOTICES.completed`/`FEED_NOTICES_RIDER.completed` rendered instead if the push was missed, omitting the one fact that mattered (this was an ops override with a contest window). | New batched `auditLog.findMany({ action: "order.adjudicate_delivered" })` over in-view orders builds a Set; the existing per-order/event loop swaps in the real, role-appropriate copy for `completed` events on adjudicated orders only (same override pattern already used for `cancelled`/`expired`). | Medium | ✅ Fixed (1 new case in `notifications.service.spec.ts`) |
| UX17-04 | Admin "Mark delivered (code bypass)" | Error/empty states | `apps/admin/app/orders/[id]/page.tsx:206` (proof card, `{o.deliveryProof ? (...) : null}`), `apps/admin/app/orders/[id]/OrderActions.tsx:45-75` (`AdjudicateDelivered`, gated only on `status==="undelivered" && rider`) | The KB-POD-DISPUTE Phase B action's own consequence copy says it applies "only when the proof above confirms the drop", but on the majority of undelivered orders (proof capture is optional, offered only at the door) the evidence card silently vanishes with no empty-state, while the "Mark delivered (code bypass)…" button renders fully enabled regardless — a rushed operator has no on-screen signal there's nothing to review. | Added an honest empty-state card ("No proof-of-drop evidence was submitted for this order") when `status==="undelivered"` and no proof exists; `AdjudicateDelivered` now takes `hasEvidence` and prepends a `tokens.color.danger` warning to its confirmation modal when false, dropping the misleading "only when the proof above confirms" clause in that case. | Medium | ✅ Fixed (no admin test harness in this repo — typecheck+lint clean, matching precedent for prior admin copy/UI fixes) |
| UX17-05 | Rider "Ban permanently" | Copy-honesty | `apps/admin/app/riders/[id]/RiderActions.tsx:63-68` | Claimed "Their account, bike registration and national ID are blocked from re-registering." Verified false for 2/3 claims: `bikeReg` has no uniqueness constraint anywhere in `becomeRider` (`apps/api/src/riders/rider.service.ts:116-199`); a duplicate national ID is explicitly documented in that file as "a FLAG for the KYC reviewer, never a block" — it only flags for manual review, never blocks signup. | Copy corrected: account is blocked, but a fresh signup with the same bike-reg/ID is not automatically prevented — a duplicate ID only flags for manual review, so ops vigilance is still needed. | Medium | ✅ Fixed |
| UX17-06 | Admin fare-adjust / refund | Copy-honesty | `apps/admin/app/orders/[id]/OrderActions.tsx:33-38` (`FareAdjust`) | Claimed "Cash refunds are paid out via the rider's next settlement." Verified false: `adjustFare` only overwrites `Order.agreedFare` and adjusts the prepaid commission ledger — no cash moves, no live settlement payout exists (`KB-SETTLEMENT-DROP`: the `Settlement` table is dormant). The sibling issue-refund modal on the SAME admin app already describes this honestly ("records the amount owed… automatic netting off the rider's settlement arrives with the commission/billing infra, not yet live"). | Copy corrected to match the sibling's already-honest wording — the refund is only *recorded*, not paid out automatically. | Medium | ✅ Fixed |
| UX17-07 | Admin "Close — no action" issue resolution | Copy-honesty | `apps/admin/app/issues/[id]/ResolveActions.tsx:81` | Claimed "Both sides are notified that the issue is closed… reopens if new evidence arrives." Verified false on both counts: `IssuesService.resolve` calls `notifyIssueResolved(result.openedByProfileId, …)` — only the single opener, for all three resolutions uniformly; and a repo-wide grep found no reopen/un-resolve endpoint anywhere (`resolve()`'s CAS guard is one-directional, `status: { not: "resolved" }`). | Copy corrected to "The reporting party is notified that the issue is closed with no action. It stays on record in the audit log." — dropped both unverifiable claims. | Medium | ✅ Fixed |

---

## 3. Phase 0.5 — cluster-claim re-verification

Rotated to three clusters not sampled by the two most recent runs (the 2026-07-16 bug-hunt PR
`#285` sampled Notifications/FCM and Mobile-journey-dead-ends): **Object-authz/IDOR cluster →
FIXED (verified)**, **KYC cluster → FIXED**, **Edge/abuse cluster → FIXED**. Two members each,
re-opened against current code:

- Object-authz/IDOR: `makeOffer`'s self-dealing guard (`offers.service.ts:38`,
  `order.customerId === riderId` check present) and `listForOrder`'s ownership gate
  (`offers.service.ts:161-167`, `order.customerId !== callerId` → `ForbiddenException`) — both
  present and correct.
- KYC: the webhook unsigned-fail-open guard (`kyc.controller.ts:71`, rejects unsigned webhooks in
  production or `KYC_PROVIDER=didit`) and the unique `kycRef` constraint
  (`schema.prisma:212`, `@unique @map("kyc_ref")`) — both present.
- Edge/abuse: the global `ThrottleGuard` (`app.module.ts:81`, `APP_GUARD` provider) and the 1MB
  body-parser cap (`main.ts:55-56`) — both present.

0/6 sampled members regressed. No fresh findings from this pass (unlike the 2026-07-16 interactive
review's IR16-01/02, which did find live members under a "→ FIXED" header).

---

## 4. Sibling-sweep

Per finding, before fixing, the pattern was distilled and the whole repo swept:

**UX17-01/02 (push-to-a-party with no feed fallback).** Enumerated every `notifyProfiles`/
`notifyOps`/`notifyOrderStatus`/`notifyIssueResolved`/`notifyNewOffer`/`notifyKycDecision` call
site outside `notifications.service.ts` itself:

```
grep -rn "\.notifyProfiles(\|\.notifyOps(\|\.notifyOrderStatus(\|\.notifyIssueResolved(\|\.notifyNewOffer(\|\.notifyKycDecision(" apps/api/src --include=*.ts | grep -v spec.ts | grep -v "notifications.service.ts"
```

19 hits across 8 files (post-fix line numbers shift slightly from the pre-fix audit since
`admin-riders.service.ts` gained lines; re-run and re-counted against the current tree). Disposition
of every hit:

- `matching.service.ts:160`, `admin-orders.service.ts:184`, `order-lifecycle.service.ts:184,803` —
  `notifyOrderStatus` calls; feed rows come from `OrderEvent` rows directly (`FEED_NOTICES`), not
  from the push call itself — already covered, no gap.
- `admin-orders.service.ts:258,263` — `adjudicateDelivered`'s pushes — **UX17-03, fixed**.
- `admin-riders.service.ts:202` — `notifyCustomersOfRiderStandingChange` — **UX17-02, fixed**.
- `admin-riders.service.ts:260,327,411` — `suspendRider`/`liftRider`/`clearHold` pushing the rider
  themselves — already covered by the existing `ACCOUNT_FEED_COPY`/`ACCOUNT_FEED_ACTIONS`
  synthesis (`rider.suspend`/`rider.lift`/`rider.clear_hold`, target=riderId matches the rider's
  own feed query) — no gap.
- `order-lifecycle.service.ts:786` — the rider-bail rebroadcast notice to the customer — already
  covered by the existing `cloneByOriginal` override in `feedForUser` (the "Your rider had to
  cancel" special-case) — no gap.
- `rider.service.ts:501,635` (`notifyKycDecision`) — already covered by `ACCOUNT_FEED_COPY`
  `rider.kyc_approve`/`rider.kyc_decline` — no gap.
- `issues.service.ts:76`, `sos.service.ts:76` — `notifyOps`, ops-only pushes; ops isn't a
  feed-holding party, not applicable.
- `issues.service.ts:285` (`notifyIssueResolved`) — already covered by the existing
  `ISSUE_RESOLUTION_FEED_COPY` synthesis (single-sided by design, see UX17-07 below) — no gap.
- `offers.service.ts:123` (`notifyNewOffer`) — already covered by the existing "New offer" `Offer`
  row synthesis — no gap.
- `sos.service.ts:88` — the SOS counterparty push — **UX17-01, fixed** (this is the original
  finding, not a sibling of itself).

**Result: exactly 2 vulnerable instances (UX17-01, UX17-02), both fixed this run. No siblings left
open.**

**UX17-05/06/07 (false-consequence-copy in admin `ConfirmModal`s).** Grepped every
`consequence=`-bearing block across `apps/admin`:

```
grep -rln "consequence=" apps/admin/app --include="*.tsx"
grep -rn "consequence=" apps/admin/app --include="*.tsx"
```

**17 `consequence` blocks across 6 files** (`KycDecision.tsx` ×2, `OrderActions.tsx` ×3,
`RiderActions.tsx` ×4, `ResolveActions.tsx` ×3, `customers/[id]/page.tsx` ×3,
`CustomerActions.tsx` ×2 — corrected from an earlier undercount of 9/4 files in this same pass,
which only checked the files the fix agents happened to touch). Three were false
(UX17-05/06/07, all fixed). The remaining 14 were individually re-opened and checked against
their backing code:

- `KycDecision.tsx` approve/decline (verified vs. `online-gate.ts` + `rider.service.ts` — "locks
  the application" at attempt 2 matches `kycAttempts >= 2` at `rider.service.ts:216`) — accurate.
- `OrderActions.tsx` `CancelOrder` ("rider gets no strike if the reason is not theirs" — matches
  the code comment at `order-lifecycle.service.ts:662-664`, "a customer cancel never strikes") —
  accurate.
- `RiderActions.tsx` suspend/lift/clear-hold (×4, including the two plain-string ones) — verified
  against `admin-riders.service.ts`'s `suspendRider`/`liftRider`/`clearHold` — accurate.
- `ResolveActions.tsx` refund (already honest — the wording UX17-06 now mirrors) and
  strike-rider — accurate.
- `customers/[id]/page.tsx` ×3 and `CustomerActions.tsx` ×2 (hold/lift/flag-account) — the
  "Flag account" false-consequence bug on this exact page was already fixed as `UX16-05`
  (2026-07-16); re-verified still intact, and the remaining hold/lift copy is accurate.

No further false claims found — the false-consequence-copy class (same bug family as
`UX15-07`/`UX16-05`) is now fully swept across every admin `ConfirmModal` in the app, not just
the 4 files the fix agents touched.

**UX17-04 (evidence-gated action with no evidence-state signal).** Grepped for other admin actions
whose copy references "the proof/evidence above" or similar conditional framing to check for a
sibling of the same "renders regardless of whether the referenced evidence exists" pattern:

```
grep -rniE "proof above|evidence above|shown above" apps/admin/app --include="*.tsx"
```

Only one hit — `AdjudicateDelivered`'s own consequence text (the finding itself). No sibling
action in the admin console references conditional on-page evidence the same way, so this is not
a recurring pattern elsewhere; fixed at its one site.

---

## 5. Notes on scope and process

- Model-per-phase: hunt (Find/Verify/Sibling-sweep, 32 sub-agents via `Workflow`) ran on the
  session's default model (Sonnet 5); the fix stage ran on two parallel `opus` implementation
  agents (backend notification-coherence cluster; admin copy/empty-state cluster), each briefed
  with the orchestrator's own independently-verified file:line evidence and a concrete fix design.
- The orchestrator independently re-read and verified every file the hunt cited (SosEvent schema,
  `feedForUser`'s existing synthesis patterns, `notifyCustomersOfRiderStandingChange`,
  `adjudicateDelivered`, all four admin `ConfirmModal` files, the order-detail page's proof card)
  before briefing the implementation agents, and re-verified the resulting diffs line-by-line
  after they returned, before committing.
- Both implementation agents worked on disjoint file sets (`apps/api/*` vs. `apps/admin/*`) in
  parallel with no merge conflicts; their combined diff was verified together
  (`pnpm typecheck && pnpm test`, full monorepo) before commit.

## 6. Needs-human-confirmation

None this pass — every finding above was verified directly against current code with quoted
evidence before being fixed, and both implementation agents' diffs were independently re-verified
by the orchestrator against that same evidence before commit.

## 7. Deferred / not fixed

None. All 7 findings from this pass were fixed in this run.
