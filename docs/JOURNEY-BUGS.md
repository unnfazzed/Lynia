# Lynia — User-Journey Bug Report

_Walking the app as a real customer and a real rider, step by step, hunting for anything that
**blocks, strands, confuses, or loses data** during normal use. Functional/UX, not security._
_Every finding was verified line-level against source._

**Severity:** **P1** = blocks the journey / strands the user · **P2** = frustrates, confuses, or
loses work · **P3** = polish. `file:line` given for each; "→" is _user action → what breaks_.

## The one-line summary

_Status as of the 2026-07-10 doc-sync: both dead-ends described below (rider post-pickup, customer
rebroadcast) have since been fixed — see the status table and per-finding notes. Left as originally
written for context on what the review found._

The happy paths are well-built, but **both journeys have hard dead-ends off the happy path**:

- **Rider:** once the parcel is on the bike, _every_ non-delivery outcome is a dead end — there is
  **no "couldn't deliver" action in the app at all**, and the only visible exit ("Cancel job") is
  rejected by the server post-pickup.
- **Customer:** if the map tile fails to load there is **no other way to set a pickup pin**, and a
  rider-bail can **strand the customer on a dead "cancelled" screen** instead of following the
  re-broadcast.

---

## Status update — 2026-07-05, after PR #98

PR **#98** ("Trust & safety (Issues/A-05, Report/block, SOS), settlement netting, Places addressing")
merged around the same time as this report. It was built on a parallel branch, so it did **not** target
these findings — but it happens to fix or soften a few. Verified against the merged `main`:

| Finding | Status after #98 | Evidence |
| --- | --- | --- |
| **R7** — no navigation handoff | ✅ **Fixed** | `src/logic/maps.ts` `mapsDirectionsUrl`; rider "Follow route in Google Maps" (`job.tsx:293`, no key needed) + customer map link (`order/[id].tsx:536`). |
| **C1** — map is the only way to set a pin | 🟡 **Partially fixed** | `src/ui/AddressSearch.tsx` now sits above each map (`home.tsx:448`), **but key-gated** — renders nothing unless `EXPO_PUBLIC_GOOGLE_PLACES_KEY` is set, so today's keyless build is still pin-only and the "map fails → dead" case remains. |
| **R1** — no rider undelivered flow | ✅ **Fixed** (since this table) | `markUndelivered` exists end-to-end: `apps/api/src/orders/order-lifecycle.service.ts` `markUndelivered`, `apps/mobile/src/api/orders.ts:145`, wired into `job.tsx` (mutation at `job.tsx:216`). |
| **R2** — Cancel shown post-pickup | ✅ **Fixed** (since this table) | `job.tsx` now gates "Cancel job" on `RIDER_CANCELLABLE.includes(order.status)`, hidden once the parcel is collected (comment cites this exact finding); the post-pickup escape hatch is "Can't complete delivery" (R1's fix). |
| **R4** — "contact support" is a dead instruction | ✅ **Fixed** (since this table) | `rider/index.tsx` renders `<SupportCallRow />` (a real `tel:` call row) for the KYC-locked, `suspended`, `on_hold`, and `banned` gate states — comments there cite this finding (R4) directly. |
| **C4** — stale rider GPS shown as "live" | ✅ **Fixed** (since this table) | `order/[id].tsx` now computes `stale = isActive && Date.now() - riderUpdatedAt > PRESENCE_ESCALATION_MS` and mutes/escalates on it — comment cites this finding (C4) directly. |
| **C6** — delivery code on terminal orders | ✅ **Fixed** (since this table) | The code card is now gated on `isActive`, with a comment citing this finding (C6) directly: "only while the trip is live/deliverable." |

New surfaces #98 added (context for future reports): order-level **Get help / raise issue**, **Report + block**
a counterparty, **SOS** with `tel:` "Call 999" on live trips, **address search** (key-gated), and **Google
Maps directions** deep-links.

**2026-07-10 doc-sync update:** nearly every P1/P2 finding in this report has since been fixed by later
work — R1–R10 (rider) and C2–C12 (customer) and S1 are all ✅ **FIXED**, verified line-level against
current source (see each section). Only **C1** (map-pin fallback, still key-gated) remains open at P1,
plus a handful of P3 polish items (marked per-item below). This report is kept as a historical record of
what the original 2026-07-05 pass found — current status is annotated inline rather than rewritten.

---

## RIDER JOURNEY

### P1 — blockers

**R1 · There is no "mark undelivered" flow anywhere in the rider app.** — ✅ FIXED
`apps/mobile/src/api/orders.ts:145` now exports `markUndelivered`; `apps/mobile/app/rider/job.tsx:216`
wires it into a mutation with a "Can't complete delivery" action, resolving to the terminal +
back-to-board flow this finding asked for.

**R2 · "Cancel job" is shown post-pickup, where the server rejects it — and it's the only visible exit.** — ✅ FIXED
`apps/mobile/app/rider/job.tsx` now gates "Cancel job" on `RIDER_CANCELLABLE.includes(order.status)`,
hidden once the parcel is collected — the in-code comment there cites this exact finding. Post-pickup,
the escape hatch is R1's "Can't complete delivery" action instead.

### P2 — frustrations

**R3 · A returning rider always lands on the customer compose screen, never their rider home.** — ✅ FIXED
`apps/mobile/app/verify.tsx:101` now does `router.replace(chosen === "rider" ? "/rider" : chosen ?
"/home" : "/role")` — exactly the fix this finding proposed.

**R4 · "Contact support" is a dead instruction — there is no way to contact support anywhere in the rider flow.** — ✅ FIXED
`apps/mobile/app/rider/index.tsx` now renders a real `<SupportCallRow />` (`tel:` call, not a
mailto/WhatsApp dead end) for the KYC attempt-cap lock, `suspended`, `on_hold`, and `banned` gate
states — the in-code comments cite this finding (R4) directly.

**R5 · on_hold is a catch-22 with no in-app escape.** — ✅ FIXED
Rider side: `rider/index.tsx` now shows both a "Try again" button that re-drives the online toggle for
the `on_hold` gate (the server re-checks and lets a recovered rider through) and the R4 `SupportCallRow`.
Admin side: an `on_hold` rider previously had no admin action at all (only `suspended` riders got
Lift/Ban) — `POST /admin/riders/:id/clear-hold` (`admin.controller.ts:188`,
`admin-riders.service.ts` `clearHold`) now gives an admin a real "Clear hold" trigger, surfaced in
`apps/admin/app/riders/[id]/RiderActions.tsx`. The on_hold copy in `gates.ts` still says "complete a
few clean trips to recover it," which remains the literal mechanism (self-recovery is still not
possible without going online first) — not stale, just worth knowing this is now escapable via support.

