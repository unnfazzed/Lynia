# Mockup ↔ Code Alignment Review — Customer & Rider Journeys

> **Re-audited 2026-07-07 against the current branch.** This replaces the earlier pre-fix baseline.
> Every node in both journey maps was re-checked screen-by-screen against the live code. The shell
> screens the first review flagged as "missing" (onboarding carousel, customer registration,
> permission priming, notifications, settings, help hub, bike & documents, force-update, no-GPS) are
> now built, and all three original P0 journey-integrity breaks are resolved. See the history note at
> the foot of this file for what changed.

**Date:** 2026-07-07 (re-audit) · original review 2026-07-05
**Scope:** the two journey-map mockups (`packages/design/explorations/journey/` — `screens.jsx` + `map.jsx` for the customer, `rider-screens.jsx` + `rider-map.jsx` for the rider) compared against the shipped mobile app (`apps/mobile/`), with server contracts (`packages/shared/src/contracts.ts`) and lifecycle endpoints (`apps/api/src/orders/`) checked wherever a screen depends on them.
**Method:** every node in both journey maps (40 customer, 46 rider) was re-checked against the actual code — screen by screen, state by state, including WS events, push notifications, and API endpoints. Each row carries a `file:line` citation for the implementing code (or evidence of absence).

---

## Verdict

**The mockups and the built screens are now substantially aligned.** The core transactional loop was always faithful — often line-for-line on copy — and the surrounding shell has since been built out to match the designs. What remains is a short tail of edge/branch states and polish, none of which block the pilot happy path.

- **Customer:** the full arc is built — first-run/auth, search-first compose, the 90-second auction (incl. counter-offers and the rider-raced-away race), live tracking with hand-off code, every terminal outcome (cancelled / undelivered / delivered / completed), and the persistent account cluster (account, history, notifications, settings, help). The code frequently exceeds the design (OTP recovery, draft restore, reorder, live ETA, offline cold-start, in-app safety).
- **Rider:** the full arc is built — KYC, online/board, accept-or-counter offers, the assigned→pickup→verify→collect→drop-off→OTP hand-off→rate job flow, and all terminal states. All three previously-flagged P0 gaps are resolved: the post-pickup **undeliverable** flow exists end-to-end, the losing-bidder **"not chosen"** and auction-**expired** states are driven off real WS events, and the post-pickup **customer-cancel hand-back** is correctly frozen and acknowledged. Several safety surfaces (SOS, report/block, get-help) are built *ahead* of the mockups.
- **Remaining gaps are edge polish, not core flow.** The biggest are a supply-empty "no riders online" auction state (customer) and the rider bail screen lacking its designed reason + reliability warning.

| | ✅ Aligned | 🟡 Partial | ❌ Missing | Total designed |
|---|---|---|---|---|
| Customer | 33 | 5 | 2 | 40 |
| Rider | 40 | 4 | 2 | 46 |

---

## Customer journey — state-by-state

**Summary: ✅ 33 · 🟡 5 · ❌ 2 of 40.**

