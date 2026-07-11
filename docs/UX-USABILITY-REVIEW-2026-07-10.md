# Lynia — UX & Usability Codebase Review

**Date:** 2026-07-10 · **Reviewer:** senior UX-engineering pass (routine) · **Scope:** shipped feature set + `docs/DESIGN.md` mockups only. No new features, no architecture changes.

> **How this was run.** Four parallel deep audits (customer journey, rider journey, cross-cutting
> resilience/data-frugality, copy/notifications/admin) against **current source**, explicitly told not to
> re-report anything already fixed in the 2026-07-08 and 2026-07-09 passes (both merged). Those two passes
> had already closed ~25 findings — cold-start restore, idempotency-survives-kill, honest cooldown copy,
> KYC relabeling, push routing, human status labels, role-toggle guard, admin stuck-banner honesty, and
> more. Today's findings are the genuine remaining gaps.

> **✅ Execution status (2026-07-10).** All quick wins below are **implemented** on this branch (typecheck +
> lint + all 825 tests green across API/mobile/admin — API 613, mobile 212). Two items are logged as
> deferred (§6) because they need a native module + device build (image downscale) or touch the largest
> screen component in the app and deserve isolated verification (tracking-screen re-render).

---

## 1. Summary — the five highest-impact fixes

1. **The customer's auction countdown could freeze at 0:00 for up to 15s at the single most anxious moment
   ("did anyone take my price?").** `expireOrder()` flipped the order to `expired` and pushed `bid:expired`
   to the *rider* board room, but never told the *customer's own* order room the auction closed — the
   client only found out on its 15s poll. Now it also emits `orderStatus:expired` on the order room, so the
   customer's screen updates the instant the auction closes, like every other status change already does.
   *(HIGH / S)*

2. **The whole app kept polling on a schedule while backgrounded.** React Query's `refetchInterval` (order
   tracking every 15s, the rider board every 15s, active-job checks every 6-8s) never actually paused when
   the app went to the background — nothing wired `focusManager` to `AppState`, so React Query's default
   "focused" check was always true. On the exact cheap-Android/expensive-data profile this app targets,
   every backgrounded minute still burned data and battery on schedule. One root-level fix. *(HIGH / S)*

3. **A rider told they're "on hold" was pointed at a self-recovery path that cannot run.** The gate copy said
   "Complete a few clean trips to recover it, or contact support" — but the online-gate hard-blocks an
   `on_hold` rider from going online at all, so they can never *complete* those clean trips; only an admin
   `clearHold` action can lift it (confirmed in the admin service's own code comment). A rider reading this
   copy would wait indefinitely for a self-fix that structurally cannot happen. Copy now makes contacting
   support the only actionable step. *(HIGH / S)*

4. **A rider's offer could go through but the app never found out.** If a `makeOffer` request timed out
   client-side (15s cap) after the server had already committed it, a retry hit the API's own idempotency
   guard ("You already responded to this order... one round only") — but the client treated that as a
   generic error, leaving the order un-marked as bid, with no countdown card and no way to tell the offer
   actually went out. The same handler also gave a generic error when the 90s auction closed mid-submit,
   instead of the calm "that window just closed" framing already used elsewhere. Both are now reconciled:
   an "already responded" conflict is treated as success (the sent-offer card appears), and a closed-auction
   conflict gets the same calm copy as a live expiry. *(HIGH / M)*

5. **Raw backend enums and generic strings were leaking straight to users with no plain-language layer.**
   `Cannot cancel a ${order.status} order` rendered the raw snake_case status (e.g. "en_route_dropoff")
   verbatim in the mobile error banner; a non-JSON gateway error surfaced as `"Request failed (502)."` with
   no next step; a stuck-order admin banner unconditionally claimed "the customer has not reported a problem
   yet" even when a real report already existed. All three now speak plainly and tell the truth. *(HIGH-MED
   / S)*

---

## 2. Findings table

