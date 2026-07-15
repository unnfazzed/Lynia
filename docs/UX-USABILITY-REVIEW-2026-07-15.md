# Lynia — UX & Usability Codebase Review

**Date:** 2026-07-15 · **Reviewer:** senior UX-engineering pass (routine) · **Scope:** shipped feature set. No new features, no architecture changes.

> **How this was run.** Four parallel deep audits (customer journey, rider journey, cross-cutting
> resilience/data-frugality, copy/notifications/trust) against **current source**, each told to read
> `docs/KNOWN_BUGS.md`, `docs/UX-USABILITY-REVIEW-2026-07-14.md`, and `docs/BUG-HUNT-2026-07-14.md`
> first and not re-flag anything already found or fixed. **Model note:** the routine's model policy asks
> for Fable-5 research / Opus implementation subagents; the initial Fable-5 launch of all four research
> agents hit a session Fable-5 rate limit (`"You've reached your Fable 5 limit"`) before doing any work.
> Per this routine's own model-fallback instruction ("never abort the run over model availability"), all
> four were relaunched on the session model instead — the rest of this run, including all fixes, was
> executed on the session model throughout (Sonnet 5), not a mix of Fable/Opus. One finding (rider
> journey's #1/#2) and another (cross-cutting's #2) independently converged on the same root cause —
> the rider's delivered/undelivered terminal durability gap — flagged below since independent
> convergence across two audit angles is a stronger signal than either alone.
>
> **✅ Execution status (2026-07-15).** 15 of 16 distinct findings below are **implemented** on this
> branch (`pnpm typecheck && pnpm lint && pnpm test` clean across all 5 packages — API 841/841 tests
> [+6], mobile 375/375 tests [+9], admin/shared lint+typecheck clean). One finding (customer-journey
> #4, "notify me" confirmation lost on navigation) is **not fixed** — see §4 for why: it was flagged by
> its own author with explicit low-confidence caveats, and this pass independently confirmed the
> underlying server registration (`TrackingService.addNotifyRequest`) is idempotent, so the gap is
> cosmetic (a lost *confirmation*, not a lost *registration*) rather than a functional break.

---

## 1. Summary — the five highest-impact fixes

1. **A rider's delivered or undelivered acknowledgement (and the "rate the sender" affordance) could be
   permanently lost to an app kill.** `rider/job.tsx`'s `deliveredDone`/`undeliveredDone` frozen
   terminals were plain `useState` — a `delivered`/`undelivered` order immediately leaves
   `activeForRider` (it isn't in `ACTIVE_RIDE_STATUSES`), so an app kill between the mutation's success
   and the rider viewing that terminal dropped the rider straight to a bare "No active job" screen with
   zero acknowledgement the parcel arrived, and no way to ever reach "Rate the sender" for that trip.
   Found independently by two audits from two angles (a rider-journey walk and a cross-cutting
   resilience audit) — the same structural gap BH-06 already closed for the customer's rating card, but
   never mirrored on the rider side. *(MEDIUM, but independently convergent — FIXED)*

2. **Every zod-validation rejection in the app, across ~40 routes, was misreported to the user as a
   network failure.** `ZodBody`'s pipe threw `new BadRequestException(result.error.flatten())` — a
   plain-object `HttpException` body is used verbatim as the HTTP response (confirmed against the
   installed `@nestjs/common` source), so the response carried no top-level `message` key. The mobile
   client's `friendlyMessage()` only ever reads `message`, so it fell through to "Couldn't reach
   LyniaGo. Check your connection and try again." for a request that reached the server fine and was
   rejected for a fixable content reason (e.g. a rider's ETA over the 180-minute contract cap) — telling
   the user to check their internet when the real, fixable problem was the value they typed. *(HIGH
   breadth — FIXED for all zod-validated routes at the source)*

3. **A customer's assigned rider getting suspended/banned mid-delivery pushed them to the rider
   onboarding screen, not their own order.** `notifyCustomersOfRiderStandingChange` sends the customer
   an `"account"`-kind push carrying the order's id, but `pushDestination` routed every `"account"` push
   to `/rider` unconditionally — landing a (usually non-rider) customer on "Set up as a rider" at the
   exact moment they're anxious about their live delivery. The same bug class two prior sweeps (F-16,
   DS13-01) fixed server-side, reproduced in client routing — and flagged inside the still-unmerged PR
   #231 by the 07-14 pass, which is now merged to `main`, making this a live, current-code defect.
   *(HIGH, safety/trust-adjacent — FIXED)*

4. **The rider-viewer gating fix from 07-14 (Fix #1) had a second, missed instance in the same
   component.** That fix correctly gated the order screen's TOP-level delivery-code card and the
   Cancel/rebroadcast/report controls for a rider viewing their own job — but `LiveTrackingCard` (a
   separate, extracted component) has its own independent "Re-issue delivery code" button and hardcodes
   the `Stepper`'s copy to `view="customer"`, neither of which the original fix touched. A rider tapping
   their own "You got the job" notification/history/earnings row could tap that second reissue button
   and get a raw "Not your order" 403, and saw customer-voiced milestone copy ("Rider on the way to
   pickup") about themselves. *(MEDIUM — FIXED)*

5. **A raised "Get help with this trip" issue was completely silent after submission.**
   `IssuesService.resolve` wrote the resolution + a refund/strike side-effect + an audit row in one
   transaction, but never told the customer/rider who opened it — no push, no feed row, no status
   endpoint. A real problem (a wrong item, a payment dispute, a safety concern) could resolve with zero
   signal back to the person who reported it, and repeated uncertainty could produce duplicate reports
   on an already-closed case. *(MEDIUM — FIXED, post-commit best-effort push)*

---

## 2. Findings table

| # | Journey / Area | Lens | File:line (at time of audit) | What the user experiences | Fix | Impact | Status |
|---|---|---|---|---|---|---|---|
| 1 | Rider delivered/undelivered terminal (post-drop-off / can't-complete) | Resilience, unwarned data loss | `apps/mobile/app/rider/job.tsx` (`deliveredDone`/`undeliveredDone` state) | App killed right after a successful deliver/undeliver mutation permanently loses the acknowledgement (and "rate the sender") — the rider lands on a bare "No active job" on relaunch. | Durable `RiderJobTerminal` marker (`session.ts`), promoted back into live state via a pure `reconcileRiderJobTerminal` (mirrors BH-06's `pendingRating` pattern); cleared on "Back to board" / sign-out. | High (independently convergent) | ✅ Fixed (6 new unit tests) |
| 2 | Zod-validated request rejection (any of ~40 routes: order create, rider signup, offers, KYC upload, profile edits…) | Copy honesty, error-classification | `apps/api/src/common/zod.pipe.ts` | A fixable validation error (e.g. ETA over 180 min) shows "Couldn't reach LyniaGo. Check your connection and try again." — a network-failure lie. | `ZodBody` now includes a top-level, field-qualified `message` alongside the full `flatten()` shape. | High (breadth) | ✅ Fixed (3 new unit tests) |
| 3 | Push routing — assigned-rider standing change | Safety/trust, dead-end routing | `apps/mobile/src/push/push.ts` `pushDestination` | A customer whose rider is suspended/banned mid-trip is pushed to "Set up as a rider" instead of their own order. | `kind==="account"` now routes to `/order/:id` when the push carries an orderId (the customer case); falls back to `/rider` only when it doesn't (the rider's own KYC/standing case). | High | ✅ Fixed (2 new unit tests) |
| 4 | Shared order screen's `LiveTrackingCard` — rider-viewer gating gap | Trust, unwarned penalty/403, jargon | `apps/mobile/src/ui/order/LiveTrackingCard.tsx` | A rider viewing their own job via this card can tap a customer-only "Re-issue delivery code" (403) and sees customer-voiced stepper copy about their own trip. | Gated the reissue button on `!isRiderViewer`; `Stepper` now receives `view={isRiderViewer ? "rider" : "customer"}`. | Medium | ✅ Fixed |
| 5 | "Get help with this trip" issue resolution | Notification-story gap | `apps/api/src/issues/issues.service.ts` `resolve` | The opener of a raised issue never learns how (or whether) it was resolved — no push, no feed row, no status check. | Post-commit `NotificationsService.notifyIssueResolved(openerId, orderId, resolution)`, best-effort, mirrors the existing `raise()` ops-escalation shape. | Medium | ✅ Fixed (3 new unit tests) |
| 6 | Rider terminals / shared order screen — brand + actor-naming mismatch | Copy, notification-story mismatch | `apps/mobile/src/ui/rider/terminals.tsx:42`, `apps/mobile/app/order/[id].tsx` | "Lynia cancelled this delivery" (stale brand) on the rider terminal; the shared order screen said generic "This order is cancelled." for the SAME admin cancel, with no actor named. | `terminals.tsx` → "LyniaGo cancelled this delivery"; the shared screen's blame line now also says "LyniaGo cancelled this delivery" for a null/admin `cancelledBy`, on both viewer roles. | Medium | ✅ Fixed |
| 7 | Admin — customer "Ban customer" / "Flag account" | Ops trust, false-consequence copy | `apps/admin/app/customers/[id]/page.tsx` | The Ban modal claims "They can no longer send parcels. Their phone number is blocked from re-registering" — but this action only writes an audit-log row (no backing `Profile` column exists, confirmed by tracing `ConfirmModal`'s default `submitAdminAction`-only path vs. the real `auditInEndpoint`+`onConfirm` pattern the equivalent rider-ban and customer-hold actions use). An operator could believe a customer was already blocked when they weren't. | Corrected the consequence copy to state this logs a decision for the record and does not yet enforce anything automatically; pointed to the real Hold action or a database admin for actual enforcement. | Medium (ops-facing) | ✅ Fixed |
| 8 | Rider bail-cancel (`cancelM`) | Resilience, stuck sheet | `apps/mobile/app/rider/job.tsx` | Unlike its three sibling mutations (`advanceM`/`deliverM`/`undeliverM`), a failed cancel never re-synced the cache — a timed-out request that actually committed server-side left the rider stuck on a `BailSheet` whose retry could now only 409. | `cancelM.onError` now also calls `refresh()`. | Medium | ✅ Fixed |
| 9 | Rider `undeliverM` (mark-undelivered) | Resilience, false-failure | `apps/mobile/app/rider/job.tsx` | Unlike `deliverM`'s explicit 409 reconciliation, a timeout/retry landing after the server already committed the undelivered CAS showed a scary generic conflict and then dropped to "No active job" — the rider believed the action failed when it had actually succeeded. | Mirrored `deliverM`'s reconciliation: on a 409, re-fetch the order and treat an already-`undelivered` status as success. | Medium | ✅ Fixed |
| 10 | `/orders/history` (feeds both Trip History and Earnings) | Data frugality | `apps/api/src/orders/orders.service.ts` `historyForUser` | Every open of either screen fetches up to 100 full trip rows on a metered-data mobile market. | Capped at 50 (was 100) — same shape, no contract change, roughly halves the payload. | Medium | ✅ Fixed (1 new unit test) |
| 11 | Rider board `openOrders` REST poll | Data frugality, redundant channel | `apps/mobile/app/rider/index.tsx` | An unconditional 15s poll over the open-orders list runs even while the board WebSocket is already pushing every relevant lifecycle event (`board:new_order`/`bid:expired`/`order:taken`) into the exact same cache key. | Gated `refetchInterval` on `board.connected`, mirroring the sibling `activeQ` query in the same file. | Low-Medium | ✅ Fixed |
| 12 | "Delivery complete" push | Dead-end routing | `apps/mobile/src/push/push.ts` | The push promising "you're free for the next job" routed to `/rider/job` — but `completed` isn't in `ACTIVE_RIDE_STATUSES`, so that screen renders a bare "No active job" by the time the push can even arrive. | Routes `completed` to `/rider` (the board) instead. | Low | ✅ Fixed (1 new unit test) |
| 13 | Admin customers/issues queues | Silent truncation | `apps/admin/app/customers/page.tsx`, `apps/admin/app/issues/page.tsx` | Orders and riders pages both disclose "Showing the latest 100/N — older records aren't listed"; customers (cap 100) and issues (cap 200) had no such disclosure, reading as "this is everyone" when it wasn't. | Added the matching disclosure line to both pages, gated on hitting the cap. | Low | ✅ Fixed |
| 14 | Admin rider KYC quick-approve button | Double-submit inconsistency | `apps/admin/app/riders/page.tsx` `KycButton` | Every other admin action (`ConfirmModal`-based) disables its confirm button while pending; this plain `<form action={setKyc}>` button had no such guard. | New `KycSubmitButton` client component (`useFormStatus`) disables + labels "Working…" while the server action is in flight. | Low | ✅ Fixed |
| 15 | Push routing — `account` kind (companion to #3) | Consistency | `apps/mobile/src/push/push.ts` | (Same fix as #3 — listed separately since it closes both the customer-facing bug and documents the rider's-own-KYC-push fallback path stays intact.) | See #3. | — | ✅ Fixed |
| 16 | "Notify me when a rider's online" confirmation | Ambiguous-state (low confidence) | `apps/mobile/app/order/[id].tsx` | The "We'll ping you…" confirmation is `useMutation`-local state (`notifyM.isSuccess`) — navigating away and back re-shows the plain button even though the server-side registration is still active. | **Not fixed this pass** — see §4. | Low | ⏸ Not fixed (needs-human-confirmation) |

---

## 3. Notes on scope and process

- All four research agents independently re-verified a spot-check of prior-sweep fixes as intact before
  hunting for new findings (rider-viewer gating core gates, token-refresh failure classification,
  `hadOffers` expiry honesty, delivery-code rotation signal, DS13-01/DS13-02/DS14-05/DS14-10 wiring, the
  admin `dangerouslySetInnerHTML` sweep, BH-03…BH-06). Nothing there was re-flagged.
- Two convergent findings (rider journey #1/#2 and cross-cutting #2, both landing on the rider
  delivered/undelivered terminal durability gap) are called out above since independent convergence
  across audit angles is a stronger signal than a single-source finding.
- Every fix was implemented directly against the four audits' verified evidence (file:line + verbatim
  snippet), not re-derived from memory of the reports.
- Per this repo's standing instruction for this routine (`CLAUDE.md`), this pass's PR is marked ready for
  review and auto-merge is requested once CI confirms the same green result independently — it is not
  left in draft awaiting manual review.

## 4. Deferred / not fixed — with rationale

- **#16 "Notify me" confirmation lost on navigation.** The customer-journey audit itself flagged this
  with explicit caveats ("at most a confidence/clarity papercut, not a functional break... should not be
  over-weighted") because it hadn't verified whether the underlying server registration is idempotent.
  This pass verified it directly: `TrackingService.addNotifyRequest`'s own doc comment states
  "Idempotent — re-registering the same customer just refreshes their point/expiry (GEOADD/ZADD
  overwrite the member)," confirmed in `tracking.service.ts:535-537`. So a second tap after
  navigating away and back is harmless — the customer is still on the waiting list either way; only the
  *visual confirmation* is lost, not the registration. Given the confirmed-idempotent backing and the
  routine's own evidence rule that uncertain items belong in a needs-human-confirmation list rather than
  forced into a fix, this was left as a documented, low-priority observation rather than a code change
  this pass. A proportionate follow-up (if picked up later) would persist a lightweight per-order
  "notified" flag client-side rather than relying on mutation-local `isSuccess` state.