| Node (ID) | State | Status | Evidence (file:line) |
|---|---|---|---|
| splash (0·1) | Brand splash while booting | ✅ | `app/index.tsx:26-31` green dove + wordmark boot screen |
| onboard (0·2) | 3-slide intro carousel | ✅ | `app/onboarding.tsx:11-96` skippable slides, dot progress, once-per-install |
| login (0·3) | Phone login → OTP | ✅ | `app/phone.tsx:33-45` WhatsApp copy, Send code |
| otp (0·4) | WhatsApp 6-digit verify | ✅ | `app/verify.tsx:104-176` verify + resend + lockout recovery |
| role_select (0·5) | Choose role (send/earn) | ✅ | `app/role.tsx:29-51` two options, customer default, persists preference |
| register (0·6) | Profile registration (name + ID, not KYC) | ✅ | `app/profile/setup.tsx:45-79` name + national ID, stored not verified |
| perm_loc (0·7) | Prime location | ✅ | `app/permissions.tsx:81-92` "Turn on location" step |
| perm_notif (0·8) | Prime notifications | ✅ | `app/permissions.tsx:94-104` "Stay in the loop" step |
| home_empty (1·1) | Map home, no address | ✅ | `app/home.tsx:396-456` full-bleed `ComposeMap` + address rows + top bar |
| addr_search (1·2) | Address search (saved/recents/Places) | 🟡 | `src/ui/AddressSearch.tsx` Places autocomplete + SAVED/RECENTS, but as an inline dropdown over the map (`home.tsx:451-455`), key-gated; no dedicated full-screen search with "use my location"/"set on map" rows + Google attribution |
| addr_map_confirm (1·3) | Confirm pin on map | 🟡 | Pin drag is inline on `ComposeMap` (`ComposeMap.tsx:23-44`) with landmark auto-fill; no dedicated "Drag to adjust · Confirm drop-off" sheet |
| home_pins (1·4) | Home, both addresses set | ✅ | `app/home.tsx:283` `canSubmit` gate drives Broadcast |
| home_expanded (1·5) | Sheet expanded, declared value | ✅ | `app/home.tsx:626-656` collapsible landmarks + declared value (max 150) |
| disclaimer (1·6) | Pre-broadcast liability gate | ✅ | `app/home.tsx:661` `DisclaimerSheet`, version-stamped accept-to-continue |
| auction_finding (2·1) | Auction open, no offers | ✅ | `app/order/[id].tsx:583-598` "Finding riders…" + skeleton + countdown |
| auction_live (2·2) | Offers streaming, sort, recommended | ✅ | `app/order/[id].tsx:498-577` sort chips, `rankOffers`, Choose |
| auction_counter (2·3) | Counter-offer accept/decline | ✅ | `app/order/[id].tsx:528-540` `CounterOfferCard`, one round |
| no_riders (2·b1) | No riders online (supply-empty) | ❌ | No supply-detection state; auction shows "finding" then generic `expired` (`order/[id].tsx:583-682`) |
| select_race (2·b2) | Chosen rider just taken | ✅ | `app/order/[id].tsx:290-297` 409 → muted "that rider was just taken" |
| auction_expired (2·b3) | 90s closed, re-broadcast | ✅ | `app/order/[id].tsx:674-682` expired EmptyState + prefilled `rebroadcast()` |
| track_code (3·1) | Rider assigned, hand-off code | ✅ | `app/order/[id].tsx:444-460` code card + re-issue; recovers persisted code |
| track_active (3·2) | Live tracking, call rider, Maps sync | ✅ | `app/order/[id].tsx:603-657` `LiveMap`, live ETA, Open-in-Maps, call rider |
| rider_cancelled (3·b0) | Rider bailed → re-broadcast same price | 🟡 | Behavior built (server re-clone `order-lifecycle.service.ts:502-523`; `order:rebroadcast` socket + toast `order/[id].tsx:133-140`), but no dedicated "Tendai had to cancel · re-broadcasting" reassurance card |
| track_paused (3·b1) | Live paused / reconnecting | ✅ | `app/order/[id].tsx:433` reconnecting banner; stale-fix "call them" (`:389-396`) |
| cancel (3·b2) | Cancel + reason | ✅ | `app/order/[id].tsx:738-758` cancel-anytime; post-pickup hand-back warning gate |
| cancelled (3·b3) | Terminal cancelled | ✅ | `app/order/[id].tsx:683-687` |
| undelivered (3·b5) | Not delivered (terminal, reason + attempts) | ✅ | `app/order/[id].tsx:692-734` reason label + attempt count + own-risk copy |
| delivered_rate (4·1) | Delivered, rate rider | ✅ | `app/order/[id].tsx:664-666` `RatingCard` on `delivered` |
| completed (4·2) | Completed, send another | ✅ | `app/order/[id].tsx:668-673` Celebrate + "Send another" via rebroadcast |
| profile (A·1) | Account | ✅ | `app/profile/index.tsx:32-85` name/phone/role, history, sign-out |
| history (A·2) | Trip history | ✅ | `app/history/index.tsx:101-137` sent trips, fare, rating, status |
| notifications (A·3) | Notifications with items | ✅ | `app/notifications/index.tsx:57-83` feed rows, icon tiles, unread dot |
| notif_empty (A·4) | Notifications empty | ✅ | `app/notifications/index.tsx:70-71` "No notifications yet" |
| help (A·5) | Help & support → WhatsApp | ✅ | `app/help/index.tsx:20-58` topic list + WhatsApp row |
| settings (A·6) | Settings | ✅ | `app/settings/index.tsx:51-77` profile/notifications/language/payment/sign-out + version |
| offline (S·1) | Global offline banner | ✅ | `app/_layout.tsx:38-47` `ConnectivityBanner` over the navigator |
| on_hold (S·2) | Account on hold (blocking) | ❌ | Built only for riders (`app/rider/index.tsx:446-451`); no customer-facing account-hold screen |
| force_update (S·3) | Hard version gate | ✅ | `app/force-update.tsx:13-53` + root gate `_layout.tsx:56` |
| no_gps (S·4) | Location off / no GPS | 🟡 | Customer degrades to manual pin/search (`src/ui/MapPicker.tsx:143`); no explicit "Open location settings" screen (riders have one) |
| generic_error (S·5) | Catch-all load failure | 🟡 | Honest per-screen error+retry is pervasive (`order/[id].tsx:365-371`); no single unified catch-all component |

