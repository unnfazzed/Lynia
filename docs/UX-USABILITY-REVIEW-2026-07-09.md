# Lynia — UX & Usability Codebase Review (follow-up pass)

**Date:** 2026-07-09 · **Reviewer:** senior UX-engineering pass (routine) · **Scope:** shipped feature set +
`docs/DESIGN.md` mockups only. No new features, no architecture changes.

> **How this was run.** This is a follow-up to `docs/UX-USABILITY-REVIEW-2026-07-08.md`, whose 19 findings
> were implemented the same day (all but #10, deliberately deferred — needs `expo-image-manipulator`, still
> not installed as of this pass, so it remains open). Three parallel targeted audits — rider trip
> log/cooldown/role-toggle, order history/profile/support/admin, and an independent re-verification of the
> prior review's "verified solid" resilience claims — deliberately avoided re-flagging anything already
> fixed. The only app-code changes since 2026-07-08 were a key-gated PostHog analytics wire-up and an EAS
> project link (both infra, no UX surface); this pass is genuinely new ground, not a re-run.

> **✅ Execution status (2026-07-09).** All 8 findings below have been **implemented** on this branch,
> verified against the full test suite (API 605 tests + mobile 208 tests, all passing) plus `typecheck` and
> `lint` clean across api/mobile/admin/shared. #9 (GPS-tick full-screen re-render) is logged but not fixed
> in this pass — real but bounded (~1 re-render per 10s during an active delivery, no memory leak), and a
> `React.memo`/`select`-based fix touches a 900+ line screen component that deserves its own focused pass
> rather than being bundled in here.

---

## 1. Summary — the five highest-impact fixes

1. **A rider's own trip history lies about the outcome.** Every rider-side history row read "9 Jul ·
   Delivered" regardless of what actually happened — a bailed-on job or a marked-undelivered job showed
   "Delivered" in the subtitle while the `StatusPill` two inches away, on the same row, correctly said
   "Cancelled" or "Not delivered". This is the one screen a rider checks to understand their own
   cancellation record, and it contradicted itself. *(HIGH / S)* — fixed.

2. **A rider whose KYC failed or is still pending was told their documents are "verified and stored
   securely."** `rider/documents.tsx`'s footer was a hardcoded string, unconditional on `kycStatus` — false
   comfort for exactly the rider who most needs an honest status, in a low-trust market where identity
   verification is a safety feature, not paperwork. *(HIGH / S)* — fixed.

3. **A cancelled order's terminal screen said nothing beyond "This order is cancelled,"** even though the
   API already computes and ships `cancelReason` + `cancelledBy` — every other terminal state
   (`expired`, `undelivered`) explains itself; `cancelled` was the one left bare, right next to the pattern
   that would have fixed it. *(HIGH / S)* — fixed.

4. **The customer↔rider toggle had no guard for an online or mid-job rider.** "Back to customer" was a
   single unconfirmed tap that immediately tore down the board socket and heartbeat — a rider could accept
   a job, browse to send their own parcel, and lose track of the accepted job or go deaf to new broadcasts
   while still marked online server-side. Now it confirms first when online/on a job, and `/home` shows a
   persistent "Online as a rider" chip so a rider can't quietly lose their shift. *(HIGH / S–M)* — fixed.

5. **The admin "stuck order" banner was hardcoded fake text** — "No GPS update... for 22 minutes while en
   route to drop-off" rendered verbatim regardless of the order's real stage or actual elapsed time, right
   next to a timeline note on the same page that correctly used the real `stuckNote`. An admin trusting the
   banner during an incident was misled about both severity and stage. *(HIGH / S)* — fixed, and extended
   to distinguish an OTP-mismatch loop from a rider who's gone silent (same intervention decision, two very
   different fixes).

---

## 2. Findings table

