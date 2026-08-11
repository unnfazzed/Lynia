# Mock-adoption classification — UI structure is NOT backend-gated

**Session 2026-08-11 · recalibration pass (read-only on app code — this classifies, it does not adopt).**

## Why this doc exists (owner correction)

A previous pass over-deferred whole screens as `BACKEND_GATED` because the mock *drew* a value the API
doesn't send (a rating, an ETA, a fee) or because a route only renders behind a seeded backend in the
**offline screenshot harness**. That was wrong. **UI structure implementation is not backend-gated:**
the structural-snapshot guardrail verifies the element **tree**, not data values, so the mock's
*structure* can be adopted for essentially every screen regardless of the API. Where the app lacks a
value, the element renders its **honest empty state** (the app already does this — we never fabricate).

This doc re-classifies every allowlisted screen by the real question — **"what does it take to adopt the
STRUCTURE now?"** — not "is every value backed?".

## Categories

- **ADOPTABLE-NOW** — structure adopts cleanly now (wire the existing data, honest-empty the rest).
- **PRIMITIVE-GAP** — structure needs a specific missing DS primitive/slot; the screen becomes
  ADOPTABLE-NOW once it exists. (Named in the Foundation-D list below.)
- **CONTROL-DEVIATION** — structure adopts, but the mock draws one genuinely-dead control that can't
  function without backend. The screen is still adoptable now; the control gets an honest-disabled render
  or a one-line `docs/DESIGN-DEVIATIONS.md` entry. The whole screen is NOT deferred for it.
- **SUPERSET** — the app has sanctioned extra structure beyond the base mock (live/compliance/safety);
  composite-adopt against the extra mock if one exists, else a ledger deviation.
- **TRUE-BACKEND-GATED** — reserved for the few screens whose STRUCTURE genuinely cannot render honestly
  without backend: they exist solely to reflect a live server-driven state with **no honest empty form**.

## Summary counts (228 allowlisted screens)

| Category | Count |
|---|---|
| **ADOPTABLE-NOW** | **221** |
| PRIMITIVE-GAP (allowlisted screens) | 0 |
| CONTROL-DEVIATION | 2 |
| SUPERSET | 2 |
| **TRUE-BACKEND-GATED** | **3** |
| **Total** | **228** |

**Movement out of `BACKEND_GATED`:** the prior allowlist marked **50** screens `BACKEND_GATED` (3 RC
payment states + 47 RM merchant-tablet screens). This pass keeps only the **3** genuinely live-only RC
payment states gated and moves the **47 RM screens back to `PENDING` / ADOPTABLE-NOW** — their structure
is already built to the mock via direct-DOM (see `docs/parity/PHASE6-merchant.md`); only the offline
*screenshot* harness needs a seeded `PARITY_MERCHANT_URL`, which is a verification-lane concern, not a
structure gate. **47 screens moved from backend-gated back to adoptable.**

> **Note on PRIMITIVE-GAP = 0 in the allowlist.** The four missing DS primitives below are real, but each
> one blocks the **deferred DATA state of an already-WIRED food screen** (`RC.cart` / `RC.menu` /
> `RC.checkout_*`, tracked in `tools/parity/codegen/adopted.mjs` `deferred[]`), not a raw `PENDING`
> allowlist key. So no allowlisted PENDING screen is primitive-blocked — but the Foundation-D build is
> still the gate for the food-cluster data states, so it is listed here as the sweep's primitive backlog.

## Foundation-D — the distinct missing DS primitives (build list)

Harvested from `adopted.mjs` `deferred[]` reasons + the Phase-4 food-cluster notes. Building these
unblocks the food-cluster **data** states (cart/menu/checkout), which are the main remaining structural
work behind the already-wired food screens.