## Rider journey — state-by-state

**Summary: ✅ 40 · 🟡 4 · ❌ 2 of 46.**

| Node (ID) | State | Status | Evidence (file:line) |
|---|---|---|---|
| splash (0·1) | Brand boot moment | ✅ | `app/index.tsx:22-32` accent-green dove splash |
| onboard (0·2) | Onboarding carousel | ✅ | `app/onboarding.tsx:11-97` slide 3 = "Earn as a rider" |
| login (0·3) | Phone sign-in | ✅ | `app/phone.tsx:28-48` "We'll WhatsApp a one-time code" |
| otp (0·4) | WhatsApp OTP | ✅ | `app/verify.tsx:104-181` verify + resend/lockout recovery |
| role_select (0·5) | Choose role | ✅ | `app/role.tsx:29-51` persists preference |
| perm_loc (0·6) | Location priming | ✅ | `app/permissions.tsx:81-92` |
| perm_notif (0·7) | Notification priming | ✅ | `app/permissions.tsx:94-104` |
| kyc_intro (1·1) | Become a rider (empty) | ✅ | `app/rider/index.tsx:354-363` "Set up as a rider" → `/rider/become` |
| kyc_form (1·2) | KYC form + consent | ✅ | `app/rider/become.tsx:99-145` name/ID/bike/photo + Didit consent |
| kyc_pending (1·3) | Verification pending | ✅ | `app/rider/index.tsx:398-408` "Continue verification" reopens Didit |
| kyc_verified (1·4) | Verified · go online | 🟡 | Verified drops straight to offline "Go online" card (`rider/index.tsx:465-497`); "You're verified" confirmation lives only on the become flow, not a dashboard win-state |
| kyc_failed (1·b1) | Verification failed | ✅ | `app/rider/index.tsx:364-397` reason + "Try again"; lock→support at 2 attempts |
| kyc_expired (1·b2) | ID expired (later) | ❌ | No `expired` KYC status exists (`packages/shared/src/enums.ts:126-131`); lapsed doc has no dedicated "Re-verify" state |
| rider_offline (2·1) | Rider offline | ✅ | `app/rider/index.tsx:465-497` offline chip + Go online |
| online_empty (2·2) | Online · no orders | ✅ | `app/rider/index.tsx:561-567` "No open orders near you… busiest 7–9am & 5–7pm" |
| board (2·3) | Order board | ✅ | `app/rider/index.tsx:545-556` live list; route/items/km/asking price |
| missed_order (2·b1) | Order taken first | ❌ | `src/realtime/use-rider-board.ts:89-99` silently filters a taken order out; no muted "that order was taken" notice for an un-bid order |
| offer_compose (3·1) | Make an offer | ✅ | `app/rider/index.tsx:571-644` segmented Accept/Counter + fare + ETA |
| offer_sent (3·2) | Offer sent · waiting | ✅ | `app/rider/index.tsx:499-543` "Your offers" + live countdown |
| picked (3·3) | Customer picked you | ✅ | `app/rider/index.tsx:319-329` "A customer picked you!" + success haptic |
| not_chosen (3·b1) | Not chosen | ✅ | `app/rider/index.tsx:516-524` `takenOrderIds` → "Not this time… still first in line" |
| bid_expired (3·b2) | Auction expired · no pick | ✅ | `app/rider/index.tsx:525-532` `expiredOrderIds` → "That window closed" |
| job_assigned (4·1) | Job · assigned | ✅ | `app/rider/job.tsx:322-334` + `JobDetailsCard.tsx:22-101` items/note/contacts |
| job_pickup (4·2) | En route to pickup | ✅ | `src/logic/rider-job.ts:8-13` + `JobDetailsCard.tsx:82-99` LiveMap + Maps deep-link |
| job_verify (4·3) | Verify items at pickup | ✅ | `src/ui/rider/PickupChecklist.tsx:24-84` |
| job_collect (4·4) | Parcel collected | ✅ | `src/logic/rider-job.ts:12` picked_up → "Head to drop-off" |
| job_dropoff (4·5) | En route to drop-off | ✅ | `app/rider/job.tsx:384-390` advance + OTP entry at en_route_dropoff |
| job_handoff (4·6) | Delivery-OTP hand-off | ✅ | `src/ui/rider/DeliveryOtp.tsx:24-46` 6-digit → confirmDelivery |
| job_delivered (4·7) | Delivered + rate sender | ✅ | `app/rider/job.tsx:403-438` Celebrate + optional recorded-only rate-the-sender |
| job_bail (4·b3) | Rider cancels (pre-pickup) | 🟡 | Gated pre-pickup (`app/rider/job.tsx:445-447`), but fires `cancelOrder` with no reason input, no confirm sheet, no reliability-score warning (mockup has all three) |
| job_offline (4·b4) | Connection lost mid-job | ✅ | `app/rider/job.tsx:333-353` `jobReconnecting` banner + "Live paused" |
| undelivered (4·b2) | Not delivered (terminal) | ✅ | `markUndelivered` (`src/api/orders.ts:135-137`) + `UndeliveredSheet.tsx` reason picker + `terminals.tsx:65-86` — **prior P0 now built** |
| handoff_wrong (4·b1) | Wrong code · lockout | 🟡 | Attempts-remaining + 5-try lock built (`DeliveryOtp.tsx:22-38`), but no "ask customer to re-send the code" action button — only static copy |
| job_cancelled (4·b5) | Customer cancelled | ✅ | `CancelledHandback` (`terminals.tsx:15-61`) frozen snapshot + call-sender; suppressed after ack — **prior P0 now built** |
| earnings (5·1) | Earnings | ✅ | `app/earnings/index.tsx:47-84` total + trip list + commission disclaimer |
| earnings_new (5·2) | Earnings · new rider | ✅ | `app/earnings/index.tsx:34-46` $0.00 hero + "your first fare starts here" |
| profile (A·1) | Account | ✅ | `app/profile/index.tsx:32-84` identity, rating, KYC badge, nav |
| bike_docs (A·2) | Bike & documents | ✅ | `app/rider/documents.tsx:35-62` masked ID + bike reg + photo, verified pills |
| history (A·3) | Trip history | ✅ | `app/history/index.tsx:69-137` |
| settings (A·4) | Settings | ✅ | `app/settings/index.tsx:43-78` bike/docs, notifications, language, cash, version |
| help (A·5) | Help & support | ✅ | `app/help/index.tsx:20-58` rider-framed topics + WhatsApp |
| offline (S·1) | Offline banner | ✅ | `app/rider/index.tsx:306-308` reconnecting banner over the board |
| on_hold (S·2) | Account on hold | ✅ | `app/rider/index.tsx:422-462` + `src/logic/gates.ts:78-82` (retry + support call) |
| force_update (S·3) | Force update | ✅ | `app/force-update.tsx:13-53` brand-green hard gate |
| no_gps (S·4) | Location off / no GPS | ✅ | `app/rider/index.tsx:409-419` `locDenied` → "Open location settings" |
| generic_error (S·5) | Generic error | 🟡 | Honest per-surface error+retry (`rider/index.tsx:342-352`, `job.tsx:300-307`); no unified catch-all component |

