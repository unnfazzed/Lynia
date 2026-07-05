# Lynia — User-Journey Bug Report

_Walking the app as a real customer and a real rider, step by step, hunting for anything that
**blocks, strands, confuses, or loses data** during normal use. Functional/UX, not security._
_Every finding was verified line-level against source._

**Severity:** **P1** = blocks the journey / strands the user · **P2** = frustrates, confuses, or
loses work · **P3** = polish. `file:line` given for each; "→" is _user action → what breaks_.

## The one-line summary

The happy paths are well-built, but **both journeys have hard dead-ends off the happy path**:

- **Rider:** once the parcel is on the bike, _every_ non-delivery outcome is a dead end — there is
  **no "couldn't deliver" action in the app at all**, and the only visible exit ("Cancel job") is
  rejected by the server post-pickup.
- **Customer:** if the map tile fails to load there is **no other way to set a pickup pin**, and a
  rider-bail can **strand the customer on a dead "cancelled" screen** instead of following the
  re-broadcast.

---

## RIDER JOURNEY

### P1 — blockers

**R1 · There is no "mark undelivered" flow anywhere in the rider app.**
`apps/mobile/src/api/orders.ts` (no `markUndelivered`) · `apps/mobile/app/rider/job.tsx` (no UI)
The backend supports it (`order-lifecycle.service.ts markUndelivered`), the shared enum
`UndeliveredReason` exists, `OrderSnapshot` carries `undeliveredReason`/`undeliveredAttempts`, and the
**customer** screen renders the terminal card (`order/[id].tsx:612`) — but the rider has neither an API
function nor a button to produce it. `orders.ts` exposes only `advanceStatus`, `confirmDelivery`,
`cancelOrder`, `confirmItems`.
→ recipient refuses / is unreachable / bike breaks down after pickup → the rider cannot record any
outcome and is stranded on a job they can't close.
**Fix:** add a "Can't complete delivery" action on `picked_up`/`en_route_dropoff` that POSTs a reason to
the undelivered endpoint and resolves to a terminal + back-to-board.

**R2 · "Cancel job" is shown post-pickup, where the server rejects it — and it's the only visible exit.**
`apps/mobile/app/rider/job.tsx:196,373`
The button is gated on `isActive = ACTIVE_RIDE_STATUSES.includes(status)` (assigned … **en_route_dropoff**),
but riders may only cancel through `en_route_pickup` — `RIDER_CANCELLABLE_STATUSES` (`enums.ts:96`)
excludes `picked_up`/`en_route_dropoff`, and its own comment says "the rider UI removes the action outside
this set." It doesn't.
→ after collecting the parcel the rider taps "Cancel job" (their only escape given R1) → server 4xx →
raw error, no progress.
**Fix:** gate the Cancel button on `RIDER_CANCELLABLE_STATUSES`, not `ACTIVE_RIDE_STATUSES`.

_R1 + R2 compound into the worst rider experience: post-pickup, there is no valid way to close a job
that isn't a clean delivery._

### P2 — frustrations

**R3 · A returning rider always lands on the customer compose screen, never their rider home.**
`apps/mobile/app/verify.tsx:34`
`role.tsx` correctly routes rider → `/rider`, but after sign-in `verify.tsx` does
`router.replace(chosen ? "/home" : "/role")` — _any_ saved role goes to `/home`. A returning rider must
then go Account → "Rider dashboard" every session to reach work.
**Fix:** `router.replace(chosen === "rider" ? "/rider" : chosen ? "/home" : "/role")`.

**R4 · "Contact support" is a dead instruction — there is no way to contact support anywhere in the rider flow.**
`apps/mobile/app/rider/index.tsx:283-293` · `src/logic/gates.ts:62-70`
Three terminal states tell the rider to "contact support" — KYC attempt-cap lock, suspended, on_hold —
but each `EmptyState` renders only a "Refresh status" button. No `mailto`/`tel`/WhatsApp link exists in
`app/rider/`.
→ rider fails KYC twice → told to "contact support" → nothing to tap.
**Fix:** add a working "Contact support" button (`Linking.openURL('mailto:…' / 'https://wa.me/…')`) to
the locked, suspended, and on_hold states.

