# Customer UI/UX + speed review — 2026-10-07 (findings only, nothing executed)

Read-only multi-agent review of the customer side of `apps/mobile` (Android + app.lyniago.com) and its seams with `apps/merchant` and `apps/api`. 18 lenses (11 journey, 7 speed); each finding was judged by two independent skeptics (one traced the code path, one tried to refute it as already-ledgered, sanctioned in DESIGN-DEVIATIONS, guarded elsewhere, or negligible). Deduped against `docs/KNOWN_BUGS.md` and the perf docs.

Raw: UX {'candidates': 78, 'confirmed': 67, 'plausible': 10, 'refuted': 1, 'unverified': 0} · Speed {'candidates': 52, 'confirmed': 39, 'plausible': 12, 'refuted': 1, 'unverified': 0}. After merging cross-lens duplicates: 109 distinct findings.

**CONFIRMED** = both skeptics agreed. **PLAUSIBLE** = one of two. Origin `design-gap` = the app does what the handoff draws, but it hurts the customer (fix needs an owner/design call).


## Part A — Blockers, bugs, pain points, inconsistencies

### U01 · BLOCKER · CONFIRMED — Web: a signed-out page load at any path other than "/" leaves the customer on a dead signed-in screen with no way to sign in

- **Where:** `apps/mobile/app/index.tsx:54` · platform: web · journey: Onboarding & sign-in · origin: app-defect · lens `onboarding-signin:1`
- **Trigger:** A customer signed in on app.lyniago.com, used the app (the URL bar now shows /home, /orders or /order/<id>), then has no session in storage. This happens when Safari deletes script-writable storage after 7 days of Safari use without visiting the site (secure-store-web.js keeps the session in localStorage), when they cleared site data, or when they signed out in another tab. They reopen the saved Safari tab, or any bookmark or link to a deep path.
- **Customer sees:** The page reloads at /home (or /orders, /order/<id>) with no session. After the splash, Home, Orders and Account render with every request failing. Restaurants, shops and pharmacy rails stay empty. Send, checkout and orders fail with the raw API text "Missing bearer token". Nothing on screen leads to sign-in, and Settings → Sign out does nothing. The only way out is to type the bare domain into the address bar by hand, which a customer won't know to do. In practice they can't sign in or order.
- **Minimal fix:** In app/_layout.tsx's existing BootRouteWatch (or SessionGate), once `useAuth().loading` is false: if there is no session and the current pathname is not a signed-out route (/onboarding, /phone, /verify, /settings/privacy), call replaceClearingStack(router, bootDestination({ session: null, onboardingSeen, rolePref: null })). This reuses the boot-route logic index.tsx already uses, adds no new screen, and also covers a signed-out push or deep link on Android.
- **Verification:** trace: real (high) / refute: real (high)

### U02 · BLOCKER · CONFIRMED — Re-ordering the same basket returns the old cancelled or delivered order instead of placing a new one

- **Where:** `apps/mobile/app/food/checkout.tsx:230` · platform: both · journey: Restaurants · origin: app-defect · lens `restaurants-browse-checkout:1`
- **Trigger:** A customer's deliver-to is a manual pick (it wins over GPS and is never re-detected), a search result, or a stored last-known point. They order 2x Sadza & Beef from Gava's, ASAP, no notes. Later the order ends: "No rider was free", "You cancelled", or Delivered. They tap "Try again at Gava's" or "Order again", add the same dishes, and tap Place.
- **Customer sees:** Nothing new is ordered. The app clears the cart and opens the OLD order: the same "No rider was free" / "You cancelled" ending, or last week's Done screen. The restaurant gets nothing. The customer can't retry the same meal at the same address unless they happen to change a quantity, a note or the address.
- **Minimal fix:** Give the food key a nonce, as Send does. Keep a random nonce in the persisted FoodCartState: mint it when a cart starts, drop it in clear(), and include it in the uuidV4FromSeed seed. Retries of one attempt still dedupe, even across a restart, and every new basket gets a new key. Optional server backstop: findByIdempotencyKey ignores orders in a terminal status.
- **Verification:** trace: real (high) / refute: real (high)

### U03 · HIGH · CONFIRMED — Web: every reload or deep-path load holds the splash about 20 s saying "Slow network", and never ends while offline, which hides the saved order copy