---

## Genuinely remaining gaps (current)

### Customer
- **P1 — "No riders online" supply state missing (2·b1).** In a zero-supply corridor the customer sees the calm "finding riders…" state for the full 90s then a generic `expired` dead-end that advises nudging the price — misleading when the real cause is no supply. No "no riders online right now / Notify me" path exists (`app/order/[id].tsx:583-682`).
- **P1 — Rider-cancelled hand-off has no explanatory screen (3·b0).** The re-broadcast works, but the customer is silently swapped to a fresh "finding" auction with only a transient toast (`app/order/[id].tsx:133-140`); the designed reassurance card ("Tendai had to cancel — same price, no need to start over") never renders.
- **P2 — Customer account-on-hold unhandled (S·2).** Only riders get a blocking on-hold state (`app/rider/index.tsx:446-451`). Confirm the API can even hold a customer before prioritizing.
- **P2 — No customer no-GPS guidance screen (S·4).** Non-blocking (customer can always pin/search manually), but there's no explicit "Open location settings" affordance.

### Rider
- **P1 — Rider bail screen is bare (4·b3).** Pre-pickup cancel works but omits the mockup's reason field, confirm sheet, and reliability-score warning (`app/rider/job.tsx:445-447`). The warning is a stated product promise, so its absence is a real gap.
- **P2 — KYC-expiry state absent (1·b2).** No `expired` status (`packages/shared/src/enums.ts:126-131`) and no "Your ID has expired · Re-verify" UI; a lapsed verified rider has no dedicated recovery screen.
- **P2 — Wrong-code "re-send" action missing (4·b1).** Lockout logic is correct but there's no button to ping the customer to re-issue the code — only instructional copy (`src/ui/rider/DeliveryOtp.tsx:30-33`).
- **P3 — "Order taken first" is a silent removal (2·b1).** An un-bid order the rider was eyeing just disappears; no muted "taken by another rider" notice (`src/realtime/use-rider-board.ts:89-99`).