**R6 · Getting selected doesn't move the rider to the job — no push deep-link, no socket nav.** — ✅ FIXED by PR #150
`apps/mobile/app/rider/index.tsx:256-262` · `src/push/push.ts`
On selection the rider learns only via `activeQ` polling every 8s, rendering a card they must manually
tap. There's no `addNotificationResponseReceivedListener`, and the board socket listens only for
`boardNewOrder`/`bidExpired`.
→ rider backgrounds the app after bidding, gets a push banner, taps it → app opens to wherever it was,
not the job; up to 8s idle (or missed) while the customer waits.
**Fix:** on the selection push/socket event, `router.push("/rider/job")`. — landed: `pushDestination()`
(`src/push/push.ts`) routes rider-only statuses (`assigned`/`completed`) to `/rider/job`, wired through
both the live `addNotificationResponseReceivedListener` and a cold-start `getLastNotificationResponseAsync()`
check (`src/push/use-push-registration.ts:49-57`).

**R7 · No navigation/directions handoff to pickup or drop-off.** — ✅ FIXED by PR #98
`apps/mobile/app/rider/job.tsx:282` · `src/ui/LiveMap.tsx:37`
`LiveMap` is a read-only tracking map (Expand + Recenter only). The job screen gives phone dialers and
landmark text but no "Open in Maps" / turn-by-turn.
→ the rider has to actually ride there with only coordinates and a static preview.
**Fix:** add an "Open in Maps" button linking to a `geo:`/`google.navigation:`/`maps://` URL for the
pickup and drop-off points.