| Primitive / slot | What it is | Unblocks (deferred data states) |
|---|---|---|
| `EtaLine` | the delivery ETA/distance line ("Arrives 30–40 min · 10:11–10:21", "3.1 km away") | `RC.cart`, `RC.checkout_cash`, `RC.checkout_wallet`, `RC.menu` |
| `Screen.footer` slot | a pinned bottom action bar the DS `Screen` does not yet expose (cart "View cart" bar, checkout pay bar, menu cart bar) | `RC.cart`, `RC.checkout_cash`, `RC.checkout_wallet`, `RC.menu` |
| `ShopLogo` | the round shop-logo primitive overhanging the menu cover (currently built inline; codegen wants a DS primitive for congruence) | `RC.menu` |
| `FoodThumb` | the food/upsell thumbnail card (the "Add a drink?" upsell rail; menu-row thumbs) | `RC.cart`, `RC.menu` |

> A `Screen.banner` slot already landed (Foundation-C) and unblocked the error states app-wide
> (`RC.list_error` adopted). The above are what remains.

## Distinct control / structural deviations (honest-disable or ledger, per screen — NOT whole-screen defers)

| Deviation | Element | Where | Disposition |
|---|---|---|---|
| Un-backed sort pills | "Nearest / Under $2 fee / Top rated" pills | `RC.list` data state (wired) | no rating/fee/distance data → honest-disable or ledger; the "Open now" pill IS wireable |
| Notify-when-open dead action | "Notify me when they open" button | `RC.list_empty` (allowlisted) | no notify-when-open backend → honest-disable or ledger |
| In-menu search button | cover-top-right search button | `RC.menu` data state (wired) | no in-menu search → omit (dead control) or ledger |
| Static rating footer vs live rating | "Submit rating" footer button | `LJ.delivered_rate` (allowlisted) | app ships tap-to-arm + 4s undo (BH-06) — honest-keep the app model or ledger |
| Live-tracking shape | map-background + floating bottom sheet vs `LiveTrackingCard` (card-in-scroll) | tracking cluster (`RC.track_*`, `LJ.track_*`, `RC.handoff*`; wired `RC.track_way`/`LJ.track_active`) | systemic; load-bearing GPS-memo isolation + honest map stub. Ledger candidate (the card shape already shipped on the wired tracker) |
| Live dispatch countdown vs no-countdown still | offer countdown timer | `RJM.offer_parcel` (allowlisted SUPERSET) | app's live countdown is the honest realization of the RJM still — keep or ledger |

## Distinct supersets (sanctioned extra structure — composite-adopt or ledger)

| Superset | What's extra | Where |
|---|---|---|
| Inline address-search | address-search folded into the send compose sheet (live) vs a standalone mock screen | `LJ.addr_search` |
| Offline/reconnect + stale-cache + skeleton interleave | live sub-states the static `RC.orders` composite never drew | `RC.orders` data state (wired) |
| Real OS-permission rows / privacy / delete / phone-mask | compliance surface — now has its own `SH·` mocks (C8·7–12) | `LJ.settings_perms*`, `LJ.privacy`, `LJ.delete_*`, `LJ.phone_masked` (composite-adopt, ADOPTABLE-NOW) |
| Notifications virtualization | `FlatList` ≡ mock's `.map` (bucket-C equivalence, guardrail-handled) | `LJ.notifications`, `RJM.notifications` |
| Wallet cash-held strip / signed ledger | honest financial extras with no mock field | rider money (wired `RJM.money`) |
| SOS safety block on trackers | kept for safety; now has its own SOS mocks | `LJ.sos_*`, `RJ.sos_*` (ADOPTABLE-NOW) |

## TRUE-BACKEND-GATED — the only screens kept gated (3)

| Key | Screen | Why it has no honest empty form |
|---|---|---|
| `RC.pay_push` | Push · payment requested | exists solely to reflect a live payment request on the order |
| `RC.pay_wait` | Prompt sent | the "prompt sent" beat is driven entirely by the live payment request |
| `RC.pay_confirmed` | Waiting to be confirmed | only exists while a live payment request is in flight |