### Shared / design polish
- **Map-first vs form-first home (1·1)** is now closed on the customer side — `home.tsx` renders a full-bleed `ComposeMap` with address rows, matching the ride-hailing paradigm.
- **Generic catch-all error (S·5)** — both roles cover failures with honest per-surface error+retry rather than the single designed "your active job is safe" catch-all component. Functionally covered; not a unified component.

---

## Where the code is AHEAD of the mockups

The mockups' own ⚑ GAP flags call some of these out as undesigned — the code shipped them anyway:

- **SOS on live trips** — `src/ui/safety.tsx` (both roles, GPS attach); flagged a P1 gap in the rider map.
- **Report / block counterparty** after a trip (both roles) and **order-scoped "Get help with this trip"** with structured issue types → ops queue — richer than the designed WhatsApp-only help.
- **Rating with a 4-second undo window** + screen-reader announcements — beyond the mockup's static stars.
- **KYC decline reasons, retry with a fresh Didit session, 2-attempt lockout → support** — richer than the mockup's single "Try again".
- **Extra online-gate states** (`suspended` / `banned` / `on_hold` / `cooldown` / `out_of_area`, each with distinct copy in `src/logic/gates.ts`) — the mockup only designed "on hold".
- **OTP resend + expiry/lockout recovery** (`verify.tsx:42-176`), **draft persistence** with "Draft restored" chip, **recent-recipient quick-fill**, **prefilled reorder / "Send again"**, **live ETA seeding from real distance**, **offline cold-start** last-known order/job paint, **Google Maps turn-by-turn deep link**, and **auction accessibility** (bid announcements, threshold countdowns, reduce-motion) — none of this is in the mockups.

---

## History — what changed since the 2026-07-05 baseline

The original review (2026-07-05) found the core loop faithful but the shell "largely not built," with three P0 journey-integrity breaks. Between then and this re-audit the code was brought into line with the designs (the designs are the source of truth). Shipped:

- **P0 resolved** — rider undeliverable flow (client `markUndelivered` + reason picker; post-pickup cancel hidden via the shared `RIDER_CANCELLABLE` set); `order:taken` / `bid:expired` WS events → rider "not chosen" + "window closed" states + board card removal; cancel-anytime with reason + reason/who-cancelled on the terminal; post-pickup customer-cancel hand-back (frozen snapshot + ack).
- **Shell built** — onboarding carousel, customer registration (0·6), permission priming (0·7/0·8), notifications centre, settings, help hub (WhatsApp), bike & documents, force-update gate, no-GPS gate (rider), green splash, earnings zero-state hero, map-anchored home, WhatsApp OTP copy, sender's note field, one-tap Accept segment.

Rate-the-sender (4·7) — noted as deferred in the baseline — is now built as a recorded-only rating (`app/rider/job.tsx:403-438`). The remaining gaps are the edge/branch states listed above.

---

*Every finding above was verified against the actual source (file:line references inline). The mockups' own ⚑ GAP flags (saved-places manager, scheduled delivery, multi-order, edit-in-flight, proof of delivery, tips, heat-map, shifts, multi-job queue, reliability dashboard, mobile-money) were treated as intentionally out of scope and are not counted as misalignments.*