- **Where:** `apps/mobile/src/boot/boot-readiness.ts:74` · platform: web · journey: Onboarding & sign-in · origin: app-defect · lens `onboarding-signin:2` (also found by: web-platform:1)
- **Trigger:** A signed-in customer reloads app.lyniago.com while on any screen other than "/": /home after the first redirect, /orders, /send or /order/<id>. iPhone Safari also reloads background tabs at their last URL when the customer comes back to them. Offline variant: the same reload with no connection. The offline shell (sw.js) still serves the page.
- **Customer sees:** Online: the green splash stays up for about 20 s. From about 5 s it shows "Slow network — still connecting" even on a fast connection, then cuts to the screen. Offline: the "You're offline / Try again" panel stays until the network returns, then about 20 s more. That hides the order screen's saved offline copy, which holds the delivery code the customer needs at the door, and Home's warm-boot cache. The offline shell and web warm boot (#1105) were built for exactly this situation.
- **Minimal fix:** In app/_layout.tsx BootRouteWatch: while booting, once auth `loading` is false and the first pathname is not "/", call reportBootDestination(pathname). The landing URL is the boot's decision, so the splash waits only for that destination's own tasks (Home's two when it is /home; just the session check anywhere else), as a normal boot does. This can share the same effect as finding 1's redirect.
- **Verification:** trace: real (high) / refute: real (high)

### U04 · HIGH · CONFIRMED — Rider code lockout tells the rider to get a new code from the sender, but the customer app can't issue one

- **Where:** `apps/mobile/app/order/[id].tsx:594` · platform: both · journey: Send a parcel · origin: cross-app · lens `parcel-after-send:1`
- **Trigger:** Status is en_route_dropoff. The recipient reads out a wrong or stale code, or the rider mistypes it 5 times (DELIVERY_OTP_MAX_ATTEMPTS = 5). The server answers 403 "Too many attempts — ask the customer to re-issue the code". The rider's screen shows "Code locked after 5 tries · Ask {sender} to send {recipient} a new code", plus a "Call {sender} to re-send" button. The customer opens their order.
- **Customer sees:** The customer's code card still shows the same 6 digits and the same "Give this code to the recipient" line. Nothing says the code is locked, and there is no way to get a new one. Reading out the same code again does nothing because the rider's field is locked. The parcel can't be handed over through the app, and the rider has to fall back to marking it Not delivered.
- **Merchant/rider side:** Rider side: the rider v2 copy and the 403 message send the rider to the customer for a re-send. That re-send exists only on the server (POST delivery-code/rotate) and nowhere in the customer UI.
- **Minimal fix:** Reuse the existing 2.14 auto-issue. When the snapshot shows `deliveryOtpAttempts >= DELIVERY_OTP_MAX_ATTEMPTS` on a live order, clear the local code and allow the auto-issue to run once more (reset `rotatedOnce` for this case). The card shows "Getting your code…" and then the new code with the existing Share code button. In `confirmDelivery`'s lockout branch, emit `order:status` to the order room (as `rotateDeliveryCode` already does) so an open customer screen refetches at once.
- **Verification:** trace: real (high) / refute: real (high)

### U05 · HIGH · CONFIRMED — Offline cold start into a live order shows "Opening your order…" forever: saved copy and delivery code never appear

- **Where:** `apps/mobile/app/order/[id].tsx:543` · platform: both · journey: Send a parcel · origin: app-defect · lens `parcel-after-send:2` (also found by: android-resilience:1)
- **Trigger:** Android kills the app during an active parcel trip. The customer, with no data signal, taps the "…has your parcel" notification or a Notifications row to open /order/:id. The order query is not persisted to disk, so the screen needs a fetch.
- **Customer sees:** The screen shows the skeleton with "Opening your order…" and a spinner indefinitely. There is no offline banner (the screen claims the offline banner), no Try again and no saved copy. The delivery code is not shown either, although it is in SecureStore and the design promises "Your code works without data" (2.4). At the door with no signal, the customer cannot give the recipient the code.
- **Minimal fix:** Mirror job.tsx:240. Treat `!orderQ.data && orderQ.isPaused` like a transient error: use `savedCopy` when one exists (state 2.4 with the code card), otherwise show the existing 2.2 "Couldn't open your order" sheet with Try again.
- **Verification:** trace: real (high) / refute: real (high)

### U06 · HIGH · CONFIRMED — Orders tab shows a delivered, unrated parcel as "{Rider} is your rider · Rider assigned" and keeps it out of history for up to 6 h

- **Where:** `apps/mobile/src/ui/orders/model.ts:227` · platform: both · journey: Send a parcel · origin: app-defect · lens `parcel-after-send:5` (also found by: orders-notifications:1)
- **Trigger:** The rider enters the code, so status becomes `delivered`. The customer skips rating or doesn't rate yet, then opens the Orders tab at any point in the next 6 hours, before the auto-close.
- **Customer sees:** The NOW section shows the delivered parcel as "Tendai M. is your rider" / "Parcel to Avenues · Rider assigned" with 1 of 4 segments lit, as if a rider had just been matched. Meanwhile the order screen and Home's live bar say "Delivered" and the push said "Parcel delivered". The order also doesn't appear in the day-grouped history until it auto-closes or is rated.
- **Minimal fix:** In orders.tsx, build `nowCards` and `liveIds` only from active orders whose status is not `delivered`/`completed`, so a delivered parcel moves to history at once (the history feed already includes delivered via COMPLETED_ORDER_STATUSES).
- **Verification:** trace: real (high) / refute: real (high)

### U07 · HIGH · CONFIRMED — A second order screen on the shared socket never joins its room and shows the other order's rider position

- **Where:** `apps/mobile/src/realtime/use-order-socket.ts:91` · platform: both · journey: Send a parcel · origin: app-defect · lens `parcel-after-send:7`
- **Trigger:** The customer is on order A's screen (parcel or restaurant order; both use useOrderSocket), with A's socket connected. A push for order B arrives ("New offer", "…has your parcel") and the tap `router.push`es /order/B on top, so A stays mounted.
- **Customer sees:** B's screen never subscribes to B's room. It gets no live offers, status or rider positions and falls back to 15 s / 5 s polling, so offers can show up to 15 s late in a 90 s auction. It also receives A's `position` events and writes A's rider location into B's cache, re-applied after every poll. B's map pin, "Arriving in N min" and the Arriving-now switch can then follow the wrong rider.
- **Merchant/rider side:** Same late-listener pattern on the rider side: use-rider-job-socket.ts:65-75 subscribes only on `connect`, while the board hook under the job screen already holds the connected socket (LC-A07). The rider's job screen may therefore miss the customer's `job:cancelled` and code-rotation `order:status` events. This should be verified in the rider lane.
- **Minimal fix:** In the effect, call `onConnect()` immediately when `socket.connected` is already true. In `onPosition`, ignore payloads whose `riderId` differs from the cached snapshot's `rider.profileId`.
- **Verification:** trace: real (medium) / refute: real (medium)

### U08 · HIGH · CONFIRMED — First order: the phone field is empty and tapping Place does nothing

- **Where:** `apps/mobile/app/food/checkout.tsx:315` · platform: both · journey: Restaurants · origin: app-defect · lens `restaurants-browse-checkout:2`
- **Trigger:** A customer who has never placed a food order or a parcel on this install, or any new browser on app.lyniago.com, builds a basket, opens Review and taps "Place order · $X cash".
- **Customer sees:** Nothing happens: no toast, no hint, no scroll, no focus. YOUR PHONE sits below the fold as an empty field whose muted placeholder "0771 234 567" looks like a filled-in number. The customer can't tell why Place is dead and may give up.
- **Minimal fix:** Prefill phone from the cached ["me"].phone when no pickup phone is saved, matching the drawn prefilled block. When submit() still stops on the phone, focus the field through a ref and scroll to it instead of the no-op setEditingPhone(true).
- **Verification:** trace: real (high) / refute: real (high)

### U09 · HIGH · CONFIRMED — A prescription item added before the Rx flag loads never asks for a prescription, and placing it fails with no way to add one

- **Where:** `apps/mobile/src/ui/browse/ShopStoreScreen.tsx:68` · platform: both · journey: Shops & pharmacy · origin: app-defect · lens `shops-pharmacy:1`
- **Trigger:** A returning customer opens a pharmacy. The catalogue paints right away from the persisted 'shops' query cache, but GET /app/order-flags has not answered yet (one 2G round trip, up to the 10 s timeout, or it fails offline). They tap + on their usual prescription medicine during that window. A second way in: Review's own useOrderFlags fetch fails or is slow while the cart line does carry rxRequired.
- **Customer sees:** There is no 'Prescription needed' pill, and the store says 'Over-the-counter only. No prescription medicine yet.' Review shows no prescription block, keeps the OTC note and enables Place. Placing returns the toast 'Add a photo of your prescription to place this order', but the screen has nowhere to add one. Every retry fails the same way. The only way out is to delete the item and leave the store entirely before adding it again, and nothing tells the customer that.
- **Merchant/rider side:** A pharmacist marking an item 'Prescription needed' in DishEditorSheet while it sits in a customer's cart leads to the same stuck 409.
- **Minimal fix:** In Review, decide whether a prescription is needed from the server's catalogue, which it already fetches (`categories`), not from the flag stamped when the item was added. Build a set of dish ids with `d.rxRequired`, set `rxNeeded = service==='pharmacy' && lines.some(l => l.rxRequired || rxDish.has(l.dishId))`, and copy rxRequired across in the R6a reconcile. The server lists Rx dishes only while RX_ENABLED is on, so the catalogue is already the switch. Also refetch the order flags on a 409 whose reason is `prescription_required`.
- **Verification:** trace: real (medium) / refute: real (medium)

### U10 · HIGH · CONFIRMED — Customer can't pay at the door while the rider's GPS is more than 150 m from the drop pin, so the cash handshake and the delivery code stall

- **Where:** `apps/mobile/src/orderflow/MerchantOrderScreen.tsx:1133` · platform: both · journey: Merchant ↔ customer · origin: cross-app · lens `merchant-order-lifecycle:1`
- **Trigger:** A cash merchant order at status en_route_dropoff. The rider is at the customer's gate and has tapped 'I'm here', so the rider app shows the door card and 'I've received $X'. The rider's phone is still sending fresh GPS (updated within the last 60 s), but the fix is more than 150 m from the customer's drop pin. That happens whenever the pin came from a street-level geocode, a map tap or the device geocoder rather than the real gate.
- **Customer sees:** The customer's screen keeps saying 'On the way to you · Arrives in ~N min'. It shows no door card and no 'I've paid $X' button, and its only action is 'Cancel order', which costs the full total. The rider's 'I've received' is refused with 'Waiting on the customer's confirm first'. No delivery code is issued, so neither side can finish. The only ways out are the rider walking into the 150 m circle or the rider's 'Can't use the code?' help path, which waits on support.
- **Minimal fix:** Inside the existing onWay case, let a customer whose order is at en_route_dropoff reach the existing door card and pay bar without depending only on the 150 m pin geofence. For example, widen the door trigger in baseStage (a larger radius, or a ride ETA of 2 minutes or less). Or render the DoorCard and payBar for every en_route_dropoff order, as the noFix/paused branch already does. confirmCustomerCash already accepts any en_route_dropoff order, so no server change is needed.
- **Verification:** trace: real (medium) / refute: real (high)

### U11 · HIGH · CONFIRMED — No-rider hold has no timeout and no customer cancel: the screen says 'We're asking more riders now' indefinitely

- **Where:** `apps/api/src/merchant/food-dispatch.service.ts:184-192` · platform: both · journey: Merchant ↔ customer · origin: backend · lens `merchant-order-lifecycle:2`
- **Trigger:** The venue marks the order ready (or auto-accept releases it). Six 60 s dispatch rounds find no rider, and the server sets noRiderHoldAt, which stops the search. The merchant then does not tap 'Keep searching' or 'Cancel order' on the hold card, because the dashboard is closed or the hold card is ignored.
- **Customer sees:** The customer stays on 'Finding a rider is taking longer · We're asking more riders now… same food, same price', with an ETA range that keeps moving forward. Home's live bar says 'Cooking your order'. Nobody is searching any more. The sheet has no cancel link, and both server cancel routes refuse the order, so the customer has no in-app exit. Their only option is LyniaGo WhatsApp support, if it is configured, or calling the venue, only when the venue chose to show its number.
- **Merchant/rider side:** Only the merchant's hold card ('Keep searching' / 'Cancel order', queue/order/page.tsx Handover) can release the order, and the merchant gets no push for it.
- **Minimal fix:** Let cancelUnpaid accept a `ready_for_pickup` order with no rider while `noRiderHoldAt` is set, and render the drawn 'Cancel order · free' link in the slowRider/riderDropped cases when that holds. Optionally, auto-close an unanswered hold with `no_rider` after a bounded time; D3d already draws that ending. Both changes stay inside the existing T11a and D3d flows.
- **Verification:** trace: real (high) / refute: real (medium)

### U12 · HIGH · CONFIRMED — '{Rider} is at your door · Have $X cash ready' push fires the moment the rider collects, while the screen says 'On the way'

- **Where:** `apps/api/src/notifications/notifications.service.ts:121-122` · platform: both · journey: Merchant ↔ customer · origin: cross-app · lens `merchant-order-lifecycle:4` (also found by: orders-notifications:2)
- **Trigger:** Any merchant order. The rider confirms pickup (code or 'Collected'), and the rider app immediately auto-advances picked_up → en_route_dropoff.
- **Customer sees:** Within seconds the customer gets two pushes: '{Rider} has your order · On the way.' and '{Rider} is at your door · Have $16.50 cash ready.' This happens possibly 20+ minutes before arrival. People go outside to wait. Opening the app shows 'On the way to you · Arrives in ~18 min', which contradicts the push. The in-app Notifications timeline repeats the 'at your door' beat.
- **Merchant/rider side:** The rider app's automatic picked_up→en_route_dropoff step is what fires the push.
- **Minimal fix:** Stop the en_route_dropoff entry from claiming arrival for merchant orders. Drop it from MERCHANT_STATUS_NOTICES (picked_up already says 'On the way'), or map it to the picked_up copy, mirroring the parcel decision. That keeps push, feed and screen consistent.
- **Verification:** trace: real (high) / refute: real (high)

### U13 · HIGH · CONFIRMED — "At your door" push and feed row tell the customer to have less cash ready than the screen and rider ask for when the order carries an owed balance

- **Where:** `apps/api/src/notifications/notifications.service.ts:146` · platform: both · journey: Merchant ↔ customer · origin: backend · lens `money-codes-consistency:1` (also found by: merchant-order-lifecycle:7)
- **Trigger:** The customer cancelled an earlier merchant order after the rider collected it (D3f). That records an owed balance, e.g. $10, and the next order carries it as previousBalanceUsd. On that next order (goods + delivery = $8) the rider reaches the door.
- **Customer sees:** The push and the Notifications row say "Tendai is at your door · Have $8.00 cash ready." The order screen's P step says "I gave $18.00". The rider is told to collect $18.00, and the server records $18.00 as the handshake amount. The customer gets the cash ready from the push, comes up $10 short at the door, and the handshake gets disputed. The "updated your order" push ("New total $X, cash at the door") leaves out the carried balance in the same way.
- **Minimal fix:** In the status-push query, select `carriedBalance: { select: { amount: true } }`. In merchantCustomerCopy's en_route_dropoff case, pass p = agreedFare + the sum of carriedBalance. Do the same for the items-edited push's "New total" (food-order-ops.ts:137) and for the feed's order select. The copy stays the same; only the amount changes.
- **Verification:** trace: real (high) / refute: real (high)

### U14 · HIGH · CONFIRMED — Delete account goes through while a food, shop or pharmacy order is still with the business, leaving that order with no way to finish

- **Where:** `apps/api/src/privacy/privacy.service.ts:147` · platform: both · journey: Account · origin: cross-app · lens `account-management:1`
- **Trigger:** The customer places a restaurant, shop or pharmacy order. While it is still with the business (status `requested` with a merchantPhase, before any rider is assigned), they open Settings > Delete account, tick the box and tap Delete my account. Variant: a parcel still in the auction (`open_for_offers`) when the client's active-order read has not loaded yet or has failed.
- **Customer sees:** The explain step shows a green "No delivery running" box, and the deletion succeeds. The app signs out, which also wipes the delivery code stored on the device. The order keeps going for everyone else. The kitchen cooks for "Deleted User". The drop-off contact phone and note are stripped, and a pharmacy order's prescription row is deleted, even if the pharmacist has not reviewed it yet. A rider is then sent with cash due and no number to call. The cash handshake needs the customer to confirm first, then the delivery code, so the hand-over can never complete and the rider is left holding the goods. The customer may believe the order was cancelled along with the account.
- **Minimal fix:** Server: in both the preflight and the in-tx check, widen the where to `OR: [{status in ACTIVE_RIDE_STATUSES, OR: [customerId, riderId]}, {customerId, status: OPEN_FOR_OFFERS}, {customerId, orderType: merchant, status: requested}]`. This returns the existing 409 "Finish or cancel your active delivery…". Client: back the box with `getActiveCustomerOrders` (the existing active-orders query and key), counting non-delivered entries. While that query is loading or errored, treat it as not-clear (no green box, "Delete account" link disabled) instead of drawing "No delivery running".
- **Verification:** trace: real (high) / refute: real (medium)

### U15 · MEDIUM · CONFIRMED — Web: an older tab still holding a rotated refresh token signs the customer out of the whole browser and wipes the other tab's saved data

- **Where:** `apps/mobile/src/auth/auth-context.tsx:37` · platform: web · journey: Onboarding & sign-in · origin: app-defect · lens `onboarding-signin:5`
- **Trigger:** Tab B (older) and tab A both run the app. Tab A stays in use long enough to refresh twice (access TTL is 15 min, so about 30 min of use), rotating R0→R1→R2 and saving R2 to localStorage. Tab B, still alive in memory with R0, regains focus and its next request hits an expired access token.
- **Customer sees:** Tab B presents R0, whose successor has already been used, and the API rejects it. Tab B then deletes the shared stored session and runs clearDeviceState over the shared localStorage. That removes saved places, the deliver-to address, the parcel draft, recent recipients and the delivery-code index for both tabs, and tab B jumps to "What's your number?". If tab A is closed before its next refresh rewrites storage, the customer is fully signed out and must spend another OTP. The kept-signed-in promise (SES-01..09) breaks on the web.
- **Minimal fix:** Web only: before refreshing in refreshSession (client.ts ~246), re-read the stored session through loadSession(). If its refreshToken differs from the stale one, adopt it (apply it via onTokens) and retry with it instead of presenting the stale token. Also add a window 'storage' listener in AuthProvider that applies the other tab's session or sign-out to `live`. No UI change.
- **Verification:** trace: real (medium) / refute: real (low)

### U16 · MEDIUM · CONFIRMED — A send that times out says "Couldn't send" while the order is already live, and editing before a retry opens a second live auction

- **Where:** `apps/mobile/app/send.tsx:442` · platform: both · journey: Send a parcel · origin: app-defect · lens `send-compose:1`
- **Trigger:** On 2G/3G, tap "Send to riders". The server commits the order, but the response takes longer than STANDARD_TIMEOUT_MS (15 s). The create waits on the PostGIS nearby count before it returns. The client aborts and gets a status-0 ApiError. The customer follows the toast's advice to "Check your data": they tap Edit on the price or the route, change something, and send again.
- **Customer sees:** Review shows the toast "Couldn't send. Check your data and try again.". At the same time the app flips to offline, so the "You're offline. What you've entered is saved." banner appears, the CTA hint reads "Connect to the internet to send.", and the toast's Try again does nothing until the /health probe recovers. Meanwhile the order is live: the Orders tab NOW section shows it, and riders are bidding on it. Any edit before the retry changes the idempotency key, so the next send opens a SECOND auction for the same parcel. The customer is told it failed and ends up with two live orders.
- **Merchant/rider side:** Nearby riders get two broadcasts and push alerts for one physical parcel, and may bid on both.
- **Minimal fix:** On a status-0 failure, freeze the key: store the idempotencyKey that went out and keep using it, instead of the content-derived one, until a definitive 2xx or 4xx arrives. Any later "Send to riders" then replays it, and if the first attempt landed the server returns that order and the app routes to it. Hide the toast's Try again while `online` is false, because the CTA hint already covers that state.
- **Verification:** trace: real (medium) / refute: real (medium)

### U17 · MEDIUM · CONFIRMED — The compose is held only in memory: an app kill, a page reload or a browser/iOS swipe-back loses all four steps, though the screen says "What you've entered is saved"

- **Where:** `apps/mobile/app/send.tsx:59` · platform: both · journey: Send a parcel · origin: app-defect · lens `send-compose:4` (also found by: android-resilience:3)
- **Trigger:** Android: fill steps 1–3, then switch to Contacts or WhatsApp to look up the recipient's number. A low-RAM phone reclaims the process, and LyniaGo cold-starts on Home. Web (app.lyniago.com, iPhone): the Safari tab reloads or is discarded, or the customer edge-swipes back (or uses the browser back button) on step 2–4. Steps are not history entries, so the swipe leaves /send entirely.
- **Customer sees:** Everything is gone: pins, items, note, both phones and price. The customer has to redo the whole order. While offline, the composer's own banner says "You're offline. What you've entered is saved.", which is untrue across any of these events. On web, the handoff's "Back moves one step back" holds only for the header button.
- **Minimal fix:** Restore the earlier debounced draft write (the PERF19-02/LC-C06 pattern: a 500 ms trailing debounce plus an unmount flush) of {pickup, drop, items, note, priceText, step} to the existing SecureStore key, which the web shim backs with localStorage. Hydrate it when /send opens without Send-again params, and clear it after a successful create. Phones stay out of it, as before.
- **Verification:** trace: real (medium) / refute: real (medium)

### U18 · MEDIUM · CONFIRMED — Tapping an address suggestion gives no feedback while the lookup runs, does nothing if it fails, and a slower earlier tap can overwrite a later pick

- **Where:** `apps/mobile/src/ui/send/AddressCard.tsx:268` · platform: both · journey: Send a parcel · origin: app-defect · lens `send-compose:6`
- **Trigger:** On a slow link, type a drop-off and tap suggestion A. Places Details takes seconds (FAST_TIMEOUT_MS 8 s) and the row shows nothing. The customer taps suggestion B. B's Details returns first and A's lands afterwards. Alternatively, A's Details times out.
- **Customer sees:** The first tap seems to do nothing: no spinner, no row change. If the lookup fails or times out, nothing ever happens and no message appears. If both lookups land, the later one wins whatever the customer meant, so the drop-off pin moves back to A after they chose B, and the row closes on the wrong place.
- **Minimal fix:** Mirror MOB-MAP-03-SIB-2 in AddressCard: a pickSeq ref so only the latest pick or submit lands, and retire any in-flight resolve when editing ends. On a null resolve, fall back to the existing "No matches. Check the spelling, or set the pin on the map." row instead of staying silent.
- **Verification:** trace: real (high) / refute: real (medium)

### U19 · MEDIUM · CONFIRMED — Opening a live order on a second device silently re-issues the delivery code and kills the one already shared

- **Where:** `apps/mobile/app/order/[id].tsx:598` · platform: both · journey: Send a parcel · origin: app-defect · lens `parcel-after-send:3`
- **Trigger:** The customer chooses a rider on phone A and taps Share code, so the recipient now holds code C1. Later the customer opens the same live order on a device without that code in local storage. Examples: app.lyniago.com in a browser; the iPhone Home Screen web app, which has storage separate from Safari; or the same phone after signing out and back in, since sign-out wipes delivery codes (BH-17).
- **Customer sees:** Device B issues code C2 on its own. Phone A's next refetch (triggered by the rotation's `order:status` emit) detects the rotation, drops C1 and issues C3. Device B then sees the rotation, but its `rotatedOnce` is already set, so it shows "Getting your code…" forever. The recipient's C1 is dead and nobody was told. At the door the code doesn't match, and after 5 tries the order hits the lockout in finding 1.
- **Merchant/rider side:** The rider's screen gets the rotation through `order:status`, but the recipient standing next to the rider still holds the old code.
- **Minimal fix:** Limit the silent auto-issue to the case its comment names: this device chose the rider but lost the response (a riderIdentity was saved for this orderId by `choose`). Never auto-issue right after an "invalidate" caused by a rotation from another device. On any other device, keep the 2.14 card and offer issuing as an explicit action through the existing toast pattern (`A.tryAgain`), so a rotation only happens on purpose and the existing Share code button can re-send it.
- **Verification:** trace: real (medium) / refute: real (medium)

### U20 · MEDIUM · CONFIRMED — One failed automatic code issue leaves the customer with no code: the card disappears, then shows "Getting your code…" forever

- **Where:** `apps/mobile/app/order/[id].tsx:892` · platform: both · journey: Send a parcel · origin: app-defect · lens `parcel-after-send:4`
- **Trigger:** A live order with no local code: the Choose response was lost on a flaky link (LC-C08), the app was killed during a rotation, or finding 3 applies. The single automatic `rotateDeliveryCode` call fails because of a 15 s timeout, a 5xx or a 409.
- **Customer sees:** While `rotateM.isError` is set, `showCode` is false and the code card vanishes from the tracking sheet. The next status change (picked up, on the way) resets the mutation, and the card comes back as six grey bars with "Getting your code…" and Share disabled. Nothing is in flight, and on the Arriving sheet there is still no code. The only fix is to leave and reopen the screen, which the customer has no reason to try.
- **Merchant/rider side:** The rider is at the door waiting for a code the customer cannot see.
- **Minimal fix:** Give `rotateM` the same failure treatment as its siblings: onError shows the existing toast (`A.sendFail`, action `A.tryAgain` → `rotate()`) and resets `rotatedOnce` so a later foreground or status change retries. Keep the card visible during the failure.
- **Verification:** trace: real (high) / refute: real (high)

### U21 · MEDIUM · CONFIRMED — After cancelling post-pickup, the customer is told to arrange the parcel's return with the rider, but the cancelled screen gives no way to reach them

- **Where:** `apps/mobile/app/order/[id].tsx:1029` · platform: both · journey: Send a parcel · origin: design-gap · lens `parcel-after-send:6`
- **Trigger:** The order is picked_up or en_route_dropoff. The customer opens Cancel order and reads "Tendai already has your parcel. If you cancel, you arrange getting it back with them directly.", then taps Cancel anyway. Variant: the customer tapped the free "It's free. Tendai hasn't picked up your parcel yet." panel just as the rider marked collected; the server accepts either way.
- **Customer sees:** The screen becomes "You cancelled this order" with "Nothing to pay." and a single "Send again" button. There is no rider name, number, Call or WhatsApp, and no Help (Help shows on live stages only). The customer's parcel is with a rider they were just told to arrange things with, and the app gives no way to do it; they depend on the rider choosing to call.
- **Merchant/rider side:** The rider's hand-back screen gets the sender's number and a "Call {name}" button (job.tsx:968). The contact only works in one direction.
- **Minimal fix:** Server: also reveal the rider's phone to the customer on a collected cancel (orders.service.ts:1068, drop the `isRider` scope). App: when `cancelledBy === "customer"` and a `picked_up` event exists, render the existing RiderCard and the existing TwoButtonBar with `A.callRider`, as the undelivered stage already does. Ask upstream for an 18a 'after pickup' variant.
- **Verification:** trace: real (medium) / refute: real (low)

### U22 · MEDIUM · CONFIRMED — After a rider cancels and the parcel is re-matched, the delivery code silently changes; the recipient still has the old one

- **Where:** `apps/api/src/orders/order-lifecycle.service.ts:1270` · platform: both · journey: Send a parcel · origin: design-gap · lens `parcel-after-send:8`
- **Trigger:** The customer matches rider 1, receives "…is on the way to pickup / Open to see your delivery code" and taps Share code, so the recipient gets C1. Rider 1 cancels before pickup, the order is re-broadcast and the customer chooses rider 2.
- **Customer sees:** The re-match mints code C2 and the card simply shows different digits. Neither the Rider cancelled screen nor the tracking sheet says the code changed or asks the customer to re-share it. The recipient gives C1 at the door, it fails, and after 5 tries the order hits the lockout in finding 1.
- **Merchant/rider side:** Starts with a rider-side bail (RIDER_CANCELLABLE_STATUSES).
- **Minimal fix:** Keep the code across the re-broadcast. Copy `otpHash`/`deliveryCodeRotatedAt` into the clone, and in `selectOffer` keep an existing hash (return `deliveryCode: null`). In `followReopened`, copy the stored code from the old orderId to the new one (`saveDeliveryCode`). This is the bid-acceptance lane: keep the change conservative and add a regression test.
- **Verification:** trace: real (medium) / refute: real (medium)

### U23 · MEDIUM · CONFIRMED — A timed-out Place says "Nothing was ordered" when the order may have gone through

- **Where:** `apps/mobile/app/food/checkout.tsx:344` · platform: both · journey: Restaurants · origin: design-gap · lens `restaurants-browse-checkout:3`
- **Trigger:** POST /restaurants/:id/orders reaches the server and the order is created (an auto-accept kitchen starts cooking at once), but the response is lost: the client's 15 s abort, a dropped link, or a proxy 502/504.
- **Customer sees:** The toast says "Couldn't place your order. Nothing was ordered." The bar hint switches to "You're offline… your cart is saved" and the cart is still full. Meanwhile the merchant queue, the Orders tab NOW card and later pushes show a live order. A customer who believes the toast leaves or orders elsewhere, then gets a cash-on-delivery rider, or ends up with two orders.
- **Minimal fix:** For a status-0 or 5xx failure, re-send the SAME body and idempotencyKey once, when reachability is back, before showing R7b. The server replays the existing order if it landed (placeOrder:295-298), and the success path then navigates to it. Show R7b only if that replay also fails or returns a 4xx.
- **Verification:** trace: real (medium) / refute: real (medium)

### U24 · MEDIUM · CONFIRMED — Web: browser Back while "Placing your order…" places the order but never shows it

- **Where:** `apps/mobile/src/logic/use-placing-guard.ts:19` · platform: web · journey: Restaurants · origin: app-defect · lens `restaurants-browse-checkout:4`
- **Trigger:** On app.lyniago.com, the customer taps Place, then presses the browser or Android-Chrome Back button while the veil shows "Don't close the app".
- **Customer sees:** They land back on the storefront with an empty cart, no confirmation and no way to the order. The order exists and the kitchen has it, but nothing says so except the Orders tab.
- **Minimal fix:** On success, navigate even when the screen has unmounted (the router is global and the order now exists): call goToPlacedFoodOrder without the mounted guard on the success path, and keep the guard only for the error toast.
- **Verification:** trace: real (medium) / refute: real (medium)

### U25 · MEDIUM · CONFIRMED — Dishes outside their category's serving time can be ordered from a saved cart

- **Where:** `apps/mobile/app/food/checkout.tsx:177` · platform: both · journey: Restaurants · origin: cross-app · lens `restaurants-browse-checkout:6`
- **Trigger:** A kitchen sets Breakfast to 07:00-11:00. The customer adds a breakfast dish at 10:55 (or keeps it in the saved cart until evening) and places after 11:00.
- **Customer sees:** The storefront marks the dish unavailable ("Served 07:00–11:00"), but Review keeps it and the server accepts it. An auto-accept kitchen goes straight to "preparing" a dish it isn't serving. The customer then gets a shortened order, a swap request or a cancellation, while their own menu said the dish wasn't available.
- **Minimal fix:** In Review's reconcile, treat a dish whose category is not served at the order time (now, or the chosen slot) as gone, so it gets the existing R6a "Sold out now — taken off" line. On the server, refuse it with the existing out-of-stock 409 using the Harare clock (or the slot time for scheduled orders).
- **Verification:** trace: real (high) / refute: real (high)

### U26 · MEDIUM · CONFIRMED — An out-of-area deliver-to address is only rejected after Place

- **Where:** `apps/mobile/app/food/checkout.tsx:128` · platform: both · journey: Restaurants · origin: app-defect · lens `restaurants-browse-checkout:7`
- **Trigger:** The customer's home deliver-to (GPS, a manual pick, or a browser outside the towns served) is outside SERVICE_ZONES, e.g. Marondera.
- **Customer sees:** Review shows the address, a per-km delivery fee, an "Arrives 12:40–12:55" window and a live Place button. Only after Place does a 4-second toast say the address is outside the service area. The R3b out-of-area hint never shows because the address editor was never opened.
- **Minimal fix:** Seed drop from home.point only when isWithinServiceCorridor(home.point). Otherwise leave drop null, so the existing R9b "Where should we deliver?" row and the noLocBlock hint ask for an address. Or, with !editingAddr && drop out of area, show outAreaBlock(venue) as the hint and disable Place.
- **Verification:** trace: real (high) / refute: real (high)

### U27 · MEDIUM · CONFIRMED — Deliver-to label can be blank, or name a different place than the pin

- **Where:** `apps/mobile/app/food/checkout.tsx:418` · platform: both · journey: Restaurants · origin: app-defect · lens `restaurants-browse-checkout:8`
- **Trigger:** The customer drags the pin or taps "Use my current location", and the reverse geocode times out, fails offline, or returns no name, which is common for informal or peri-urban points. They then tap "Use this address" and Place without a rider note.
- **Customer sees:** (a) With an earlier address, the label stays the OLD address while the pin moved: the Review and the rider's landmark name a different place than the pin. (b) With no earlier label (no home location), the Deliver to row is blank, and Place fails with a raw toast like "dropoff: Too small: expected string to have >=1 characters".
- **Minimal fix:** On a pin move or current-location fix, reset the draft label to coordName(lat, lng) (the existing Send helper) and let a successful reverse geocode replace it, so the label never names the old place and is never empty.
- **Verification:** trace: real (medium) / refute: real (medium)

### U28 · MEDIUM · CONFIRMED — When every item needed the prescription, a declined order never shows the customer the pharmacist's reason

- **Where:** `apps/mobile/src/orderflow/MerchantOrderScreen.tsx:1038` · platform: both · journey: Shops & pharmacy · origin: design-gap · lens `shops-pharmacy:3`
- **Trigger:** The basket holds only 'Prescription needed' items, which is the usual prescription order. The pharmacist declines with a reason such as Expired and a note like 'Needs a script dated this month'.
- **Customer sees:** The customer sees 'Your prescription wasn't approved · Nothing was charged.' and an 'Other pharmacies' button, but not the reason or the note. The push doesn't carry them either. They can't tell what to fix and are likely to resend the same script. The pharmacist, meanwhile, typed the reason into a field labelled 'Note for the customer', and their screen confirms 'Declined · the customer was told'.
- **Merchant/rider side:** The merchant's decline sheet (queue/rx/page.tsx) collects a reason and a 'Note for the customer' and confirms 'the customer was told'.
- **Minimal fix:** In the rx_declined / D5b branch, set `more` to the same reason Card D5a already draws (O.d.rxNoReason + rxReasonLabel), so the ending carries the pharmacist's reason. Same data and same component, no new copy.
- **Verification:** trace: real (high) / refute: real (high)

### U29 · MEDIUM · CONFIRMED — A prescription page can't be removed, so one rejected at placement fails every retry

- **Where:** `apps/mobile/app/food/checkout.tsx:385` · platform: both · journey: Shops & pharmacy · origin: app-defect · lens `shops-pharmacy:4`
- **Trigger:** (a) The customer adds a blurry or wrong page and wants to replace it. (b) Placement returns 422 for one page. Example: a WebP or HEIC gallery image no larger than 1280 px is not re-encoded but is labelled image/jpeg, giving 'That file isn't a valid photo — please retake it.' Other causes are upload_too_large and upload_empty.
- **Customer sees:** The page thumbnails offer no way to delete a page. After a 422 the server deletes that object, but its key stays in the page list. Each later Place answers 'We couldn't find that photo — please retake it.' Retaking only adds another page, and with 3 pages the add tile is gone. The order can't be placed until the customer happens to leave Review, which also loses the patient name and the consent tick.
- **Minimal fix:** With no new UI: when placement fails with a 422 whose reason starts with `upload_`, clear the prescription pages so the block returns to R8a (Take photo / From gallery) and the toast makes sense. Separately, ask design to draw a remove action on the R8b thumbnail (rx.remove is ready), and log the ask in DESIGN-DEVIATIONS.
- **Verification:** trace: real (high) / refute: real (medium)

### U30 · MEDIUM · CONFIRMED — Adding prescription photos fails silently when the camera is denied, extra pages are camera-only, and every upload error reads 'No connection'

- **Where:** `apps/mobile/src/query/use-prescription-photos.ts:57` · platform: both · journey: Shops & pharmacy · origin: app-defect · lens `shops-pharmacy:5` (also found by: android-resilience:2)
- **Trigger:** Android: the customer tapped 'Don't allow' on the camera prompt, or it is permanently denied. Then 'Take photo', or the dashed + tile for pages 2–3, is tapped. Separately, any page upload fails while online: mint 503 'uploads_unavailable', the 20/min mint throttle, or a refused PUT (on the web, for example a storage CORS refusal).
- **Customer sees:** 'Take photo' and the + tile do nothing, with no message and no path to Settings. A customer who added page 1 from the gallery can't add pages 2–3, because the + tile only opens the camera, so a two-page prescription can't be sent. Every failed upload drops the page and says 'No connection. Nothing was sent.' even when the network is fine, so the customer keeps retaking photos.
- **Minimal fix:** On a denied camera, fall back to the gallery picker (or the existing settings path the rider fix used), and have the + tile use the gallery when the camera isn't granted. Pass the upload error to onError and use the server's message for a 4xx/503, keeping 'No connection' for real network failures.
- **Verification:** trace: real (high) / refute: real (medium)

### U31 · MEDIUM · CONFIRMED — Venue offline: the 3-minute accept window is extended by 20 s indefinitely, so the customer's countdown cycles 0:20→0:00

- **Where:** `apps/api/src/merchant/food-order.service.ts:1236-1242` · platform: both · journey: Merchant ↔ customer · origin: backend · lens `merchant-order-lifecycle:3`
- **Trigger:** A customer places a shop, pharmacy or manual-accept restaurant order (or a scheduled one rings) while the venue's merchant dashboard has no socket in merchantQueueRoom. That covers a closed browser tab or a phone browser suspended in the background, which is the normal case for the phone-first merchant app.
- **Customer sees:** The screen reads 'Waiting for {venue} to accept · They have 3 minutes. Nothing is ordered until they accept.' After 3:00 the timer pill and bar drop to 0:00, then jump back to about 0:20 on the next 4 s poll, and repeat indefinitely. The order is never auto-cancelled, so the customer is never told the venue isn't answering. They wait until they give up and cancel, or the merchant comes back hours later and can still accept a stale order.
- **Merchant/rider side:** A merchant whose dashboard is closed or backgrounded counts as offline, which suppresses the auto-cancel that D-13/N-03 promise.
- **Minimal fix:** Cap the offline pause in sweepExpiredAcceptWindows, for example by cancelling with the existing `shop_closed` path once now − (createdAt, or schedule.rungAt for a scheduled order) exceeds acceptWindowMs plus a fixed grace. The customer then gets the existing D3b ending and push instead of a looping timer. No new fields are needed.
- **Verification:** trace: real (medium) / refute: real (medium)

### U32 · MEDIUM · CONFIRMED — Auto-accepted orders show 'Food is ready · {time}' and 'Finding a rider is taking longer' 8 minutes before the kitchen's ready time

- **Where:** `apps/api/src/merchant/food-order.service.ts:1451-1458` · platform: both · journey: Merchant ↔ customer · origin: backend · lens `merchant-order-lifecycle:5`
- **Trigger:** An auto-accept restaurant order whose kitchen is confirmed. sweepAutoAccepted releases it to ready_for_pickup when prepStartedAt + prepMinutes − dispatchLeadMs (8 min) has passed.
- **Customer sees:** The cooking prep bar ('Cooking · about 8 min left') is replaced right away by 'Finding a rider is taking longer · We're asking more riders now. Your food is kept warm…' and 'Food is ready · 12:28'. The food isn't ready, and the search has only just started. The ETA range is also computed from 12:28 rather than the real ready time, so it is about 8 minutes too early. Meanwhile the merchant board says 'Ready 12:36 · finding a rider'.
- **Merchant/rider side:** The merchant board's ready time (prep-based) disagrees with the customer's (release-based).
- **Minimal fix:** Customer side: when prepStartedAt + prepMinutes is still in the future, keep the 'cooking' stage, and use that time in readyAtMs/merchantEta instead of the release stamp. Alternatively, have sweepAutoAccepted leave readyAt for the kitchen's own time. The early search stays, and the screen and ETA match the merchant's 'Ready HH:MM'.
- **Verification:** trace: real (high) / refute: real (medium)

### U33 · MEDIUM · CONFIRMED — A venue's 'Something else' reject or cancel shows as 'Cancelled by LyniaGo' on the Orders tab while the order screen and push blame the venue

- **Where:** `apps/api/src/orders/orders.service.ts:1320-1321` · platform: both · journey: Merchant ↔ customer · origin: backend · lens `merchant-order-lifecycle:6`
- **Trigger:** The merchant picks 'Something else' (reason `other`, optional note) on 'Why can't you take it?', or cancels a cooking order via 'Can't finish this order', whose body defaults to `other`.
- **Customer sees:** The push and the order screen say '{Venue} couldn't take your order · Nothing was charged.' The Orders tab history row says 'Cancelled by LyniaGo', and the Notifications feed attributes the cancel to LyniaGo too. The customer is told two different parties cancelled the same order.
- **Merchant/rider side:** The merchant-v2 reject and cancel sheets now offer 'Something else' as a first-class reason.
- **Minimal fix:** In customerOrderOutcome and cancelledByOf, treat a merchant order with `rejectionReason === 'other'` and no cancelledBy as venue_declined/merchant, as the push and the order screen already do.
- **Verification:** trace: real (high) / refute: real (high)

### U34 · MEDIUM · CONFIRMED — Prep bar stays at 'about 1 min left' indefinitely once the venue is past its prep time

- **Where:** `apps/mobile/src/logic/merchant-order.ts:228-235` · platform: both · journey: Merchant ↔ customer · origin: app-defect · lens `merchant-order-lifecycle:8`
- **Trigger:** A manually accepted order (any shop or pharmacy, or a non-auto restaurant) in merchantPhase preparing, where prepStartedAt + prepMinutes has passed and the merchant hasn't marked it ready. Manual orders have no server sweep that moves them on.
- **Customer sees:** The sheet keeps saying 'Cooking · about 1 min left' with a full bar and 'We find a rider about 8 minutes before it's ready', for as long as the venue takes, possibly hours. There is no cancel link in this state, and nothing tells them the venue is late. The merchant board shows the same order as 'Due'.
- **Merchant/rider side:** The merchant sees 'Due' for the same order.
- **Minimal fix:** Have prepProgress return null once nowMs is at or past the ready time, so the 'about N min left' bar disappears instead of lying. The stage title and the ETA range carry on unchanged.
- **Verification:** trace: real (high) / refute: real (medium)

### U35 · MEDIUM · CONFIRMED — Delivered receipt rows don't add up to its Total when the order carried an owed balance

- **Where:** `apps/mobile/src/orderflow/MerchantOrderScreen.tsx:968-973` · platform: both · journey: Merchant ↔ customer · origin: app-defect · lens `money-codes-consistency:3`
- **Trigger:** A merchant order that carried a previous owed balance (previousBalanceUsd > 0) is delivered. The customer opens the receipt or taps Share receipt.
- **Customer sees:** The receipt lists Food $7.00 · Delivery fee $1.50 · Total $18.50 with nothing in between. The extra $10 is unexplained and looks like an overcharge. The shared text receipt has the same gap. Review showed the owed line, but the receipt for the same order drops it.
- **Minimal fix:** When order.previousBalanceUsd > 0, render `<KV k={O_ADDED.r.owed} v={usd(order.previousBalanceUsd)} />` before the Total row, and add the same line to shareReceipt's text. This mirrors Review's Breakdown row.
- **Verification:** trace: real (high) / refute: real (medium)

### U36 · MEDIUM · CONFIRMED — Orders tab shows "No charge" for an order the customer must pay in full, and leaves the owed money out of the order that collected it

- **Where:** `apps/api/src/orders/orders.service.ts:948` · platform: both · journey: Merchant ↔ customer · origin: backend · lens `money-codes-consistency:5`
- **Trigger:** The customer cancels a merchant order after collection (the order screen says "You owe $8.00"). Their next order then collects that $8 at the door on top of its own $9.
- **Customer sees:** The cancelled order's row reads "No charge" while its own order screen says they owe the full total. The next order's row reads $9.00 although they handed over $17.00, which is also what its receipt Total shows. The $8 never appears in the customer's only order history.
- **Minimal fix:** In customerOrders, select `owedBalance { amount }` and `carriedBalance { amount }`. For cancelled_by_you with an owed entry, set chargedTotal to the owed amount. For a delivered row, set it to agreedFare + the carried sum. The tab already renders any chargedTotal > 0 as an amount, so the client doesn't change.
- **Verification:** trace: real (high) / refute: real (medium)

### U37 · MEDIUM · CONFIRMED — An admin fare correction on a restaurant/shop order is pushed to the customer, but the order screen keeps the old total while the door handshake uses the new one

- **Where:** `apps/api/src/admin/admin-orders.service.ts:373-376` · platform: both · journey: Merchant ↔ customer · origin: backend · lens `money-codes-consistency:6`
- **Trigger:** Ops uses "Adjust fare / refund" on a live merchant order, e.g. correcting $12.00 to $10.00. The admin action has no orderType guard. The rider then reaches the door.
- **Customer sees:** A push says "Your fare was corrected to $10.00 by our team." The order screen, summary, P-step button ("I gave $12.00") and receipt still show $12.00. Once the customer taps it, the server records $10.00 as the handshake amount and tells the rider to confirm $10.00. Customer, rider and receipt disagree on what was paid.
- **Minimal fix:** Smallest change: refuse adjustFare for orderType "merchant" with a 409 ("Use a refund for restaurant orders"), since the merchant refund flow (refundAmount/refundReference) already exists. The alternative is to have the merchant read's `total` follow agreedFare when an adjust audit row exists.
- **Verification:** trace: real (medium) / refute: real (medium)

### U38 · MEDIUM · CONFIRMED — An order that ends while the Orders tab is mounted disappears from the tab entirely

- **Where:** `apps/mobile/app/(tabs)/orders.tsx:89` · platform: both · journey: Orders & notifications · origin: app-defect · lens `orders-notifications:3`
- **Trigger:** The customer has the Orders tab open, or switches back to it later in the same session, while a running order is cancelled by the venue, expires with no rider, is not delivered, or is cancelled by LyniaGo. The 30 s active poll drops the NOW card.
- **Customer sees:** The order vanishes from both NOW and history, with no row saying it was cancelled or that nothing was charged. It only comes back after the app is backgrounded and resumed, or the connection drops and returns. On the web, nothing else (no push) tells the customer what happened.
- **Merchant/rider side:** A venue decline, no-answer timeout or no-rider cancel from the merchant side is the usual trigger.
- **Minimal fix:** In orders.tsx, also call `invalidateCustomerOrderHistory(qc)` from the focus effect. Also call it when an id present in the previous `activeOrders` is missing from the new one (a small useEffect over the active id set).
- **Verification:** trace: real (medium) / refute: real (high)

### U39 · MEDIUM · CONFIRMED — Customer web Settings always opens on a red "Order updates are off" card whose Turn on and toggle do nothing, because web has no push

- **Where:** `apps/mobile/app/settings/index.tsx:118` · platform: web · journey: Account · origin: app-defect · lens `account-management:2` (also found by: orders-notifications:5, web-platform:2)
- **Trigger:** An iPhone user on the web build (EXPO_PUBLIC_LYNIA_WEB=1) opens Account > Settings. The browser's notification permission is not granted, which is the normal case because the web build never asks (D-81 skips perm_notif).
- **Customer sees:** The top of Settings shows a danger card: "Order updates are off. You won't hear when your rider arrives." with a Turn on pill, and the Order updates toggle is off. Tapping Turn on or the toggle either asks for a browser permission that nothing uses, or does nothing: iOS Safari outside a home-screen app has no Notification API, and react-native-web's Linking has no openSettings for the blocked or granted branch. The card never goes away. The customer is told something is broken that they cannot fix, and that even granting would not fix, since the web build sends no push.
- **Minimal fix:** In settings/index.tsx, gate on isCustomerWebBuild() the same way ask-in-context does: on the web build, do not render the PC11 card and do not render the Order updates row. Extend the D-81 table with one row for this. No change on Android or iOS.
- **Verification:** trace: real (medium) / refute: real (medium)

### U40 · MEDIUM · CONFIRMED — Browser back (iPhone edge swipe, Android back) on Send steps 2–4 throws away the whole parcel draft instead of stepping back

- **Where:** `apps/mobile/app/send.tsx:341` · platform: web · journey: Web · origin: app-defect · lens `web-platform:3`
- **Trigger:** In the web build, fill in pickup and drop-off, items and phone numbers, then reach the Price or Review step. Use the browser's back action: the iPhone Safari edge swipe, the Android system back in Chrome, or the back button.
- **Customer sees:** The app leaves /send completely and returns to Home. Addresses, items, sender and recipient phones, note and price are all lost and must be typed again. In the Android app the same back press moves back one step (or closes the inline address edit).
- **Minimal fix:** In send.tsx, add react-navigation's usePreventRemove(step > 1 || editing != null, () => back()) next to the BackHandler listener. A browser back then runs the same back() the Android hardware back runs (finish the edit, or go to step - 1), and leaving at step 1 stays unchanged.
- **Verification:** trace: real (high) / refute: real (medium)

### U41 · MEDIUM · CONFIRMED — Android Back on Review & place while editing the address leaves Review instead of closing the editor

- **Where:** `apps/mobile/app/food/checkout.tsx:399` · platform: android · journey: Android · origin: app-defect · lens `android-resilience:4`
- **Trigger:** On Review & place, tap the address to edit it (editingAddr = true), then press the Android hardware or gesture Back to dismiss the editor.
- **Customer sees:** The header's Back closes the address editor, but the system Back pops the whole Review screen back to the storefront. Everything typed on Review that lives only in local state is dropped: contact phone (saved only after placing), rider note, chosen schedule slot, out-of-stock preference, and prescription pages, patient name and consent. The customer has to re-enter all of it and re-upload the prescription photos.
- **Minimal fix:** Add a useFocusEffect + BackHandler.addEventListener("hardwareBackPress") that does what the header does: if editingAddr, setEditingAddr(false) and return true; otherwise return false and let the stack pop. This is the same pattern send.tsx uses.
- **Verification:** trace: real (high) / refute: real (high)

### U42 · MEDIUM · PLAUSIBLE — Code screen: after a timeout, dropped connection or 429, the full code sits in the boxes and is never sent again unless the customer deletes and retypes a digit

- **Where:** `apps/mobile/app/verify.tsx:218` · platform: both · journey: Onboarding & sign-in · origin: app-defect · lens `onboarding-signin:3`
- **Trigger:** The customer types the 6th digit and verifyOtp fails without a verdict on the code: the 15 s STANDARD_TIMEOUT_MS on a slow link, no network, a 5xx, or the 10-per-5-min verify throttle (429). The connection then comes back, or the wait ends.
- **Customer sees:** A toast says "…check your connection and try again", then disappears. The six digits stay in the boxes, there is no Verify button (C4 draws none), and the footer still says "We check it automatically." Nothing happens. The only way to resend is to delete a digit and retype it, which nothing tells them. Customers wait or tap Resend, which spends one of their 5 sends an hour. If the server had accepted the code and only the response was lost, a retype more than 60 s later gets "That code has expired", so they need a new code and another send.
- **Minimal fix:** In verify.tsx, re-arm the same code when the reason for the non-answer goes away. Read useReachability() and add an effect: when it turns true, or the app comes back to the foreground, and retryable.current && code.length === 6, set tried.current = null and retryable.current = false. The existing effect then sends it once. No new UI.
- **Verification:** trace: real (medium) / refute: refuted (medium)

### U43 · MEDIUM · PLAUSIBLE — A prescription order accepted by a pharmacy with no ticked pharmacist can never be packed, and the customer can't cancel it

- **Where:** `apps/api/src/merchant/prescription.service.ts:77` · platform: both · journey: Shops & pharmacy · origin: cross-app · lens `shops-pharmacy:2`
- **Trigger:** The pharmacy has no team member with isPharmacist. It is false by default, including for the owner's own member row and for every new branch, and stays false if the ticked pharmacist leaves or is unticked. A customer places an Rx order, and the owner or a cashier taps Accept.
- **Customer sees:** The order sits on 'Pharmacist is checking your prescription · Usually under 10 minutes' with no end. The screen offers no cancel. Both cancel endpoints refuse ('the kitchen has started'). Only WhatsApp support can end it.
- **Merchant/rider side:** The non-pharmacist who accepted sees only an error on 'Packed'. The fix lives on the merchant team setting, and nothing on the order screen points to it.
- **Minimal fix:** Enforce in code what the runbook asks for by hand. In prepareForPlacement, throw the existing `rx_unavailable` 409 when the merchant has zero members with isPharmacist, or leave the pharmacy's Rx dishes out of rxVisible() for such a pharmacy so they can't be added. Neither needs new UI.
- **Verification:** trace: real (medium) / refute: refuted (medium)

### U44 · LOW · CONFIRMED — Web: the code field asks the browser for autocomplete="sms-otp", which isn't a browser value, so iPhone Safari doesn't offer the code from Messages

- **Where:** `apps/mobile/app/verify.tsx:311` · platform: web · journey: Onboarding & sign-in · origin: app-defect · lens `onboarding-signin:4`
- **Trigger:** An iPhone user signs in on app.lyniago.com and the code arrives by SMS.
- **Customer sees:** The screen promises "Fills in by itself when the message arrives", but Safari is not told this is a one-time-code field. The keyboard's "From Messages" suggestion is not reliably offered, so the customer has to leave the browser, read the 6 digits in Messages and come back to type them. The input is a 1×1 hidden field, so long-press paste over the boxes doesn't work either. iPhone users are the web app's target audience.
- **Merchant/rider side:** The merchant web sign-in already uses the correct one-time-code hint, so the two LyniaGo web sign-ins behave differently.
- **Minimal fix:** verify.tsx: autoComplete={Platform.OS === "web" ? "one-time-code" : "sms-otp"}. One attribute, same screen.
- **Verification:** trace: real (medium) / refute: real (medium)

### U45 · LOW · CONFIRMED — A suspended or banned rider sending a parcel as a customer gets a generic "Couldn't send" toast whose retry can never succeed

- **Where:** `apps/mobile/app/send.tsx:443` · platform: both · journey: Send a parcel · origin: app-defect · lens `send-compose:2`
- **Trigger:** A rider whose account is suspended or banned uses Account, Switch to customer (no standing gate on that path), goes Home, Send a parcel, fills all four steps and taps "Send to riders".
- **Customer sees:** The server answers 403 { reason: "account_suspended" | "account_banned" }. The app shows "Couldn't send. Check your data and try again.", and every Try again returns the same 403. Nothing says the account is the problem, and there is no way forward or support route. By contrast, a held customer is caught before step 1 and gets the hold wall with "Call support".
- **Minimal fix:** In send.tsx's catch, treat e.code "account_banned" or "account_suspended" the same as on_hold (setHeldFromBroadcast(true)), so the customer lands on the drawn SendHoldView ("You can't send parcels right now. Call us…", Call support, Back to home). No new copy or screen.
- **Verification:** trace: real (medium) / refute: real (medium)

### U46 · LOW · CONFIRMED — The hold wall reached from a refused send never clears after support lifts the hold, so the entered order is stranded

- **Where:** `apps/mobile/app/send.tsx:128` · platform: both · journey: Send a parcel · origin: app-defect · lens `send-compose:3`
- **Trigger:** Ops puts a customer on hold after their ["me"] data was cached (for example while the app was open). The customer composes an order and taps Send. The 403 on_hold flips the screen to the hold wall. They tap "Call support", and support lifts the hold during the call.
- **Customer sees:** The wall polls /auth/me every 60 s and sees onHold:false, but keeps showing "Your account is on hold" indefinitely. The four steps the customer filled in are still in memory behind the wall. The only exit is "Back to home", which discards them, and they have to start the order again from scratch.
- **Minimal fix:** Clear heldFromBroadcast when a refetch of meQ reports onHold === false, for example an effect on meQ.data?.onHold with meQ.dataUpdatedAt. The compose then reappears with everything still filled in.
- **Verification:** trace: real (high) / refute: real (high)

### U47 · LOW · CONFIRMED — The "Use my location" map pill fills the DROP-OFF with the GPS pickup, so a 0.0 km trip goes through to riders

- **Where:** `apps/mobile/app/send.tsx:207` · platform: both · journey: Send a parcel · origin: design-gap · lens `send-compose:5`
- **Trigger:** Open Send a parcel. The pickup auto-fills from GPS and the drop-off is empty. The customer taps the prominent "Use my location" pill, expecting it to recenter or confirm where they are.
- **Customer sees:** The drop-off row fills with the customer's own position, the same as the pickup. The map shows "0.0 km" and Next turns on. Price suggests $1.50, and Review shows the same address twice. Nothing flags it, and a zero-distance job is broadcast to riders. To recover, the customer has to notice and re-edit the drop-off.
- **Merchant/rider side:** Riders receive a zero-distance parcel job.
- **Minimal fix:** Treat a drop-off that coincides with the pickup as not set. Make step1Ok also require quote.distanceKm above a small floor (for example 0.05 km), and show the existing "Add a drop-off to continue." CTA hint in that state. No new copy.
- **Verification:** trace: real (medium) / refute: real (medium)

### U48 · LOW · CONFIRMED — A first-time sender has to type their own phone even though the account has it; the handoff draws it prefilled

- **Where:** `apps/mobile/app/send.tsx:145` · platform: both · journey: Send a parcel · origin: app-defect · lens `send-compose:7`
- **Trigger:** A customer who just signed up with OTP opens Send a parcel for the first time (no earlier order, so nothing stored under lynia.myPickupPhone.v1) and reaches step 2.
- **Customer sees:** "Your phone (sender)" is empty, and the CTA hint reads "Still needed: what you're sending, your phone, recipient phone". On the most fragile journey (the first order) the customer has to retype the number they verified a minute earlier.
- **Minimal fix:** When loadMyPickupPhone() returns nothing, seed senderPhone from meQ.data?.phone (formatPhoneLocal), using the same `p || …` guard so a typed value is never overwritten.
- **Verification:** trace: real (high) / refute: real (high)

### U49 · LOW · CONFIRMED — Review total can leave out a carried balance the rider will still collect

- **Where:** `apps/mobile/src/query/use-order-flow.ts:43` · platform: both · journey: Restaurants · origin: app-defect · lens `restaurants-browse-checkout:5` (also found by: money-codes-consistency:2)
- **Trigger:** A customer owes a balance from an earlier cancel after collection (BRIEF D3f). They tap Place before GET balance lands (it fetches on every mount, staleTime 0), or the read fails on a weak link.
- **Customer sees:** Review shows "Place order · $16.50 cash" and "Have $16.50 ready" with no Owed row. The server adds the balance, so the order screen and the rider ask for more at the door than the customer agreed to.
- **Minimal fix:** Have useCarriedBalance expose its query state and add `!balanceSettled` to the Place button's disabled condition. On a balance read error, show the existing R7b toast with Try again bound to a refetch of the balance.
- **Verification:** trace: real (medium) / refute: real (low)

### U50 · LOW · CONFIRMED — A saved cart whose dishes all sold out opens as "Your cart is empty" with no reason

- **Where:** `apps/mobile/app/food/checkout.tsx:356` · platform: both · journey: Restaurants · origin: app-defect · lens `restaurants-browse-checkout:9`
- **Trigger:** A cart restored after a restart holds only dishes that are now out of stock or gone, e.g. a single dish that sold out overnight.
- **Customer sees:** Review goes straight to R9a "Your cart is empty". The R6a "Some things changed… Sold out now — taken off" lines never show, so the customer doesn't learn why the basket vanished. "Browse" always opens Restaurants, even for a pharmacy or shop cart.
- **Minimal fix:** When changes.gone is non-empty, render the R6a note and the struck-through gone lines above the R9a empty state. Remember the service before the cart is emptied so "Browse" goes back to that section.
- **Verification:** trace: real (high) / refute: real (medium)

### U51 · LOW · CONFIRMED — A price drop is flagged as "Price went up"

- **Where:** `apps/mobile/app/food/checkout.tsx:468` · platform: both · journey: Restaurants · origin: app-defect · lens `restaurants-browse-checkout:10`
- **Trigger:** A dish in the cart is cheaper on the latest menu, e.g. a merchant promo from $6.00 to $5.00.
- **Customer sees:** The line reads "Price went up $6.00 → $5.00" under the yellow "Some things changed" banner. The customer sees a contradictory, alarming message about a cheaper item.
- **Minimal fix:** Pass the flag only when ch.to > ch.from. Apply a drop silently, still showing the struck old price via `was`.
- **Verification:** trace: real (high) / refute: real (high)

### U52 · LOW · CONFIRMED — "Your cart is empty" flashes right after a successful Place

- **Where:** `apps/mobile/app/food/checkout.tsx:339` · platform: android · journey: Restaurants · origin: app-defect · lens `restaurants-browse-checkout:11` (also found by: tap-to-screen:TTS-09)
- **Trigger:** Any successful placement on Android, longest on a low-end phone.
- **Customer sees:** Between the success and the jump to the order (or the PC8 explainer), the screen shows R9a "Your cart is empty" with a Browse button. The customer briefly reads that their order vanished, and a tap on Browse in that moment starts a second navigation.
- **Minimal fix:** Compute `next` before clearing (await routeAfterOrderPlaced, then cart.clear(), then goToPlacedFoodOrder), or skip the R9a branch while busy is true.
- **Verification:** trace: real (medium) / refute: real (low)

### U53 · LOW · CONFIRMED — Adding past 20 of one dish from the item sheet silently adds nothing

- **Where:** `apps/mobile/app/food/[id].tsx:176` · platform: both · journey: Restaurants · origin: app-defect · lens `restaurants-browse-checkout:12`
- **Trigger:** The cart has 12 of a dish. The customer opens it again, sets quantity 10 (or 10 with a different note such as "no onions") and taps "Add 10 · $X".
- **Customer sees:** The sheet closes as if the items were added, but nothing is added and nothing is said. Catering-size or split-note orders lose the input.
- **Minimal fix:** Clamp instead of drop: add min(qty, 20 - qtyFor(item.id)), keeping per-line caps as the server does, or show the existing BrowseToast when the add can't fit. The same change applies in ShopStoreScreen.tsx:176.
- **Verification:** trace: real (high) / refute: real (medium)

### U54 · LOW · CONFIRMED — Going over the 20-per-item cap silently adds nothing

- **Where:** `apps/mobile/src/ui/browse/ShopStoreScreen.tsx:176` · platform: both · journey: Shops & pharmacy · origin: app-defect · lens `shops-pharmacy:8`
- **Trigger:** The cart already holds 15 of an item, and the customer opens its sheet and picks 'Add 6'. Or the item is at 20 and they tap the row's + or stepper +.
- **Customer sees:** The sheet closes as if the add worked, but nothing is added. Nothing is capped to the maximum and nothing explains why. The quantity shown stays the same.
- **Minimal fix:** Clamp to the remaining room (`Math.min(qty, MAX_ITEM_QTY - qtyFor(id))`), add when it is above 0, and pass `plusDisabled={qty >= MAX_ITEM_QTY}` to the row and tile steppers, as the item sheet already does.
- **Verification:** trace: real (high) / refute: real (low)

### U55 · LOW · CONFIRMED — Shop and pharmacy search loses the in-store query and shows a blank screen when the request fails

- **Where:** `apps/mobile/src/ui/browse/ShopStoreScreen.tsx:336` · platform: both · journey: Shops & pharmacy · origin: app-defect · lens `shops-pharmacy:9`
- **Trigger:** The customer types 'amoxi' inside a pharmacy, gets 'No “amoxi” here', and taps 'Search all pharmacies'. Or the section search request returns 5xx, 503 or a timeout while online.
- **Customer sees:** The section search opens empty on the idle 'Search pharmacies' state, so the customer types again. Restaurants carry the query across. A failed search shows nothing at all under the field, with no error and no retry.
- **Minimal fix:** Pass `?q=` from the store's no-match button and seed ShopSearchScreen's query from useLocalSearchParams, the way BrowseSearchScreen's initialQuery works. Render the existing emptyCopy error state with Try again when `isError`.
- **Verification:** trace: real (high) / refute: real (medium)

### U56 · LOW · CONFIRMED — Cancel-after-collection sheet quotes one amount, then the cancelled screen says the customer owes a different one

- **Where:** `apps/mobile/src/orderflow/MerchantOrderScreen.tsx:705` · platform: both · journey: Merchant ↔ customer · origin: app-defect · lens `money-codes-consistency:4`
- **Trigger:** An order carrying a $10 previous balance (goods + delivery $8) is collected. The customer taps Cancel order.
- **Customer sees:** The sheet says "Cancelling now costs the full $18.00" and the button reads "Cancel and pay $18.00". The cancelled screen then says "You owe $8.00 — pay it on your next order". Next time, Review shows $18.00 owed. The customer sees three figures for one decision and can't tell what they agreed to.
- **Minimal fix:** Use the order's own cost for the T15b sheet amount: `order.total - (order.previousBalanceUsd ?? 0)`. That is what owedUsd will read and what the cancel actually adds. The carried balance stays owed, as it already was.
- **Verification:** trace: real (high) / refute: real (medium)

### U57 · LOW · CONFIRMED — Bell unread dot on Home and Orders never updates after boot

- **Where:** `apps/mobile/src/query/use-notifications-unread.ts:25` · platform: both · journey: Orders & notifications · origin: app-defect · lens `orders-notifications:4`
- **Trigger:** The customer opens the app with nothing unread. A new feed row is then created: an offer, a status beat, a swap request or an account change. On Android the push may arrive while the app is in the foreground. On the web there is no push at all.
- **Customer sees:** The bell on Home and the Orders tab stays without a dot for the rest of the session. A web customer, whose only in-app signal is that dot, isn't told about a new offer or swap request while the app is open.
- **Minimal fix:** Invalidate `NOTIFICATIONS_UNREAD_COUNT_KEY` in the existing foreground callbacks on Home and Orders, and in the push-received listener for any notification that carries an `orderId` or `kind`. Optionally poll at the same 30 s focus-gated cadence those tabs already use.
- **Verification:** trace: real (medium) / refute: real (medium)

### U58 · LOW · CONFIRMED — Delete account says "A delivery is running — finish or cancel it first" for a parcel that was already delivered and only awaits a rating

- **Where:** `apps/mobile/app/settings/delete-account.tsx:67` · platform: both · journey: Account · origin: app-defect · lens `account-management:3`
- **Trigger:** A parcel reaches `delivered` and the customer skips the rating. Within the next 6 hours (RATING_WINDOW_MS, before the auto-close), they open Settings > Delete account.
- **Customer sees:** The screen shows a red box saying a delivery is running and to finish or cancel it, and the "Delete account" link is disabled. The delivery is already done and a delivered order cannot be cancelled, so the instruction cannot be followed. Nothing tells the customer that rating the order, or waiting up to 6 hours, unblocks it. The server would have allowed the deletion, because its guard excludes `delivered`.
- **Minimal fix:** Ignore a `delivered` snapshot when deriving `running` (for example, `activeQ.data && activeQ.data.status !== 'delivered'`), matching the server guard. Apply the same filter to the active-orders list if it adopts finding 1's fix.
- **Verification:** trace: real (high) / refute: real (medium)

### U59 · LOW · CONFIRMED — Merchant order actions spin forever while offline ("I've paid", item approval, substitutions, cancel): an ALR-09 regression in Order flow v2

- **Where:** `apps/mobile/src/orderflow/MerchantOrderScreen.tsx:1192` · platform: both · journey: Android · origin: app-defect · lens `android-resilience:5`
- **Trigger:** At the door with no data (reachability already offline), the customer taps "I've paid $X". Or they tap Confirm on the item-approval / substitution prompt, or Cancel, while the link is down.
- **Customer sees:** The button shows a spinner indefinitely. The "No data" toast the screen wrote for this case never appears, because a paused mutation never errors. On the item-approval prompt (60 s window) and the substitution round (3 min) the customer cannot tell that the answer hasn't gone out, and the window can lapse behind the spinner. The parcel order screen handles the same situation honestly with a queued state.
- **Minimal fix:** Drive these buttons from `pendingOrQueued(m)`. When it returns "queued", stop the spinner and show the existing O.c.noData toast or offline banner once, so the customer knows the tap will be sent on reconnect. Btn's `loading` prop can stay boolean (`loading={pendingOrQueued(cashM) === true}`), with a one-time toast on the transition to queued. No new copy is needed.
- **Verification:** trace: real (high) / refute: real (medium)

### U60 · LOW · PLAUSIBLE — Name step (C5) is asked again on a device whose saved session still says needsProfile after the name was saved elsewhere

- **Where:** `apps/mobile/src/logic/boot-route.ts:22` · platform: both · journey: Onboarding & sign-in · origin: app-defect · lens `onboarding-signin:6`
- **Trigger:** The customer verifies on the Android app and leaves C5 unfinished (gets distracted, kills the app). Later they sign in on app.lyniago.com, or on another phone, and save their name there. Then they reopen the Android app.
- **Customer sees:** The Android app opens on "What should riders call you?" again, for an account that already has a name. Saving it there overwrites the name they entered on the other device. Customers see their name step repeated and may end up with an inconsistent name.
- **Minimal fix:** In profile/setup.tsx, when the ['me'] data (already fetched or seeded) has a non-empty firstName, call updateSession({ needsProfile: false, signupIntent: undefined }) and replaceClearingStack to signedInDestination(...), the same calls submit() makes after a successful save.
- **Verification:** trace: real (medium) / refute: refuted (medium)

### U61 · LOW · PLAUSIBLE — A price above $100,000 passes Review, then fails with a generic "Couldn't send" whose Try again repeats forever

- **Where:** `apps/mobile/src/ui/send/SendPriceStep.tsx:71` · platform: both · journey: Send a parcel · origin: app-defect · lens `send-compose:8`
- **Trigger:** On the price step, type a 6–7 digit amount (for example 250000, a fat-fingered $2.50). maxLength 7 allows up to 9999999. Ignore the soft far-above warning, tap Review, then Send to riders.
- **Customer sees:** Review shows the huge price and Send is enabled. Tapping it shows "Couldn't send. Check your data and try again." without naming the price. Try again re-runs the same failing check every time, so the customer is stuck until they guess that the price is the problem.
- **Minimal fix:** Cap the whole-number part in sanitizePriceText to 5 digits (≤ $99,999.99, inside the contract max), so the value can't exceed the API bound. Nothing else changes.
- **Verification:** trace: real (high) / refute: refuted (medium)

### U62 · LOW · PLAUSIBLE — Choose stays tappable after the 15 s grace; the refusal says the rider "was just taken by another customer"

- **Where:** `apps/mobile/app/order/[id].tsx:586` · platform: both · journey: Send a parcel · origin: app-defect · lens `parcel-after-send:10`
- **Trigger:** Offers are on screen when the timer reaches 0. The "Choose in 0:12" pill counts down to 0:00, and the screen keeps rendering until the expiry job flips the status (about 1 s, longer if the job is lost and the 2-minute reconciler runs). The customer taps Choose at "Choose in 0:00". The same toast also appears when the rider has withdrawn the bid or gone offline.
- **Customer sees:** The server refuses (409 "the time to choose has ended"). The customer sees "Farai was just taken by another customer. Pick another rider.", which isn't true, and there is nobody left to pick before the screen jumps to No rider yet.
- **Minimal fix:** When `graceLeftMs === 0`, disable Choose and call `orderQ.refetch()`. In `onError`, show the taken toast only when the reconciled order is still `open_for_offers`.
- **Verification:** trace: real (medium) / refute: refuted (medium)

### U63 · LOW · PLAUSIBLE — The Notifications screen never says a prescription was declined, while the push and order screen do

- **Where:** `apps/api/src/notifications/notifications-feed.service.ts:333` · platform: both · journey: Shops & pharmacy · origin: backend · lens `shops-pharmacy:6`
- **Trigger:** The pharmacist declines while the rest of the order is still being packed (D5a), or declines an Rx-only order (cancelled, rx_declined).
- **Customer sees:** The push and the order screen say 'Your prescription wasn't approved'. The Notifications row for the same order still says 'Being prepared · We'll tell you when a rider has it.' for a partial decline, or a generic 'Order cancelled' for a full one. Production push is off (E2E-LB-3), so the in-app feed is the customer's only passive channel, and it doesn't mention the decline.
- **Merchant/rider side:** The decline comes from the merchant's P1 check (queue/rx/page.tsx).
- **Minimal fix:** In feedForUser, select prescription {status, checkedAt} for the customer's merchant orders, and when it is declined add a beat at checkedAt with the existing PUSH_C.rxDeclined copy, the same way kitchenConfirmedAt and prepStartedAt are synthesized. No new copy and no new screen.
- **Verification:** trace: real (medium) / refute: refuted (low)

### U64 · LOW · PLAUSIBLE — A missing patient name or consent tick produces a toast that only repeats the field label

- **Where:** `apps/mobile/app/food/checkout.tsx:319` · platform: both · journey: Shops & pharmacy · origin: app-defect · lens `shops-pharmacy:7`
- **Trigger:** The customer adds a page but leaves 'Patient name' empty or doesn't tick consent, then taps Place, which stays enabled.
- **Customer sees:** A toast reads only 'Patient name' or 'I'll show the original prescription to the rider'. It isn't an instruction, the bar hint is empty, and the button looked ready to use.
- **Minimal fix:** Use the bar hint/toast slot that already exists: show O.r.rxBlocked-style blocking by disabling Place until the patient name and consent are filled, and focus the empty field. Otherwise log a copy request for a proper instruction string.
- **Verification:** trace: real (high) / refute: refuted (medium)

### U65 · LOW · PLAUSIBLE — Shops and pharmacies stay orderable in the app when Restaurants is switched off, but every order step fails

- **Where:** `apps/mobile/src/ui/browse/ShopStoreScreen.tsx:104` · platform: both · journey: Shops & pharmacy · origin: cross-app · lens `shops-pharmacy:10`
- **Trigger:** RESTAURANTS_ENABLED is not 'true' (its env default is false and the release workflow sets no default), for example when it is pulled during an incident, while SHOPS_ENABLED and PHARMACY_ENABLED default to 'true'.
- **Customer sees:** The pharmacy storefront shows + buttons and a cart bar, and Review loads. Placing then fails with the generic 'Couldn't place' and Try again, forever, because a 503 isn't a 4xx. The schedule slots and the carried balance also come back 503.
- **Merchant/rider side:** The same switch turns off the whole merchant web, so the pharmacy couldn't receive the order anyway.
- **Minimal fix:** Make the shop storefront browse-only (its existing `!sectionOn` path) when `useFeatureFlags().restaurantsEnabled` is false as well, so the kill switch shows the drawn browse-only state rather than a dead Place button.
- **Verification:** trace: real (medium) / refute: refuted (medium)

### U66 · LOW · PLAUSIBLE — The venue's 'Something else' note ('Rudo sees this note') is never shown in the customer app, only in a push

- **Where:** `apps/mobile/src/orderflow/MerchantOrderScreen.tsx:1072-1076` · platform: both · journey: Merchant ↔ customer · origin: cross-app · lens `merchant-order-lifecycle:9`
- **Trigger:** The merchant rejects or can't finish an order with 'Something else' and types a note, e.g. 'Gas ran out today'.
- **Customer sees:** The merchant is told 'Rudo sees this note.' The customer's ending only says '{Venue} couldn't take your order · Nothing was charged.' The note is appended only to the push body. With production push off (ledger E2E-LB-3), or a dismissed push, the customer never learns the venue's reason.
- **Merchant/rider side:** The merchant-v2 S2a/K3b sheets promise the customer sees the note.
- **Minimal fix:** In the D3b branch, when snap.cancelReason is present, append the venue's note in quotes to the sub line, exactly as the push does, and log the addition under D-59/D-77 in DESIGN-DEVIATIONS.
- **Verification:** trace: real (medium) / refute: refuted (medium)

### U67 · LOW · PLAUSIBLE — Opening Notifications stamps everything read even when the feed failed to load or loads after the stamp

- **Where:** `apps/mobile/app/notifications/index.tsx:79` · platform: both · journey: Orders & notifications · origin: app-defect · lens `orders-notifications:6`
- **Trigger:** The customer opens Notifications on a slow link and the heavy feed GET fails (N10 "Couldn't load"), while the one-column POST /notifications/read succeeds. Or both requests are in flight together and the POST is processed before the GET reads `notificationsReadAt`.
- **Customer sees:** The bell dot clears and the server marks every row read although the customer saw an error screen. On the next open, or after Retry, nothing has a "new" dot. In the race case the very first open shows no new-dots at all, which defeats the "rows that were new keep their dot" rule.
- **Minimal fix:** Call `markNotificationsRead()` only once `feedQ.isSuccess`, after the first successful fetch of this visit. For example, gate the focus effect's body on `feedQ.dataUpdatedAt > 0` and re-run it when that changes.
- **Verification:** trace: real (medium) / refute: refuted (medium)


## Part B — Speed & optimisation

### P01 · HIGH · CONFIRMED — Loading PostHog remounts the whole app mid-boot, which replays the splash intro and repeats the boot requests

- **Where:** `apps/mobile/src/telemetry/analytics.tsx:84` · platform: android · kind: startup · lens `cold-start-to-home:CS-01`
- **Mechanism:** AnalyticsProvider returns `<>{children}</>` until the deferred `require("posthog-react-native")` lands. React unwraps a top-level unkeyed fragment, so the child fiber is PersistQueryClientProvider. After the load it returns `<Provider …><ScreenTracker/>{children}</Provider>` (analytics.tsx:84-91). The element type in that slot changes, so React unmounts and remounts everything under it (_layout.tsx:341-392): the persisted-cache provider, AuthProvider, BootstrapSync, BootPhaseProvider, BootSplash, AppStage, the Stack and Home. The swap is queued with runAfterInteractions (analytics.tsx:67). On Android only the splash's JS-driven `Animated.delay` drift starts hold an interaction handle (BootSplash.tsx:333, the longest is 1,900 ms). The native-driven intro and exit hold none. So the swap fires about 1.9 s after the first commit, which on a warm boot is in the middle of the exit: the splash is done at 1,300 ms and Home rises from 1,750 to 2,450 ms. The new BootPhaseProvider starts with booting=true (boot-phase.tsx:69; endedAt is only stamped later, by the old exit's stop callback at BootSplash.tsx:452). It rebuilds `reveal` at y=0, so Home drops back off-screen, and the new BootSplash starts a fresh clock (BootSplash.tsx:221), so the intro replays from 0. Several boot effects then run a second time. useBootstrap has a fresh `seededFor` ref, so `startBootstrap` calls `fetchBootstrap()` unconditionally (use-bootstrap.ts:43,133). useFeatureFlags and useServiceFlags fetch once per mount. AppNavigator's useServerMinVersion fetches per mount. useHomeLocation re-runs the SecureStore read, the GPS fix and both reverse geocodes. PersistQueryClientProvider re-reads and re-parses rq-cache.json.
- **Cost:** Warm boot with the PostHog key: the whole tree remounts about 1.9 s after launch, which is during Home's rise (1.75–2.45 s). The remounted BootPhaseProvider starts with booting=true and the new BootSplash starts a new t0, so the 1.3 s intro and the about 1.15 s exit play again. Home is settled at about 4.3 s instead of 2.45 s. The remount also costs a full re-render of providers, splash and Home (several hundred ms of JS on a low-end phone) and evaluation of the 307 KB SDK, and it repeats the per-mount boot effects: bootstrap, flags, service-flags, version gate and the location work.
- **Minimal fix:** Keep `children` in the same slot and mount the provider as a sibling that wraps only ScreenTracker, the one context consumer. Always return `<>{Provider ? <Provider apiKey={…} options={…} autocapture={false} style={{ position: "absolute", width: 0, height: 0 }}><ScreenTracker /></Provider> : null}{children}</>`. Add a test that counts a child's mounts across the deferred load and expects 1.
- **Verification:** cost-trace: real (high) / refute: real (high)

