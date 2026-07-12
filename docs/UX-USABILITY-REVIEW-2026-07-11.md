# Lynia — UX & Usability Codebase Review

**Date:** 2026-07-11 · **Reviewer:** senior UX-engineering pass (routine) · **Scope:** shipped feature set + `docs/DESIGN.md` mockups only. No new features, no architecture changes.

> **How this was run.** Four parallel deep audits (customer journey, rider journey, cross-cutting
> resilience/data-frugality, copy/notifications/trust) against **current source**, each explicitly told to
> read all three prior passes (2026-07-08, -09, -10 — all merged) in full and not re-flag anything they
> already fixed. Those three passes had already closed ~44 findings: cold-start restore, idempotency,
> honest cooldown/on-hold/KYC copy, offer-conflict reconciliation, the live-expired push, focusManager
> background-poll fix, admin loading skeletons, and more. Today's findings are the genuine remaining gaps,
> each independently verified against the actual code (not inferred from comments or prior docs).

> **✅ Execution status (2026-07-11).** 22 of 24 findings below are **implemented** on this branch
> (`typecheck` + `lint` clean across api/mobile/admin/shared; API 620 tests, mobile 197 tests — one
> pre-existing API test failure and three pre-existing mobile Jest-transform suite failures were confirmed
> present on `main` before this branch touched anything, via `git stash` + re-run, and are unrelated to any
> file this pass changed). One finding (#5, OTP-verify idempotency after a lost response) is deliberately
> deferred — it touches session-issuance in the auth path and deserves an isolated, security-focused pass
> rather than being bundled into a same-day UX sweep.

---

## 1. Summary — the five highest-impact fixes

1. **A rider who delivers a parcel right as their connection drops can't tell — from their own phone —
   whether the hand-off registered.** If the 15s client timeout on `confirmDelivery` fired after the
   server already committed `delivered`, a retry hit a `409 "Order is not ready for delivery"` — read as a
   scary generic conflict — and then the active-job refetch (which excludes `delivered` orders) dropped
   straight to "No active job," with zero acknowledgement the parcel arrived. This is the single most
   consequential ambiguous-state gap in the app: it's the exact hand-off moment the whole tracking flow
   exists to make legible. Now the client checks the order directly on that specific conflict and, if it's
   actually `delivered`/`completed`, reconciles into the same success state `onSuccess` uses. *(HIGH / M)*

2. **Choosing a rider — the single highest-stakes tap in the customer journey — could leave a permanent,
   false "try again" banner glued under an already-correct tracking screen.** A client-side timeout on
   `selectOffer` rolled the optimistic UI back and set an error; the background refetch then correctly
   showed the assigned/tracking view, but nothing ever cleared the mutation's error state, so the red
   banner sat there — with no retry control left to fire — until the customer left and reopened the order.
   The same no-reset gap existed on cancel/rotate/rate/notify. Now every mutation resets once the order's
   status genuinely transitions underneath it. *(HIGH / S)*

3. **A single failed BullMQ job could leave a customer's auction countdown frozen at 0:00 forever, not
   just for 15 seconds.** `offer-expiry`'s job had no `attempts`/`backoff` (BullMQ defaults to exactly one
   try) and, unlike the rating-auto-close job, had no DB-driven reconciler as a Redis-independent backstop
   — so a transient DB/Redis blip during expiry left the order stuck `open_for_offers` with no other code
   path ever revisiting it. Added retry/backoff to the job plus a 2-minute reconciler sweep, mirroring the
   pattern `order-lifecycle.service.ts` already uses for stale deliveries. *(HIGH / S)*

4. **A rider's just-finished delivery was invisible on the one screen that answers "was I credited?".**
   Earnings filtered to `status === "completed"` only — but the fare is fixed at hand-off and doesn't
   change based on the customer's rating, so a `delivered`-but-not-yet-rated trip (which can sit for up to
   6 hours before auto-closing) was completely absent from Earnings while the *identical* trip was already
   visible on Trip history. Now Earnings includes `delivered` trips too, tagged "Awaiting rating." *(HIGH
   / S)*

