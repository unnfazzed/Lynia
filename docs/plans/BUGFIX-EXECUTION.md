# Bug-fix Execution Plan — build-now fixes (design gaps excluded)

Implements the fixes from `docs/JOURNEY-BUGS.md` + `docs/BUG-HUNT.md` that **do not need a new mockup**
(the ✅ "build the existing design" and logic-only items in `UX-FIX-DESIGN-GAP-PLAN.md`). The ❌ ABSENT
screens (SOS, gate-state redesign, etc.) are being designed separately in Claude and are **out of scope
here**.

Work is partitioned across five parallel agents with **disjoint file ownership** — no two agents edit the
same file, so their changes land in one working tree without collision.

## Lanes (file ownership is exclusive)

**Lane A — Rider mobile surfaces**
`apps/mobile/app/rider/job.tsx`, `apps/mobile/app/rider/index.tsx`, `apps/mobile/src/api/orders.ts`
- R1: add `markUndelivered` to `orders.ts`; wire a "Couldn't deliver" reason picker (unreachable / refused
  / wrong address / breakdown) on `picked_up`/`en_route_dropoff` → terminal → back to board. Mockup:
  `rider-screens.jsx` "Couldn't deliver".
- R2: gate "Cancel job" on `RIDER_CANCELLABLE_STATUSES`, not `ACTIVE_RIDE_STATUSES`.
- R9: show attempts-remaining from the delivery-OTP error; disable the field/button once locked.
- R4: give the KYC-lock / suspended / on_hold gate states a real **Contact support** action (`Linking`
  WhatsApp/`tel:`), replacing the dead "contact support" copy.

**Lane B — Customer mobile surfaces**
`apps/mobile/app/order/[id].tsx`, `apps/mobile/app/home.tsx`, `apps/mobile/src/ui/MapPicker.tsx`
- C6: gate the delivery-code card to live/deliverable statuses (hide on cancelled/undelivered/completed).
- C7: when `assigned`+ and no local code, prompt "reveal / re-issue code" (wire the existing rotate).
- C5: "Nudge price & re-broadcast" / "Send another request" prefill the compose form with the order's
  params instead of dumping to a blank `/home`.
- C8/C9: MapPicker — surface a denied-permission message; add a GPS timeout with a "tap the map" fallback.
- C10/C11: inline `declaredValue ≤ 150` validation; relabel the "optional" section that holds required
  landmarks.

**Lane C — Mobile auth / session / routing**
`apps/mobile/app/verify.tsx`, `apps/mobile/src/auth/auth-context.tsx`, `apps/mobile/src/auth/session.ts`
- R3: route a returning rider to `/rider`, not `/home`.
- S1: `signOut()` clears the React Query cache + the order-draft / disclaimer / delivery-code keys.
- C3: add a "Resend code" affordance with a cooldown on the verify screen (reuses `requestOtp`).

**Lane D1 — API identity / config / shared contracts**
`apps/api/src/config/env.ts`, `apps/api/src/auth/auth.service.ts`, `apps/api/src/auth/token.service.ts`,
`packages/shared/src/phone.ts`, `packages/shared/src/contracts.ts`, `apps/api/src/notifications/notifications.service.ts`
- P1-1: prod boot-guard rejecting the default `JWT_SIGNING_SECRET`.
- Logout IDOR: scope `logout` revoke by `profileId`.
- Pin `jwt.verify` to `["HS256"]`.
- P2-5: `normalizePhone` strips a trunk-0 after the country code; rejects a `0`-leading country code.
- Fare bounds: `proposedFare`/`offeredFare` → `.positive().max(100_000).multipleOf(0.01)`.
- Device-token: don't re-home a token owned by another profile.

**Lane D2 — API domain / authorization**
`apps/api/src/offers/offers.service.ts`, `apps/api/src/offers/offers.controller.ts`,
`apps/api/src/matching/matching.service.ts`, `apps/api/src/admin/admin.service.ts`,
`apps/api/src/settlements/settlements.service.ts`, `apps/api/src/admin/admin.controller.ts`,
`apps/api/src/orders/orders.service.ts`, `apps/api/src/tracking/tracking.gateway.ts`,
`apps/api/src/tracking/tracking.controller.ts`
- P2-1: gate `makeOffer`/`selectOffer` on account standing; set `isOnline=false` on suspend/ban.
- P2-2: party-gate `getSnapshot` (no live GPS to non-parties).
- P2-3: admin `cancelOrder` declines pending offers + emits WS.
- P2-4: `recordPayment` writes an audit row with actor + rejects already-paid.
- Offers IDOR: `listForOrder` checks caller is the customer.
- P2-7: `boardLeave` leaves the geo rooms.
- `riders/nearby` role-gate; `adjustFare` status guard.

## Pre-flight review (design + eng)

The approach was already validated by the gstack reviews appended to `UX-FIX-DESIGN-GAP-PLAN.md`
(design 7.4/10; eng "mergeable, proceed"). Their conditions are folded into scope:
- **Design:** R4's "Contact support" is included as a real action (the required-exit fix the design review
  called the #1 issue). The remaining design-review asks (SOS a11y, gate-state redesign) belong to the
  ABSENT screens the user is designing — correctly out of scope here.
- **Eng:** reuse the existing `markUndelivered` server CAS and `RIDER_CANCELLABLE_STATUSES` (don't
  rebuild); surface the undelivered submit's server-side conflict as a clean state; OTP resend must reset
  the server attempt lock. All in the lane briefs.

Verdict: cleared to implement. Post-fix, the diff gets a fresh design + engineering review before the PR.