**R5 · on_hold is a catch-22 with no in-app escape.**
`apps/mobile/src/logic/gates.ts:66` · `app/rider/index.tsx:322`
on_hold copy says "complete a few clean trips to recover it," but being on_hold is exactly what hides the
go-online card (`gate` truthy → online Card never renders). Reliability only recovers via completed trips
(`RELIABILITY.RECOVER_PER_COMPLETION`), which need going online. The only real escape is an admin lift —
which has no in-app trigger (and per R4, no support button).
**Fix:** rewrite the copy to the real recovery mechanism and give it a working support affordance.

**R6 · Getting selected doesn't move the rider to the job — no push deep-link, no socket nav.**
`apps/mobile/app/rider/index.tsx:256-262` · `src/push/push.ts`
On selection the rider learns only via `activeQ` polling every 8s, rendering a card they must manually
tap. There's no `addNotificationResponseReceivedListener`, and the board socket listens only for
`boardNewOrder`/`bidExpired`.
→ rider backgrounds the app after bidding, gets a push banner, taps it → app opens to wherever it was,
not the job; up to 8s idle (or missed) while the customer waits.
**Fix:** on the selection push/socket event, `router.push("/rider/job")`.

**R7 · No navigation/directions handoff to pickup or drop-off.**
`apps/mobile/app/rider/job.tsx:282` · `src/ui/LiveMap.tsx:37`
`LiveMap` is a read-only tracking map (Expand + Recenter only). The job screen gives phone dialers and
landmark text but no "Open in Maps" / turn-by-turn.
→ the rider has to actually ride there with only coordinates and a static preview.
**Fix:** add an "Open in Maps" button linking to a `geo:`/`google.navigation:`/`maps://` URL for the
pickup and drop-off points.

**R8 · `job:cancelled` while backgrounded strands a post-pickup rider with no hand-back info.**
`apps/mobile/app/rider/job.tsx:40-56,185`
The hand-back terminal is frozen only from the live `job:cancelled` socket event, and the cancelled order
"immediately drops out of /orders/mine/active." If the app was backgrounded (socket down) when the
customer cancels, reopening gets `getActiveOrder()` → null → a bare "No active job," with no sender phone
and no "you still hold the parcel" guidance.
**Fix:** keep a cancelled-but-uncollected order retrievable, or deliver the hand-back state via a durable
push payload, not only the live socket.

**R9 · Delivery-OTP lockout gives no attempts-remaining and leaves the field inviting futile retries.**
`apps/mobile/app/rider/job.tsx:84-99,362`
A wrong code shows a raw error with no count of tries left; on the 5th (403) the lock message appears, but
the field and "Confirm delivery" button stay enabled (disabled only on `code.length !== 6`), so the rider
keeps tapping into a locked endpoint. The rider has no in-app re-issue (`rotateDeliveryCode` is
customer-only).
**Fix:** surface remaining attempts from the error, and disable the field once locked until the customer
re-issues.

**R10 · Going online outside the service corridor gives a generic error + silent toggle bounce.**
`apps/mobile/src/logic/gates.ts:25`
`OnlineGateReason` is only `kyc | suspended | on_hold | cooldown` — there's no out-of-area reason for
going online (`isOutOfServiceArea` is wired only to customer order-create). If the rules API refuses
go-online for being out of area, `onlineGateReason()` returns null → "Couldn't change your status." and
the switch bounces back to Offline with no reason.
**Fix:** add an `out_of_area` gate reason + copy and map the corridor refusal to it.

### P3 — polish

- **Retake photo destroys the good photo before the retry.** `rider/become.tsx:52` — `setPhotoUri(uri);
  setPhotoKey(null)` runs before the upload; on a failed retake `setPhotoUri(null)` wipes the prior
  verified photo, dropping `canSubmit` to false. → keep the prior key/uri; overwrite only on success.
- **"Continue verification" is a silent no-op when no URL comes back.** `rider/index.tsx:124` — opens the
  browser only if `verificationUrl` is https, else just invalidates `["me"]` with no feedback.
- **`getMe` failure shows the full online dashboard optimistically.** `rider/index.tsx:78` —
  `knownUnverified` is false when `meQ.data` is null, so a network error renders the online card as if
  verified; going online then fails at the backend. No `meQ.isError` branch. → add an error/retry state.
- **Location denied is invisible on the board.** `rider/index.tsx:54-65` — a `catch {}` swallows a denied
  permission; every card falls back to "? km" with no hint that location is off.
- **All-items-unticked is a soft dead-end.** `rider/job.tsx:293-356` — the checklist replaces the advance
  button and "Confirm N collected" disables at zero ticks; a rider with none of the items can neither
  collect nor advance (and per R1 has no undelivered path).