| # | Journey | Lens | File:line | What the user experiences today | Proposed fix | Impact | Effort |
|---|---------|------|-----------|----------------------------------|---------------|--------|--------|
| 1 | Rider trip history | Trust, Copy | `apps/mobile/app/history/index.tsx:28` | Subtitle hardcoded `"Delivered"` for every rider-role row regardless of `o.status`; contradicts the correct `StatusPill` on the same row for a cancelled/undelivered job. | Route the subtitle through `statusPillLabel(status)` (same labels the pill already uses), keeping "Delivered" only for `delivered`/`completed`. | High | S |
| 2 | Rider "Bike & documents" | Trust & safety, Feedback | `apps/mobile/app/rider/documents.tsx:53-57` | Footer claims "verified and stored securely" unconditionally — a `pending`/`failed` rider is told their ID is verified when it isn't. Row pills already correctly hide themselves when `verified=false`, but the footer contradicts that. | Branch footer copy on `rider.kycStatus` (verified / pending / not yet) + add a "View verification status" link back to `/rider` when not verified; unverified rows now show an explicit "Not verified" pill instead of a blank one. | High | S |
| 3 | Customer cancelled-order terminal | Feedback, Trust | `apps/mobile/app/order/[id].tsx:822-826` | "This order is cancelled." — no reason, no who-cancelled, despite `order.cancelReason`/`order.cancelledBy` already on the wire (`apps/api/src/orders/orders.service.ts:609-615`) and used nowhere on mobile. | Mirror the `undelivered` terminal's pattern: "You cancelled this order." / "Your rider cancelled this delivery." plus `cancelReason` when present. | High | S |
| 4 | Role toggle (rider ↔ customer) | Low-tech, Never-stuck | `apps/mobile/app/rider/index.tsx:699` (button); `apps/mobile/app/home.tsx:505` (no reciprocal signal) | "Back to customer" is one unconfirmed tap even while `online`/mid-job; nothing on `/home` shows a rider they're still online as a rider. | Confirm-before-switch when `online \|\| activeJob` (inline card, matches `BailSheet`'s pattern); persistent "Online as a rider" chip on `/home` when `me.rider.isOnline`, linking back to `/rider`. | High | S–M |
| 5 | Admin stuck-order support | Feedback, Trust (founder) | `apps/admin/app/orders/[id]/page.tsx:142-149` | Banner text is a static string ("22 minutes... en route to drop-off") independent of `o.stuck`/`o.stuckNote`/current step — always the same sentence regardless of the real state. | Render `{o.stuckNote}` (already piped through for the timeline note two lines away) + the current step label. | High | S |
| 6 | Admin OTP-mismatch visibility | Feedback (founder) | `apps/api/src/admin/admin-orders.service.ts` `getOrderDetail` select (no `deliveryOtpAttempts`) | A rider stuck failing the delivery code repeatedly and a rider who's gone silent produce the identical generic stuck banner — admin can't tell which intervention applies. | Select `deliveryOtpAttempts`, fold into `stuckNote` as "Rider has entered the wrong delivery code N of 5 times" when `status === "en_route_dropoff"` and attempts > 0. | Med | S |
| 7 | Rider "Cancel job" confirm | Trust, Copy | `apps/mobile/src/ui/rider/BailSheet.tsx:47-50` | Identical caution text on the 1st and the 3rd (final, lockout-triggering) cancel — a rider gets no earlier warning to course-correct, only discovers their count at the moment they're locked out. | Expose `cancelStrikes` on `getMe()` (`apps/api/src/auth/auth.service.ts`, field already in the DB) and interpolate into `BailSheet`: "This would be cancel N of 3 before a 2-hour pause." | Med-High | M |
| 8 | Earnings screen | Low-tech, Consistency | `apps/mobile/app/earnings/index.tsx:71-83` | Trip cards are not tappable, unlike the visually identical rows in Trip history — a rider checking a fare that looks wrong has no way to open it for detail. | Wrap the row in the same `Pressable` → `router.push(/order/:id)` pattern `history/index.tsx` already uses. | Med | S |
| 9 | Customer tracking screen | Data frugality, Perf | `apps/mobile/app/order/[id].tsx` (whole component subscribes to one `useQuery`); `apps/mobile/src/realtime/use-order-socket.ts:99-104` | Every WS `position` tick replaces the whole `OrderSnapshot` query object, re-executing the entire 900+ line screen (offer ranking, ETA calc) — not just moving the marker. Bounded (~1×/10s during an active delivery, GPS is throttled) but a genuine re-render cost. No memory-growth risk (verified — no accumulated-positions array exists). | Split the rider-position slice into its own `useQuery` `select`, or wrap the offer-list/bid sections in `React.memo`. | Low-Med | S–M |

---

## 3. Quick wins (High impact + Small effort) — all implemented this pass

- **#1** `history/index.tsx`: route the rider subtitle through `statusPillLabel`.
- **#2** `rider/documents.tsx`: `kycStatus`-aware footer copy + "Not verified" pill + status link.
- **#3** `order/[id].tsx`: cancelled terminal now shows who-cancelled + `cancelReason`.
- **#4** `rider/index.tsx` + `home.tsx`: confirm-before-switch + persistent online chip.
- **#5** `admin/app/orders/[id]/page.tsx`: real `stuckNote` in the banner instead of a hardcoded sentence.
- **#8** `earnings/index.tsx`: tappable trip rows.

## 4. Ambiguity audit — "did that actually happen?"

| Situation | Today (before this pass) | Fix |
|---|---|---|
| Rider checks their own trip history after a bailed-on or undelivered job | The subtitle claims "Delivered" — contradicts the pill on the same row. | #1 |
| Rider's KYC failed or is pending, opens "Bike & documents" | Told "verified and stored securely" — actively false. | #2 |
| Customer opens a cancelled order | No indication of who cancelled or why — can't tell if it was them, the rider, or a system/admin action. | #3 |
| Rider taps "Back to customer" while online/on a job | No warning; board socket + heartbeat torn down silently, no reminder they're still online server-side. | #4 |
| Admin looks at a stuck order to decide whether to intervene | Banner text is fabricated, not the real elapsed time/stage — admin can be misled about severity. | #5, #6 |
| Rider about to cancel an accepted job | Same caution shown on strike 1 as strike 3 (the lockout-triggering one) — no escalating signal. | #7 |

## 5. Out-of-scope log

- **#9's real fix** (query-slice `select` or targeted `React.memo`) — logged, not bundled into this pass;
  touches the largest screen component in the app and deserves isolated verification.
- **#10 from the 2026-07-08 review** (client-side image downscale before KYC-selfie upload) — still open;
  `expo-image-manipulator` remains uninstalled. Unchanged from the prior pass.
- **Item photo + size UI on order creation** — still consciously deferred (unchanged from prior review).