5. **A rider told "contact support" for an on-hold account was handed a "Try again" button that can never
   work.** The 2026-07-10 pass fixed the on-hold gate's copy to honestly say only support can lift it —
   but the retry button one line below it was never updated to match, so the screen simultaneously told the
   rider "only support can fix this" and invited them to retry a button that structurally cannot succeed
   (only an admin's `clearHold` action changes the outcome). Dropped `on_hold` from the retry condition.
   *(HIGH / S)*

Also worth calling out even though it's Medium-High rather than top-5: **flipping `OTP_CHANNEL=sms` in
production today would silently and completely break sign-in for every user** — `SmsOtpSender.send()` is
an unimplemented stub that logs and returns success with no code ever delivered, and unlike the `console`
channel it had no boot-time guard. Added one, mirroring the existing console guard.

---

## 2. Findings table

| # | Journey | Lens | File:line | What the user experiences today | Proposed fix | Impact | Effort |
|---|---------|------|-----------|----------------------------------|---------------|--------|--------|
| 1 | Rider delivery (OTP confirm) | Ambiguous-state, error handling | `apps/mobile/app/rider/job.tsx` `deliverM` | A client-timeout retry after the server already committed `delivered` reads as a generic 409 conflict, then the active-job refetch drops to "No active job" with no acknowledgement the parcel arrived. | On the specific "not ready for delivery" conflict, fetch the order directly; if it's `delivered`/`completed`, reconcile into the success state with a calm toast. | High | M |
| 2 | Customer select-rider | Ambiguous-state, error handling | `apps/mobile/app/order/[id].tsx` (`selectM`/`rotateM`/`rateM`/`cancelM`/`notifyM`) | A timed-out-but-actually-successful mutation leaves a permanent "try again" error banner under an already-correct screen, with no way to clear or retry. | Reset every mutation's error state on any real order-status transition. | High | S |
| 3 | Waiting/offer window | Timeouts & retries, resumable flows | `apps/api/src/matching/offer-expiry.service.ts` | A single failed expiry job (no `attempts`/`backoff`, no reconciler) left an order stuck `open_for_offers` indefinitely — the countdown freezes at 0:00 for good, not just 15s. | Added `attempts: 3` + exponential backoff to the job, plus a 2-minute DB-driven reconciler sweep (mirrors `order-lifecycle.service.ts`'s stale-delivery reconciler). | High | S |
| 4 | Rider earnings | Emotional appeal & trust (fair record) | `apps/mobile/app/earnings/index.tsx` | A just-delivered trip is completely invisible in Earnings (not even shown pending) for up to 6h, while the identical trip is already visible in Trip history. | Include `delivered` trips too, tagged "Awaiting rating"; fare doesn't depend on the rating. | High | S |
| 5 | Rider go-online (on-hold gate) | Trust, error handling | `apps/mobile/app/rider/index.tsx` (retry-button condition) | The on-hold gate's copy says "contact support," but a "Try again" button directly below it re-hits the same refusal every time — nothing about tapping it can change the outcome. | Dropped `on_hold` from the retry condition; only `cooldown`/`out_of_area` (which genuinely self-resolve) keep it. | High | S |
| 6 | Auth (all users) | Timeouts & retries, launch hygiene | `apps/api/src/auth/otp-sender.ts` `SmsOtpSender`, `apps/api/src/config/env.ts` | `OTP_CHANNEL=sms` is a fully-valid config value that silently delivers no code to anyone — `SmsOtpSender.send()` is an unimplemented stub with no boot guard, unlike the `console` channel. | Added a production boot-guard rejecting `OTP_CHANNEL=sms`, mirroring the existing `console` guard. | High | S |
| 7 | Rider delivery-code lockout | Ambiguous-state | `apps/mobile/app/rider/job.tsx` (`otpTries`), `apps/api/src/orders/orders.service.ts` `getSnapshot` | After a 5-attempt lockout, a customer re-issuing the code resets the attempt count server-side — but the rider's screen had no way to learn that, so the lockout never cleared on the same screen instance, contradicting its own "enter the new one" copy. | Added `deliveryOtpAttempts` to the order snapshot; the rider's local counter now syncs DOWN whenever the server's committed count is lower (a rotate), while keeping the instant local increment on a wrong guess. | High | S-M |
| 8 | Admin console | Timeouts & retries (founder-facing) | `apps/admin/app/lib/api.ts` | Every admin read/write `fetch` had no timeout — a stalled API/proxy blocks the whole SSR render indefinitely; the `loading.tsx` skeletons never resolve into data or an honest error. | Added a 10s `AbortSignal.timeout` to both `adminFetchResult` and `adminPostResult`; an abort now surfaces as the existing `unreachable` reason. | High | S |
| 9 | Rider hand-off failure | Low tech-sophistication (input forgiveness) | `apps/mobile/src/ui/rider/UndeliveredSheet.tsx` | Tapping any one of four reason rows immediately ended the job — no confirm, no undo — despite being post-pickup (parcel already in hand) and more consequential than the pre-pickup cancel, which already got an explicit confirm step. | Added a one-tap-further confirm ("You picked '{reason}' — this ends the job.") mirroring `BailSheet`'s pattern. | Med-High | S |
| 10 | Customer tracking / rider board | Data/battery frugality | `apps/mobile/app/order/[id].tsx` (`orderQ`), `apps/mobile/app/rider/index.tsx` (`activeQ`) | Both queries kept polling on a fixed schedule (15s / 8s) for the entire length of an auction/active order/shift, even while their sibling sockets were healthy and already invalidating the same query live — the exact redundancy the 07-10 pass fixed on the rider's job screen, never ported to these two screens. | Both now poll only while their socket is disconnected, matching `job.tsx`'s already-shipped pattern. | Med | S |
| 11 | Rider dashboard | Copy jargon | `apps/mobile/app/rider/index.tsx:405` | "You have an active job (en route dropoff)" — a raw snake_case enum leaking to the rider, the same bug class the 07-08 pass fixed for `StatusPill` in a different spot the fix never reached. | `statusPillLabel(activeJob.status)` (already exported, already imported in this file). | Med | S |
| 12 | Customer waiting/offer window | Copy jargon, consistency | `apps/mobile/app/order/[id].tsx:585,703`, `apps/api/src/notifications/notifications.service.ts` | "Nudge price & re-broadcast" / "re-broadcast your parcel" survived on the live-auction screen and in push/feed copy for the identical event whose *other* on-screen copy was already scrubbed of "broadcast" in the 07-08 pass. | Relabeled to "Raise price & send again" (screen) and "send it/your parcel again" (push/feed), matching the vocabulary already standardized elsewhere. | Med | S |
| 13 | Auth (WhatsApp send failure) | Copy jargon | `apps/api/src/auth/otp-sender.ts:82` | A WhatsApp network error surfaced verbatim as `"Couldn't reach the OTP provider"` — "OTP" is exactly the jargon term item-5 of every prior pass targeted, missed here because a sibling string on the next line was fixed but this one wasn't. | `"Couldn't send the code — try again in a moment."` | Med | S |
| 14 | Tracking window (both sides) | Trust (perceivable privacy) | `apps/mobile/app/order/[id].tsx`, `apps/mobile/src/ui/rider/JobDetailsCard.tsx` | The counterparty phone number is correctly revealed only `assigned`→`completed` (verified against `PHONE_REVEAL_STATUSES`) — but neither side's screen ever explained that, so a trust feature the user can't perceive builds no trust. | Added a one-line caption under each phone row: "Shared only while your delivery is live — for your/their privacy." | Med | S |
| 15 | Customer tracking (delivered) | Emotional appeal, success confirmation | `apps/mobile/app/order/[id].tsx` | The `assigned` transition gets an explicit toast ("You're matched…"); the `delivered` transition — arguably the higher-anxiety moment ("did my parcel arrive?") — got only a silent haptic, asymmetric with both its own sibling and the rider's identical-event confirmation. | Added a matching toast: "Delivered! Let your rider know how it went." | Med | S |
| 16 | Customer create-delivery | Input forgiveness | `apps/mobile/app/home.tsx` (pickup/recipient phone fields) | Waypoint contact phones had no format check — only a bare 6-char length floor — unlike the sign-in phone field's tolerant `normalizePhone`. A 6-character typo passed silently; the failure only surfaced mid-delivery when a rider's dialer opened on garbage. | Gated validity on `normalizePhone(...) !== null` (the same ZW-aware check used at sign-in), with an inline "That doesn't look like a phone number" hint. | Med | S |
| 17 | Customer create-delivery | Input forgiveness | `apps/mobile/app/home.tsx` (declared value) | `declaredValueOk` only mirrored the contract's upper bound (≤150), not `nonnegative()` — a pasted negative value left Broadcast enabled, then bounced off a raw server Zod message. | Added the lower bound (`>= 0`) to the client check, with matching copy. | Low-Med | S |
| 18 | Customer waiting/offer window | Trust, error feedback | `apps/mobile/app/order/[id].tsx` | "Get help with this trip" — the order-scoped support control — was hidden during `open_for_offers`/`expired`, the single highest-anxiety stretch of the journey ("is anyone going to take my price?"), even though the server-side `raise()` already accepts a report at any status. | Added `open_for_offers`/`expired` to the render condition. | Med | S |
| 19 | Customer/rider select-rider | Latency, perceived speed | `apps/mobile/app/order/[id].tsx`, `apps/mobile/src/ui/order/CounterOfferCard.tsx` | "Choose this rider" / "Accept $X" showed a bare spinner for up to 15s with no "still trying" signal, unlike the rider's own equivalent tap, which already got this treatment in the 07-10 pass. | After 4.5s of `isPending`, both buttons swap to "Still choosing — hang on," mirroring the shipped `offerSlow` pattern. | Med | S |
| 20 | Rider KYC onboarding | Latency, perceived speed | `apps/mobile/app/rider/become.tsx` | A real photo upload on a slow link showed a bare "Uploading…" for the full 15s timeout with no escalating feedback, unlike the identical pattern already shipped for offer submits. | After 4.5s, the button swaps to "Still uploading — hang on." | Med | S |
| 21 | Rider KYC onboarding | Photo uploads, resumable flows | `apps/mobile/app/rider/become.tsx` | On an upload failure, the only recovery was "Retake photo" — always re-invoking the camera — even when the capture itself was fine and only the upload (the actual point of failure on a flaky link) needed retrying. | Keep the failed asset's local URI; a new "Try again" button re-uploads the SAME file. | Low-Med | S |
| 22 | Rider board | Data/battery frugality | `apps/mobile/app/rider/index.tsx` (`activeQ`) | Same class as #10 — folded in above; the `useRiderBoard` hook was reordered ahead of `activeJob`'s query so the poll can read its live connection state. | (implemented together with #10) | — | — |

---

## 3. Quick wins (High/Med impact + Small effort) — all implemented this pass

Items **#2, #3, #4, #5, #6, #8, #9, #10, #11, #12, #13, #14, #15, #16, #17, #18, #19, #20, #21**. Item
**#1** (delivery-OTP reconciliation) and **#7** (delivery-code lockout resync) are Medium/S-M effort but
were bundled in given how directly they reuse the existing reconciliation pattern from prior passes.

---

## 4. Copy fixes

| Screen / message | Before | After |
|---|---|---|
| WhatsApp send failure (`otp-sender.ts`) | "Couldn't reach the OTP provider" | "Couldn't send the code — try again in a moment." |
| Rider dashboard active-job banner (`rider/index.tsx`) | "You have an active job (en route dropoff)" (raw enum) | "You have an active job (On the way to drop-off)" (via `statusPillLabel`) |
| Customer live-auction urgent CTA (`order/[id].tsx` ×2) | "Nudge price & re-broadcast" | "Raise price & send again" |
| No-offers push + in-app feed (`notifications.service.ts` ×2) | "No rider took your price. Nudge it up and re-broadcast." | "No rider took your price yet. Try raising it and sending again." |
| Riders-back-online push (`notifications.service.ts`) | "Riders are back near your pickup — re-broadcast your parcel to get offers." | "Riders are back near your pickup — send your parcel again to get offers." |
| Phone reveal (customer + rider cards) | *(no explanation)* | "Shared only while your/this delivery is live — for your/their privacy." |
| Delivered transition (customer tracking) | *(silent haptic only)* | Toast: "Delivered! Let your rider know how it went." |
| Select-rider / accept-counter buttons (slow network) | (bare spinner, no copy change) | "Still choosing — hang on" after 4.5s |
| KYC photo upload (slow network) | "Uploading…" (unchanged for the full 15s) | "Still uploading — hang on" after 4.5s |
| Undelivered reason picker | one-tap, no confirm | "End this job? You picked '{reason}' — this ends the job and frees you for the next one." + explicit confirm |
| Waypoint phone fields, invalid entry | *(no validation)* | "That doesn't look like a phone number" |
| Declared value, negative entry | (upper-bound message only) | "Declared value must be between $0 and $150." |

---

## 5. Ambiguity audit — "did that actually happen?"

| Situation | Today (before this pass) | Fix |
|---|---|---|
| Rider confirms delivery, request times out client-side but the server already committed `delivered` | Generic "check your connection" error → retry gets a confusing "not ready for delivery" conflict → active-job query returns null → "No active job," no mention the delivery succeeded | #1 |
| Customer chooses a rider, the select times out but actually succeeded server-side | UI rolls back, refetch shows the correct tracking screen — but the error banner never clears; no retry control left to make | #2 |
| Order's offer-expiry job fails once (transient DB/Redis blip) | No retry, no reconciler — the auction stays `open_for_offers` forever; the countdown is frozen at 0:00 permanently, not just for 15s | #3 |
| Rider hits the 5-attempt delivery-code lockout, customer re-issues a fresh code | Server resets the count; rider's screen has no way to learn this and stays locked on the same instance | #7 |
| Rider on hold reads "contact support," then sees "Try again" | Retry silently fails identically every time — was that supposed to work? | #5 |
| Rider delivers a parcel, checks Earnings right after | Trip is entirely absent (not even pending) for up to 6h, while Trip history shows it immediately | #4 |
| Admin API stalls on a weak connection | Indefinite spinner — no timeout, no error, no retry surfaces | #8 |

---

## 6. Out-of-scope log

- **OTP-verify idempotency after a lost response** (`apps/api/src/auth/auth.service.ts` `verifyOtp`) — a
  client timeout after a *successful* verify (session already issued, OTP record already deleted) makes an
  immediate retry read as "Code expired or never requested" instead of reconciling into the already-issued
  session. Real, but touches session-issuance in the auth path; deserves a dedicated, security-reviewed pass
  rather than a same-day bundle. Logged, not implemented.
- **Client-side image downscale before KYC-selfie/item-photo upload** (`expo-image-manipulator` still not
  installed) — unchanged from every prior pass; needs a native module + device build.
- **Order-tracking screen (`order/[id].tsx`) re-renders the whole ~900-line component on every WS position
  tick** — unchanged from 07-09/07-10; the real fix touches the largest screen component in the app.
- **Rider's "Follow route in Google Maps" button backgrounds the app and silently pauses live GPS
  streaming** — needs a foreground service on Android plus device testing.
- **Proof-of-pickup rider photo** — `docs/DESIGN.md` itself notes this is still deferred; new-feature-shaped.
- **Fare-adjustment provenance** in admin — needs an `agreedFareSource` field or audit-log lookup.
- **Rider board's 1s countdown re-renders the whole open-orders list** — unchanged from 07-10; the real fix
  is a larger `SentOfferCard` extraction.