- **Compose card isn't dismissed when the selected order expires mid-compose.** `rider/index.tsx:434` vs
  `use-rider-board.ts:72` — `bidExpired` clears the board entry but not the open offer card; Send then hits
  a closed order.

---

## CUSTOMER JOURNEY

### P1 — blockers

**C1 · The map is the only way to set a pin; if it fails to load, the whole order flow is dead.**
`apps/mobile/src/ui/MapPicker.tsx:112-127`
The only way to set pickup/drop-off is tapping the `MapView` (`onPress`). There's no address search and no
manual coordinate entry, and the file notes the map "needs the dev build + a Google Maps key on Android."
If the map fails (missing/invalid key, offline tiles, WebGL failure), the tap surface is a blank grey box →
`coordsOk` never becomes true → order can't be posted, with no alternative path.
**Fix:** add an address-search / manual-pin fallback, and detect+surface map-load failure instead of a
silent grey box.

**C2 · Rebroadcast follow can silently fail — customer stranded on the dead "cancelled" screen.**
`apps/mobile/app/order/[id].tsx:157` · `src/realtime/use-order-socket.ts`
On a rider bail the server cancels the order **and** emits `order:rebroadcast`. But
`socketExpected = isActive || delivered || open_for_offers` — **`cancelled` is not included**. If the
`order:status(cancelled)` push (or the 15s poll) refetches to `cancelled` before the rebroadcast handler
fires, the socket disconnects and the follow event is never received.
→ rider bails mid-trip → customer sees "This order is cancelled," never taken to the new auction.
**Fix:** keep the socket subscribed through `cancelled` for a short grace window so the rebroadcast can
still arrive.

### P2 — frustrations

**C3 · No "Resend code" and no cooldown on the OTP screen.**
`apps/mobile/app/verify.tsx:58-59` (+ `app/phone.tsx:45`)
The verify screen has only "Verify" and "Back." If the code never arrives, expires (300s), or locks after 5
tries, the only recovery is tapping "Back" to re-request — undiscoverable, and `phone.tsx` has no resend
cooldown either.
**Fix:** add an explicit "Resend code" with a visible countdown on `verify.tsx`.

**C4 · Stale rider position is rendered as "live"; the "rider went dark" state never surfaces.**
`apps/mobile/app/order/[id].tsx:357,362`
`riderPoint` is derived purely from lat/lng _existence_, not freshness. `PRESENCE_ESCALATION_MS` (120s) and
the snapshot's `rider.updatedAt` are never referenced. A 10-minute-old fix shows a full-opacity pin with the
copy "the gold pin updates live." The map's de-saturation keys off the _customer's_ socket, not the rider's
presence, so the "rider offline — call your rider" escalation is missing on the customer side.
**Fix:** compute `stale = now - updatedAt > PRESENCE_ESCALATION_MS`; mute the marker and switch to the
warning copy when stale.

**C5 · "Nudge price & re-broadcast" / "Send another request" throw away the whole order.**
`apps/mobile/app/order/[id].tsx:428,600`
All three recovery CTAs are literally `router.replace("/home")`. The labels promise a re-broadcast / price
nudge of _this_ order, but they dump the user on a blank new-order form — pickup, drop-off, items, and price
all lost, to be re-typed. This lands exactly when the auction expired and the user is already frustrated.
**Fix:** carry the order's params into the create flow (prefill), or call a real re-broadcast endpoint.

**C6 · The delivery-code card shows on cancelled / undelivered / completed orders.**
`apps/mobile/app/order/[id].tsx:130-138,388`
`deliveryCode` is rehydrated from SecureStore on mount regardless of status, and the card renders whenever
that state is set. So a cancelled or undelivered order still shows "Give this code to the recipient — the
rider enters it at hand-off" directly above "This order is cancelled." / "Parcel not delivered" — actively
misleading on `undelivered`.
**Fix:** gate the code card on live/deliverable statuses (`isActive`).

**C7 · A dropped select response strands the delivery code with no prompt to re-issue.**
`apps/mobile/app/order/[id].tsx:261-289`
`selectOffer` returns the one-time code only in `onSuccess`. If the POST commits server-side but the
response is lost, `onError` rolls back and the code is gone (server keeps only the hash). The 15s poll
re-lands on `assigned` with no code card and no message; the "Re-issue delivery code" button is buried with
no reason to tap it.
**Fix:** when `assigned`+ and no local code, prompt "Your hand-off code — tap to reveal" wired to rotate.