### P02 · HIGH · CONFIRMED — The shop/pharmacy storefront re-renders the whole catalogue on item -> sheet, every +, and every scroll-spy crossing (the Wave 3 memo was applied to restaurants only)

- **Where:** `apps/mobile/src/ui/browse/ShopStoreScreen.tsx:399` · platform: both · kind: tap-latency · lens `tap-to-screen:TTS-03` (also found by: render-lists-lowend:RL-01)
- **Mechanism:** Wave 3 (docs/PERFORMANCE.md) memoized the restaurant menu body so that scroll-spy and collapse re-render only the tabs. Its sibling `ShopStoreScreen` (D-58) still builds every ShopTile/PharmacyRow inline in render: `renderItems` (:185) is called from `sections.map` (:399), with inline closures `onOpen={() => setOpenItem(it)}` (:195/:204) and inline style literals, and the tiles are not memoized. Every state change on the screen therefore reconciles the full catalogue: setOpenItem when the sheet opens and again when it closes, setActive/setCollapsed from onScroll (:359, :366) at each section crossing and at the collapse threshold, setToast, every cart change, the 60 s `useNow` tick, and the 2-3 location updates per mount from TTS-01. The item sheet's Modal cannot start mounting until that render commits.
- **Cost:** Every state change on the shop/pharmacy storefront reconciles every tile, which is ~100-300 ms of JS on a low-end Android for a ~150-item catalogue. That cost lands on item tap (setOpenItem) before the sheet Modal starts, again on close, at every scroll-spy section crossing and at the collapse threshold mid-fling, on each +/- tap, and on the 60 s useNow tick. It scales linearly with catalogue size.
- **Minimal fix:** Copy the food/[id].tsx:183-217 pattern. Wrap the `sections.map(...)` body in a `useMemo` keyed on `[sections, cart.cart, id, canAdd, service]`, and pass stable `useCallback`s that read the latest `add`/`minus`/`setOpenItem` through a ref and take the item as an argument. Keep tabs, collapse and overlays outside the memo. No pixel changes. Pairs with TTS-07's row memo.
- **Verification:** cost-trace: real (high) / refute: real (high)

