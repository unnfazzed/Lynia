# Lynia — UX & Usability Codebase Review

**Date:** 2026-07-12 · **Reviewer:** senior UX-engineering pass (routine) · **Scope:** shipped feature set + `docs/DESIGN.md` mockups only. No new features, no architecture changes.

> **How this was run.** Four parallel deep audits (customer journey, rider journey, cross-cutting
> resilience/data-frugality, copy/notifications/trust) against **current source**, each explicitly told to
> read all four prior passes (2026-07-08, -09, -10, -11 — all merged) plus `docs/KNOWN_BUGS.md` in full and
> not re-flag anything already fixed. Today's findings are the genuine remaining gaps, each independently
> verified against the actual code (not inferred from comments or prior docs). One finding (customer #4)
> and one (rider #2) converged on the same root cause from two different angles — `order/[id].tsx` has no
> viewer-role awareness — and are merged below into a single finding (#1).
>
> **✅ Execution status (2026-07-12).** All 16 findings below are **implemented** on this branch
> (`pnpm typecheck` + `lint` clean across api/mobile/admin; API 688/688 tests, mobile 285/285 tests — zero
> pre-existing failures found on either suite this pass, so nothing needed to be excluded as unrelated).
> Finding #15 (dual-role notifications-feed voice) was implemented directly rather than via the same
> per-finding agent pass as the others, after the four fix-agent rounds surfaced it as the one item without
> an assigned owner. Two test files' hand-rolled `NotificationsService` stubs (`rider.service.spec.ts`,
> `order-lifecycle.service.spec.ts`) needed a `notifyProfiles` no-op added to match the new best-effort
> calls added by findings #6 and #8 — mechanical stub updates, no assertion or behavior changes.

---

## 1. Summary — the five highest-impact fixes

1. **Idle online riders are invisible to the entire supply pipeline.** The only code that ever records a
   rider's position writes to Redis/PG *only while they're on an active delivery* — `setOnline()` receives
   the rider's location but never persists it. In production, unless a rider within range happens to be
   mid-delivery, every new auction sees zero nearby riders: the customer gets a false "No riders online
   nearby" empty state, the WS board push is skipped, and the FCM "New delivery nearby" push never fires.
   This directly breaks the core matching promise on both sides. *(HIGH / M)*

2. **A rider's own delivery-in-progress screen has no viewer-role awareness**, so a rider's finished trip —
   which they can only reach via Trip history/Earnings since the "delivered" active-job state is otherwise
   dead code (#2) — renders the *customer's* rating card ("Rate your rider"), throws a 403 if tapped,
   inverts cancellation blame ("You cancelled this order" when the customer did), and mislabels the
   counterparty phone. *(HIGH / M)*

3. **A successful delivery confirmation drops the rider straight to "No active job"** with zero
   acknowledgement the parcel arrived — no celebration, no rate-the-sender flow (a shipped safety feature
   that is consequently unreachable dead code), because `activeForRider` excludes `delivered` and nothing
   freezes a local terminal for it the way `undelivered`/`cancelled` already do. *(HIGH / S)*

4. **The rider board's GPS position is captured once at mount and never refreshed.** After one delivery
   that takes a rider across town, the board silently stays scoped to their old location for the rest of
   the shift — wrong "N km away" labels, wrong ETA seeds, and orders near their real position invisible —
   with no way for the rider to tell anything is wrong. *(HIGH / S)*

5. **The SOS sheet asserts "We've alerted the LyniaGo team — help is on the way" before the alert call has
   resolved** (and the alert is fire-and-forget server-side with no delivery confirmation) — the one screen
   where a false "it worked" is most costly, at the single highest-stakes moment in the app. *(HIGH / S)*

Also worth calling out even though it's High-but-narrower than top-5: **when a rider bails mid-delivery,
every channel (push + in-app feed) tells the customer "Order cancelled — this delivery was cancelled"**
while the system is silently re-running the same job as a fresh auction — the rebroadcast is WS-only with
no push and no forward link, so a backgrounded customer's natural next move is to recompose the same
parcel, creating a duplicate live auction. Also: **the SOS counterparty push routes a rider straight to the
customer's tracking screen** at the most safety-critical tap in the app.

---

## 2. Findings table

| # | Journey | Lens | File:line | What the user experiences today | Proposed fix | Impact | Effort |
|---|---------|------|-----------|----------------------------------|---------------|--------|--------|
| 1 | Rider trip history/earnings → order detail | Trust, error handling, viewer-role | `apps/mobile/app/order/[id].tsx` (no role branch), `apps/api/src/orders/order-lifecycle.service.ts:435` | A rider viewing their own finished trip sees the customer's "Rate your rider" stars (403 on tap), inverted cancel-blame copy, and the customer's phone mislabeled "Rider phone." | Add `viewerRole` to `getSnapshot`; gate `RatingCard`/cancel controls/phone label on it; flip cancelled-blame strings for rider viewers. | High | M |
| 2 | Rider delivery confirmation | Ambiguous-state, dead code | `apps/mobile/app/rider/job.tsx` (`activeForRider` excludes `delivered`) | A successful OTP hand-off drops straight to "No active job" — no acknowledgement, no rate-sender flow (unreachable). | Freeze a local `deliveredDone` terminal from the pre-mutation snapshot, mirroring the existing `undelivered`/`cancelled` pattern. | High | S |
| 3 | Rider board (idle, between jobs) | Resilience, data integrity | `apps/api/src/riders/rider.service.ts` `setOnline`, `apps/api/src/tracking/tracking.gateway.ts`, `apps/api/src/orders/orders.service.ts` `broadcastToNearbyRiders` | Idle online riders' positions are never recorded outside an active job, so `ridersNearby` is falsely 0 and board/FCM pushes are skipped. | `setOnline` persists position via `recordFix`; decouple the WS board emit from the nearby-riders gate (only FCM needs it). | High | M |
| 4 | Rider board (after moving) | Resilience, data frugality | `apps/mobile/app/rider/index.tsx` (one-shot `getCurrentPositionAsync`) | The board silently stays scoped to wherever the rider was when the screen first mounted, even after a cross-town job. | Re-request location on focus / when the active job clears; feed the refreshed coords into the existing re-scope effects. | High | S |
| 5 | SOS (both roles) | Trust, honesty of state | `apps/mobile/src/ui/safety.tsx:466-470`, `apps/api/src/sos/sos.service.ts:74-80` | The sheet claims "We've alerted the team — help is on the way" while the alert is still in flight or after a silently-dropped best-effort call. | Three-state copy: pending / sent / failed-fallback; soften "help is on the way" since delivery isn't confirmed. | High | S |
| 6 | Rider bail / auto-rebroadcast | Trust, notification honesty | `apps/api/src/notifications/notifications.service.ts:72`, `apps/api/src/orders/order-lifecycle.service.ts:606-621` | Customer gets "Order cancelled — this delivery was cancelled" push+feed while a same-price rebroadcast is quietly running; no way to find the live clone. | Dedicated push/feed copy + forward link when a rebroadcast happened; route its tap to the new order. | High | M |
| 7 | SOS push routing | Trust, safety-critical routing | `apps/mobile/src/push/push.ts` (no `kind:"sos"` branch), `apps/api/src/sos/sos.service.ts:81-87` | A rider whose customer raises SOS is pushed straight to the customer-voiced `/order/:id` screen, not their own job screen. | Add `sos`+`isRider` → `/rider/job` branch in `pushDestination`. | High | S |
| 8 | Rider KYC/account standing | Trust, notification gap | `apps/api/src/riders/rider.service.ts` (`applyKycResult`, `adminSetKyc`), `apps/api/src/admin/admin-riders.service.ts` (`suspendRider`, `liftRider`, `clearHold`) | No notification at all — including on the *recovery* direction — when KYC resolves or standing changes; a rider told "contact support" never learns support fixed it. | Fire best-effort pushes on verified/failed/hold-cleared/suspended, routing to `/rider`. | Medium-High | S-M |
| 9 | Rider board — sent offers | Ambiguous-state | `apps/mobile/src/ui/rider/SentOfferCard.tsx`, `apps/mobile/src/realtime/use-rider-board.ts` | If the resolving `bid:expired`/`order:taken` push is missed (e.g. a dead zone), the offer card freezes at "closes in 0:00" forever with no local fallback. | Client-local time-based fallback once past `expiresAt` + grace: render a neutral "that window has closed" state. | Medium-High | S |
| 10 | Customer auction wait | Ambiguous-state, regression | `apps/mobile/app/order/[id].tsx` (socket-gated poll, since 07-11 #10) | `ridersNearby` never refreshes while the socket is healthy (nothing emits on supply change), so the "no riders online" empty state can outlive its truth for the whole auction. | Keep the 15s snapshot poll for `open_for_offers` regardless of socket health (mirrors the offers-list poll already unconditional in this status). | Medium | S |
| 11 | Auction expiry | Trust, misleading advice | `apps/api/src/matching/matching.service.ts` `expireOrder`, `apps/mobile/app/order/[id].tsx:813-821` | The expired terminal always says "no offers, raise your price" even when there were live bids the customer just watched, or when the real cause was zero riders online (raising price can't fix that). | Branch expiry copy on whether offers existed / riders were online; carry that signal into the expired snapshot for the client terminal. | Medium | S-M |
| 12 | Customer notify-me | Ambiguous-state | `apps/mobile/app/order/[id].tsx:731-742`, `apps/api/src/tracking/tracking.service.ts:453-463` | Tapping "Notify me" during a Redis outage/misconfig succeeds but `queued:false` — the button just silently reappears with no explanation. | Add an honest third branch for `isSuccess && !queued`. | Medium | S |
| 13 | Rider offer refusal (on-hold) | Trust, consistent copy | `apps/api/src/offers/offers.service.ts:71` | A newly-on-hold rider's accept/counter tap shows "complete deliveries to raise your reliability score" — impossible advice, contradicted 20s later by the correct gate-screen copy. | Use the shared `REFUSAL_MESSAGE` map instead of a hand-rolled string. | Medium | S |
| 14 | Rider → customer view switch | Trust, honesty of state | `apps/mobile/app/rider/index.tsx:766-770` | "Switching takes you offline" — but nothing calls `setOnline(false)`; the very next screen still shows "Online as a rider" and pushes keep arriving. | Fire `setOnline(false)` on confirm (no-active-job branch) before navigating. | Medium | S |
| 15 | Dual-role notifications feed | Copy, trust | `apps/api/src/notifications/notifications.service.ts` `feedForUser` | Every feed row uses customer-voiced copy ("A rider took your delivery") even for a rider's own trips, breaking the feed's "mirrors the push you saw" contract. | Role-aware notice map in `feedForUser`, keyed off `customerId === userId`. | Medium | M |
| 16 | Auth — WhatsApp OTP send failure | Copy consistency | `apps/api/src/auth/otp-sender.ts:88` | When Meta rejects the send (expired token/bad template), the error has no next-step, unlike its two sibling failure strings. | Align to `"Couldn't send the code — try again in a moment."` | Low | S |

---

## 3. Notes on scope and process

- All four audits confirmed the prior four passes' fixes are intact in current code — cold-start restore,
  idempotency, honest cooldown/on-hold/KYC copy (mostly — see #8/#13 for the two sibling strings those
  passes didn't reach), offer-conflict reconciliation, BullMQ retry/backoff + reconcilers, socket
  resubscribe/self-heal, and the DS-01…DS-11 deep-sweep fixes. Nothing there was re-flagged.
- Deliberately **not** re-litigated: the deferred OTP-verify idempotency item (correction 2026-07-13:
  this was in fact already fixed on main the same day this doc was written — commit `139c99a`, a 60s
  hash-only grace window on verify, hardened by `f9c2a12`'s route throttle; a later security-focused
  audit confirmed the shipped design), image downscale, and the tracking-screen re-render item.
- This pass leans heavily on one area none of the prior four ever looked at closely: **how the server
  learns where idle (not-currently-delivering) riders are** — `docs/KNOWN_BUGS.md`'s own coverage map
  flagged `tracking.service` geo internals as "lightly or never audited," and that's exactly where findings
  #3/#4 live.