**R8 · `job:cancelled` while backgrounded strands a post-pickup rider with no hand-back info.** — ✅ FIXED
`apps/mobile/app/rider/job.tsx:264-281` now freezes the hand-back terminal from either the live socket
event OR a fetched `cancelled` order still in `/orders/mine/active` for a collected parcel;
`apps/mobile/src/ui/rider/terminals.tsx` `CancelledHandback` shows "you still have the parcel" guidance
plus a tap-to-call sender phone.

**R9 · Delivery-OTP lockout gives no attempts-remaining and leaves the field inviting futile retries.** — ✅ FIXED
`apps/mobile/src/ui/rider/DeliveryOtp.tsx:27-58` now shows "N attempts left", locks the copy at cap, and
disables the field/button at lockout (`DELIVERY_OTP_MAX_ATTEMPTS` from shared).

**R10 · Going online outside the service corridor gives a generic error + silent toggle bounce.** — ✅ FIXED
`apps/mobile/src/logic/gates.ts:27` — `OnlineGateReason` now includes `"out_of_area"` (and
`"kyc_expired"`/`"banned"`), with matching copy in `ONLINE_GATE_COPY` ("You're outside the service
area… Head back toward the city, then refresh.") and a `Try again` retry button for it in
`rider/index.tsx`, exactly the fix this finding asked for.

### P3 — polish

- ✅ FIXED — **Retake photo destroys the good photo before the retry.** `rider/become.tsx:91-107` now
  holds the prior uri/key and only overwrites on upload success; a failed retake rolls back instead of
  wiping the verified photo.
- **"Continue verification" is a silent no-op when no URL comes back.** `rider/index.tsx:166-178` —
  still opens the browser only if `verificationUrl` starts with `https://`, else silently just
  invalidates `["me"]` with no feedback. Still open.
- ✅ FIXED — **`getMe` failure shows the full online dashboard optimistically.** `rider/index.tsx:367-377`
  now has an explicit `meQ.isError` branch rendering a "Couldn't load your rider status" EmptyState +
  Retry instead of the online dashboard.
- ✅ FIXED — **Location denied is invisible on the board.** `rider/index.tsx:53,446-456` — `locDenied`
  now blocks the whole board behind an explicit "Can't find your location" gate with "Open location
  settings", instead of a swallowed `catch {}`.
- **All-items-unticked is a soft dead-end.** `apps/mobile/src/ui/rider/PickupChecklist.tsx:78-83` —
  "Confirm N items collected" still disables at zero ticks with no alternate action. Still open (the
  original aside "and per R1 has no undelivered path" is stale — R1 is fixed — but this specific
  pre-pickup dead-end is unchanged).
- **Compose card isn't dismissed when the selected order expires mid-compose.** `rider/index.tsx` —
  the `selected` state is still never cleared when `board.expiredOrderIds`/`board.takenOrderIds`
  contains it; only cleared on offer success or manual Cancel. Still open.

---

## CUSTOMER JOURNEY

### P1 — blockers

**C1 · The map is the only way to set a pin; if it fails to load, the whole order flow is dead.** — 🟡 PARTIALLY FIXED by PR #98 (key-gated address search)
`apps/mobile/src/ui/MapPicker.tsx:112-127`
The only way to set pickup/drop-off is tapping the `MapView` (`onPress`). There's no address search and no
manual coordinate entry, and the file notes the map "needs the dev build + a Google Maps key on Android."
If the map fails (missing/invalid key, offline tiles, WebGL failure), the tap surface is a blank grey box →
`coordsOk` never becomes true → order can't be posted, with no alternative path.
**Fix:** add an address-search / manual-pin fallback, and detect+surface map-load failure instead of a
silent grey box.

**C2 · Rebroadcast follow can silently fail — customer stranded on the dead "cancelled" screen.** — ✅ FIXED
`apps/mobile/app/order/[id].tsx:154-155` now includes a 20s `CANCELLED_GRACE_MS` grace window in
`socketExpected` (`... || (status === "cancelled" && !cancelledExpired)`), keeping the socket alive
through cancellation long enough for the rebroadcast push to arrive — exactly the fix this finding
proposed.

### P2 — frustrations

**C3 · No "Resend code" and no cooldown on the OTP screen.** — ✅ FIXED
`apps/mobile/app/verify.tsx:27-30,72-75,146-188` now has a full "Resend code" flow with an
absolute-deadline countdown, cooldown gating, and a "Send a fresh code" recovery path on lock/expiry.

**C4 · Stale rider position is rendered as "live"; the "rider went dark" state never surfaces.** — ✅ FIXED
`apps/mobile/app/order/[id].tsx` now computes `stale = isActive && riderUpdatedAt != null && Date.now() -
new Date(riderUpdatedAt).getTime() > PRESENCE_ESCALATION_MS` (in-code comment cites this finding, C4,
directly) and uses it to mute the marker / switch to warning copy, exactly as this finding asked for.

**C5 · "Nudge price & re-broadcast" / "Send another request" throw away the whole order.** — ✅ FIXED
`apps/mobile/app/order/[id].tsx:491-500` — `rebroadcast()` now calls `router.replace({ pathname:
"/home", params: buildRebroadcastParams(...) })`, carrying pickup/dropoff/items/price into the compose
form instead of dumping the user on a blank one.

**C6 · The delivery-code card shows on cancelled / undelivered / completed orders.** — ✅ FIXED
`apps/mobile/app/order/[id].tsx` now gates the code card on `isActive`, with an in-code comment citing
this finding (C6) directly: "only while the trip is live/deliverable... On a terminal order the code is
meaningless and... actively misleading."

**C7 · A dropped select response strands the delivery code with no prompt to re-issue.** — ✅ FIXED
`apps/mobile/app/order/[id].tsx:522-532` — when `isActive` and no local `deliveryCode`, a card now
prompts "tap to re-issue" wired to the rotate mutation.

**C8 · "Use my location" fails silently when permission is denied.** — ✅ FIXED
`apps/mobile/src/ui/MapPicker.tsx:124-126` now sets an explicit message on denial: "Location is off —
tap the map to drop your pin, or turn on location in Settings."

**C9 · GPS lookup has no timeout — "Locating…" can hang.** — ✅ FIXED
`apps/mobile/src/ui/MapPicker.tsx:27,130-133` — `LOCATE_TIMEOUT_MS = 9_000` races
`getCurrentPositionAsync` via `withTimeout()`.

**C10 · A `declaredValue > 150` error points at a field hidden in a collapsed section.** — ✅ FIXED
`apps/mobile/app/home.tsx:333-335,618-633,813-817,838-842` — `declaredValueOk` is now folded into
`canSubmit`, flagged in the collapsed-section header and the "what's missing" footer, plus an inline
error under the field when expanded.

**C11 · Landmarks are contract-required but sit under a section labeled "(optional)."** — ✅ FIXED
`apps/mobile/app/home.tsx:811-820` — the section is now labeled "Landmarks & details" (no "optional"
wording) and shows a red "landmarks required" inline flag when unset.

**C12 · The server's `needsProfile` signal is dropped; there's no name-entry screen.** — ✅ FIXED
`apps/mobile/app/verify.tsx:92-95` now reads `res.needsProfile` and routes to `/profile/setup`, a real
name/ID entry screen (`apps/mobile/app/profile/setup.tsx`) that PATCHes the profile before continuing.

### P3 — polish

- **Auction clock hits 0:00 but the screen stays "Finding riders…" for up to 15s.** Still open —
  `order/[id].tsx:268-279`: at `remainingMs` 0 only an accessibility announcement fires, no immediate
  refetch/transitional visual state. → show a "window closing…" transitional state and refetch
  immediately at zero.
- **`requested` status renders a blank screen.** Still open — `requested` still matches none of the
  status blocks in `order/[id].tsx` (not in `ACTIVE_RIDE_STATUSES`/`isActive`/terminal blocks) → header
  pill + "Back home" only.
- **StatusPill renders every status in neutral grey.** Still open — `order/[id].tsx:510` still passes
  no `tone` to `StatusPill`; `PillTone` (`src/ui/index.tsx:185-214`) has no per-order-status mapping. →
  map status → tone.

---

## SHARED / BOTH ROLES

**S1 · Sign-out leaks the previous user's data and skips the liability disclaimer (shared devices).** — ✅ FIXED
`apps/mobile/src/auth/auth-context.tsx` — both `signOut()` and `onSignOut()` now call
`clearDeviceState()` and `queryClient.clear()`, exactly the fix this finding proposed.

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