| # | Journey | Lens | File:line | What the user experiences today | Proposed fix | Impact | Effort |
|---|---------|------|-----------|----------------------------------|---------------|--------|--------|
| 1 | Waiting/offer window | Latency, ambiguous-state | `apps/api/src/matching/matching.service.ts` `expireOrder()` | Countdown hits 0:00 and sits frozen with "Finding riders…" still showing for up to 15s — no live push tells the customer's own order room the auction closed. | Also emit `gateway.emitOrderStatus(orderId, "expired")` alongside the existing `emitBidExpired`. | High | S |
| 2 | All screens | Data/battery frugality | `apps/mobile/app/_layout.tsx`; `apps/mobile/src/query/client.ts` | No `focusManager`↔`AppState` wiring — `refetchInterval` polling (order/offers 15s, board 15s, active-job 6-8s) keeps firing on schedule while backgrounded. | Added `wireFocusManager()` (AppState listener → `focusManager.setFocused`), called once at app root. | High | S |
| 3 | Rider on-hold gate | Trust, copy | `apps/mobile/src/logic/gates.ts` (`on_hold` message) vs `apps/api/src/admin/admin-riders.service.ts` (own comment: online-gate refuses on_hold entirely) | Told to "complete a few clean trips to recover it" — a path that's structurally impossible; only an admin can clear the hold. | Rewrote copy so contacting support is the only actionable step. | High | S |
| 4 | Rider accept/counter | Ambiguous-state, error handling | `apps/mobile/app/rider/index.tsx` `offerM` | A client-timeout retry that lands on an already-committed offer reads as a generic error — no sent-offer card, no countdown, no way to tell it went through. A closed-auction conflict also reads as generic. | `offerM.onError` now special-cases both known conflict messages: "already responded" reconciles into the same sent-offer state `onSuccess` uses; "not open for offers" gets calm expired-style copy. | High | M |
| 5 | Cancel (both roles) | Copy, enum leak | `apps/api/src/orders/order-lifecycle.service.ts:459` | `ConflictException` message included the raw status enum verbatim (e.g. "Cannot cancel a en_route_dropoff order") — the client renders exception messages unmodified. | Plain-language message: "This order can't be cancelled anymore — it's already past that point." | Med-High | S |
| 6 | Any non-JSON gateway error | Error feedback | `apps/mobile/src/api/client.ts` `friendlyMessage()` | Fallback for a non-JSON error body (proxy/gateway page, bare 502/504) was `"Request failed (502)."` — no plain explanation, no next step. | `"Couldn't reach LyniaGo. Check your connection and try again."` (mirrors existing network-down copy). | Med | S |
| 7 | Admin stuck-order support | Feedback, honesty (founder) | `apps/admin/app/orders/[id]/page.tsx`; `apps/api/src/admin/admin-orders.service.ts` `getOrderDetail` | Banner unconditionally claimed "the customer has not reported a problem yet," even when a real `Issue` already existed for the order. | Added `hasOpenIssue` (queries `Issue` for `status in (open, investigating)`) to order detail; banner branches on it. | Med | S |
| 8 | Admin "Nudge rider" | Honesty (founder) | `apps/admin/app/orders/[id]/page.tsx` | Button read "Nudge rider — 'Are you OK to continue?'" but only writes an audit-log row — no push/SMS/call ever reaches the rider. An ops agent would wait for a reply that could never come. | Relabeled: "Log a follow-up note (doesn't contact the rider)." | Med | S |
| 9 | Customer create (pins) | Low-tech usability | `apps/mobile/src/ui/ComposeMap.tsx` marker `onDragEnd` | Dragging a pin to fine-tune it (the natural fat-finger-correction gesture) moved the pin but never re-ran reverse-geocoding — the landmark text kept describing the earlier, imprecise tap location. | `onDragEnd` now calls the same `setActive()` path the map-tap handler uses, re-running `reverseGeocode`. | Med | S |
| 10 | Tracking window (customer) | Trust, copy consistency | `apps/mobile/src/ui/index.tsx` `STEP_LABELS.customer.completed` | A `completed` order's timeline step read "Rate your rider" — contradicting the "Delivered & completed. Thank you!" card on the same screen for an order that's already been rated (or the rating window lapsed). | Relabeled to "Trip complete," distinct from the `delivered` step where the RatingCard actually lives. | Med | S |
| 11 | Post-delivery rating | Trust, emotional appeal | `apps/mobile/src/ui/order/RatingCard.tsx` | All 5 stars rendered pre-filled before any tap — visually claims "already rated 5★" right next to a "Tap a star to rate" hint, nudging toward an inflated, unchosen rating. | `score` now starts unselected (`0`) instead of `5`. | Med | S |
| 12 | Rider job screen | Data frugality | `apps/mobile/app/rider/job.tsx` `jobQ` | REST-polled the active job every 6s for the entire delivery, even though the job socket (`useRiderJobSocket`) already resyncs `["activeJob"]` on connect. | Poll only while the job socket isn't connected (`jobPollFallback` toggled by `jobSocketConnected`). | Med | S |
| 13 | Rider heartbeat kick | Error feedback, trust | `apps/mobile/app/rider/index.tsx` heartbeat effect | A 403 from the 20s heartbeat (rider already taken offline server-side) showed only "cooldown or a connection issue" — vague — while the *identical* 403 via the online-toggle mutation correctly routes to the specific gate screen (suspended/banned/on_hold/cooldown + support row). | Heartbeat 403 now resolves through the same `onlineGateReason` path as the toggle. | Med | S |
| 14 | Rider accept/counter | Perceived latency | `apps/mobile/app/rider/index.tsx` offer button | A bare spinner for up to 15s (the request timeout) inside the 90s auction window reads as "frozen," not "still trying." | After 4.5s of `isPending`, button label swaps to "Still sending — hang on." | Med | S |
| 15 | Rider trip log/earnings | Trip fairness | `apps/mobile/app/earnings/index.tsx` `fmtDate` | Rows showed date only ("10 Jul") — three same-day trips are indistinguishable without tapping into each one to reconcile cash collected. | Added a time alongside the date. | Low | S |
| 16 | Mobile bundle | Data/bundle frugality | `apps/mobile/package.json` | `convex` (a full backend-client SDK, ^1.42.1) was declared as a dependency but never imported anywhere in the app — dead weight in every EAS build. | Removed the unused dependency; lockfile regenerated. | Low-Med | S |
| 17 | Admin detail routes | Perceived latency (founder) | `apps/admin/app/{orders,riders,customers,issues}/[id]/` | List routes (`orders/loading.tsx` etc.) already show a skeleton while their server component awaits data; the corresponding `[id]/page.tsx` detail routes had no sibling `loading.tsx` — on weak internet, clicking into a detail page shows a blank screen for the full round trip. | Added `loading.tsx` to all four detail routes, reusing the existing `PageSkeleton`. | Med | S |

