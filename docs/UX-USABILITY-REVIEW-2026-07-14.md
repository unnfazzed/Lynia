# Lynia — UX & Usability Codebase Review

**Date:** 2026-07-14 · **Reviewer:** senior UX-engineering pass (routine) · **Scope:** shipped feature set + `docs/DESIGN.md` mockups only. No new features, no architecture changes.

> **How this was run.** Four parallel deep audits (customer journey, rider journey, cross-cutting
> resilience/data-frugality, copy/notifications/trust) against **current source**, each explicitly told to
> read all five prior UX passes (2026-07-08, -09, -10, -11, -12 — all merged), `docs/KNOWN_BUGS.md`, and
> the diff of the currently-open bug-hunt PR #231, and not re-flag anything already found or already
> fixed. Research ran on Claude Fable 5; implementation ran on Claude Opus, per this routine's model
> policy. Three findings converged independently from two different audit angles onto the same root
> cause — the shared order-detail screen's viewer-role gating (rider-journey #1 + copy-audit #1/#2), push
> routing by global account role instead of per-order relationship (rider-journey #2 + copy-audit #3),
> and the token-refresh failure-classification bug (customer-journey #4 + cross-cutting #1) — which is
> called out below where it happened, since independent convergence is a strong signal.
>
> **✅ Execution status (2026-07-14).** 20 of 24 distinct findings below are **implemented** on this
> branch (`pnpm typecheck && pnpm lint && pnpm test` clean across all 5 packages — API 772/772 tests,
> mobile 311/311 tests, zero pre-existing failures found on either suite this pass). Four findings are
> **deferred** with rationale (see §4) rather than silently dropped: the "notify me" waiter's missing
> `orderId` (needs 3-way client/API/push coordination for a Low-impact fix — descoped to keep the
> higher-value fixes moving), the fuller fix for the notifications-feed empty-state promise (needs a new
> Notification table or server-side row synthesis — only the copy was corrected this pass), the
> `become.tsx` redirect for an already-verified rider tapping "Rider setup" (the security half — the
> actual ID-freeze bypass — **is** fixed server-side this pass; the UI half is a nice-to-have), and a bug
> found *inside* the still-unmerged PR #231 (a customer push routing to `/rider` instead of `/order/:id`)
> — out of scope for this routine since it isn't on `main` yet; noted for whoever lands #231.

---

## 1. Summary — the five highest-impact fixes

1. **A rider viewing their own live job through the shared order screen could silently eat a real
   bail-penalty cancel.** Every notifications-feed row, history row, and earnings row for a rider's own
   trip opens the same `/order/[id]` screen the customer uses. A prior fix (07-12 #1) gated the rating
   card, cancel-blame line, and phone label for a rider viewer — but not the *active-state* controls: the
   Cancel button (a rider tap here takes the full server-side bail path — reliability penalty, possible
   forced-offline cooldown — with none of the warning the rider's own `BailSheet` gives for the identical
   mutation), the delivery-code re-issue card (invites the rider to reset the customer's hand-off code,
   403s), the rebroadcast/follow-clone controls (invite the rider to re-send someone else's parcel, or
   403), and the report control (files the rider's report with the wrong noun). Found independently by
   two audits from two angles. *(HIGH / S-M — FIXED)*

2. **The "rider went dark" escalation could never fire while the customer was actually watching the
   screen.** `useOrderSocket` already parsed the server's presence-stale WS event and called an
   `onRiderStale` callback — but the order screen never passed one, and the render-time staleness check
   only re-evaluated when a new GPS tick arrived, i.e. never once ticks stopped (the trigger condition).
   A rider's phone dying mid-delivery froze the tracking card indefinitely with the "call your rider"
   escalation unreachable — the exact case it was built for. *(HIGH / S — FIXED)*

3. **A transient network failure during token refresh forcibly signed the user out and wiped all local
   device state** — found independently by two audits. `doRefresh` treated a 502/504/429 or a bare
   timeout identically to a genuine refresh-token rejection, so a customer or rider on a flaky link (the
   target market) could be dumped to the sign-in screen mid-delivery, losing their compose draft, saved
   hand-off codes, and cached history, with the OTP flow to redo over the same bad network. *(HIGH / S —
   FIXED, with 10 new regression tests)*

4. **DS13-02 (backgrounded riders stay in the geo index) and BR-01 (a 120s heartbeat freshness cutoff)
   were both correct in isolation and quietly cancelled each other out for the one channel FCM exists to
   serve.** A rider's foreground heartbeat can't fire while the app is suspended, so 120 seconds after
   backgrounding, that same rider — still online, still a valid broadcast candidate per DS13-02 — dropped
   out of the FCM "new delivery nearby" audience anyway. A pocketed, still-online rider 500m from a new
   order got no push. *(MED-HIGH / M — FIXED, split into a strict cutoff for the customer-facing count/gate
   and a permissive one for the FCM audience)*

5. **Push notifications for SOS and cancellations routed by the recipient's permanent account role, not
   their relationship to the specific order** — the exact bug class two prior sweeps (F-16, DS13-01) fixed
   server-side, reproduced in client routing. A rider-role account acting as the *customer* on a given
   order, whose assigned rider raised SOS, was routed to `/rider/job` ("No active job") instead of their
   own order — at the single most safety-critical tap in the app. Found independently by two audits.
   *(MED-HIGH / S-M — FIXED: pushes now carry the recipient's actual per-order role)*

---

## 2. Findings table

| # | Journey / Area | Lens | File:line (at time of audit) | What the user experiences | Fix | Impact | Effort | Status |
|---|---|---|---|---|---|---|---|---|
| 1 | Rider viewing own live job (feed/history/earnings → `/order/[id]`) | Trust, unwarned penalty | `apps/mobile/app/order/[id].tsx` (Cancel button, delivery-code card, rebroadcast/follow-clone, ReportControl noun) | Rider taps their own "You got the job" notification, lands on customer-shaped screen, can silently trigger a real bail-penalty cancel or 403 on customer-only controls. | Gate all of the above on `isRiderViewer`; add an "Open your job" shortcut. | High | S-M | ✅ Fixed |
| 2 | Live tracking (rider went dark) | Ambiguous-state, dead wiring | `order/[id].tsx`, `use-order-socket.ts`, `LiveTrackingCard.tsx` | Rider's phone dies mid-delivery; customer's tracking card freezes forever with no escalation. | Wire `onRiderStale` through to a re-render trigger; add a defensive 30s re-check interval. | High | S | ✅ Fixed |
| 3 | Auth — token refresh | Resilience, data-loss on flaky network | `apps/mobile/src/api/client.ts` `doRefresh` | A network blip during refresh signs the user out and wipes drafts/codes/history. | Only a definitive 401/403 signs out; network failure/timeout/5xx propagate as an ordinary retryable error. | High | S | ✅ Fixed (10 new tests) |
| 4 | Supply pipeline — backgrounded riders | Resilience, cross-fix interaction | `packages/shared/policy.ts`, `apps/api/tracking.service.ts`, `orders.service.ts`, `matching.service.ts` | A backgrounded-but-online rider silently drops out of the FCM broadcast audience after 120s. | Split the heartbeat freshness cutoff: strict for count/gate, permissive for the FCM audience. | Med-High | M | ✅ Fixed |
| 5 | SOS / cancelled push routing | Safety-critical routing | `apps/mobile/src/push/push.ts`, `apps/api/sos.service.ts`, `notifications.service.ts` | A dual-role user's SOS/cancelled push routes by global account role, landing a customer on the rider board. | Server stamps `data.to: "customer"\|"rider"` per recipient; client prefers it over global role, falls back safely. | Med-High | S-M | ✅ Fixed |
| 6 | Auction expiry | Trust, misleading advice | `matching.service.ts`, `notifications.service.ts`, `orders.service.ts` | Expiry push/feed/terminal always imply "no rider engaged, raise your price" even when riders did bid; a cold start into an expired order loses the honest signal entirely. | Thread `hadOffers` (recomputed on demand — offer rows survive expiry) through push, feed, and snapshot. | Medium | S | ✅ Fixed |
| 7 | Customer on account hold | Blocked-state | `apps/mobile/app/home.tsx` | A customer held mid-dispute has zero path to view/track/cancel/rate a delivery already in flight. | Keep the hold wall but render the active-order banner above/alongside it. | Medium | S | ✅ Fixed |
| 8 | Rider board — online-state after restart | Ambiguous-state | `apps/mobile/app/rider/index.tsx` | App killed mid-shift; `/home` shows "Online" while the board silently isn't and runs no heartbeat. | Reconcile local `online` from `meQ.data.rider.isOnline` once per mount, never overriding an explicit toggle-off. | Medium | S | ✅ Fixed |
| 9 | Rider board — location denied mid-shift | Blocked-state | `apps/mobile/app/rider/index.tsx` | Permission revoked mid-shift replaces the whole dashboard with a gate that has no way to go offline. | Add a "Go offline" button inside the gate; keep the state honest about still being online. | Medium | S | ✅ Fixed |
| 10 | Rider KYC — national-ID freeze | Integrity bypass | `apps/api/src/riders/rider.service.ts` `completeProfile` | A verified rider's national ID (an anti-ban-evasion control) could be silently overwritten through the sibling profile-update route, bypassing the freeze `/auth/me` already enforces. | Mirror the exact `/auth/me` freeze guard in `completeProfile`. | Medium (integrity) | S | ✅ Fixed (regression tests added) |
| 11 | Ops cancel-reason copy | Jargon leak | `apps/api/src/orders/orders.service.ts` | Customer/rider sees raw ops taxonomy verbatim, including "Suspected fraud", with no explanation. | Remap ops-internal reasons to calm user-safe copy at the snapshot boundary; admin/audit views keep the raw reason. | Medium | S | ✅ Fixed |
| 12 | Rider board — GPS fix timeout | Resilience, data integrity | `apps/mobile/app/rider/index.tsx` | An unbounded `getCurrentPositionAsync` can hang forever; a rider goes online with zero recorded position, invisibly excluded from all broadcasts. | Race the fix against a 9s timeout; fall back to last-known position; surface a non-blocking hint if both fail. | Medium | S | ✅ Fixed |
| 13 | Push token registration | Resilience | `apps/mobile/src/push/{push,use-push-registration}.ts` | A failed registration (dead zone at cold start) never retries; a rotated FCM token is never re-bound. | Retry on reachability recovery/foreground (capped); add a token-rotation listener. | Medium | S | ✅ Fixed |
| 14 | Rider job — rate-the-sender | Ambiguous-state | `apps/mobile/app/rider/job.tsx` | A failed rating POST leaves a falsely-filled star with no error and no retry cue. | Show the error; roll the star back on failure. | Low-Med | S | ✅ Fixed |
| 15 | Rider board — open-orders loading state | Ambiguous-state | `apps/mobile/app/rider/index.tsx` | The definitive "No open orders near you" empty state renders before the first fetch even returns. | Add a loading branch rendering the existing `SkeletonList`. | Low-Med | S | ✅ Fixed |
| 16 | Admin — SOS console freshness | Push-vs-poll gap (ops) | `apps/admin/app/sos/page.tsx` | The console's own empty state promises alerts "land here the moment they fire," but the page never refreshes itself. | Client-side auto-refresh (~35s) while the tab is open. | Medium | S | ✅ Fixed |
| 17 | Mobile app shell | Error boundary | `apps/mobile/app/_layout.tsx` | No React error boundary anywhere; a render exception is an unrecoverable crash. | Add an expo-router `ErrorBoundary` export with a "Reload" recovery affordance. | Low-Med | S | ✅ Fixed |
| 18 | Time-critical push TTL | Data frugality | `apps/api/src/adapters/push/fcm.push.ts`, `notifications.service.ts` | A "New delivery nearby" push for a 90s-old auction can arrive hours late after a dead zone (FCM's 4-week default TTL). | Opt-in `ttlSeconds` (≈ the offer window) for broadcast/rebroadcast/riders-available pushes only. | Low | S | ✅ Fixed |
| 19 | Rider documents screen | Ambiguous-state | `apps/mobile/app/rider/documents.tsx` | A transient fetch error is indistinguishable from "you haven't registered as a rider." | Add an explicit `isError` branch with retry, before the `!rider` fallback. | Low | S | ✅ Fixed |
| 20 | Brand-name consistency | Copy | `notifications.service.ts`, `sos.service.ts`, `receipt.ts` | "Lynia" vs the shipped app name "LyniaGo" mixed across API- and client-authored strings. | Swept the three remaining "Lynia" strings to "LyniaGo". | Low | S | ✅ Fixed |
| 21 | Cancelled terminal — recovery path | Dead-end | `order/[id].tsx` | Every other non-happy terminal (expired/undelivered) offers a one-tap resend; plain cancelled offered none, and the confirm-before-cancel gate didn't cover pre-pickup-matched statuses. | Added the existing `rebroadcast()` CTA to the cancelled terminal (framed per whether the customer or ops cancelled); extended the confirm gate to the full matched-status set. | Low-Med | S | ✅ Fixed |
| 22 | Cancelled terminal — support access | Trust | `order/[id].tsx` | `GetHelpControl` rendered on every terminal except `cancelled` — exactly where "why was my order cancelled?" is sharpest. | Added `cancelled` to the render condition. | Low | S | ✅ Fixed |
| 23 | "Notify me" waiter — orderId & destination | Ambiguous-state | `rider.service.ts` `drainNotifyWaiters`, `push.ts` | The riders-available push/feed gives generic "send again" advice and routes to `/home` even when the original auction is still open. | **Deferred** — needs a 3-way client/API/push contract change for a Low-impact fix; descoped to prioritize higher-value items this pass. | Low | M | ⏸ Deferred |
| 24 | Notifications feed — empty-state promise (full fix) | Copy vs reality | `apps/mobile/app/notifications/index.tsx`, `notifications.service.ts` | The feed can structurally never show "New offer" or account-status rows (no Notification table backs it), even though the empty-state copy implies it will. | Empty-state copy corrected this pass (#20 in effect); the fuller fix (synthesizing real rows) needs a schema/data-model change. | Low-Med | M | ⏸ Deferred (copy fixed, full fix out of scope) |

Two additional items are **explicitly out of scope for this routine, not silently dropped**:
- `apps/mobile/app/rider/become.tsx` — a verified rider tapping "Rider setup" still lands on the
  registration form (which now correctly *rejects* rather than silently overwriting their ID, per finding
  #10's server-side fix, but the UI redirect to skip the form for an already-verified rider wasn't added).
- A bug found **inside the currently-open, unmerged PR #231**: its new `notifyCustomersOfRiderStandingChange`
  push uses `kind: "account"`, which the mobile `pushDestination` routes to `/rider` regardless of
  `orderId` — a customer tapping "an update on your delivery" push would land on the rider board, not
  their order. This is a defect in code that isn't on `main` yet, so it's outside this routine's remit;
  flagging it here so whoever lands #231 sees it.

---

## 3. Notes on scope and process

- All four audits independently confirmed every prior UX pass's fixes (07-08 through 07-12) are intact in
  current code, plus everything in `docs/KNOWN_BUGS.md`'s OPEN section resolving to non-code/founder-gated
  items only. Nothing there was re-flagged.
- Each audit also read the full diff of the still-open, unmerged bug-hunt PR #231 (SOS location fallback,
  rider Back-button GPS-stream kill, ops-cancel actor mislabeling, suspended-rider live-order banner, SOS
  console sort) and confirmed none of today's findings overlap it — the one place they intersect (a bug
  found *inside* #231 itself) is documented above as explicitly out of scope.
- Three convergent findings (#1, #3, #5 in the top-5) were independently discovered by two separate
  research agents working from different angles (a rider-journey walk and a copy/trust audit; a
  customer-journey walk and a cross-cutting resilience audit) — that convergence is itself a confidence
  signal the other passes don't always have, and is called out explicitly rather than presented as a
  single-source finding.
- Every fix in §2 above was implemented by a dedicated Opus subagent scoped to a disjoint set of files (to
  allow safe parallel execution), each of which ran and reported passing typecheck/lint/test results for
  its own files; this report's "Execution status" additionally reflects a **combined, whole-monorepo**
  verification run after all seven implementation passes landed (`pnpm typecheck && pnpm lint && pnpm
  test` — all 5 packages, 772+311 tests, zero failures), not just the sum of each agent's isolated claim.
- Per this repo's standing instruction for this routine (`CLAUDE.md`), this pass's PR is marked ready for
  review and auto-merge is requested once CI confirms the same green result independently — it is not
  left in draft awaiting manual review, matching this routine's established policy (distinct from the
  narrower bug-hunt routine's policy, which does not apply here).