> `RC.track_secured` was previously gated and is now `PENDING`/ADOPTABLE-NOW — issue #671 put the rider's
> identity on the food-order read, so the tracker renders it from live data with an honest fallback.

---

## Per-screen classification

Every allowlisted key (`PENDING` + the 3 kept-gated), grouped by surface. Wired screens
(`tools/parity/app-targets.mjs`) are already adopted and are not re-listed here.

### LJ — customer send / parcel / account / safety (58)

| Key | Screen | Category | Reason | Primitive / element |
|---|---|---|---|---|
| `LJ.splash` | Splash | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `LJ.onboard_send` | Onboarding · send | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `LJ.onboard_shared` | Onboarding · one app | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `LJ.perm_notif` | Permission · notifications | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `LJ.onboard_flag_off` | Onboarding · food off | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `LJ.role_select_flag_off` | Choose your role · food off | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `LJ.home_flag_off` | Home · Food tile soon | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `LJ.order_restore` | Cold start · order running | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `LJ.stale_cache` | Orders · saved copy | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `LJ.addr_search` | Address search | SUPERSET | the app folds address-search INTO the send compose sheet (live inline AddressSearch) where the mock draws it as a standalone screen — live-vs-static; composite/ledger | inline AddressSearch in compose sheet |
| `LJ.addr_map_confirm` | Confirm pin on map | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `LJ.home_expanded` | Send · sheet expanded | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `LJ.disclaimer` | Broadcast disclaimer | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `LJ.draft_restored` | Draft restored | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `LJ.addr_unavailable` | Address search down | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `LJ.map_failed` | Map didn't load | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `LJ.loc_off` | Location off · composer | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `LJ.auction_finding` | Auction · finding | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `LJ.auction_live` | Auction · offers live | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `LJ.auction_counter` | Counter-offer review | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `LJ.delivered_rate` | Delivered · rate the rider | CONTROL-DEVIATION | structure adopts, but the mock's static 'Submit rating' footer button clashes with the app's shipped tap-to-arm + 4s-undo rating (BH-06); honest-keep the app model or ledger it | 'Submit rating' footer button |
| `LJ.completed` | Completed | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `LJ.rate_undo` | Rating sent · undo | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `LJ.notif_empty` | Notifications · empty | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `LJ.settings_perms` | Settings · real permissions | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `LJ.settings_perms_ok` | Settings · all granted | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `LJ.privacy` | Privacy | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `LJ.delete_account` | Delete account | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `LJ.delete_final` | Delete · final confirm | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `LJ.phone_masked` | Order ended · numbers masked | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `LJ.sos_idle` | SOS · live-trip control | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `LJ.sos_confirm` | SOS · confirm | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `LJ.sos_contacts` | SOS · contacts | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `LJ.sos_error` | SOS · log failed (offline) | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `LJ.report` | Report + block rider | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `LJ.report_done` | Report sent | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `LJ.trip_help` | Get help with this order | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `LJ.trip_help_sent` | Issue logged | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `LJ.no_riders` | No riders online | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `LJ.select_race` | Rider just taken | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `LJ.auction_expired` | Auction expired | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `LJ.rider_cancelled` | Rider cancelled | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `LJ.track_paused` | Live paused | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `LJ.cancel` | Cancel · reason | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `LJ.cancelled` | Cancelled | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `LJ.undelivered` | Not delivered | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `LJ.track_dark` | Rider went dark | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `LJ.otp_cooldown` | OTP · resend cooldown | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `LJ.otp_resent` | OTP · code re-sent | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `LJ.otp_locked` | OTP · expired / locked | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `LJ.offline` | Offline banner | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `LJ.on_hold` | Account on hold | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `LJ.no_gps` | Location off / no GPS | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `LJ.generic_error` | Generic error | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `LJ.conn_reconnecting` | Reconnecting banner | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `LJ.stale_cache_empty` | Offline · nothing saved | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `LJ.order_restore_error` | Restore failed | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `LJ.draft_discard` | Discard draft · confirm | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |

### RC — customer food (37)

| Key | Screen | Category | Reason | Primitive / element |
|---|---|---|---|---|
| `RC.orders_empty` | Orders · empty | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RC.list_loading` | List loading | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RC.item` | Item sheet | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RC.cart_note` | Note for the kitchen | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RC.placing` | Placing | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RC.await_accept` | Waiting on the kitchen | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RC.confirm_call` | They call to confirm | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RC.pay_push` | Push · payment requested | TRUE-BACKEND-GATED | live payment-prompt send state — no honest empty form; exists solely to reflect a live payment request on the order | — |
| `RC.pay_wait` | Prompt sent | TRUE-BACKEND-GATED | live payment-prompt 'prompt sent' state — driven entirely by a live payment request; no honest empty form | — |
| `RC.pay_manual` | Paid another way | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RC.pay_confirmed` | Waiting to be confirmed | TRUE-BACKEND-GATED | live 'waiting to be confirmed' payment state — only exists while a live payment request is in flight | — |
| `RC.track_prep` | Prep countdown | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RC.track_secured` | Rider secured | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RC.handoff` | Pay at the door | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RC.handoff_wait` | Waiting for rider confirm | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RC.handoff_code` | Both confirmed · code | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RC.list_empty` | Nothing open | CONTROL-DEVIATION | structure adopts, but the mock draws a 'Notify me when they open' primary with no notify-when-open backend + a live 'area · time' AppBar sub | 'Notify me when they open' button |
| `RC.list_error` | Offline list | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RC.menu_closed` | Closed restaurant | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RC.closed_interrupt` | Closes while browsing | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RC.cart_oos` | Item sold out | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RC.cart_price` | Price changed | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RC.cart_empty` | Empty cart | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RC.cart_min` | Under the minimum | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RC.checkout_offline` | Offline mid-checkout | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RC.pay_open` | Still unpaid · reminder | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RC.pay_failed` | Payment declined | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RC.item_removed` | One item unavailable | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RC.no_rider` | NO_RIDER | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RC.track_paused` | Live paused | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RC.rejected` | Rejected · refund pending | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RC.refunded` | Refunded | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RC.cancel_sheet` | Cancel pre-pickup | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RC.rider_cancelled` | Rider cancelled · re-finding | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RC.handoff_dispute` | Rider didn't confirm | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RC.failed_noshow` | No-show · returned | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RC.resume` | App resumed mid-order | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |

### RJ — rider onboarding / KYC / jobs / wallet (55)

| Key | Screen | Category | Reason | Primitive / element |
|---|---|---|---|---|
| `RJ.splash` | Splash | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RJ.onboard` | Onboarding · rider | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RJ.login` | Phone sign-in | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RJ.otp` | SMS OTP | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RJ.role_select` | Choose your role | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RJ.perm_loc` | Permission · location | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RJ.perm_notif` | Permission · notifications | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RJ.kyc_form` | KYC form + consent | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RJ.photo_capture` | ID photo · capture | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RJ.photo_preview` | ID photo · preview | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RJ.photo_uploading` | ID photo · uploading | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RJ.kyc_pending` | Verification pending | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RJ.kyc_verified` | Verified | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RJ.offer_sent` | Offer sent · waiting | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RJ.picked` | Customer picked you | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RJ.job_pickup` | En route to pickup | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RJ.job_verify` | Verify items at pickup | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RJ.job_collect` | Parcel collected | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RJ.job_dropoff` | En route to drop-off | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RJ.job_handoff` | Hand-off · parcel | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RJ.job_delivered` | Delivered | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RJ.topup_wait` | Payment prompt · wait | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RJ.topup_success` | Top up · success | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RJ.wallet_low` | Balance low | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RJ.history` | Job history | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RJ.settings` | Settings | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RJ.help` | Help & support | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RJ.sos_idle` | SOS · live-job control | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RJ.sos_confirm` | SOS · confirm | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RJ.sos_contacts` | SOS · contacts | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RJ.report` | Report + block customer | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RJ.report_done` | Report sent | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RJ.job_help` | Get help with this job | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RJ.job_help_sent` | Issue logged | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RJ.missed_order` | Job taken first | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RJ.not_chosen` | Not chosen | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RJ.bid_expired` | Auction expired · no pick | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RJ.handoff_wrong` | Wrong code · lockout | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RJ.undelivered` | Not delivered | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RJ.job_bail` | Rider cancels (bail) | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RJ.job_offline` | Connection lost mid-job | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RJ.job_cancelled` | Customer cancelled | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RJ.kyc_failed` | Verification failed | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RJ.kyc_expired` | ID expired (later) | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RJ.photo_failed` | ID photo · upload failed | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RJ.gate_out_of_area` | Gate · out of area | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RJ.gate_cooldown` | Gate · cooldown | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RJ.gate_banned` | Gate · account closed | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RJ.gate_kyc_locked` | Gate · verification locked | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RJ.topup_declined` | Top up · declined | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RJ.offline` | Offline banner | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RJ.on_hold` | Account on hold | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RJ.force_update` | Force update | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RJ.no_gps` | Location off / no GPS | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RJ.generic_error` | Generic error | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |

### RJM — rider unified (Jobs·Money·Account) (13)

| Key | Screen | Category | Reason | Primitive / element |
|---|---|---|---|---|
| `RJM.offline` | Offline | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RJM.notifications` | One inbox | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RJM.board_food_off` | Jobs · food dispatch off | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RJM.board_empty_food_off` | Food off · nothing in range | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RJM.offer_parcel` | Parcel · name your fare | SUPERSET | the app renders a live dispatch countdown timer where the RJM still draws a no-countdown offer; honest-keep the live countdown or ledger | offer countdown timer |
| `RJM.active_parcel` | Active · parcel | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RJM.handoff` | Delivery code | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RJM.pickup_photo` | Proof of pickup · capture | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RJM.pickup_photo_preview` | Proof of pickup · preview | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RJM.gate_topup` | Gate · top up to keep riding | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RJM.strikes` | Reliability · strikes | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RJM.pickup_photo_failed` | Proof photo · upload failed | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RJM.strikes_final` | One strike from a pause | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |

### RR — rider food-run (18)

| Key | Screen | Category | Reason | Primitive / element |
|---|---|---|---|---|
| `RR.offer_upfront` | Food · kitchen wants upfront | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RR.offer_wallet` | Food · already paid | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RR.pay_merchant` | Pay the merchant | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RR.pickup_confirm` | Collect · CASH job | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RR.pickup_paid` | Collect · already PAID | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RR.nav_cust` | To the customer | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RR.doorstep` | Collect · confirm cash | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RR.delivered` | Delivered · food | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RR.return_cash` | Return the kitchen's cash | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RR.offer_expired` | Offer expired | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RR.cancel_reason` | Drop the job · before pickup | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RR.cancel_blocked` | Can't drop after collecting | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RR.cash_dispute` | Customer confirmed, you didn't | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RR.code_wrong` | Wrong code | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RR.unreachable` | Customer unreachable | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RR.return_rest` | Return to restaurant | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RR.handback` | Hand back confirm | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |
| `RR.offline_resume` | Resumed mid-delivery | ADOPTABLE-NOW | static/state structure with fixed mock copy; adopts now, honest-empty where the API lacks a value | — |

### RM — merchant tablet (web) (47)