---

## 3. Quick wins (High/Med impact + Small effort) — all implemented this pass

Items **#1–#3, #5–#17** above. Item **#4** (offer-submit reconciliation) is Medium effort but was small
enough in practice to bundle in given how directly it reuses the existing `onSuccess` sent-offer logic.

---

## 4. Copy fixes

| Screen / message | Before | After |
|---|---|---|
| Rider on-hold gate (`gates.ts`) | "Your reliability score dropped below what's needed to accept deliveries. Complete a few clean trips to recover it, or contact support." | "Your reliability score dropped too low to keep riding automatically. Contact support to have your account reviewed." |
| Cancel-blocked conflict (`order-lifecycle.service.ts`) | `Cannot cancel a en_route_dropoff order` (raw enum) | "This order can't be cancelled anymore — it's already past that point." |
| Non-JSON API error fallback (`client.ts`) | "Request failed (502)." | "Couldn't reach LyniaGo. Check your connection and try again." |
| Rider heartbeat-kick banner (`rider/index.tsx`) | "You were taken offline (cooldown or a connection issue). Tap Go online to retry." | Routes to the specific gate screen (suspended/banned/on_hold/cooldown), same as the toggle path. |
| Admin stuck-order banner | "...The customer has not reported a problem yet." (always) | "...The customer or rider has already filed a report — check Issues." when a real open `Issue` exists; otherwise "No one has reported a problem yet." |
| Admin "Nudge rider" button | "Nudge rider — 'Are you OK to continue?'" (implies contact) | "Log a follow-up note (doesn't contact the rider)" |
| Tracking timeline, `completed` step (customer) | "Rate your rider" | "Trip complete" |
| Rider accept/counter button (slow network) | (bare spinner, no copy change) | "Still sending — hang on" after 4.5s |
| Rider offer conflict: auction just closed | generic API error text | "That request's window just closed — someone else may already have it." |

---

## 5. Ambiguity audit — "did that actually happen?"

| Situation | Today (before this pass) | Fix |
|---|---|---|
| Customer's countdown hits 0:00 | Screen freezes at "Finding riders…" for up to 15s — no signal the auction closed. | #1 |
| Rider retries an offer submit after a client-side timeout | Told "you already responded" but the board never shows the offer as sent — no way to confirm it went through. | #4 |
| Rider submits an offer right as the 90s window closes | Generic error, same as any other failure — invites a pointless retry. | #4 |
| Customer drags a pin to correct an imprecise tap | Pin moves but the landmark text still describes the old spot — silently mismatched. | #9 |
| Rider goes offline via a failed heartbeat (not the toggle) | Vague "connection issue" — can't tell if they're suspended, on cooldown, or just had a network blip. | #13 |
| Ops looks at a stuck-order banner during an incident | Static claim that no one has reported a problem, even when someone has. | #7 |
| Ops taps "Nudge rider" | Looks like a message was sent; nothing reaches the rider. | #8 |

---

## 6. Out-of-scope log

- **Client-side image downscale before KYC-selfie/item-photo upload** (`expo-image-manipulator` still not
  installed) — unchanged from the 2026-07-08 review; needs a native module + device build to verify, outside
  a vendor-free pass.
- **Order-tracking screen (`order/[id].tsx`) re-renders the whole ~900-line component on every WS position
  tick** — unchanged from the 2026-07-09 review; the real fix (query-slice `select` or targeted
  `React.memo`) touches the largest screen component in the app and deserves isolated verification.
- **Rider's "Follow route in Google Maps" button backgrounds the app and silently pauses live GPS
  streaming** (no background-location permission/task registered) — needs a foreground service on Android
  plus device testing; logged for a dedicated pass, not bundled here.
- **Proof-of-pickup rider photo** — `docs/DESIGN.md` itself notes this is still deferred; no camera capture
  exists in `PickupChecklist`. New-feature-shaped, out of scope for this pass.
- **Fare-adjustment provenance** (admin fare row can't distinguish an admin cash-correction from a real
  rider counter-offer) — needs an `agreedFareSource` field or an audit-log lookup; logged, not bundled.
- **Rider board 1s countdown re-renders the whole open-orders list** — logged from the cross-cutting audit;
  the real fix (extract a `SentOfferCard` with its own ticking state) is a larger refactor of `rider/index.tsx`
  than fits a same-day quick win.