### P03 · HIGH · CONFIRMED — Merchant order read re-signs the pickup/door proof and swap photos on every request, so each 4-15 s poll gets a new URL and downloads the photos again

- **Where:** `apps/api/src/merchant/merchant-order-proof.service.ts:136` · platform: both · kind: network-waste · lens `network-slow-link:NET-01`
- **Mechanism:** `getMyOrder` (GET /restaurants/orders/:id) always runs `withDetail`. That calls `proofViews`, whose `sign()` is a raw `storage.createReadUrl(key, 900)` for the pickup and door proof. For an open substitution round it also calls `storage.createReadUrl(d.photoUrl, 24h)` per swap dish (food-order.service.ts:516). Nothing is cached, and a V4 signature carries its own X-Goog-Date, so every response has new URL strings. That has three effects. (1) The ETag never matches, so the customer's food-order poll (`pollIntervalFor`: 15 s in every non-cancelled phase including delivered, 4 s while a substitution is open) downloads the full body every time. (2) `PhotoTile` renders those URLs with `cachePolicy="memory"` keyed by URL, so the 48-px proof tile, which holds a 1280-px rider upload of about 150-400 KB, downloads again on every poll and on every socket-driven invalidation. During a substitution, each 44-px swap tile downloads a 1600-px dish photo of up to 300 KB every 4 s. (3) Each request spends one or two IAM signBlob RPCs. This is the PERF19-01 bug class. The parcel `getSnapshot` pickup photo was fixed with `pickupPhotoUrlCache` (orders.service.ts:1146-1162), but the Order flow v2 merchant proof and swap reads added later never got the same cache.
- **Cost:** About 0.6-1.6 MB/min of photo re-download while the T8/T9/D screens are foregrounded (one 150-400 KB photo per 15 s poll), plus an uncached JSON body each poll. During an open substitution: one 44-px tile per swap dish re-downloads (up to 300 KB) every 4 s.
- **Minimal fix:** Server only. Give `proofViews` and the swap-photo mint the same read-through micro-cache the parcel pickup photo uses: `MicroCache.getOrLoad(objectKey, ttl = 2/3 × validity, mint)`, with `.catch(() => null)` outside the loader as in `MerchantService.signPhoto` and `OrdersService.pickupPhotoUrlCache`. Inject one shared cache from FoodOrderService (or reuse `MerchantService.signPhoto` for dish keys). URLs then stay byte-stable across polls, polls get 304s again, and the photo is fetched once. This also helps the merchant and rider reads that share `withDetail` (food-order.service.ts:710, :764). No contract change.
- **Verification:** cost-trace: real (high) / refute: real (high)