| Key | Screen | Category | Reason | Primitive / element |
|---|---|---|---|---|
| `RM.setup` | First login · setup | ADOPTABLE-NOW | ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (Phase 6); adopts now with honest-empty data. Screenshot verification awaits a seeded PARITY_MERCHANT_URL — a verification-lane limit, not a structure gate | — |
| `RM.reboot` | Tablet rebooted mid-shift | ADOPTABLE-NOW | ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (Phase 6); adopts now with honest-empty data. Screenshot verification awaits a seeded PARITY_MERCHANT_URL — a verification-lane limit, not a structure gate | — |
| `RM.queue_empty` | Open · no orders | ADOPTABLE-NOW | ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (Phase 6); adopts now with honest-empty data. Screenshot verification awaits a seeded PARITY_MERCHANT_URL — a verification-lane limit, not a structure gate | — |
| `RM.queue_loading` | Loading | ADOPTABLE-NOW | ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (Phase 6); adopts now with honest-empty data. Screenshot verification awaits a seeded PARITY_MERCHANT_URL — a verification-lane limit, not a structure gate | — |
| `RM.queue_new` | NEW ORDER · alarm | ADOPTABLE-NOW | ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (Phase 6); adopts now with honest-empty data. Screenshot verification awaits a seeded PARITY_MERCHANT_URL — a verification-lane limit, not a structure gate | — |
| `RM.queue_board` | Kitchen board · 3 live | ADOPTABLE-NOW | ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (Phase 6); adopts now with honest-empty data. Screenshot verification awaits a seeded PARITY_MERCHANT_URL — a verification-lane limit, not a structure gate | — |
| `RM.two_orders` | Two orders at once | ADOPTABLE-NOW | ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (Phase 6); adopts now with honest-empty data. Screenshot verification awaits a seeded PARITY_MERCHANT_URL — a verification-lane limit, not a structure gate | — |
| `RM.offline` | Connection lost | ADOPTABLE-NOW | ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (Phase 6); adopts now with honest-empty data. Screenshot verification awaits a seeded PARITY_MERCHANT_URL — a verification-lane limit, not a structure gate | — |
| `RM.offline_order` | Order arrived offline | ADOPTABLE-NOW | ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (Phase 6); adopts now with honest-empty data. Screenshot verification awaits a seeded PARITY_MERCHANT_URL — a verification-lane limit, not a structure gate | — |
| `RM.order_accept` | Accept + prep time | ADOPTABLE-NOW | ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (Phase 6); adopts now with honest-empty data. Screenshot verification awaits a seeded PARITY_MERCHANT_URL — a verification-lane limit, not a structure gate | — |
| `RM.call_confirm` | Call, then request payment | ADOPTABLE-NOW | ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (Phase 6); adopts now with honest-empty data. Screenshot verification awaits a seeded PARITY_MERCHANT_URL — a verification-lane limit, not a structure gate | — |
| `RM.awaiting_payment` | Awaiting payment · no clock | ADOPTABLE-NOW | ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (Phase 6); adopts now with honest-empty data. Screenshot verification awaits a seeded PARITY_MERCHANT_URL — a verification-lane limit, not a structure gate | — |
| `RM.reject_sheet` | Reject · reason | ADOPTABLE-NOW | ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (Phase 6); adopts now with honest-empty data. Screenshot verification awaits a seeded PARITY_MERCHANT_URL — a verification-lane limit, not a structure gate | — |
| `RM.waiting_rider` | Accepted · do not cook yet | ADOPTABLE-NOW | ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (Phase 6); adopts now with honest-empty data. Screenshot verification awaits a seeded PARITY_MERCHANT_URL — a verification-lane limit, not a structure gate | — |
| `RM.cook_now` | Rider secured · cook now | ADOPTABLE-NOW | ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (Phase 6); adopts now with honest-empty data. Screenshot verification awaits a seeded PARITY_MERCHANT_URL — a verification-lane limit, not a structure gate | — |
| `RM.mark_ready` | Mark ready | ADOPTABLE-NOW | ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (Phase 6); adopts now with honest-empty data. Screenshot verification awaits a seeded PARITY_MERCHANT_URL — a verification-lane limit, not a structure gate | — |
| `RM.no_rider_merchant` | NO_RIDER · never cooked | ADOPTABLE-NOW | ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (Phase 6); adopts now with honest-empty data. Screenshot verification awaits a seeded PARITY_MERCHANT_URL — a verification-lane limit, not a structure gate | — |
| `RM.rider_cancelled` | Rider cancelled · re-dispatch | ADOPTABLE-NOW | ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (Phase 6); adopts now with honest-empty data. Screenshot verification awaits a seeded PARITY_MERCHANT_URL — a verification-lane limit, not a structure gate | — |
| `RM.item_out` | Don't have an item | ADOPTABLE-NOW | ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (Phase 6); adopts now with honest-empty data. Screenshot verification awaits a seeded PARITY_MERCHANT_URL — a verification-lane limit, not a structure gate | — |
| `RM.item_out_wait` | New total · customer confirming | ADOPTABLE-NOW | ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (Phase 6); adopts now with honest-empty data. Screenshot verification awaits a seeded PARITY_MERCHANT_URL — a verification-lane limit, not a structure gate | — |
| `RM.pickup_cash` | Upfront · confirm cash | ADOPTABLE-NOW | ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (Phase 6); adopts now with honest-empty data. Screenshot verification awaits a seeded PARITY_MERCHANT_URL — a verification-lane limit, not a structure gate | — |
| `RM.pickup_collect` | Collect-and-return · release | ADOPTABLE-NOW | ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (Phase 6); adopts now with honest-empty data. Screenshot verification awaits a seeded PARITY_MERCHANT_URL — a verification-lane limit, not a structure gate | — |
| `RM.pickup_wallet` | WALLET · confirm before cooking | ADOPTABLE-NOW | ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (Phase 6); adopts now with honest-empty data. Screenshot verification awaits a seeded PARITY_MERCHANT_URL — a verification-lane limit, not a structure gate | — |
| `RM.wallet_mismatch` | Short payment blocked | ADOPTABLE-NOW | ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (Phase 6); adopts now with honest-empty data. Screenshot verification awaits a seeded PARITY_MERCHANT_URL — a verification-lane limit, not a structure gate | — |
| `RM.pickup_done` | Handed over | ADOPTABLE-NOW | ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (Phase 6); adopts now with honest-empty data. Screenshot verification awaits a seeded PARITY_MERCHANT_URL — a verification-lane limit, not a structure gate | — |
| `RM.cash_return` | Count the returned cash | ADOPTABLE-NOW | ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (Phase 6); adopts now with honest-empty data. Screenshot verification awaits a seeded PARITY_MERCHANT_URL — a verification-lane limit, not a structure gate | — |
| `RM.rider_noshow` | Rider no-show | ADOPTABLE-NOW | ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (Phase 6); adopts now with honest-empty data. Screenshot verification awaits a seeded PARITY_MERCHANT_URL — a verification-lane limit, not a structure gate | — |
| `RM.refund_exec` | Refund after wallet paid | ADOPTABLE-NOW | ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (Phase 6); adopts now with honest-empty data. Screenshot verification awaits a seeded PARITY_MERCHANT_URL — a verification-lane limit, not a structure gate | — |
| `RM.pickup_reveal` | Pickup code · hidden | ADOPTABLE-NOW | ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (Phase 6); adopts now with honest-empty data. Screenshot verification awaits a seeded PARITY_MERCHANT_URL — a verification-lane limit, not a structure gate | — |
| `RM.pickup_revealed` | Pickup code · revealed | ADOPTABLE-NOW | ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (Phase 6); adopts now with honest-empty data. Screenshot verification awaits a seeded PARITY_MERCHANT_URL — a verification-lane limit, not a structure gate | — |
| `RM.catalog` | Menu · grouped by category | ADOPTABLE-NOW | ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (Phase 6); adopts now with honest-empty data. Screenshot verification awaits a seeded PARITY_MERCHANT_URL — a verification-lane limit, not a structure gate | — |
| `RM.category_manage` | Categories · reorder & hide | ADOPTABLE-NOW | ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (Phase 6); adopts now with honest-empty data. Screenshot verification awaits a seeded PARITY_MERCHANT_URL — a verification-lane limit, not a structure gate | — |
| `RM.category_edit` | New category | ADOPTABLE-NOW | ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (Phase 6); adopts now with honest-empty data. Screenshot verification awaits a seeded PARITY_MERCHANT_URL — a verification-lane limit, not a structure gate | — |
| `RM.category_rename` | Edit / delete category | ADOPTABLE-NOW | ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (Phase 6); adopts now with honest-empty data. Screenshot verification awaits a seeded PARITY_MERCHANT_URL — a verification-lane limit, not a structure gate | — |
| `RM.catalog_empty` | No categories yet | ADOPTABLE-NOW | ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (Phase 6); adopts now with honest-empty data. Screenshot verification awaits a seeded PARITY_MERCHANT_URL — a verification-lane limit, not a structure gate | — |
| `RM.item_edit` | Edit dish · photo required | ADOPTABLE-NOW | ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (Phase 6); adopts now with honest-empty data. Screenshot verification awaits a seeded PARITY_MERCHANT_URL — a verification-lane limit, not a structure gate | — |
| `RM.dish_photo` | Dish photo · crop | ADOPTABLE-NOW | ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (Phase 6); adopts now with honest-empty data. Screenshot verification awaits a seeded PARITY_MERCHANT_URL — a verification-lane limit, not a structure gate | — |
| `RM.dish_draft` | Draft · needs a photo | ADOPTABLE-NOW | ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (Phase 6); adopts now with honest-empty data. Screenshot verification awaits a seeded PARITY_MERCHANT_URL — a verification-lane limit, not a structure gate | — |
| `RM.oos_sheet` | Out of stock today | ADOPTABLE-NOW | ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (Phase 6); adopts now with honest-empty data. Screenshot verification awaits a seeded PARITY_MERCHANT_URL — a verification-lane limit, not a structure gate | — |
| `RM.hours` | Operating hours | ADOPTABLE-NOW | ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (Phase 6); adopts now with honest-empty data. Screenshot verification awaits a seeded PARITY_MERCHANT_URL — a verification-lane limit, not a structure gate | — |
| `RM.statement` | Weekly statement | ADOPTABLE-NOW | ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (Phase 6); adopts now with honest-empty data. Screenshot verification awaits a seeded PARITY_MERCHANT_URL — a verification-lane limit, not a structure gate | — |
| `RM.eod` | End of day | ADOPTABLE-NOW | ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (Phase 6); adopts now with honest-empty data. Screenshot verification awaits a seeded PARITY_MERCHANT_URL — a verification-lane limit, not a structure gate | — |
| `RM.shop` | Shop profile | ADOPTABLE-NOW | ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (Phase 6); adopts now with honest-empty data. Screenshot verification awaits a seeded PARITY_MERCHANT_URL — a verification-lane limit, not a structure gate | — |
| `RM.cash_rule` | Your cash rule | ADOPTABLE-NOW | ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (Phase 6); adopts now with honest-empty data. Screenshot verification awaits a seeded PARITY_MERCHANT_URL — a verification-lane limit, not a structure gate | — |
| `RM.shop_crop` | Position the banner | ADOPTABLE-NOW | ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (Phase 6); adopts now with honest-empty data. Screenshot verification awaits a seeded PARITY_MERCHANT_URL — a verification-lane limit, not a structure gate | — |
| `RM.shop_upload` | Uploading · compressing | ADOPTABLE-NOW | ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (Phase 6); adopts now with honest-empty data. Screenshot verification awaits a seeded PARITY_MERCHANT_URL — a verification-lane limit, not a structure gate | — |
| `RM.shop_upload_failed` | Upload paused · offline | ADOPTABLE-NOW | ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (Phase 6); adopts now with honest-empty data. Screenshot verification awaits a seeded PARITY_MERCHANT_URL — a verification-lane limit, not a structure gate | — |