**C8 · "Use my location" fails silently when permission is denied.**
`apps/mobile/src/ui/MapPicker.tsx:82`
`if (status !== "granted") return;` inside the try — the button flickers "Locating…" then nothing, no
message, no "enable in Settings" hint. → add a one-line message pointing to the map / settings.

**C9 · GPS lookup has no timeout — "Locating…" can hang.**
`apps/mobile/src/ui/MapPicker.tsx:84`
`Location.getCurrentPositionAsync({ accuracy: Balanced })` has no timeout, while every REST call is bounded
at 15s. On a cold GPS fix the button can sit on "Locating…" indefinitely with no cancel. → race against an
8–10s timeout and fall back to "couldn't get your location — tap the map."

**C10 · A `declaredValue > 150` error points at a field hidden in a collapsed section.**
`apps/mobile/app/home.tsx:467,305`
Declared value lives inside "Add details (**optional**)" and isn't in `canSubmit`, but the contract enforces
`.max(150)`. Entering `500` keeps Broadcast enabled, then the server-side zod error shows a raw message in
the sheet while the offending field is collapsed out of view. → validate inline, or auto-expand the section
on that error.

**C11 · Landmarks are contract-required but sit under a section labeled "(optional)."**
`apps/mobile/app/home.tsx:447,276`
`canSubmit` requires both landmarks (matching `Waypoint.landmark.min(1)`). They auto-fill from reverse
geocode, which "can fail offline / keyless" — exactly the Android-no-key case — and the user must then open
"Add details (optional)" to satisfy a mandatory field. → relabel the section or move landmarks onto the
required path when auto-fill is empty.

**C12 · The server's `needsProfile` signal is dropped; there's no name-entry screen.**
`apps/mobile/app/verify.tsx:24-34` · `app/profile/index.tsx:60`
`VerifyResult.needsProfile` exists but `verify.tsx` never reads it, and the profile screen is read-only
("Editing your details is coming soon"). A brand-new customer never enters a name and renders as the literal
fallback "Your account." → honor `needsProfile` with a name-entry step, or stop returning it.

### P3 — polish

- **Auction clock hits 0:00 but the screen stays "Finding riders…" for up to 15s.**
  `order/[id].tsx:148` — the flip to `expired` waits for the next poll/WS; selecting in that gap fails
  server-side. → show a "window closing…" transitional state and refetch immediately at zero.
- **`requested` status renders a blank screen.** `order/[id].tsx:395-679` — every block is gated on a
  specific status; `requested` (a real lifecycle state) matches none → header pill + "Back home" only.
- **StatusPill renders every status in neutral grey.** `order/[id].tsx:385` — no `tone` passed, so
  cancelled / undelivered / delivered / completed look identical. → map status → tone.

---

## SHARED / BOTH ROLES

**S1 · Sign-out leaks the previous user's data and skips the liability disclaimer (shared devices).**
`apps/mobile/src/auth/auth-context.tsx:47`
`signOut()` clears only the session key — not the React Query cache, the saved order draft
(`lynia.orderDraft`), or the disclaimer flag (`lynia.disclaimerAccepted`). On a shared phone (common in the
target market), user B rehydrates user A's pickup/drop-off addresses and **skips the liability disclaimer**
(`home.tsx:347`) because A already accepted it. → in `signOut()`, also `queryClient.clear()` and delete the
draft / disclaimer / delivery-code keys.

---

## Checked and sound (not bugs)

- Locale decimals in price/value fields parse (`util.ts` comma→dot); REST calls are bounded at 15s with a
  friendly error (`client.ts`); the disclaimer is a genuine first-broadcast hard gate with a non-trapping
  back path; out-of-service-area is a calm distinct state that clears when a pin moves.
- Customer: empty-while-waiting is coherent; the select-race 409 is a calm "that rider was just taken";
  counter-offer decline reverts cleanly; rating is skippable and its undo timer is torn down on unmount;
  offer-list refresh is wired via `offers:changed` + a 15s fallback.
- Rider: KYC "pending" self-polls out (not a forever-stare) and offers "Continue verification"; declined
  shows the specific reason + a real retry; the attempt-cap lock is a clean state; empty board has a proper
  empty state and live updates; earnings renders a clean zero-trips state; the delivery-OTP field correctly
  uses `number-pad`+`maxLength=6` (the code is read aloud, not SMS'd, so autofill is N/A).