### P04 · HIGH · CONFIRMED — Menu and shop catalogue screens download every item photo at upload resolution as soon as the screen opens

- **Where:** `apps/merchant/app/components/menu/PhotoPicker.tsx:64` · platform: both · kind: network-waste · lens `network-slow-link:NET-02`
- **Mechanism:** Two problems compound. (1) Size: the merchant PhotoPicker encodes every kind at `maxDimension: 1600` and lowers JPEG quality only until the file fits `MAX_DISH_PHOTO_BYTES` (300 KB) or `MAX_BANNER_PHOTO_BYTES` (250 KB, which also covers the logo). So a dish is about 1600×1600 at roughly 250-300 KB and a cover about 1600×533 at roughly 120-250 KB. The customer app shows them at 44-148 dp (DishRow 112, pharmacy row 72, PopularCard 148, home rail card 96 tall, store logo about 54-64). No thumbnail variant exists anywhere, and the API signs one URL per object. expo-image downsamples only at decode time, so the network bytes are unchanged. (2) Eagerness: the menu (`app/food/[id].tsx`) and the storefront (`ShopStoreScreen`) put every section's rows in one `ScrollView` (`sections.map(... renderItems(x.items))`), so every row mounts and starts its photo download at open, including rows many screens below the fold. The catalogue response is unbounded (`getShopCatalogue` has no `take`).
- **Cost:** About N_photos × 150-300 KB on first open of a menu or storefront, typically 3-8 MB for a 20-30 dish menu with photos. That is tens of seconds of 3G bandwidth competing with the menu, cart and checkout calls.
- **Minimal fix:** Three tiers, none of which changes what a screen looks like. (a) One-line stopgap in the merchant app: pass `maxDimension` per kind in PhotoPicker (logo 256, dish 800, banner 1200). New uploads drop about 3-5×. (b) Thumbnail variant using the existing canvas pipeline: PhotoPicker also encodes `compressImage(file, { maxDimension: 400, maxBytes: 40_000 })` and PUTs it to a second signed target minted next to the first (`<uuid>.t.jpg`). `toCustomerDish`/`toListItem` add an optional `thumbUrl` signed through the same `signPhoto` cache. Row, tile and rail components use `thumbUrl ?? photoUrl`, while ItemSheet and StoreCover keep the full photo. (c) Near-viewport loading in the two ScrollView storefronts: the screens already measure `sectionY` and track scroll offset for the scroll-spy, so pass `photoUrl` only to sections within about 2 viewport heights of the current offset. Until then the tile shows its existing `surface` background, which is the same pixel it shows while a photo loads.
- **Verification:** cost-trace: real (high) / refute: real (medium)

### P05 · HIGH · CONFIRMED — Prescription photo upload has a fixed 15 s total deadline for a 150-400 KB body, so it always fails on a slow uplink and the page is thrown away

- **Where:** `apps/mobile/src/api/uploads.ts:58` · platform: both · kind: network-waste · lens `network-slow-link:NET-03`
- **Mechanism:** `uploadImage` arms `setTimeout(() => controller.abort(), STANDARD_TIMEOUT_MS)` (15 s) before `fetch(uploadUrl, { method: "PUT", body: blob })`. That one deadline must cover DNS, TCP and TLS to storage.googleapis.com (about 3-4 RTT, roughly 2 s at 600 ms RTT) plus sending the entire body. `network-policy.ts` sized STANDARD_TIMEOUT_MS for JSON round trips, but the body here is the downscaled photo, which the repo's own note puts at about 150-400 KB (`image-downscale.ts`: 1280 px, q0.7). If downscaling throws, it is the camera original (`/* upload the original */`). Below roughly 20-25 KB/s of sustained uplink (about 160-200 kbps, which is common on poor 3G and is every 2G link) the PUT cannot finish inside 15 s, so it aborts every time. `use-prescription-photos.ts` then removes the page (`setPages(cur => cur.filter(...))`) and shows a toast, and every retry fails the same way. Checkout blocks placing an Rx order without the photo (`rxEmpty`).
- **Cost:** At an uplink below about 16-25 KB/s, every attempt aborts at 15 s after sending 120-240 KB, and an Rx order cannot be placed. On normal 3G the upload succeeds.
- **Minimal fix:** Scale the PUT deadline to the body instead of using the JSON tier. Add a helper in network-policy.ts, for example `uploadTimeoutMs(bytes) = STANDARD_TIMEOUT_MS + Math.ceil(bytes / 8_000) * 1000`, which assumes a 64-kbps uplink floor (300 KB comes to about 53 s). Use it in `uploadImage` with `blob.size`. An alternative with the same footprint is an idle timeout that is re-armed on XHR `upload.onprogress`, so only a stalled upload aborts. No change to the UI or the contract.
- **Verification:** cost-trace: real (high) / refute: real (medium)

### P06 · HIGH · CONFIRMED — Every browse screen runs its own GPS fix and two reverse geocodes; the cached-fix geocode is unbounded and runs before the live fix

- **Where:** `apps/mobile/src/logic/home-location.ts:303` · platform: both · kind: network-waste · lens `maps-location-search:MLS-01` (also found by: tap-to-screen:TTS-01, network-slow-link:NET-05)
- **Mechanism:** `useHomeLocation()` has no shared state. Its detection effect is guarded only by a per-instance `started` ref (:295-305), so each of the 9 screens that mount it runs the whole chain again. The chain is: SecureStore read, permission read, `getLastKnownPositionAsync`, a reverse geocode of the cached fix, then `getCurrentPositionAsync` (Balanced, up to 9 s), then a reverse geocode of the live fix, then a SecureStore write. The cached-fix geocode is AWAITED before the live fix starts (:332-343). `addressFor` (:223-233) has no timeout, unlike `use-pickup-autolocate.ts` `landmarkFor`, which fixed this exact anti-pattern for the pickup. So on a stalled link the live fix waits on the platform geocoder's own network timeout. The point is only published together with a label (:337-341, :354-357), so a working GPS fix with a failed geocode never yields distances or ETAs. Each mount flips `place` up to 3 times (stored, cached, live). On Review & place the drop follows `home.point` until touched (checkout.tsx:128-131), and `useScheduleSlots` is keyed on the drop rounded to 3 decimals (checkout.tsx:190, use-order-flow.ts:26-29). Each flip that crosses a ~110 m cell therefore refetches schedule slots and changes the Deliver-to label, fee and ETA under the customer's thumb. `point` is also a new object on every render (:417), which defeats every consumer's `useMemo([... location.point ...])`, for example food/index.tsx:91 and home.tsx:289.
- **Cost:** Per screen push: 1 location fix (Wi-Fi scan + network-location lookup, about 1-3 s, up to 9 s) plus 2 serial reverse-geocode round trips to Google (about 0.4-1.2 s each on 3G at 300-600 ms RTT) plus 2 keychain ops. That is about 2-5 s of radio activity competing with the screen's own catalogue fetch. A 4-screen food journey does 4 fixes and up to 8 geocodes where 1 fix and 2 geocodes would do. On Review & place: 2-3 drop changes and often 1-2 extra schedule-slots API round trips. On a first run or a stalled geocoder, list distances and ETAs are missing for several seconds or for the whole visit. On web, every geocode is a billable Maps JS Geocoder request.
- **Minimal fix:** Keep everything inside home-location.ts and leave the hook's API unchanged. Add a module-level session cache, `{ place, source, at }`, plus a single-flight `inflight` promise. `useState` initialises from the cache, so later mounts paint the resolved place on their first frame. A mount only re-detects when the cached result is older than LAST_KNOWN_MAX_AGE_MS; concurrent mounts join `inflight`. Inside the chain, start `livePoint()` concurrently with the cached-point geocode, using the generation guard the pickup hook already has, and wrap `addressFor` in `withTimeout(..., FIX_TIMEOUT_MS)`. `setManualPlace` and `useCurrentLocation` also write the cache. Return a memoised `point` (`useMemo` on place.lat/lng). Nothing on screen changes. The result is 1 fix and at most 2 geocodes per 2-minute window instead of per screen, and Review & place opens on the already-resolved drop: one slots fetch, no flip.
- **Verification:** cost-trace: real (high) / refute: real (high)

### P07 · HIGH · CONFIRMED — Service-worker install downloads the entry bundle and fonts a second time, skipping the HTTP cache, right after the first paint

- **Where:** `apps/customer-web/public/sw.js:26` · platform: web · kind: network-waste · lens `web-load:WEB-LOAD-01`
- **Mechanism:** sw-register.js registers the worker on `load`. The install handler then precaches every PRECACHE entry with `new Request(url, { cache: "reload" })`. `reload` skips the browser HTTP cache, so the hashed entry bundle and the three Inter TTFs are fetched from the network again. The page loaded those exact bytes seconds earlier, and `_headers` marks them `public, max-age=31536000, immutable`. The precache list also holds every file under assets/, which includes framework PNGs the customer never sees.
- **Cost:** Confirmed in code. sw.js:26 precaches every PRECACHE entry with cache:'reload', which skips the HTTP cache. PRECACHE (finish-build.mjs:59-69) holds the entry bundle referenced from index.html, plus every file under assets/ (the docs put this at about 0.5 MB, mostly the three fonts), plus the icons. sw-register.js registers the worker on `load`, so the re-download starts right after first paint. PERFORMANCE.md Wave 3 gives the bundle as 3.97 MB minified, about 0.9-1.1 MB compressed on the wire. With about 0.3-0.5 MB of assets, a first visit downloads roughly 1.2-1.5 MB a second time, and so does the first visit after each deploy (the old worker's cacheFirst fetches the new bundle, then the new worker's install fetches it again). At an effective ~1 Mbps that is about 8-12 s of saturated link, overlapping Home's API calls, photos and the Maps script. Minimal fix: drop `cache:'reload'` for the immutable /_expo/static and /assets entries and keep it only for '/'.
- **Minimal fix:** In the install handler, keep `cache: "reload"` only for "/" and the non-hashed files (manifest, icons). Use the default cache mode for paths starting with `/_expo/static/` or `/assets/`, for example `stat.add(isHashed(path) ? url : new Request(url, { cache: "reload" }))`. The browser then copies those files out of its HTTP disk cache with no network transfer. Optionally, narrow `assetFiles` in finish-build.mjs to fonts only (the `.ttf` files).
- **Verification:** cost-trace: real (high) / refute: real (high)

### P08 · MEDIUM · CONFIRMED — The saved cache expires after 24 h, so most customer launches hold the splash on network round trips

- **Where:** `apps/mobile/src/query/persist.ts:105` · platform: both · kind: startup · lens `cold-start-to-home:CS-02`
- **Mechanism:** Since splash-v1 (D-64) the splash waits for Home's `profile` signal (`["me"]` has data) and `home` signal (all three rails have data or have errored) (home.tsx:328-338; timeline.ts:41,82). These are instant only when the saved query cache restores. PersistQueryClientProvider throws away the whole saved client when its timestamp is older than PERSIST_MAX_AGE_MS = 24 h (persist.ts:105, passed at _layout.tsx:345). It also throws it away when the buster, which is the app version, changes (persist.ts:108). The timestamp is the last throttled cache write, which is roughly the last time the app was used. So a customer who orders less than daily, and everyone on the first launch after a release, boots with an empty cache. The splash then waits on the network for /app/bootstrap (me) plus page 1 of restaurants, shops and pharmacy. On these launches the 15-minute access token is also always expired (CS-03). Before D-64 an empty cache only meant skeletons; now it means a held splash.
- **Cost:** On a launch more than 24 h after the last write, or the first launch after a version bump, the splash waits on bootstrap plus 3 feed first pages (in parallel), on top of the 401/refresh round (CS-03). That is about 3–5 RTT plus radio promotion on 3G, so roughly 1.5–4 s of extra splash beyond the 1.3 s intro. The bytes are unchanged.
- **Minimal fix:** Raise PERSIST_MAX_AGE_MS to about 7 days. `me` and the browse lists are already revalidated on mount, and /food shows its own "Showing what we had at HH:MM". Card photos load from the image cache, which is keyed by the old URL, until the refetch brings fresh URLs. To keep the "last month's balance is a lie" rule, add a `deserialize` to queryPersister that drops `wallet` and `earnings` entries whose dataUpdatedAt is older than 24 h. Optionally, replace the version buster with a hand-bumped cache-schema constant, so routine releases stop clearing every customer's cache.
- **Verification:** cost-trace: real (medium) / refute: real (medium)

### P09 · MEDIUM · CONFIRMED — The 15-minute access token has expired on almost every cold start, so every boot request goes 401 → refresh → retry

- **Where:** `apps/mobile/src/api/client.ts:188` · platform: both · kind: network-waterfall · lens `cold-start-to-home:CS-03` (also found by: submit-latency:SUBMIT-03)
- **Mechanism:** ACCESS_TTL_SECONDS defaults to 900 (apps/api/src/config/env.ts:142), and deploy-admin.yml:34 confirms the 15-minute expiry is live. The client only refreshes after a 401. Every request is sent with the stored token (client.ts:188), gets a 401, reads the body, and then waits for the single-flight refresh (client.ts:206, 246-255). That refresh waits for a keystore write (client.ts:290) before the request is re-sent (:208). Any launch more than 15 minutes after the last request starts with an expired token, so /app/bootstrap, restaurants, shops, pharmacy and the three popularity reads each spend a round trip on a 401. Android's OkHttp sends at most 5 requests per host at once (the repo says so in use-notifications-unread.ts:19-21), and the queue is first in, first out. The refresh POST is queued only after the first 401 comes back. By then the requests queued at mount (shop and pharmacy popularity) and at +250 ms (feature-flags, service-flags, version-gate) are ahead of it, and they take the freed slots. So the refresh itself waits about another round trip.
- **Cost:** Compared with refreshing before sending, the reactive path adds 1 RTT (the 401 wave), plus up to 1 more RTT when the refresh POST queues behind the other same-host requests at Android's 5-per-host limit. That is about 0.3–1.2 s on 3G for bootstrap, the rails and the live-order bar on any launch more than 15 min after the last request. There are also about 6–8 wasted 401 request/response pairs (small).
- **Minimal fix:** In apiFetchInner, before the first `send`, decode the access token's `exp` claim (base64url-decode the middle segment; no library needed). If it is within about 30 s of expiry and a refresh token exists, `await refreshSession(session.refreshToken)` and send with the new token. If that returns null or throws, fall through to today's reactive path unchanged, which also covers a skewed device clock. Bootstrap is the launch's first apiFetch, so the refresh goes out first. Home's requests then wait on the same single-flight promise in JS without holding an OkHttp slot, so the 401 wave disappears. Optional second step: enable usePopularity only after its own feed has settled, so the requests the splash waits on own the first slots.
- **Verification:** cost-trace: real (medium) / refute: real (medium)

### P10 · MEDIUM · CONFIRMED — Home's "idle" warm-ups (two route graphs and a 1×1 native Google map) run during the splash exit, not after it

