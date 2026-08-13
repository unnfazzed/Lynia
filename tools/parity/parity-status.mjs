/**
 * Parity allowlist — the honest disposition of every gallery screen that does NOT yet have an entry
 * in `app-targets.mjs`. Together, `app-targets.mjs` (wired) and this file (not-yet-wired) must cover
 * EVERY key in `screens.generated.json` — the screen-inventory guardrail
 * (`apps/api/src/parity/screen-inventory.spec.ts`) fails CI if any screen is silently uncovered, if a
 * target points at a retired/renamed screen, or if a key is listed here AND wired.
 *
 * This is the machine record that replaced per-screen human visual sign-off (owner decision,
 * 2026-08-11): a screen is "done" when it moves OUT of this file into `app-targets.mjs` and the
 * token/inventory/reverse-drift guardrails stay green — not when someone eyeballs it.
 *
 * Status values:
 *   PENDING        the mock is current and adopted as the source of truth, but no app target is wired
 *                  yet. It renders its MOCK in the parity harness; the app column is honestly "pending".
 *                  Moving it to `app-targets.mjs` is pure wiring — the screen renders from a static
 *                  fixture (mobile) with no backend.
 *   BACKEND_GATED  ⛔ RESERVED for screens whose STRUCTURE genuinely cannot render honestly without a
 *                  live backend — they exist solely to reflect a live server-driven state with NO honest
 *                  empty form. `reason` says why. This is NOT for screens the mock merely populates with
 *                  a value the API doesn't send (that renders an honest empty state) nor for a web route
 *                  the offline SCREENSHOT harness can't reach (that is a verification-lane limit, not a
 *                  structure gate) — those are `PENDING` / ADOPTABLE-NOW.
 *
 * RECALIBRATION (2026-08-11): UI structure is NOT backend-gated — the structural-snapshot guardrail
 * verifies the element TREE, not data values. This pass moved the 47 RM merchant-tablet screens back
 * from BACKEND_GATED to PENDING (their structure is built to the mock via direct-DOM; only the offline
 * screenshot needs a seeded instance) and keeps only the 3 genuinely live-only RC payment states gated.
 * Per-screen classification + the Foundation-D primitive backlog: docs/parity/ADOPTION-CLASSIFICATION.md.
 *
 * Never list a RETIRED screen here (retired ids live in packages/design/EXPORT-README.md); retired
 * screens are absent from screens.generated.json, so they can't appear in the coverage set at all.
 */
export const PARITY_STATUS = {
  // ── LJ ──────────────────────────────────────────────────────────
  "LJ.home_flag_off": { status: "PENDING" }, // Home · Food tile soon
  "LJ.order_restore": { status: "PENDING" }, // Cold start · order running
  "LJ.stale_cache": { status: "PENDING" }, // Orders · saved copy
  "LJ.addr_search": {
    status: "PENDING",
    reason: "SUPERSET — the app folds address-search INTO the send compose sheet (live inline AddressSearch) where the mock draws it as a standalone screen; composite-adopt or ledger. See docs/parity/ADOPTION-CLASSIFICATION.md",
  }, // Address search
  "LJ.addr_map_confirm": { status: "PENDING" }, // Confirm pin on map
  "LJ.home_expanded": { status: "PENDING" }, // Send · sheet expanded
  "LJ.disclaimer": { status: "PENDING" }, // Broadcast disclaimer
  "LJ.draft_restored": { status: "PENDING" }, // Draft restored
  "LJ.addr_unavailable": { status: "PENDING" }, // Address search down
  "LJ.map_failed": { status: "PENDING" }, // Map didn't load
  "LJ.loc_off": { status: "PENDING" }, // Location off · composer
  "LJ.auction_finding": { status: "PENDING" }, // Auction · finding
  "LJ.auction_live": { status: "PENDING" }, // Auction · offers live
  "LJ.auction_counter": { status: "PENDING" }, // Counter-offer review
  "LJ.delivered_rate": {
    status: "PENDING",
    reason: "CONTROL-DEVIATION — structure adopts; the mock's static 'Submit rating' footer button clashes with the app's shipped tap-to-arm + 4s-undo rating (BH-06). Honest-keep the app model or ledger the one control; not a whole-screen defer. See docs/parity/ADOPTION-CLASSIFICATION.md",
  }, // Delivered · rate the rider
  "LJ.completed": { status: "PENDING" }, // Completed
  "LJ.rate_undo": { status: "PENDING" }, // Rating sent · undo
  "LJ.phone_masked": { status: "PENDING" }, // Order ended · numbers masked
  "LJ.sos_idle": { status: "PENDING" }, // SOS · live-trip control
  "LJ.sos_confirm": { status: "PENDING" }, // SOS · confirm
  "LJ.sos_contacts": { status: "PENDING" }, // SOS · contacts
  "LJ.sos_error": { status: "PENDING" }, // SOS · log failed (offline)
  "LJ.report": { status: "PENDING" }, // Report + block rider
  "LJ.report_done": { status: "PENDING" }, // Report sent
  "LJ.trip_help": { status: "PENDING" }, // Get help with this order
  "LJ.trip_help_sent": { status: "PENDING" }, // Issue logged
  "LJ.no_riders": { status: "PENDING" }, // No riders online
  "LJ.select_race": { status: "PENDING" }, // Rider just taken
  "LJ.auction_expired": { status: "PENDING" }, // Auction expired
  "LJ.rider_cancelled": { status: "PENDING" }, // Rider cancelled
  "LJ.track_paused": { status: "PENDING" }, // Live paused
  "LJ.cancel": { status: "PENDING" }, // Cancel · reason
  "LJ.cancelled": { status: "PENDING" }, // Cancelled
  "LJ.undelivered": { status: "PENDING" }, // Not delivered
  "LJ.track_dark": { status: "PENDING" }, // Rider went dark
  "LJ.offline": { status: "PENDING" }, // Offline banner
  "LJ.on_hold": { status: "PENDING" }, // Account on hold
  "LJ.no_gps": { status: "PENDING" }, // Location off / no GPS
  "LJ.generic_error": { status: "PENDING" }, // Generic error
  "LJ.conn_reconnecting": { status: "PENDING" }, // Reconnecting banner
  "LJ.stale_cache_empty": { status: "PENDING" }, // Offline · nothing saved
  "LJ.order_restore_error": { status: "PENDING" }, // Restore failed
  "LJ.draft_discard": { status: "PENDING" }, // Discard draft · confirm

  // ── RC ──────────────────────────────────────────────────────────
  "RC.item": { status: "PENDING" }, // Item sheet
  "RC.cart_note": { status: "PENDING" }, // Note for the kitchen
  "RC.placing": { status: "PENDING" }, // Placing
  "RC.confirm_call": { status: "PENDING" }, // They call to confirm
  "RC.pay_push": { status: "PENDING" }, // Push · payment requested — #670 lifted the gate: the payment-prompt lifecycle is now a plain order field (MerchantOrderResponse.paymentPromptStatus), so a static fixture can stand up each state. Adopted; parity wiring pending.
  "RC.pay_wait": { status: "PENDING" }, // Prompt sent — #670: paymentPromptStatus="pending" renders this; renderable from a fixture now.
  "RC.pay_manual": { status: "PENDING" }, // Paid another way
  "RC.track_prep": { status: "PENDING" }, // Prep countdown — tracker region ADOPTED (Foundation-F.d: RTracker≡Stepper in FoodOrderPreparingView); ring/finding glue deferred. Parity target+fixture wiring pending.
  "RC.track_secured": { status: "PENDING" }, // Rider secured — #671 lifted the gate: the rider's identity (name·plate·vehicle·rating·KYC) is now a plain field on the food order read (MerchantOrderResponse.rider), so the tracker renders it from live data and a static fixture can stand it up. Adopted; parity target+fixture wiring pending.
  "RC.handoff": { status: "PENDING" }, // Pay at the door
  "RC.handoff_wait": { status: "PENDING" }, // Waiting for rider confirm
  "RC.handoff_code": { status: "PENDING" }, // Both confirmed · code
  "RC.list_empty": {
    status: "PENDING",
    reason: "CONTROL-DEVIATION — structure adopts; the mock draws a 'Notify me when they open' primary with no notify-when-open backend (a dead control) + a live 'area · time' AppBar sub. Honest-disable the one control or ledger; not a whole-screen defer. See docs/parity/ADOPTION-CLASSIFICATION.md",
  }, // Nothing open
  "RC.closed_interrupt": { status: "PENDING" }, // Closes while browsing
  "RC.cart_oos": { status: "PENDING" }, // Item sold out
  "RC.cart_price": { status: "PENDING" }, // Price changed
  "RC.cart_min": { status: "PENDING" }, // Under the minimum
  "RC.checkout_offline": { status: "PENDING" }, // Offline mid-checkout
  "RC.pay_open": { status: "PENDING" }, // Still unpaid · reminder
  "RC.pay_failed": { status: "PENDING" }, // Payment declined
  "RC.no_rider": { status: "PENDING" }, // NO_RIDER
  "RC.track_paused": { status: "PENDING" }, // Live paused
  "RC.cancel_sheet": { status: "PENDING" }, // Cancel pre-pickup
  "RC.rider_cancelled": { status: "PENDING" }, // Rider cancelled · re-finding
  "RC.handoff_dispute": { status: "PENDING" }, // Rider didn't confirm
  "RC.failed_noshow": { status: "PENDING" }, // No-show · returned
  "RC.resume": { status: "PENDING" }, // App resumed mid-order

  // ── RJ ──────────────────────────────────────────────────────────
  "RJ.splash": { status: "PENDING" }, // Splash
  "RJ.onboard": { status: "PENDING" }, // Onboarding · rider
  "RJ.login": { status: "PENDING" }, // Phone sign-in
  "RJ.otp": { status: "PENDING" }, // SMS OTP
  "RJ.role_select": { status: "PENDING" }, // Choose your role
  "RJ.perm_loc": { status: "PENDING" }, // Permission · location
  "RJ.perm_notif": { status: "PENDING" }, // Permission · notifications
  "RJ.kyc_form": { status: "PENDING" }, // KYC form + consent
  "RJ.photo_capture": { status: "PENDING" }, // ID photo · capture
  "RJ.photo_preview": { status: "PENDING" }, // ID photo · preview
  "RJ.photo_uploading": { status: "PENDING" }, // ID photo · uploading
  "RJ.kyc_pending": { status: "PENDING" }, // Verification pending
  "RJ.kyc_verified": { status: "PENDING" }, // Verified
  "RJ.offer_sent": { status: "PENDING" }, // Offer sent · waiting
  "RJ.picked": { status: "PENDING" }, // Customer picked you
  "RJ.job_pickup": { status: "PENDING" }, // En route to pickup
  "RJ.job_verify": { status: "PENDING" }, // Verify items at pickup
  "RJ.job_collect": { status: "PENDING" }, // Parcel collected
  "RJ.job_dropoff": { status: "PENDING" }, // En route to drop-off
  "RJ.job_handoff": { status: "PENDING" }, // Hand-off · parcel
  "RJ.job_delivered": { status: "PENDING" }, // Delivered
  "RJ.topup_wait": { status: "PENDING" }, // Payment prompt · wait
  "RJ.topup_success": { status: "PENDING" }, // Top up · success
  "RJ.wallet_low": { status: "PENDING" }, // Balance low
  "RJ.history": { status: "PENDING" }, // Job history
  "RJ.settings": { status: "PENDING" }, // Settings
  "RJ.help": { status: "PENDING" }, // Help & support
  "RJ.sos_idle": { status: "PENDING" }, // SOS · live-job control
  "RJ.sos_confirm": { status: "PENDING" }, // SOS · confirm
  "RJ.sos_contacts": { status: "PENDING" }, // SOS · contacts
  "RJ.report": { status: "PENDING" }, // Report + block customer
  "RJ.report_done": { status: "PENDING" }, // Report sent
  "RJ.job_help": { status: "PENDING" }, // Get help with this job
  "RJ.job_help_sent": { status: "PENDING" }, // Issue logged
  "RJ.missed_order": { status: "PENDING" }, // Job taken first
  "RJ.not_chosen": { status: "PENDING" }, // Not chosen
  "RJ.bid_expired": { status: "PENDING" }, // Auction expired · no pick
  "RJ.handoff_wrong": { status: "PENDING" }, // Wrong code · lockout
  "RJ.undelivered": { status: "PENDING" }, // Not delivered
  "RJ.job_bail": { status: "PENDING" }, // Rider cancels (bail)
  "RJ.job_offline": { status: "PENDING" }, // Connection lost mid-job
  "RJ.job_cancelled": { status: "PENDING" }, // Customer cancelled
  "RJ.kyc_failed": { status: "PENDING" }, // Verification failed
  "RJ.kyc_expired": { status: "PENDING" }, // ID expired (later)
  "RJ.photo_failed": { status: "PENDING" }, // ID photo · upload failed
  "RJ.gate_out_of_area": { status: "PENDING" }, // Gate · out of area
  "RJ.gate_cooldown": { status: "PENDING" }, // Gate · cooldown
  "RJ.gate_banned": { status: "PENDING" }, // Gate · account closed
  "RJ.gate_kyc_locked": { status: "PENDING" }, // Gate · verification locked
  "RJ.topup_declined": { status: "PENDING" }, // Top up · declined
  "RJ.offline": { status: "PENDING" }, // Offline banner
  "RJ.on_hold": { status: "PENDING" }, // Account on hold
  "RJ.force_update": { status: "PENDING" }, // Force update
  "RJ.no_gps": { status: "PENDING" }, // Location off / no GPS
  "RJ.generic_error": { status: "PENDING" }, // Generic error

  // ── RJM ─────────────────────────────────────────────────────────
  "RJM.offline": { status: "PENDING" }, // Offline
  "RJM.notifications": { status: "PENDING" }, // One inbox
  "RJM.board_food_off": { status: "PENDING" }, // Jobs · food dispatch off
  "RJM.board_empty_food_off": { status: "PENDING" }, // Food off · nothing in range
  "RJM.offer_parcel": {
    status: "PENDING",
    reason: "STRUCTURALLY ADOPTED via mock→RN codegen (RJM.offer_parcel#offer → app/rider/(tabs)/offer-parcel-card.view.tsx, guardrail-locked in adopted.mjs). Screenshot-lane wiring stays deferred: the offer-compose card is an INLINE state of the board (index.tsx), opened by tapping a job row (chooseOrder sets `selected`), not a standalone route — there is no separate screen to target (the board itself is wired as RJM.board). Wireable once a fixture can drive the board into its `selected` compose state.",
  }, // Parcel · name your fare
  "RJM.active_parcel": { status: "PENDING" }, // Active · parcel
  "RJM.handoff": { status: "PENDING" }, // Delivery code
  "RJM.pickup_photo": { status: "PENDING" }, // Proof of pickup · capture
  "RJM.pickup_photo_preview": { status: "PENDING" }, // Proof of pickup · preview
  "RJM.gate_topup": { status: "PENDING" }, // Gate · top up to keep riding
  "RJM.strikes": { status: "PENDING" }, // Reliability · strikes
  "RJM.pickup_photo_failed": { status: "PENDING" }, // Proof photo · upload failed
  "RJM.strikes_final": { status: "PENDING" }, // One strike from a pause

  // ── RR ──────────────────────────────────────────────────────────
  "RR.offer_upfront": { status: "PENDING" }, // Food · kitchen wants upfront
  "RR.offer_wallet": { status: "PENDING" }, // Food · already paid
  "RR.pay_merchant": { status: "PENDING" }, // Pay the merchant
  "RR.pickup_confirm": { status: "PENDING" }, // Collect · CASH job
  "RR.pickup_paid": { status: "PENDING" }, // Collect · already PAID
  "RR.nav_cust": { status: "PENDING" }, // To the customer
  "RR.doorstep": { status: "PENDING" }, // Collect · confirm cash
  "RR.delivered": { status: "PENDING" }, // Delivered · food
  "RR.return_cash": { status: "PENDING" }, // Return the kitchen's cash
  "RR.offer_expired": { status: "PENDING" }, // Offer expired
  "RR.cancel_reason": { status: "PENDING" }, // Drop the job · before pickup
  "RR.cancel_blocked": { status: "PENDING" }, // Can't drop after collecting
  "RR.cash_dispute": { status: "PENDING" }, // Customer confirmed, you didn't
  "RR.code_wrong": { status: "PENDING" }, // Wrong code
  "RR.unreachable": { status: "PENDING" }, // Customer unreachable
  "RR.return_rest": { status: "PENDING" }, // Return to restaurant
  "RR.handback": { status: "PENDING" }, // Hand back confirm
  "RR.offline_resume": { status: "PENDING" }, // Resumed mid-delivery

  // ── RM ──────────────────────────────────────────────────────────
  "RM.setup": {
    status: "PENDING",
    reason: "ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (docs/parity/PHASE6-merchant.md; classification in docs/parity/ADOPTION-CLASSIFICATION.md); adopts now with honest-empty data. The offline screenshot-harness auth-redirect (gated routes redirect to /login without a seeded PARITY_MERCHANT_URL) is a verification-lane limit, NOT a structure gate — was over-classified BACKEND_GATED",
  }, // First login · setup
  "RM.reboot": {
    status: "PENDING",
    reason: "ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (docs/parity/PHASE6-merchant.md; classification in docs/parity/ADOPTION-CLASSIFICATION.md); adopts now with honest-empty data. The offline screenshot-harness auth-redirect (gated routes redirect to /login without a seeded PARITY_MERCHANT_URL) is a verification-lane limit, NOT a structure gate — was over-classified BACKEND_GATED",
  }, // Tablet rebooted mid-shift
  "RM.queue_empty": {
    status: "PENDING",
    reason: "ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (docs/parity/PHASE6-merchant.md; classification in docs/parity/ADOPTION-CLASSIFICATION.md); adopts now with honest-empty data. The offline screenshot-harness auth-redirect (gated routes redirect to /login without a seeded PARITY_MERCHANT_URL) is a verification-lane limit, NOT a structure gate — was over-classified BACKEND_GATED",
  }, // Open · no orders
  "RM.queue_loading": {
    status: "PENDING",
    reason: "ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (docs/parity/PHASE6-merchant.md; classification in docs/parity/ADOPTION-CLASSIFICATION.md); adopts now with honest-empty data. The offline screenshot-harness auth-redirect (gated routes redirect to /login without a seeded PARITY_MERCHANT_URL) is a verification-lane limit, NOT a structure gate — was over-classified BACKEND_GATED",
  }, // Loading
  "RM.queue_new": {
    status: "PENDING",
    reason: "ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (docs/parity/PHASE6-merchant.md; classification in docs/parity/ADOPTION-CLASSIFICATION.md); adopts now with honest-empty data. The offline screenshot-harness auth-redirect (gated routes redirect to /login without a seeded PARITY_MERCHANT_URL) is a verification-lane limit, NOT a structure gate — was over-classified BACKEND_GATED",
  }, // NEW ORDER · alarm
  "RM.queue_board": {
    status: "PENDING",
    reason: "ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (docs/parity/PHASE6-merchant.md; classification in docs/parity/ADOPTION-CLASSIFICATION.md); adopts now with honest-empty data. The offline screenshot-harness auth-redirect (gated routes redirect to /login without a seeded PARITY_MERCHANT_URL) is a verification-lane limit, NOT a structure gate — was over-classified BACKEND_GATED",
  }, // Kitchen board · 3 live
  "RM.two_orders": {
    status: "PENDING",
    reason: "ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (docs/parity/PHASE6-merchant.md; classification in docs/parity/ADOPTION-CLASSIFICATION.md); adopts now with honest-empty data. The offline screenshot-harness auth-redirect (gated routes redirect to /login without a seeded PARITY_MERCHANT_URL) is a verification-lane limit, NOT a structure gate — was over-classified BACKEND_GATED",
  }, // Two orders at once
  "RM.offline": {
    status: "PENDING",
    reason: "ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (docs/parity/PHASE6-merchant.md; classification in docs/parity/ADOPTION-CLASSIFICATION.md); adopts now with honest-empty data. The offline screenshot-harness auth-redirect (gated routes redirect to /login without a seeded PARITY_MERCHANT_URL) is a verification-lane limit, NOT a structure gate — was over-classified BACKEND_GATED",
  }, // Connection lost
  "RM.offline_order": {
    status: "PENDING",
    reason: "ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (docs/parity/PHASE6-merchant.md; classification in docs/parity/ADOPTION-CLASSIFICATION.md); adopts now with honest-empty data. The offline screenshot-harness auth-redirect (gated routes redirect to /login without a seeded PARITY_MERCHANT_URL) is a verification-lane limit, NOT a structure gate — was over-classified BACKEND_GATED",
  }, // Order arrived offline
  "RM.order_accept": {
    status: "PENDING",
    reason: "ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (docs/parity/PHASE6-merchant.md; classification in docs/parity/ADOPTION-CLASSIFICATION.md); adopts now with honest-empty data. The offline screenshot-harness auth-redirect (gated routes redirect to /login without a seeded PARITY_MERCHANT_URL) is a verification-lane limit, NOT a structure gate — was over-classified BACKEND_GATED",
  }, // Accept + prep time
  "RM.call_confirm": {
    status: "PENDING",
    reason: "ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (docs/parity/PHASE6-merchant.md; classification in docs/parity/ADOPTION-CLASSIFICATION.md); adopts now with honest-empty data. The offline screenshot-harness auth-redirect (gated routes redirect to /login without a seeded PARITY_MERCHANT_URL) is a verification-lane limit, NOT a structure gate — was over-classified BACKEND_GATED",
  }, // Call, then request payment
  "RM.awaiting_payment": {
    status: "PENDING",
    reason: "ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (docs/parity/PHASE6-merchant.md; classification in docs/parity/ADOPTION-CLASSIFICATION.md); adopts now with honest-empty data. The offline screenshot-harness auth-redirect (gated routes redirect to /login without a seeded PARITY_MERCHANT_URL) is a verification-lane limit, NOT a structure gate — was over-classified BACKEND_GATED",
  }, // Awaiting payment · no clock
  "RM.reject_sheet": {
    status: "PENDING",
    reason: "ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (docs/parity/PHASE6-merchant.md; classification in docs/parity/ADOPTION-CLASSIFICATION.md); adopts now with honest-empty data. The offline screenshot-harness auth-redirect (gated routes redirect to /login without a seeded PARITY_MERCHANT_URL) is a verification-lane limit, NOT a structure gate — was over-classified BACKEND_GATED",
  }, // Reject · reason
  "RM.waiting_rider": {
    status: "PENDING",
    reason: "ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (docs/parity/PHASE6-merchant.md; classification in docs/parity/ADOPTION-CLASSIFICATION.md); adopts now with honest-empty data. The offline screenshot-harness auth-redirect (gated routes redirect to /login without a seeded PARITY_MERCHANT_URL) is a verification-lane limit, NOT a structure gate — was over-classified BACKEND_GATED",
  }, // Accepted · do not cook yet
  "RM.cook_now": {
    status: "PENDING",
    reason: "ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (docs/parity/PHASE6-merchant.md; classification in docs/parity/ADOPTION-CLASSIFICATION.md); adopts now with honest-empty data. The offline screenshot-harness auth-redirect (gated routes redirect to /login without a seeded PARITY_MERCHANT_URL) is a verification-lane limit, NOT a structure gate — was over-classified BACKEND_GATED",
  }, // Rider secured · cook now
  "RM.mark_ready": {
    status: "PENDING",
    reason: "ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (docs/parity/PHASE6-merchant.md; classification in docs/parity/ADOPTION-CLASSIFICATION.md); adopts now with honest-empty data. The offline screenshot-harness auth-redirect (gated routes redirect to /login without a seeded PARITY_MERCHANT_URL) is a verification-lane limit, NOT a structure gate — was over-classified BACKEND_GATED",
  }, // Mark ready
  "RM.no_rider_merchant": {
    status: "PENDING",
    reason: "ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (docs/parity/PHASE6-merchant.md; classification in docs/parity/ADOPTION-CLASSIFICATION.md); adopts now with honest-empty data. The offline screenshot-harness auth-redirect (gated routes redirect to /login without a seeded PARITY_MERCHANT_URL) is a verification-lane limit, NOT a structure gate — was over-classified BACKEND_GATED",
  }, // NO_RIDER · never cooked
  "RM.rider_cancelled": {
    status: "PENDING",
    reason: "ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (docs/parity/PHASE6-merchant.md; classification in docs/parity/ADOPTION-CLASSIFICATION.md); adopts now with honest-empty data. The offline screenshot-harness auth-redirect (gated routes redirect to /login without a seeded PARITY_MERCHANT_URL) is a verification-lane limit, NOT a structure gate — was over-classified BACKEND_GATED",
  }, // Rider cancelled · re-dispatch
  "RM.item_out": {
    status: "PENDING",
    reason: "ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (docs/parity/PHASE6-merchant.md; classification in docs/parity/ADOPTION-CLASSIFICATION.md); adopts now with honest-empty data. The offline screenshot-harness auth-redirect (gated routes redirect to /login without a seeded PARITY_MERCHANT_URL) is a verification-lane limit, NOT a structure gate — was over-classified BACKEND_GATED",
  }, // Don't have an item
  "RM.item_out_wait": {
    status: "PENDING",
    reason: "ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (docs/parity/PHASE6-merchant.md; classification in docs/parity/ADOPTION-CLASSIFICATION.md); adopts now with honest-empty data. The offline screenshot-harness auth-redirect (gated routes redirect to /login without a seeded PARITY_MERCHANT_URL) is a verification-lane limit, NOT a structure gate — was over-classified BACKEND_GATED",
  }, // New total · customer confirming
  "RM.pickup_cash": {
    status: "PENDING",
    reason: "ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (docs/parity/PHASE6-merchant.md; classification in docs/parity/ADOPTION-CLASSIFICATION.md); adopts now with honest-empty data. The offline screenshot-harness auth-redirect (gated routes redirect to /login without a seeded PARITY_MERCHANT_URL) is a verification-lane limit, NOT a structure gate — was over-classified BACKEND_GATED",
  }, // Upfront · confirm cash
  "RM.pickup_collect": {
    status: "PENDING",
    reason: "ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (docs/parity/PHASE6-merchant.md; classification in docs/parity/ADOPTION-CLASSIFICATION.md); adopts now with honest-empty data. The offline screenshot-harness auth-redirect (gated routes redirect to /login without a seeded PARITY_MERCHANT_URL) is a verification-lane limit, NOT a structure gate — was over-classified BACKEND_GATED",
  }, // Collect-and-return · release
  "RM.pickup_wallet": {
    status: "PENDING",
    reason: "ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (docs/parity/PHASE6-merchant.md; classification in docs/parity/ADOPTION-CLASSIFICATION.md); adopts now with honest-empty data. The offline screenshot-harness auth-redirect (gated routes redirect to /login without a seeded PARITY_MERCHANT_URL) is a verification-lane limit, NOT a structure gate — was over-classified BACKEND_GATED",
  }, // WALLET · confirm before cooking
  "RM.wallet_mismatch": {
    status: "PENDING",
    reason: "ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (docs/parity/PHASE6-merchant.md; classification in docs/parity/ADOPTION-CLASSIFICATION.md); adopts now with honest-empty data. The offline screenshot-harness auth-redirect (gated routes redirect to /login without a seeded PARITY_MERCHANT_URL) is a verification-lane limit, NOT a structure gate — was over-classified BACKEND_GATED",
  }, // Short payment blocked
  "RM.pickup_done": {
    status: "PENDING",
    reason: "ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (docs/parity/PHASE6-merchant.md; classification in docs/parity/ADOPTION-CLASSIFICATION.md); adopts now with honest-empty data. The offline screenshot-harness auth-redirect (gated routes redirect to /login without a seeded PARITY_MERCHANT_URL) is a verification-lane limit, NOT a structure gate — was over-classified BACKEND_GATED",
  }, // Handed over
  "RM.cash_return": {
    status: "PENDING",
    reason: "ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (docs/parity/PHASE6-merchant.md; classification in docs/parity/ADOPTION-CLASSIFICATION.md); adopts now with honest-empty data. The offline screenshot-harness auth-redirect (gated routes redirect to /login without a seeded PARITY_MERCHANT_URL) is a verification-lane limit, NOT a structure gate — was over-classified BACKEND_GATED",
  }, // Count the returned cash
  "RM.rider_noshow": {
    status: "PENDING",
    reason: "ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (docs/parity/PHASE6-merchant.md; classification in docs/parity/ADOPTION-CLASSIFICATION.md); adopts now with honest-empty data. The offline screenshot-harness auth-redirect (gated routes redirect to /login without a seeded PARITY_MERCHANT_URL) is a verification-lane limit, NOT a structure gate — was over-classified BACKEND_GATED",
  }, // Rider no-show
  "RM.refund_exec": {
    status: "PENDING",
    reason: "ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (docs/parity/PHASE6-merchant.md; classification in docs/parity/ADOPTION-CLASSIFICATION.md); adopts now with honest-empty data. The offline screenshot-harness auth-redirect (gated routes redirect to /login without a seeded PARITY_MERCHANT_URL) is a verification-lane limit, NOT a structure gate — was over-classified BACKEND_GATED",
  }, // Refund after wallet paid
  "RM.pickup_reveal": {
    status: "PENDING",
    reason: "ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (docs/parity/PHASE6-merchant.md; classification in docs/parity/ADOPTION-CLASSIFICATION.md); adopts now with honest-empty data. The offline screenshot-harness auth-redirect (gated routes redirect to /login without a seeded PARITY_MERCHANT_URL) is a verification-lane limit, NOT a structure gate — was over-classified BACKEND_GATED",
  }, // Pickup code · hidden
  "RM.pickup_revealed": {
    status: "PENDING",
    reason: "ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (docs/parity/PHASE6-merchant.md; classification in docs/parity/ADOPTION-CLASSIFICATION.md); adopts now with honest-empty data. The offline screenshot-harness auth-redirect (gated routes redirect to /login without a seeded PARITY_MERCHANT_URL) is a verification-lane limit, NOT a structure gate — was over-classified BACKEND_GATED",
  }, // Pickup code · revealed
  "RM.catalog": {
    status: "PENDING",
    reason: "ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (docs/parity/PHASE6-merchant.md; classification in docs/parity/ADOPTION-CLASSIFICATION.md); adopts now with honest-empty data. The offline screenshot-harness auth-redirect (gated routes redirect to /login without a seeded PARITY_MERCHANT_URL) is a verification-lane limit, NOT a structure gate — was over-classified BACKEND_GATED",
  }, // Menu · grouped by category
  "RM.category_manage": {
    status: "PENDING",
    reason: "ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (docs/parity/PHASE6-merchant.md; classification in docs/parity/ADOPTION-CLASSIFICATION.md); adopts now with honest-empty data. The offline screenshot-harness auth-redirect (gated routes redirect to /login without a seeded PARITY_MERCHANT_URL) is a verification-lane limit, NOT a structure gate — was over-classified BACKEND_GATED",
  }, // Categories · reorder & hide
  "RM.category_edit": {
    status: "PENDING",
    reason: "ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (docs/parity/PHASE6-merchant.md; classification in docs/parity/ADOPTION-CLASSIFICATION.md); adopts now with honest-empty data. The offline screenshot-harness auth-redirect (gated routes redirect to /login without a seeded PARITY_MERCHANT_URL) is a verification-lane limit, NOT a structure gate — was over-classified BACKEND_GATED",
  }, // New category
  "RM.category_rename": {
    status: "PENDING",
    reason: "ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (docs/parity/PHASE6-merchant.md; classification in docs/parity/ADOPTION-CLASSIFICATION.md); adopts now with honest-empty data. The offline screenshot-harness auth-redirect (gated routes redirect to /login without a seeded PARITY_MERCHANT_URL) is a verification-lane limit, NOT a structure gate — was over-classified BACKEND_GATED",
  }, // Edit / delete category
  "RM.catalog_empty": {
    status: "PENDING",
    reason: "ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (docs/parity/PHASE6-merchant.md; classification in docs/parity/ADOPTION-CLASSIFICATION.md); adopts now with honest-empty data. The offline screenshot-harness auth-redirect (gated routes redirect to /login without a seeded PARITY_MERCHANT_URL) is a verification-lane limit, NOT a structure gate — was over-classified BACKEND_GATED",
  }, // No categories yet
  "RM.item_edit": {
    status: "PENDING",
    reason: "ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (docs/parity/PHASE6-merchant.md; classification in docs/parity/ADOPTION-CLASSIFICATION.md); adopts now with honest-empty data. The offline screenshot-harness auth-redirect (gated routes redirect to /login without a seeded PARITY_MERCHANT_URL) is a verification-lane limit, NOT a structure gate — was over-classified BACKEND_GATED",
  }, // Edit dish · photo required
  "RM.dish_photo": {
    status: "PENDING",
    reason: "ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (docs/parity/PHASE6-merchant.md; classification in docs/parity/ADOPTION-CLASSIFICATION.md); adopts now with honest-empty data. The offline screenshot-harness auth-redirect (gated routes redirect to /login without a seeded PARITY_MERCHANT_URL) is a verification-lane limit, NOT a structure gate — was over-classified BACKEND_GATED",
  }, // Dish photo · crop
  "RM.dish_draft": {
    status: "PENDING",
    reason: "ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (docs/parity/PHASE6-merchant.md; classification in docs/parity/ADOPTION-CLASSIFICATION.md); adopts now with honest-empty data. The offline screenshot-harness auth-redirect (gated routes redirect to /login without a seeded PARITY_MERCHANT_URL) is a verification-lane limit, NOT a structure gate — was over-classified BACKEND_GATED",
  }, // Draft · needs a photo
  "RM.oos_sheet": {
    status: "PENDING",
    reason: "ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (docs/parity/PHASE6-merchant.md; classification in docs/parity/ADOPTION-CLASSIFICATION.md); adopts now with honest-empty data. The offline screenshot-harness auth-redirect (gated routes redirect to /login without a seeded PARITY_MERCHANT_URL) is a verification-lane limit, NOT a structure gate — was over-classified BACKEND_GATED",
  }, // Out of stock today
  "RM.hours": {
    status: "PENDING",
    reason: "ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (docs/parity/PHASE6-merchant.md; classification in docs/parity/ADOPTION-CLASSIFICATION.md); adopts now with honest-empty data. The offline screenshot-harness auth-redirect (gated routes redirect to /login without a seeded PARITY_MERCHANT_URL) is a verification-lane limit, NOT a structure gate — was over-classified BACKEND_GATED",
  }, // Operating hours
  "RM.statement": {
    status: "PENDING",
    reason: "ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (docs/parity/PHASE6-merchant.md; classification in docs/parity/ADOPTION-CLASSIFICATION.md); adopts now with honest-empty data. The offline screenshot-harness auth-redirect (gated routes redirect to /login without a seeded PARITY_MERCHANT_URL) is a verification-lane limit, NOT a structure gate — was over-classified BACKEND_GATED",
  }, // Weekly statement
  "RM.eod": {
    status: "PENDING",
    reason: "ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (docs/parity/PHASE6-merchant.md; classification in docs/parity/ADOPTION-CLASSIFICATION.md); adopts now with honest-empty data. The offline screenshot-harness auth-redirect (gated routes redirect to /login without a seeded PARITY_MERCHANT_URL) is a verification-lane limit, NOT a structure gate — was over-classified BACKEND_GATED",
  }, // End of day
  "RM.shop": {
    status: "PENDING",
    reason: "ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (docs/parity/PHASE6-merchant.md; classification in docs/parity/ADOPTION-CLASSIFICATION.md); adopts now with honest-empty data. The offline screenshot-harness auth-redirect (gated routes redirect to /login without a seeded PARITY_MERCHANT_URL) is a verification-lane limit, NOT a structure gate — was over-classified BACKEND_GATED",
  }, // Shop profile
  "RM.cash_rule": {
    status: "PENDING",
    reason: "ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (docs/parity/PHASE6-merchant.md; classification in docs/parity/ADOPTION-CLASSIFICATION.md); adopts now with honest-empty data. The offline screenshot-harness auth-redirect (gated routes redirect to /login without a seeded PARITY_MERCHANT_URL) is a verification-lane limit, NOT a structure gate — was over-classified BACKEND_GATED",
  }, // Your cash rule
  "RM.shop_crop": {
    status: "PENDING",
    reason: "ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (docs/parity/PHASE6-merchant.md; classification in docs/parity/ADOPTION-CLASSIFICATION.md); adopts now with honest-empty data. The offline screenshot-harness auth-redirect (gated routes redirect to /login without a seeded PARITY_MERCHANT_URL) is a verification-lane limit, NOT a structure gate — was over-classified BACKEND_GATED",
  }, // Position the banner
  "RM.shop_upload": {
    status: "PENDING",
    reason: "ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (docs/parity/PHASE6-merchant.md; classification in docs/parity/ADOPTION-CLASSIFICATION.md); adopts now with honest-empty data. The offline screenshot-harness auth-redirect (gated routes redirect to /login without a seeded PARITY_MERCHANT_URL) is a verification-lane limit, NOT a structure gate — was over-classified BACKEND_GATED",
  }, // Uploading · compressing
  "RM.shop_upload_failed": {
    status: "PENDING",
    reason: "ADOPTABLE-NOW (web) — merchant tablet structure is built to the mock via direct-DOM (docs/parity/PHASE6-merchant.md; classification in docs/parity/ADOPTION-CLASSIFICATION.md); adopts now with honest-empty data. The offline screenshot-harness auth-redirect (gated routes redirect to /login without a seeded PARITY_MERCHANT_URL) is a verification-lane limit, NOT a structure gate — was over-classified BACKEND_GATED",
  }, // Upload paused · offline
};

/** Convenience sets for the guardrail + tooling. */
export const PENDING_KEYS = Object.keys(PARITY_STATUS).filter((k) => PARITY_STATUS[k].status === "PENDING");
export const BACKEND_GATED_KEYS = Object.keys(PARITY_STATUS).filter(
  (k) => PARITY_STATUS[k].status === "BACKEND_GATED",
);