- **Where:** `apps/mobile/app/(tabs)/home.tsx:203` · platform: android · kind: jank · lens `cold-start-to-home:CS-04`
- **Mechanism:** usePrewarmRoutes(HOME_PREWARM) evaluates the /send and /order/[id] module graphs: about 32 + 29 local modules plus react-native-maps (about 29) and socket.io-client. MapsSdkPrewarm (home.tsx:96-126, mounted at :459) mounts a throwaway native MapView to pay the Maps SDK's first-in-process init. Both were designed as "launcher idle" work and are scheduled with InteractionManager.runAfterInteractions. Since D-64, Home mounts under the splash. The splash's intro, loops and exit are native-driven, and RN Animated sets isInteraction = !useNativeDriver, so they hold no interaction handle. Only the JS `Animated.delay` drift starts do, and the longest ends at 1,900 ms. On a warm boot both warm-ups therefore fire at about 1.9 s. That is during Home's rise (1.75–2.45 s) and BootEntrance (2.1–2.86 s, BootEntrance.tsx:18). The Maps SDK init runs on the Android UI thread, which is the thread driving those native animations. On a cold-cache boot the init freezes the splash's loading loop instead. The JS module evaluation also delays processing of the very feed responses the splash is waiting for.
- **Cost:** The Maps SDK first init (about 200–700 ms on the Android UI thread of a low-end phone) plus 3 sequential route-graph evaluations land at about 1.9 s. That is inside Home's native-driven rise (1.75–2.45 s) and the entrance, so it shows as dropped frames in the boot handoff animation. On a cold-cache boot it stalls the splash's loading loop instead.
- **Minimal fix:** Gate both warm-ups on the boot phase. Use `const { booting } = useBootPhase(); usePrewarmRoutes(booting ? [] : HOME_PREWARM);` and in MapsSdkPrewarm return early from the scheduling effect while `booting`, with `booting` added to its deps. They then start after endBoot, behind the existing setTimeout and runAfterInteractions, the same gate useNotificationsUnreadCount uses. If the entrance still overlaps, add one more short delay of about 500 ms.
- **Verification:** cost-trace: real (medium) / refute: real (medium)

### P11 · MEDIUM · CONFIRMED — Store and menu screens mount every item row and start every item photo download in the first content frame (the LC-B07 problem, back in the browse-v2 storefronts)

- **Where:** `apps/mobile/app/food/[id].tsx:193` · platform: both · kind: jank · lens `tap-to-screen:TTS-02`
- **Mechanism:** The menu body is a plain `ScrollView` with `.map` over every section and every dish (food/[id].tsx:193-217, rendered at :412). The shop/pharmacy catalogue is the same (`ShopStoreScreen` :399 `sections.map` → `ShopGrid`/`PharmacyRow`). There is no windowing, so the first commit with data creates every row's native views. Every row's `VenueImage` → `RemoteImage` → expo-image starts fetching and decoding as soon as it is attached, and every ScrollView child is attached, so off-screen photos download in parallel with the cover, logo and first rows. On a revisit the menu comes from the persisted query cache, so this whole mount happens in the push-transition frame. KNOWN_BUGS LC-B07 fixed this pattern for the list screens by moving them to FlatList; the browse-v2 storefronts reintroduced it, with no cap on catalogue size (merchant.service `getShopCatalogue` returns every non-draft item).
- **Cost:** 40-dish menu: every DishRow (with a 112px VenueImage, AddButton and Text) mounts in one commit, ~150-400 ms of JS+UI work on a low-end Paper device. All photos start downloading at once because every ScrollView child is attached. With uploads up to ~300 KB at 1600 px, that is a few MB on first open, competing with the cover and above-the-fold rows on 3G. expo-image downsamples on decode, so the OOM risk is overstated, but the bandwidth and queueing are not. It scales linearly with shop/pharmacy catalogue size.
- **Minimal fix:** Keep the ScrollView (scroll-spy and sticky tabs depend on it) but mount progressively. Add a `mountedUntil` section index: start at enough sections for about 1.5 screens (or the first ~10 items), and extend it from the existing `onScroll` when `y + viewport + one screen` passes the last mounted section's measured `sectionY`. In `jump(i)`, raise it to `i`, then scroll after layout. Rows look identical once reached, so the design is untouched. Cheap first step: add a `priority` prop to RemoteImage (expo-image supports 'low'|'normal'|'high') and pass 'low' to rows past the first screen.
- **Verification:** cost-trace: real (high) / refute: real (medium)

### P12 · MEDIUM · CONFIRMED — Order screens create the native map during the push, and the opening-state BlankMap is a second map that is torn down when data arrives

- **Where:** `apps/mobile/app/order/[id].tsx:684` · platform: both · kind: jank · lens `tap-to-screen:TTS-04` (also found by: maps-location-search:MLS-05)
- **Mechanism:** `ParcelOrderScreen` and `MerchantOrderScreen` mount `OrderMap`/`MerchantMap` (a real Google MapView) in the same commit as the push. ComposeMap's deferral is not reused: it uses `runAfterInteractions` plus a ground-colour canvas. Whenever the order is not yet in cache, the opening state renders `BlankMap` (OrderMap.tsx:205), which is a separate native MapView at Harare. It is unmounted and replaced by OrderMap/MerchantMap when the data lands, so the native view and GL surface are created twice, tiles are fetched twice, and the camera jumps from the Harare default.
- **Cost:** Each open creates a native MapView during the push animation (~100-300 ms of UI-thread work on a Go-class phone). When the order is not cached, BlankMap and OrderMap/MerchantMap are different component types, so the native view is created twice, the visible tiles are fetched twice and the camera jumps from Harare.
- **Minimal fix:** Inside OrderMap/MerchantMap, gate the `<MapView>` behind a `mounted` flag set in `InteractionManager.runAfterInteractions`, and draw the same ground-colour View until then (ComposeMap's pattern). Make the opening state render the same map component with no pins, instead of a separate `BlankMap`, so the native view survives the data arriving. No visual change beyond removing the stutter and the camera jump.
- **Verification:** cost-trace: real (high) / refute: real (high)

### P13 · MEDIUM · CONFIRMED — A past restaurant/shop/pharmacy order makes two round trips one after the other and creates three maps before it shows anything

- **Where:** `apps/mobile/app/order/[id].tsx:112` · platform: both · kind: network-waterfall · lens `tap-to-screen:TTS-06`
- **Mechanism:** `OrderRoute` learns an order's type only from a cached food order (`isCachedMerchantOrder`). `food-order` is not persisted and a past order has never been loaded, so it renders `ParcelOrderScreen` while `getOrder` (the generic snapshot) loads, purely to learn `orderType`. Only then does it mount `MerchantOrderScreen`, whose `useFoodOrder` fires `getFoodOrder`: two round trips in series. The throwaway ParcelOrderScreen meanwhile runs 3 delivery-code SecureStore reads, a rider-identity read and an order-copy read, and mounts a native BlankMap. MerchantOrderScreen then mounts its own BlankMap and finally MerchantMap: three native MapView creations for one tap.
- **Cost:** Merchant order opened from a history row, a notification or a push: getOrder (to learn the type), then getFoodOrder in series, +1 round trip of skeleton (~0.6-1.5 s on 3G). The throwaway ParcelOrderScreen does 5 device reads and mounts a BlankMap, then MerchantOrderScreen mounts its own BlankMap and then MerchantMap: 3 native MapView creations (~100-300 ms UI thread each).
- **Minimal fix:** Pass the type the row already knows. In the Orders tab, `open(id, merchant)` → `router.push('/order/' + id + '?k=m')` for rows whose `service !== 'send'`. In OrderRoute, `if (cachedFood || k === 'm' || typeQ.data === 'merchant')` renders MerchantOrderScreen directly. The list is customer-only, so the rider-viewer exception in `select` does not apply. MerchantOrderScreen then fires getFoodOrder and getOrder in parallel. Any other caller that knows the type can pass the same parameter.
- **Verification:** cost-trace: real (high) / refute: real (high)

### P14 · MEDIUM · CONFIRMED — Every + on a restaurant menu re-renders every dish row

- **Where:** `apps/mobile/app/food/[id].tsx:217` · platform: both · kind: tap-latency · lens `tap-to-screen:TTS-07`
- **Mechanism:** Wave 3's `menuBody` memo depends on `cart.cart` because it builds each row's quantity into the element. Every cart change therefore rebuilds every DishRow/PopularCard element with fresh inline `onOpen`/`onAdd`/`onMinus` closures. Neither component is `React.memo`, so all N rows, with their VenueImage, AddButton and Text flatten patch, re-render to change one row's count. The CartBar count and total update in the same commit, so the visible result of the tap waits for the whole menu.
- **Cost:** Every +/- or Add rebuilds and re-renders all N DishRow/PopularCard (non-memoised, fresh closures), ~60-150 ms of JS per tap for 40-60 dishes on a low-end Android, and the CartBar update waits for it. Stepper bursts queue one such render per tap.
- **Minimal fix:** Wrap `DishRow` and `PopularCard` (and ShopTile/PharmacyRow, with TTS-03) in `React.memo`, with props `(item, qty, canAdd)` plus stable callbacks that take the item (`onOpen(it)`, `onAdd(it)`, `onMinus(it)`). The screen already has stable `onRowAdd`/`onRowMinus`; add an `onRowOpen` the same way. After that, only the row whose quantity changed re-renders.
- **Verification:** cost-trace: real (high) / refute: real (high)

### P15 · MEDIUM · CONFIRMED — The Orders tab mounts its whole history in one go, then re-renders all of it every 15 s for the rest of the session, even when hidden

- **Where:** `apps/mobile/app/(tabs)/orders.tsx:83` · platform: both · kind: jank · lens `tap-to-screen:TTS-08`
- **Mechanism:** History is a `ScrollView` with `groups.map` → `HistoryRow` (not memoized), 50 rows per page and growing as pages load. `useNow(15_000)` ignores focus and the Tabs set no `freezeOnBlur`, so after the first visit the entire tab (every row plus `groupByDay`) re-renders every 15 s for the rest of the session, behind whatever screen the customer is using.
- **Cost:** First Orders visit: up to ~50 HistoryRows (each with an SVG sticker and a useClamp hook) mount in one ScrollView commit, ~200-400 ms. After that: an unconditional re-render of the whole tab, including groupByDay and every row, every 15 s while the tab stays mounted in the background, ~80-200 ms of JS each time, 240 per hour, which can collide with taps or scrolls elsewhere.
- **Minimal fix:** Smallest change: stop the clock while blurred (`useNow(focused ? 15_000 : null)`, letting useNow skip its interval for null; the tab already tracks `focused`) and memoize `HistoryRow`. Optionally set `freezeOnBlur: true` in the (tabs) Tabs screenOptions. Virtualizing with a SectionList stays the documented follow-up.
- **Verification:** cost-trace: real (high) / refute: real (high)

### P16 · MEDIUM · CONFIRMED — The device image cache is keyed by the signed URL, which changes at least every ~14 h and per API instance, so every photo downloads again each day

- **Where:** `apps/mobile/src/ui/RemoteImage.tsx:45-46` · platform: android · kind: network-waste · lens `network-slow-link:NET-04`
- **Mechanism:** `RemoteImage` passes `source={{ uri: props.source.uri }}` to expo-image with no `cacheKey`, so the memory and disk cache key is the full V4 signed URL, query string included. The API re-mints each photo's URL whenever its MicroCache entry expires (`MERCHANT_PHOTO_URL_CACHE_TTL_MS` = 14 h ± 10%). The code comment also says each Cloud Run instance mints its own URL unless the optional Redis L2 (`MICRO_CACHE_REDIS_L2`, default "false") is on. So the first list or menu revalidation after a window rolls over, or one served by a different instance, returns new strings for the same immutable object (keys are `<prefix>/<owner>/<uuid>.<ext>`, so the bytes never change). expo-image treats each as a cold miss and downloads it again. The persisted query cache hydrates yesterday's URLs, which hit the disk cache, and then the revalidation replaces them with new URLs and triggers a full re-download. The same per-instance variance also defeats ETag/304 for `/restaurants` and menus whenever requests alternate between instances.
- **Cost:** Each photo a returning customer has seen downloads again about once per 14 h window, and once per instance variant: a few MB per day for an active user at current photo sizes.
- **Minimal fix:** One line in RemoteImage: `source={{ uri, cacheKey: uri.split("?")[0] }}`. The object path identifies the content because the keys are immutable UUIDs, so disk-cache hits survive signature rotation and instance variance. expo-image supports `cacheKey` on Android and iOS; on web it is ignored and behaves as today. Private imagery keeps `cachePolicy="memory"` unchanged. Separately, an ops check: confirm whether `MICRO_CACHE_REDIS_L2` is true in production, because that restores cross-instance JSON 304s.
- **Verification:** cost-trace: real (medium) / refute: real (medium)

### P17 · MEDIUM · CONFIRMED — Flag hooks fetch on every mount and start at the default, so rxEnabled=false flips on each pharmacy screen and checkout can place an Rx order before the flag arrives

- **Where:** `apps/mobile/src/net/use-order-flags.ts:36-48` · platform: both · kind: perceived-latency · lens `network-slow-link:NET-06`
- **Mechanism:** `useOrderFlags`, `useServiceFlags` and `useFeatureFlags` each hold the answer in component `useState(DEFAULT_*)` and fire a plain `fetch` in a mount effect, the latter two after a deliberate 250 ms timer. There is no shared store, so every mount starts from the default and re-asks the API, even though the doc comments say 'checked once per cold start'. The repo already has the shared pattern in `useServerVersionGate` ('One answer per cold start, shared'). `DEFAULT_ORDER_FLAGS.rxEnabled` is false while the server default is true (env.ts RX_ENABLED, launched per D-76). So on every pharmacy list, storefront and checkout mount, the OTC notice renders and the Rx 'Prescription needed' badges and Rx cart flags are missing (`storeItem(d, served, orderFlags.rxEnabled)`) until the round trip lands, and then the screen re-lays out. On checkout, `rxOn = flags.rxEnabled && service === "pharmacy"` is false until `/app/order-flags` answers. A customer who taps Place in that window sends no prescription and gets a server refusal plus a retry.
- **Cost:** One flags round trip per mount: about 3-5 extra requests on a pharmacy journey (0.6-2 s each on 3G, not blocking). For one RTT after each mount the Rx UI is wrong, and a placement tapped in that window is refused by the server and needs a retry.
- **Minimal fix:** Move the three hooks onto the module-level pattern `useServerVersionGate` already uses: one `let last` per flag set plus an in-flight promise, refreshed at most once per 60 s (the server's max-age), with `useSyncExternalStore` (or `useState(last ?? DEFAULT)`) so a remount starts from the last answer. Navigation from storefront to checkout then reuses the value fetched seconds earlier, and the OTC/Rx state is right from the first frame. Defaults and fail-open/fail-closed rules stay as they are for a true cold start.
- **Verification:** cost-trace: real (high) / refute: real (medium)

### P18 · MEDIUM · CONFIRMED — Shops and Pharmacy search sends a request on every keystroke, with no debounce, unlike the restaurant search

- **Where:** `apps/mobile/src/ui/browse/ShopSearchScreen.tsx:59-60` · platform: both · kind: network-waste · lens `network-slow-link:NET-07`
- **Mechanism:** `ShopSearchScreen` passes the raw `query.trim()` straight into `useShopSearch`, whose query key is `["shopSearch", service, q]`. Every character from the second onward creates a new key and fires `GET /shops/search`. Each request runs a name ILIKE, a visible-shops read, an item name/description ILIKE and up to 20 signed photo URLs. There is no `placeholderData`, so each new key starts at `data === undefined` and the results area resets between keystrokes. The restaurant/Home search (`BrowseSearchScreen`) already debounces at 300 ms (`DEBOUNCE_MS`, `useDebounced`, 'work order §3'), but the section search never adopted it. Superseded requests are not cancelled (apiFetch ignores the query signal), so they still download and occupy Android's ~5-per-host request slots ahead of the final query.
- **Cost:** 5-8 extra search requests per typed query (about 5-12 KB each, so 30-90 KB). The final result can queue behind stale ones, adding about 1 RTT. Results flicker on every keystroke.
- **Minimal fix:** Export `useDebounced` from BrowseSearchScreen (or move it to src/logic) and use `const q = useDebounced(query.trim(), 300)` in ShopSearchScreen. That is the same 300 ms / 2-char rule the other search follows. No visual change beyond results no longer resetting on every keystroke.
- **Verification:** cost-trace: real (high) / refute: real (high)

### P19 · MEDIUM · CONFIRMED — Merchant order screen: the two reads invalidate each other and cancel each other's in-flight fetches, and the food read still polls every 15 s while the socket is live and after delivery

- **Where:** `apps/mobile/src/orderflow/MerchantOrderScreen.tsx:192-226` · platform: both · kind: network-waterfall · lens `network-slow-link:NET-08` (also found by: submit-latency:SUBMIT-07)
- **Mechanism:** On an `order:status` push, `useOrderSocket.refetchOrder` invalidates the snapshot (fetch A) and `onStatus` invalidates the food order (fetch B), both at once. When A lands, `snapStatus` changes and the effect at :219-222 invalidates the food order again. When B lands, `phaseKey` changes and the effect at :223-226 invalidates the snapshot again. TanStack v5's `invalidateQueries` defaults to `cancelRefetch: true`, so whichever read is still in flight with data is silently cancelled and restarted. `apiFetch` ignores the abort signal, so the abandoned response still downloads. The same chain runs on open: the snapshot's first arrival restarts the food refetch. Separately, `pollIntervalFor` returns 15 s for every phase except `cancelled`. The food read keeps polling while the socket is connected (pushes already invalidate it) and keeps polling after `delivered`/`completed` on the rating screen. A cold open from a push tap also runs as a waterfall: `OrderRoute` must fetch the snapshot to learn `orderType` before `MerchantOrderScreen` mounts and starts the food read, even though the push payload already carries `orderType`.
- **Cost:** Per status change: about 1-2 redundant requests, and the food half of the sheet lands about 1 RTT later (+0.6-2 s on 3G). Plus about 4 redundant food polls/min while the socket is live and after delivery.
- **Minimal fix:** (1) Pass `{ cancelRefetch: false }` on the echo invalidations (MerchantOrderScreen.tsx:197, :221, :225, and the reconnect self-heal in use-order-socket.ts) so they join an in-flight fetch instead of cancelling it. (2) Have `pollIntervalFor` return false for terminal statuses (`delivered`, `completed`, `undelivered`, as well as `cancelled`), and let `useFoodOrder` take the screen's `connected` flag to relax to a 60 s safety net while the socket is up. (3) Optional: have push routing add `orderType` to the `/order/[id]` params and let `OrderRoute` `prefetchQuery(foodOrderKey)` in parallel when it is "merchant".
- **Verification:** cost-trace: real (medium) / refute: real (medium)

### P20 · MEDIUM · CONFIRMED — The finding-a-rider rings marker is re-rasterised about 25 times a second for the whole auction

- **Where:** `apps/mobile/src/ui/order/OrderMap.tsx:174` · platform: android · kind: jank · lens `maps-location-search:MLS-02`
- **Mechanism:** `<Marker key=rings-a ... tracksViewChanges={!reduceMotion}>` wraps `FindingRings`: a 132×132 dp view holding two looping native-driver Animated rings. With tracksViewChanges on, react-native-maps 1.20 on the old architecture (newArchEnabled:false) redraws the marker's view hierarchy into a bitmap on every tick of its ViewChangesTracker (about every 40 ms) and re-uploads it as the marker icon. This happens on the UI thread for as long as `rings` is true (`stage === "finding" || "reopened"`, [id].tsx:1064).
- **Cost:** 132 dp² at 2-3× density is a 264-396 px ARGB bitmap, about 0.28-0.63 MB per frame. At about 25 frames a second that is 7-16 MB/s of bitmap allocation and upload, about 2,250 re-rasterisations per 90 s OFFER_WINDOW_MS. On a 2-3 GB phone that means a busy UI thread, GC churn and dropped frames on the sheet and the arriving offer cards, plus heat and battery, exactly while the customer is waiting to choose.
- **Minimal fix:** Make no visual change. Drop the rings Marker and render the same `<FindingRings/>` as an absolutely positioned, pointerEvents="none" sibling over the MapView. Centre it on `mapRef.current.pointForCoordinate(pickup)`, recomputed in `onRegionChangeComplete`; while finding, the camera only moves on stage fits. The native-driver loops then animate a plain view with zero bitmap uploads. Keep the static ring under reduce motion. The web shim already renders markers as DOM and needs nothing.
- **Verification:** cost-trace: real (high) / refute: real (high)

### P21 · MEDIUM · CONFIRMED — On app.lyniago.com, Home loads the whole Google Maps JS API just to name the deliver-to address

- **Where:** `apps/mobile/metro-shims/expo-location-web.js:11` · platform: web · kind: network-waste · lens `maps-location-search:MLS-07` (also found by: cold-start-to-home:CS-05)
- **Mechanism:** On web, `Location.reverseGeocodeAsync` is shimmed to `loadGoogle()` then `new google.maps.Geocoder().geocode()`. `loadGoogle` injects `maps.googleapis.com/maps/api/js?key=…&v=weekly&callback=…` (classic bootstrap, no `loading=async`, no timeout). `useHomeLocation` calls `addressFor` on Home mount whenever the browser has already granted geolocation, which is true for any returning customer who used Send. So Home's first load pulls the Maps JS API and issues 1-2 Geocoder requests before the customer reaches any map. The service worker doesn't cache other origins. A stalled script never settles, `onerror` fires only on a hard failure, and because the cached-fix geocode is awaited before the live fix (home-location.ts:332-343), later mounts in the same page never request the live fix at all.
- **Cost:** On the order of 150-250 KB compressed of Google JS across 3 or more dependent requests (bootstrap, then core modules, then the geocoder): about 1.5-3 s of a 3G link during Home's first load, competing with /app/bootstrap, active orders and the restaurants page. Plus about 0.3-0.6 s of main-thread parse in a low-end phone browser. Each Geocoder call is billed at the Geocoding SKU, about 7 per food journey together with MLS-01.
- **Minimal fix:** (1) MLS-01's session single-flight brings web down to 1 detection per session. (2) On web, run Home's reverse geocode after first paint (`InteractionManager.runAfterInteractions` or `requestIdleCallback`) while the stored label paints. (3) Bound `loadGoogle` with a timeout that rejects into the existing 'couldn't ask' fallbacks. (4) Add `loading=async` and get the Geocoder through `google.maps.importLibrary("geocoding")` for geocode-only callers, so Home doesn't pull the map renderer. No visual change.
- **Verification:** cost-trace: real (medium) / refute: real (medium)

### P22 · MEDIUM · CONFIRMED — Restaurant/shop/pharmacy order screen ignores what its commit actions return, so Cancel briefly says "LyniaGo cancelled this order" and "I've paid" resets until a refetch lands

- **Where:** `apps/mobile/src/orderflow/MerchantOrderScreen.tsx:352` · platform: both · kind: perceived-latency · lens `submit-latency:SUBMIT-01`
- **Mechanism:** cancelM's mutationFn is typed Promise<void> and throws away the response. For a free cancel that response is the full updated MerchantOrderResponse (cancelUnpaidFoodOrder). onSuccess then calls setPanel(null) and invalidate() (lines 335-338), which refetches BOTH reads. The panel closes at once, and the old stage comes back with live buttons for about one round trip. When the food read lands first (status cancelled, no rejectionReason), the old snapshot still has cancelledBy=null. The ending branch then computes byYou=false (line 1005) and falls through to the final else (lines 1077-1080): "LyniaGo cancelled this order — The restaurant reported a problem… Message us if this looks wrong", with a WhatsApp CTA. That stays up until a snapshot refetch lands. SUBMIT-07's phaseKey effect cancels and restarts that refetch, pushing it about one more RTT later. itemsM (347-351) also throws away its MerchantOrderResponse. cashM (339-346) throws away {customerCashConfirmedAt}, so payBar's "I've paid $X" button (line 1189-1193) goes from loading back to live while the rider waits at the door, inviting a second tap. The same screen's scheduleM and subM already seed the cache from their responses (lines 391 and 411), so this is inconsistent with its own pattern.
- **Cost:** On 3G (RTT 300-600 ms, plus getMyOrder/getSnapshot server time and about 1-4 KB of body), the pre-action stage shows for about 0.4-0.8 s after the POST has already succeeded. On cancel, the wrong "LyniaGo cancelled this order" ending then shows for about another 0.4-0.8 s, because of the restarted snapshot fetch. On a flaky link, the query retry policy (2 attempts, up to 4 s jittered backoff) can stretch either window to several seconds. Each cancel also costs 4 GETs (one snapshot body is downloaded and then discarded) where 0-1 are needed.
- **Minimal fix:** Use the responses, the same way scheduleM and subM already do. (1) cancelM: return the response from mutationFn. In onSuccess, before setPanel(null): for a free cancel, `qc.setQueryData(foodOrderKey(orderId), res)`; for a paid cancel, patch `{...o, status: "cancelled", merchantPhase: null}`. In both cases also patch the snapshot: `qc.setQueryData<OrderSnapshot>(orderKey(orderId), s => s ? {...s, status: "cancelled", cancelledBy: "customer"} : s)`. (2) itemsM.onSuccess: `qc.setQueryData(foodOrderKey(orderId), res)`. (3) cashM.onSuccess: patch `customerCashConfirmedAt: res.customerCashConfirmedAt` into the food cache. Keep the existing invalidate() calls as the authoritative refresh. No visual change: the screen simply shows the next stage the mocks already draw, one round trip sooner.
- **Verification:** cost-trace: real (high) / refute: real (high)

### P23 · MEDIUM · CONFIRMED — Place order seeds the food order but not the snapshot, so the order screen opens on a Harare-wide map and pins wait a round trip

- **Where:** `apps/mobile/app/food/checkout.tsx:338` · platform: both · kind: perceived-latency · lens `submit-latency:SUBMIT-02`
- **Mechanism:** After placeFoodOrder resolves, checkout only calls seedFoodOrder(queryClient, order), which writes foodOrderKey. MerchantOrderScreen takes the map's venue/dropoff points only from the generic snapshot (`const venue = snap?.pickup.point ?? null; const dropoff = snap?.dropoff.point ?? null`, lines 572-573), and MerchantOrderResponse has no location fields. The screen therefore mounts MerchantMap with null points. Its MapView starts at `initialRegion={HARARE}` with a 0.06° delta (MerchantMap.tsx:21,115), so it loads a metro-wide tile batch, then waits for GET /orders/:id (snapQ, line 206) before the fitKey effect (MerchantMap.tsx:102-108) animates to venue and drop. Send already avoids this for parcels by seeding orderKey with pickup/dropoff (send.tsx:425-438), and Checkout already holds both points at Place time (`drop`, `restaurant.location`).
- **Cost:** Every food/shop/pharmacy order: about 1 RTT plus snapshot server time (~0.4-0.8 s on 3G, more while the first post-POST requests contend) with no venue/drop pins or route. A discarded initial tile batch for a ~6.6 km Harare view (tens to low hundreds of KB on metered 3G). An animated camera jump once the snapshot lands.
- **Minimal fix:** In checkout.tsx submit(), right after seedFoodOrder, also seed the snapshot the screen reads, the same shape send.tsx:425-438 uses: `queryClient.setQueryData<OrderSnapshot>(orderKey(order.id), { id: order.id, orderType: "merchant", status: order.status, agreedFare: null, proposedFare: String(money.total), pickup: { point: restaurant.location, landmark: venue }, dropoff: { point: { lat: drop.lat, lng: drop.lng }, landmark: drop.label }, items: [], rider: null, events: [], counterpartyPhone: null, expiresAt: null, ridersNearby: null })`. Guard it with `if (restaurant?.location)`. The existing snapQ refetch (forced at mount by the phaseKey effect) replaces it with the real snapshot. The screen looks the same; the pins just appear on the first frame.
- **Verification:** cost-trace: real (medium) / refute: real (medium)

### P24 · MEDIUM · CONFIRMED — Parcel Cancel ignores the cancel response and shows the live stage again with an active Cancel until the snapshot refetch lands

- **Where:** `apps/mobile/app/order/[id].tsx:501` · platform: both · kind: perceived-latency · lens `submit-latency:SUBMIT-04`
- **Mechanism:** POST /orders/:id/cancel returns {status: "cancelled", cancelledBy}. cancelM.onSuccess (lines 503-508) ignores it: it closes the panel (`setPanel(null)`) and only invalidates orderKey. resolveStage then keeps returning the old stage (finding/offers/toPickup) from the cached status. The FindingBar or tracking sheet comes back with its countdown and an armed Cancel control (`cancelling` is false again) until GET /orders/:id returns. The server's order:status WS frame (emitted before the HTTP reply) also only invalidates (use-order-socket.ts onOrderStatus → refetchOrder), and onSuccess's invalidate then cancels and restarts that in-flight GET (TanStack's default cancelRefetch). A second tap in that window gets a 409, and onError shows the "couldn't cancel – Try again" toast on an order that is already cancelled. selectM on the same screen already does it right: it writes the server result straight into the cache (line 365).
- **Cost:** About 1 RTT plus getSnapshot (~1 KB gz body per A-T4) ≈ 0.4-0.8 s on 3G of the pre-cancel screen after the cancel has committed. If that GET fails, query retries (≤4 s backoff) stretch it to several seconds, and socket-connected active states don't poll. Plus one duplicate snapshot GET per cancel.
- **Minimal fix:** In cancelM.onSuccess, take `res` and before setPanel(null) add `qc.setQueryData<OrderSnapshot>(orderKey(orderId), (o) => (o ? { ...o, status: res.status, cancelledBy: res.cancelledBy } : o));`, mirroring selectM. Keep the invalidations as the authoritative refresh. The cancelled ending the mock already draws appears as soon as the server confirms.
- **Verification:** cost-trace: real (high) / refute: real (high)

### P25 · MEDIUM · CONFIRMED — One-tap "Send again at $X" lands on an unseeded order screen: an Opening skeleton for a round trip, then a second map init

- **Where:** `apps/mobile/app/order/[id].tsx:519` · platform: both · kind: perceived-latency · lens `submit-latency:SUBMIT-05`
- **Mechanism:** resendM.onSuccess does `router.replace(`/order/${res.id}`)` without seeding orderKey(res.id). The new route mounts with no data: OrderRoute's typeQ and ParcelOrderScreen's orderQ both start cold. ParcelOrderScreen renders the 2.1 Opening sheet over <BlankMap/> (lines 684-686, a full native MapView at the Harare region). Once GET /orders/:newId returns, it swaps BlankMap for OrderMap, a second native map init plus tile reload. The resend response (id, status, proposedFare, expiresAt) plus the current screen's cached snapshot (same pickup, dropoff and items, since the server clones them) is everything Send uses to seed its own first paint (send.tsx:425-438). In a low-supply market the no-rider → resend loop is a core path.
- **Cost:** +1 RTT plus getSnapshot ≈ 0.4-0.8 s on 3G (longer on a lossy link) of skeleton before "Finding riders" paints. On top of that, a redundant MapView init and tile batch (BlankMap → OrderMap remount) on a low-RAM phone.
- **Minimal fix:** In resendM.onSuccess, before router.replace, seed the clone from the snapshot already in cache, the same as send.tsx: `const cur = qc.getQueryData<OrderSnapshot>(orderKey(orderId)); if (cur) qc.setQueryData<OrderSnapshot>(orderKey(res.id), { ...cur, id: res.id, status: res.status, proposedFare: res.proposedFare, agreedFare: null, expiresAt: res.expiresAt, rider: null, riderCard: null, events: [], counterpartyPhone: null, cancelledBy: null, ridersNearby: null, rating: null, rebroadcastedToId: null });`. The new screen then paints the finding stage and its OrderMap on the first frame, and the normal 15 s auction poll refreshes it.
- **Verification:** cost-trace: real (high) / refute: real (high)

### P26 · MEDIUM · CONFIRMED — app.lyniago.com calls a different origin, so every commit whose URL contains an id pays a CORS preflight round trip first

- **Where:** `apps/api/src/main.ts:112` · platform: web · kind: network-waterfall · lens `submit-latency:SUBMIT-06`
- **Mechanism:** The web build is served from https://app.lyniago.com but calls EXPO_PUBLIC_API_URL=https://api.lyniago.com. Every apiFetch carries Authorization and x-device-id (and Content-Type: application/json on POSTs), so every request is non-simple and the browser sends an OPTIONS preflight first. Browsers cache preflight results per request URL, with maxAge: 600 s here (WebKit, the iPhone engine this surface targets, caps at 600 s anyway). Commit URLs that embed ids are new every time and always pay the preflight: /orders/:id/offers/:offerId/select, /orders/:id/cancel, /orders/:id/resend, /orders/:id/price, /restaurants/orders/:id/cancel and cash/customer-confirm. So does the first GET of each new order screen (two for merchant orders: /orders/:id and /restaurants/orders/:id). /orders, /restaurants/:merchantId/orders and /auth/otp/verify pay it on first use per 10 minutes.
- **Cost:** +1 RTT (≈300-600 ms on 3G) in front of nearly every customer commit on the web surface, plus one more before the first read of each newly opened order. The OPTIONS itself is tiny; the cost is purely serialized latency.
- **Minimal fix:** Serve REST same-origin for the web build so no preflight is ever needed. Add a /api/* passthrough to the existing app.lyniago.com Worker: `assets.run_worker_first: ["/api/*"]` and a ~10-line fetch handler that forwards to api.lyniago.com and strips /api. Build the web bundle with EXPO_PUBLIC_API_URL=https://app.lyniago.com/api, and keep WS_URL pointed at api.lyniago.com, since WebSocket handshakes aren't preflighted (config.ts:75 currently derives it from API_URL). Owner trade-offs: proxied requests count against the Workers quota (the Worker stops being free static-only); API per-IP throttling must read CF-Connecting-IP / trust one more hop; and it puts Cloudflare in the API path that docs/CLOUDFLARE.md keeps DNS-only. maxAge alone cannot fix this, because the cache is per-URL and WebKit already caps it at 600 s.
- **Verification:** cost-trace: real (high) / refute: real (medium)

### P27 · MEDIUM · CONFIRMED — No preconnect to api.lyniago.com: the first API call starts the DNS, TCP and TLS handshakes only after the 4 MB bundle has been evaluated

- **Where:** `apps/customer-web/finish-build.mjs:37` · platform: web · kind: network-waterfall · lens `web-load:WEB-LOAD-04`
- **Mechanism:** The API is on a different origin (EXPO_PUBLIC_API_URL=https://api.lyniago.com). Nothing in index.html warms that connection. The first fetch is issued only after the whole bundle has downloaded (or come from the service-worker cache) and been evaluated. The connection then pays DNS, TCP and TLS, and because every request carries Authorization and x-device-id, a CORS OPTIONS preflight comes before the GET. On repeat visits the bundle comes from cache and evaluating it takes about 1-2 s on a low-end phone. The handshake could run during that time, but now it runs after.
- **Cost:** Confirmed: the head tags injected by finish-build.mjs:37-50 have no preconnect or dns-prefetch, and the API is on a different origin (api.lyniago.com). A `<link rel=preconnect href=https://api.lyniago.com crossorigin>` would move DNS+TCP+TLS (about 2-3 round trips, 0.6-1.8 s at 300-600 ms RTT) off the critical path into the bundle download/evaluation window, on every cold load and every launch where the connection is not already warm. It does not remove the CORS preflight (Authorization and x-device-id headers, client.ts:181-182). That is cached for 600 s anyway, so on a launch it is one more round trip that preconnect cannot hide. Note the `crossorigin` attribute is needed because the fetches are CORS-mode.
- **Minimal fix:** Add `'<link rel="preconnect" href="https://api.lyniago.com" crossorigin />'` to the `head` array in finish-build.mjs. `crossorigin` is required because apiFetch's CORS requests use the anonymous connection pool. smoke.sh already checks the head tags, so add one grep there. Preconnect is not limited by connect-src, so the CSP needs no change.
- **Verification:** cost-trace: real (high) / refute: real (high)

### P28 · MEDIUM · PLAUSIBLE — Tapping 'Deliver to ✎' on Review & place mounts a native Google map synchronously, usually the first map of the session

- **Where:** `apps/mobile/src/ui/orderflow/PinMap.tsx:55` · platform: android · kind: tap-latency · lens `maps-location-search:MLS-03`
- **Mechanism:** `openAddress` sets `editingAddr` (checkout.tsx:247-251). The same commit renders `<AddressEdit>`, which unconditionally renders `<PinMap>`, and PinMap inflates `<MapView>` immediately (PinMap.tsx:55-62). There is no `runAfterInteractions` deferral like the one PERF-SEND-01 gave ComposeMap (ComposeMap.tsx:162-166). On the restaurant, shop and pharmacy path, nothing before Review & place renders a map (Home, list, menu). So this tap usually pays the first-in-process Google Maps SDK initialisation on the UI thread (CUSTOMER-JOURNEY-LOAD-PERF §2 item 1), before the search field and its rows can paint or take focus. 'Done' unmounts it and a re-edit pays the creation again.
- **Cost:** About 0.3-1 s of UI-thread stall on the tap on a 2-3 GB Android for the session's first map (Maps module load plus GL surface). About 100-300 ms on each later open. Plus the first tile batch on the same link as the Places search.
- **Minimal fix:** Copy ComposeMap's gate into PinMap: `const [mapMounted, setMapMounted] = useState(false); useEffect(() => { const h = InteractionManager.runAfterInteractions(() => setMapMounted(true)); return () => h.cancel(); }, []);` and render the MapView only when mapMounted. The 200 px container already paints `tokens.color.surface`, so nothing visible changes. The edit block and keyboard respond on the tap's first frame. Optionally keep AddressEdit mounted, but hidden, after its first open so Done then Edit doesn't re-create the map.
- **Verification:** cost-trace: real (medium) / refute: refuted (medium)

### P29 · MEDIUM · PLAUSIBLE — Picking a search suggestion waits on a Places Details request with no acknowledgement, no re-tap guard and no stale guard

- **Where:** `apps/mobile/src/ui/send/AddressCard.tsx:268` · platform: both · kind: perceived-latency · lens `maps-location-search:MLS-04`
- **Mechanism:** `pick = (r) => void r.resolve().then((place) => { if (place) props.onPick(place); })`. `resolve` is `placeDetails(...)`, one Places Details round trip bounded at FAST_TIMEOUT_MS = 8 s. Until it lands nothing on screen changes: the keyboard and the list stay up, and a null result is silent. Each re-tap fires another Details call. In Places (New), only the first Details request closes the session token; later ones bill per request. A Details answer that lands after the customer has typed, switched slot or tapped the map still applies. send.tsx `onPick` closes over the `editing` slot at tap time, and checkout `pickRow` (:262-270) has no guard either. A sibling has the same missing stale guard: ComposeMap fires a reverse geocode per map tap or drag (:276-290), and send.tsx `onGeoPickup` and `onGeoDrop` (:222-229) accept any answer while `source === "map"` without checking coordinates, unlike `nameStopAt` (:189-192). A slower answer for an earlier tap can therefore name the newer pin.
- **Cost:** One Details round trip per pick: about 0.4-1 s on 3G over a warm connection, up to 8 s on a flaky one, all of it dead time with no feedback, on every searched address in the two core flows. Duplicate taps mean duplicate billable Details requests. A stale result can move the pin or rename a stop the customer had already replaced.
- **Minimal fix:** In AddressCard.pick and checkout.pickRow: call `Keyboard.dismiss()` at tap time, which is the state the pick ends in anyway, so the tap is acknowledged at once. Add a `picking` ref that ignores re-taps while a resolve is in flight. Add a seq ref, bumped by query edits and finishEdit, so an answer arriving after the customer moved on is dropped. Optionally start `r.resolve()` from `onPressIn`. For the sibling, ComposeMap passes the requested coordinate to `onReverseGeocode*`, and send.tsx checks it the way `nameStopAt` does. No visual change.
- **Verification:** cost-trace: real (medium) / refute: refuted (medium)

### P30 · MEDIUM · PLAUSIBLE — Customer's merchant-order screen (1,577 lines) re-renders entirely once a second while waiting for the kitchen, during substitution rounds and at the door handshake

- **Where:** `apps/mobile/src/orderflow/MerchantOrderScreen.tsx:598` · platform: both · kind: jank · lens `render-lists-lowend:RL-02`
- **Mechanism:** `needsSecond` starts setInterval(() => setNowMs(Date.now()), 1000) on the screen component itself (:600-604). nowMs only feeds a few countdown chips and progress bars: the waiting chip and bar at :1268-1283, AnswerHead at :1294, roundClock at :1207, and the handshake clock at :1166. Every tick still re-runs the whole MerchantOrderScreen function: stage derivation (:592), prep and ETA (:845-846), every sheet card and the OrderSheet children. Only MerchantMap is memo-shielded. This is the anti-pattern PERF20-02 fixed on the parcel screen with <AuctionClock/>, re-introduced in Order flow v2's screen. MOTION-AUDIT P2 names only the rider's food-job.tsx, the Orders tab and Notifications, not this customer screen.
- **Cost:** About 10 to 25 ms of JS once a second during the waiting, itemApproval, open-round and door-handshake stages. Per tick the screen recomputes stage/ETA and reconciles a small sheet: StageTop, one chip and bar, Track, VenueRow, a collapsed OrderSummary and a cancel link, roughly 50 to 120 host views. MerchantMap is React.memo (MerchantMap.tsx:66) and its props are stable in those stages, so the map is skipped. That is one short hitch per second, not per frame, and well under 50 ms per interaction.
- **Minimal fix:** Move the per-second displays into leaf components that take a deadline: a DeadlineChip/bar for waiting, AnswerHead's clock for itemApproval and rounds, and a handshake clock. They can reuse kit.tsx Countdown/WindowProgress, which already render the same chip shape. Drop needsSecond from the screen interval so it keeps only the 15 s tick, plus a one-shot setTimeout at the deadline for the stage flip, the same way the parcel screen handles windowEnd at app/order/[id].tsx:573-577. No visual change.
- **Verification:** cost-trace: refuted (medium) / refute: real (medium)

### P31 · MEDIUM · PLAUSIBLE — Network-first page handling blocks every reload and Home Screen launch for a full connection round trip, up to 4 s, before the cached app can start

- **Where:** `apps/customer-web/public/sw.js:55` · platform: web · kind: perceived-latency · lens `web-load:WEB-LOAD-02` (also found by: cold-start-to-home:CS-06)
- **Mechanism:** fromNetworkThenShell races `fetch(request)` against a 4000 ms timer and serves the saved shell only when the timer wins or the fetch fails. The bundle the shell needs is already in the worker's cache (cacheFirst). Even so, the browser cannot begin parsing until the page itself has made a fresh connection to app.lyniago.com and got an answer: DNS, TCP and TLS, then a conditional GET that returns 304. Navigation preload is not enabled either, so on a cold service-worker start the network request waits for the worker to boot first.
- **Cost:** The finding overstates the cost. Without a service worker the page is served `no-cache` (_headers), so a launch would pay the same connect plus revalidating GET to app.lyniago.com anyway. Network-first therefore adds almost nothing over the baseline. The pure waste is the missing navigation preload: on a cold worker start (typical for a Home Screen launch) the page fetch waits for the worker to boot, about 100-400 ms on a 2-3 GB Android phone. Serving the saved shell first would save the full ~3 round trips (about 0.9-1.8 s per launch). That is not a minimal fix, though. It changes the documented promise that 'a deploy reaches everyone on their next visit', and activate (sw.js:40-45) deletes old bundles once a new worker takes over, so a stale shell would point at a bundle that no longer exists. Realistic minimal win: enable navigationPreload in activate and use event.preloadResponse in fromNetworkThenShell, about 100-400 ms per cold launch.
- **Minimal fix:** Smallest change: serve `shell.match("/")` at once when it exists, and update the cache from the network in the background, using the same structure as savedThenRefresh. The worker caches its own build's shell when it installs, and the browser's update check on each launch still installs the next deploy, so a deploy reaches users one launch later. If network-first must stay, cut NAV_TIMEOUT_MS to about 1000-1500 ms, enable navigationPreload in activate, and use `event.preloadResponse` in place of `fetch(request)` so the worker's boot is overlapped.
- **Verification:** cost-trace: real (medium) / refute: refuted (medium)

### P32 · MEDIUM · PLAUSIBLE — Every route, including the whole rider app, ships in one entry bundle that must download and parse before the first frame

- **Where:** `apps/mobile/app.config.ts:166` · platform: web · kind: bundle-size · lens `web-load:WEB-LOAD-03`
- **Mechanism:** The web build sets `output: "single"`, and the expo-router plugin is registered without `asyncRoutes`, so expo-router's require.context runs in sync mode on the web. Every file under app/ goes into the single entry bundle: app/rider/** (about 577 KB of source), food, order, settings and history. Their dependency graphs come too (src/ui/rider, src/kyc, expo-image-picker/manipulator, react-native-webview, expo-task-manager). isCustomerWebBuild() only blocks rider routes at runtime (RiderRouteGate). The web plan accepted this (B3: 'Rider routes still bundle'), but no one sized the cost for the web.
- **Cost:** Confirmed: app.config.ts:166 sets `output: 'single'` and app.config.ts:197 registers a bare 'expo-router' with no asyncRoutes, so every route under app/ (rider included) is in the single 3.97 MB entry bundle. The rider share is only estimated from source. A plausible range is 150-280 KB minified (about 50-80 KB compressed), which is roughly 0.4-0.7 s on ~1 Mbps 3G plus 100-300 ms of parse and compile on a low-end Chrome, on first visit and after each deploy. Repeat visits get the bundle from the worker cache, so they pay only the parse/compile part. The 'customer routes not on the first screen' share is less clear-cut to remove: deferring it moves the cost to the first tap rather than removing it.
- **Minimal fix:** Only in the web build, register the plugin as `["expo-router", { asyncRoutes: { web: true, default: "development" } }]` behind `isWebBuild`, so the Android/iOS config and its fingerprint stay byte-identical. Check with `expo export --platform web` that `output: "single"` splits the bundle. Three follow-on edits keep the split useful: (a) prewarm-routes' synchronous `require("../../app/send")` and the other loaders would pull those routes back into the entry bundle, so on the web either skip them or use `import()`; (b) the service worker's activate step deletes `/_expo/static/js/*` files missing from PRECACHE, so finish-build.mjs should add the split chunks to PRECACHE so they stay available offline; (c) leave the rider chunks out of the precache.
- **Verification:** cost-trace: real (medium) / refute: refuted (medium)

### P33 · MEDIUM · PLAUSIBLE — Google Maps JS loads only when the first map mounts on Send or the order screen, so on the web the map stays a grey panel for seconds after the tap

- **Where:** `apps/mobile/app/(tabs)/home.tsx:105` · platform: web · kind: network-waterfall · lens `web-load:WEB-LOAD-05`
- **Mechanism:** On Android, Home warms the Maps SDK during idle (MapsSdkPrewarm). On the web it returns at once (`if (Platform.OS !== "android") return;`). The web shim's loadGoogle() runs only from MapView's mount effect, so the chain starts at the tap: a new connection and TLS to maps.googleapis.com, the bootstrap script, then a second origin (maps.gstatic.com) for the map, marker and overlay modules, then tiles. The script URL also lacks `loading=async`, which Google recommends for the callback loader.
- **Cost:** Confirmed: MapsSdkPrewarm returns early off Android (home.tsx:105). The web shim's loadGoogle() (react-native-maps-web.js:34-58) runs only from MapView's mount effect (around :157). So the first Send or order-screen open in a session starts DNS+TLS to maps.googleapis.com, then the bootstrap script, then the maps.gstatic.com modules, and only then tiles. The avoidable part is about 2 cold origins (4-6 round trips) plus about 150-250 KB of script: roughly 1.5-3 s of grey map on 3G, once per session. Minimal fix: on web, call the exported loadGoogle() from the existing MapsSdkPrewarm idle hook. Script loading does not instantiate a map. The missing `loading=async` is a minor point, not a cost driver.
- **Minimal fix:** In MapsSdkPrewarm's existing `runAfterInteractions` path, add a web branch for the customer web build: `if (isCustomerWebBuild()) { (require("react-native-maps") as { loadGoogle?: () => Promise<unknown> }).loadGoogle?.().catch(() => {}); return; }`. This fetches the script once, idle-scheduled, and mounts no hidden map. Optionally add `&loading=async` to the script URL, and `<link rel="preconnect" href="https://maps.googleapis.com">` and `https://maps.gstatic.com` with `crossorigin` to finish-build.mjs's head tags.
- **Verification:** cost-trace: real (high) / refute: refuted (medium)

### P34 · LOW · CONFIRMED — An order screen opened from the Orders tab shows a loading skeleton and spinner although the order is already on the phone

- **Where:** `apps/mobile/app/order/[id].tsx:113` · platform: both · kind: perceived-latency · lens `tap-to-screen:TTS-05`
- **Mechanism:** The Orders tab (and Home) hold full `OrderSnapshot`s under `["activeCustomerOrders"]` (`getActiveCustomerOrders(): Promise<OrderSnapshot[]>`), but the order screen reads only `orderKey(id)`. Home copies each snapshot into `orderKey(id)` only while Home is the focused screen, and the Orders tab never does. A copied entry with no observer is garbage-collected 5 min after the order screen unmounts (no gcTime is set, so the 5-minute default applies). A customer who follows the order from the Orders tab therefore gets the OpeningSheet and a BlankMap for a full snapshot round trip, then a map remount (TTS-04). For merchant NOW cards, MerchantMap draws with no rider or route until `getOrder` returns.
- **Cost:** When it is hit: 1 snapshot round trip of OpeningSheet + BlankMap (~0.6-1.5 s on 3G), plus the BlankMap -> OrderMap remount. It is hit only for PARCEL NOW cards whose orderKey seed has been garbage-collected (Home seeded it more than ~5 min earlier with no data change since), or for an order that appeared while Home was unfocused.
- **Minimal fix:** On the `orderKey(orderId)` query in OrderRoute (the first observer, so the cache entry is created with it), add `initialData: () => qc.getQueryData<OrderSnapshot[]>(["activeCustomerOrders"])?.find(o => o.id === orderId)` and `initialDataUpdatedAt: () => qc.getQueryState(["activeCustomerOrders"])?.dataUpdatedAt`. initialData applies only when the entry does not exist, so the socket's anti-rollback merge and staleTime revalidation are unchanged. MerchantOrderScreen's snapQ gets the rider point immediately as a side benefit.
- **Verification:** cost-trace: real (medium) / refute: real (medium)

### P35 · LOW · CONFIRMED — On the web build, the 15 s request timeout stops at response headers, so a body that stalls mid-download hangs the screen indefinitely

- **Where:** `apps/mobile/src/api/client.ts:82-102` · platform: web · kind: perceived-latency · lens `network-slow-link:NET-09`
- **Mechanism:** `fetchWithTimeout` clears its abort timer in `finally` as soon as `fetch()` resolves. In React Native, fetch resolves only after the whole body is received (XHR onload), so the 15 s bound covers the full response. In a browser, `fetch()` resolves when the headers arrive, and `apiFetchInner` then calls `await res.text()` (:226, :232) with no timer and no armed abort. A response that stalls mid-body (a cell handover, a lossy link, a large catalogue or list) leaves the query or mutation pending until the browser's own socket timeout, which can be minutes. That shows exactly the endless spinner STANDARD_TIMEOUT_MS exists to prevent, and React Query never retries because the promise never settles.
- **Cost:** Rare, but each occurrence leaves a spinner or skeleton up for minutes (until the browser's socket timeout) instead of a 15 s failure and retry. Exposure is mostly on large bodies (menus, catalogues, first history page).
- **Minimal fix:** Keep the timer armed until the body is consumed. In `fetchWithTimeout`, read the body inside the try (`const text = res.status === 304 || res.status === 204 ? "" : await res.text()`) and return `{ res, text }` to `apiFetchInner`, which already parses from text. Apply the same move (parse before `clearTimeout`) to the three flag fetchers and places.ts. Native behaviour is unchanged.
- **Verification:** cost-trace: real (medium) / refute: real (medium)

### P36 · LOW · CONFIRMED — The Send compose map is destroyed on Next (1→2) and rebuilt on Back or Edit

- **Where:** `apps/mobile/app/send.tsx:475` · platform: both · kind: jank · lens `maps-location-search:MLS-06`
- **Mechanism:** `{step === 1 ? (<>...<ComposeMap .../>...</>) : (<><ScrollView key={step}>...)}`. Leaving step 1 unmounts the native map. Back, or RouteStrip `onEdit={() => goTo(1)}`, mounts a fresh ComposeMap. That shows the surface placeholder for an interaction, re-creates the native MapView, reloads tiles, restarts the 9 s and 22 s load watch, and resets `lastKey`, so the two-pin fit animates again.
- **Cost:** About 100-300 ms of UI thread to re-create the map on a low-end phone, plus a placeholder flash, a tile re-request and a re-fit animation, on every return to step 1. Corrections are common, and the map is the step's main content.
- **Minimal fix:** Keep the step-1 subtree mounted for the life of the screen and hide it while steps 2-4 show. For example, wrap it in `<View style={{ flex: 1, display: step === 1 ? "flex" : "none" }}>` and render the step 2-4 ScrollView when step !== 1. ComposeMap's loaded state, camera and `lastKey` then survive Back and Edit. Check resident memory on a 2 GB device, since one MapView stays alive, which is cheaper than re-creating it.
- **Verification:** cost-trace: real (high) / refute: real (medium)

### P37 · LOW · CONFIRMED — Each rider GPS fix glides the marker for 800 ms on the JS thread

- **Where:** `apps/mobile/src/ui/order/OrderMap.tsx:146` · platform: android · kind: jank · lens `maps-location-search:MLS-08`
- **Mechanism:** `riderRegion.current.timing({ ...next, duration: 800, easing: Easing.linear, useNativeDriver: false }).start()` drives `MarkerAnimated` from JS. That is about 48 JS-computed frames, each a setNativeProps across the old-architecture bridge, per fix. The order sheet's drag and snap are also JS-driven (`Animated.timing(top, … useNativeDriver: false)`, OrderSheet.tsx:101, plus a PanResponder), so a glide and a sheet gesture compete for the same thread.
- **Cost:** 800 ms of per-frame JS work per fix. Fixes arrive about every 10 s (rider watch timeInterval 10 s, distanceInterval 25 m), so about 8% JS-thread duty for the whole delivery, more with the ALR-07 double stream. Sheet drags during a glide drop frames on a low-end phone.
- **Minimal fix:** On Android, swap the AnimatedRegion timing for react-native-maps' native marker animation: keep a plain `<Marker ref>` and call `markerRef.current.animateMarkerToCoordinate({ latitude, longitude }, 800)` on a new fix. Keep the snap under reduce motion and leave the web shim's rAF path alone. The glide looks the same and costs zero JS frames.
- **Verification:** cost-trace: real (medium) / refute: real (medium)

### P38 · LOW · CONFIRMED — Inter fonts (336 KB of TTF) are requested only after the bundle evaluates, and nothing preloads them, so Home's text can stay invisible on first visit

- **Where:** `apps/mobile/src/ui/fonts.ts:23` · platform: web · kind: network-waterfall · lens `web-load:WEB-LOAD-06`
- **Mechanism:** prewarmFonts() runs at module scope in _layout.tsx. On the web that is only after the whole entry bundle has downloaded and been evaluated, so the three TTF requests (112 KB each, raw TrueType rather than WOFF2) start strictly after the bundle. expo-font's web loader adds @font-face with the default font-display, and Chrome hides text in a pending font for up to about 3 s. Since MOB-BOOT-05 the splash no longer waits for fonts, so Home can rise with blank or swapping text. On native the fonts are bundled, so the 'no network' assumption in fonts.ts does not hold on the web.
- **Cost:** The mechanism is confirmed: the three 112 KB TTFs (fonts.ts:23-27) are first requested from prewarmFonts at module evaluation (_layout.tsx:94), strictly after the bundle. index.html has no preload, and the fonts.ts comment that they are 'bundled (no network)' is wrong for the web. The real cost is smaller than claimed. On a bandwidth-bound 3G link, preloading 336 KB raw (compressed TTF, about 190 KB) alongside the ~1 MB bundle mostly delays the bundle by the same amount. The net saving is the latency part, about 1-2 round trips (0.3-1 s). It also runs in parallel with the /app/bootstrap fetch, which pays its own cross-origin connect and preflight and which the splash already waits on. It applies to first visits only (the worker serves the fonts afterwards). Converting to WOFF2 would save about 100+ KB on the first visit, but it is an asset-pipeline change rather than a minimal one.
- **Minimal fix:** In finish-build.mjs, which already lists `assetFiles`, add one `<link rel="preload" as="font" type="font/ttf" crossorigin href="…">` to the head tags for each `/assets/**/Inter-*.ttf`. The hashed URLs are known at that point, and the CSP's font-src 'self' allows them. Optional and still small: point appFontMap at WOFF2 output from the existing scripts/subset-fonts.mjs, only in the web build (a `fonts.web.ts` override), so the Android files stay unchanged.
- **Verification:** cost-trace: real (low) / refute: real (low)

### P39 · LOW · PLAUSIBLE — Device-id keychain read is not started early and not shared, so it adds a serial step before /app/bootstrap and is repeated per request in the boot burst

- **Where:** `apps/mobile/src/auth/session.ts:66` · platform: android · kind: startup · lens `cold-start-to-home:CS-08`
- **Mechanism:** Every apiFetch waits for getDeviceId() before sending (client.ts:174). The id is cached only after the first read resolves, and that read is not among the boot reads prewarm.ts starts at module load (prewarm.ts:98-121). /app/bootstrap starts only after the early session read resolves, so it then waits for one more Android keystore read in series. Every request in Home's burst that starts before that read resolves issues its own concurrent keystore read, queued with the other boot keychain work. On a first install, concurrent callers can each create and save a different UUID.
- **Cost:** One extra keystore read in series before /app/bootstrap is sent, about 20–150 ms on Go-class devices on each cold start. There are also a few redundant concurrent reads in the burst before the cache fills.
- **Minimal fix:** Cache the in-flight promise (`deviceIdPromise ??= (async () => { …existing body… })()`) and start it from prewarmBootReads() next to loadSession(), so the first request finds it already resolved.
- **Verification:** cost-trace: real (low) / refute: refuted (medium)

### P40 · LOW · PLAUSIBLE — During a parcel auction, the offers list polls every 15 s even while the socket pushes offers:changed

- **Where:** `apps/mobile/app/order/[id].tsx:287-292` · platform: both · kind: network-waste · lens `network-slow-link:NET-10`
- **Mechanism:** `offersQ` has `refetchInterval: status === "open_for_offers" ? 15_000 : false` with no socket gate. `useOrderSocket` already invalidates `offersKey` on every `offers:changed` push and records `offer_glass`, so the poll duplicates the live channel. The snapshot keeps its own 15 s auction poll on purpose, because `ridersNearby` only refreshes on a fetch. This is the 'offers-list 15s poll while the socket is live' item that docs/PERFORMANCE.md wave 2 left STILL UNVERIFIED, and it is unchanged in code.
- **Cost:** About 4 background 304 revalidations per minute (about 1 KB each). Nothing waits on them.
- **Minimal fix:** Gate the interval on the socket the same way the snapshot query already does through `socketConnectedRef`: `refetchInterval: status === "open_for_offers" ? (socketConnectedRef.current ? 60_000 : 15_000) : false`. That keeps a 60 s safety net while connected and the 15 s fallback when the socket is down.
- **Verification:** cost-trace: refuted (high) / refute: real (high)

### P41 · LOW · PLAUSIBLE — An address search with no Places results runs up to two serial device-geocoder lookups (and may raise the OS permission dialog) before 'No matches'

- **Where:** `apps/mobile/src/logic/use-address-suggest.ts:105` · platform: both · kind: network-waste · lens `maps-location-search:MLS-09`
- **Mechanism:** When `autocompletePlaces` returns [], the hook awaits `geocodeAddress(q)`. That calls `requestForegroundPermissionsAsync()`, which pops the OS dialog for a customer who hasn't decided yet, contrary to D-82's explainer-first rule. It then runs up to 2 sequential `geocodeAsync` calls, the verbatim query and then the corridor-suffixed one, each up to 8 s. A newer keystroke only discards the result (`live()`); the geocoder chain keeps running. Separately, MIN_QUERY = 2 while autocomplete needs 3, so typing 2 characters and pausing flashes 'No matches' after 300 ms without any request.
- **Cost:** Each pause with no results costs an autocomplete round trip plus 1-2 geocoder round trips in series, about 1.5-4 s on 3G. That often crosses SUGGEST_SLOW_MS (2.5 s), so the 'Searching… Slow connection' skeleton shows for a simple typo. On web, each geocodeAsync is a billable Maps JS Geocoder request, up to 2 per pause.
- **Minimal fix:** In this as-you-type path: check permission without asking (`getForegroundPermissionsAsync`), and report 'empty' when it isn't granted. Pass a `live` check into the loop so a superseded query stops before its second geocodeAsync. Run the fallthrough only after a further GEOCODE_DEBOUNCE_MS of no typing. Set MIN_QUERY to 3 to match autocomplete.
- **Verification:** cost-trace: real (medium) / refute: refuted (low)

### P42 · LOW · PLAUSIBLE — Regression: every rider GPS push re-renders the whole order screen (the telemetry render isolation was lost)

- **Where:** `apps/mobile/app/order/[id].tsx:214` · platform: both · kind: jank · lens `maps-location-search:MLS-10`
- **Mechanism:** The PERF split meant only `LiveTrackingCard`, through `selectRiderTelemetry`, would re-render on a position push, never the screen. After Send v2 retired LiveTrackingCard and moved the `telemetry` useQuery into `ParcelOrderScreen` itself (:214-220), next to the shell observer. Each socket `position` setQueryData now re-renders the 1,097-line screen: sheet content, CTA and three overlay components. `riderPoint` (:547) is a new object every render, so `OrderMap`'s React.memo never holds, including on the 15 s `nowMs` tick. MerchantOrderScreen subscribes to the full snapshot with no select (:206-212), and `riderFix` (:574) is also new every render, so the same happens on the 1,577-line merchant screen. The isolation test still passes because it tests probes, not the real wiring, and order-tracking.ts:10-11 still claims the isolation.
- **Cost:** One full order-screen render, about 15-40 ms of JS on a Go-class phone, per fix (about every 10 s, about 5 s with ALR-07), landing at the start of each 800 ms glide (MLS-08). Small on its own; flagged because it regresses a documented, tested fix.
- **Minimal fix:** Memoise `riderPoint` and `riderFix` on lat/lng so the map's memo holds on non-GPS renders. Move the telemetry subscription and `<OrderMap>`/`<MerchantMap>` into a small child component that alone re-renders per fix. Give the screen a select that returns only what it draws from telemetry at display granularity, as primitives (ETA minutes, a has-fix flag, updatedAt bucketed to the 15 s tick), so most pushes are structurally equal and skip the screen. Point the isolation test at the real wiring.
- **Verification:** cost-trace: refuted (medium) / refute: real (high)


## Refuted (dropped)

- Merchant-order pushes for rider assigned, rider dropped and no rider leave no feed row, or a contradicting one — `apps/api/src/notifications/notifications-feed.service.ts:333`
- Home fetches list pages until all 50 ranked venues are loaded, and every launch refetches all saved pages one after another — `apps/mobile/app/(tabs)/home.tsx:293`
