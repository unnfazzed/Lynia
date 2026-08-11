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
 *   BACKEND_GATED  ⛔ the design cannot be faithfully rendered by the static fixture/offline harness
 *                  because it is populated entirely from live API/DB state (a seeded authenticated
 *                  backend). Tracked as a backend-fixture issue, not app drift. `reason` says why.
 *
 * Never list a RETIRED screen here (retired ids live in packages/design/EXPORT-README.md); retired
 * screens are absent from screens.generated.json, so they can't appear in the coverage set at all.
 */
export const PARITY_STATUS = {
  // ── LJ ──────────────────────────────────────────────────────────
  "LJ.splash": { status: "PENDING" }, // Splash
  "LJ.onboard_send": { status: "PENDING" }, // Onboarding · send
  "LJ.onboard_shared": { status: "PENDING" }, // Onboarding · one app
  "LJ.perm_notif": { status: "PENDING" }, // Permission · notifications
  "LJ.onboard_flag_off": { status: "PENDING" }, // Onboarding · food off
  "LJ.role_select_flag_off": { status: "PENDING" }, // Choose your role · food off
  "LJ.home_flag_off": { status: "PENDING" }, // Home · Food tile soon
  "LJ.order_restore": { status: "PENDING" }, // Cold start · order running
  "LJ.stale_cache": { status: "PENDING" }, // Orders · saved copy
  "LJ.addr_search": { status: "PENDING" }, // Address search
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
  "LJ.delivered_rate": { status: "PENDING" }, // Delivered · rate the rider
  "LJ.completed": { status: "PENDING" }, // Completed
  "LJ.rate_undo": { status: "PENDING" }, // Rating sent · undo
  "LJ.notif_empty": { status: "PENDING" }, // Notifications · empty
  "LJ.settings_perms": { status: "PENDING" }, // Settings · real permissions
  "LJ.settings_perms_ok": { status: "PENDING" }, // Settings · all granted
  "LJ.privacy": { status: "PENDING" }, // Privacy
  "LJ.delete_account": { status: "PENDING" }, // Delete account
  "LJ.delete_final": { status: "PENDING" }, // Delete · final confirm
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
  "LJ.otp_cooldown": { status: "PENDING" }, // OTP · resend cooldown
  "LJ.otp_resent": { status: "PENDING" }, // OTP · code re-sent
  "LJ.otp_locked": { status: "PENDING" }, // OTP · expired / locked
  "LJ.offline": { status: "PENDING" }, // Offline banner
  "LJ.on_hold": { status: "PENDING" }, // Account on hold
  "LJ.no_gps": { status: "PENDING" }, // Location off / no GPS
  "LJ.generic_error": { status: "PENDING" }, // Generic error
  "LJ.conn_reconnecting": { status: "PENDING" }, // Reconnecting banner
  "LJ.stale_cache_empty": { status: "PENDING" }, // Offline · nothing saved
  "LJ.order_restore_error": { status: "PENDING" }, // Restore failed
  "LJ.draft_discard": { status: "PENDING" }, // Discard draft · confirm

  // ── RC ──────────────────────────────────────────────────────────
  "RC.orders_empty": { status: "PENDING" }, // Orders · empty
  "RC.list_loading": { status: "PENDING" }, // List loading
  "RC.item": { status: "PENDING" }, // Item sheet
  "RC.cart_note": { status: "PENDING" }, // Note for the kitchen
  "RC.placing": { status: "PENDING" }, // Placing
  "RC.await_accept": { status: "PENDING" }, // Waiting on the kitchen
  "RC.confirm_call": { status: "PENDING" }, // They call to confirm
  "RC.pay_push": {
    status: "BACKEND_GATED",
    reason: "prompt-send pay — the payment-prompt send/confirm state is driven by a live payment request on the order; not renderable from a static fixture",
  }, // Push · payment requested
  "RC.pay_wait": {
    status: "BACKEND_GATED",
    reason: "prompt-send pay — the payment-prompt send/confirm state is driven by a live payment request on the order; not renderable from a static fixture",
  }, // Prompt sent
  "RC.pay_manual": { status: "PENDING" }, // Paid another way
  "RC.pay_confirmed": {
    status: "BACKEND_GATED",
    reason: "prompt-send pay — the payment-prompt send/confirm state is driven by a live payment request on the order; not renderable from a static fixture",
  }, // Waiting to be confirmed
  "RC.track_prep": { status: "PENDING" }, // Prep countdown
  "RC.track_secured": { status: "PENDING" }, // Rider secured — #671 lifted the gate: the rider's identity (name·plate·vehicle·rating·KYC) is now a plain field on the food order read (MerchantOrderResponse.rider), so the tracker renders it from live data and a static fixture can stand it up. Adopted; parity target+fixture wiring pending.
  "RC.handoff": { status: "PENDING" }, // Pay at the door
  "RC.handoff_wait": { status: "PENDING" }, // Waiting for rider confirm
  "RC.handoff_code": { status: "PENDING" }, // Both confirmed · code
  "RC.list_empty": { status: "PENDING" }, // Nothing open
  "RC.list_error": { status: "PENDING" }, // Offline list
  "RC.menu_closed": { status: "PENDING" }, // Closed restaurant
  "RC.closed_interrupt": { status: "PENDING" }, // Closes while browsing
  "RC.cart_oos": { status: "PENDING" }, // Item sold out
  "RC.cart_price": { status: "PENDING" }, // Price changed
  "RC.cart_empty": { status: "PENDING" }, // Empty cart
  "RC.cart_min": { status: "PENDING" }, // Under the minimum
  "RC.checkout_offline": { status: "PENDING" }, // Offline mid-checkout
  "RC.pay_open": { status: "PENDING" }, // Still unpaid · reminder
  "RC.pay_failed": { status: "PENDING" }, // Payment declined
  "RC.item_removed": { status: "PENDING" }, // One item unavailable
  "RC.no_rider": { status: "PENDING" }, // NO_RIDER
  "RC.track_paused": { status: "PENDING" }, // Live paused
  "RC.rejected": { status: "PENDING" }, // Rejected · refund pending
  "RC.refunded": { status: "PENDING" }, // Refunded
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
  "RJM.offer_parcel": { status: "PENDING" }, // Parcel · name your fare
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
    status: "BACKEND_GATED",
    reason: "merchant tablet route renders only against a seeded authenticated API (gated routes client-redirect to /login without one — see app-targets.mjs); needs backend fixture",
  }, // First login · setup
  "RM.reboot": {
    status: "BACKEND_GATED",
    reason: "merchant tablet route renders only against a seeded authenticated API (gated routes client-redirect to /login without one — see app-targets.mjs); needs backend fixture",
  }, // Tablet rebooted mid-shift
  "RM.queue_empty": {
    status: "BACKEND_GATED",
    reason: "merchant tablet route renders only against a seeded authenticated API (gated routes client-redirect to /login without one — see app-targets.mjs); needs backend fixture",
  }, // Open · no orders
  "RM.queue_loading": {
    status: "BACKEND_GATED",
    reason: "merchant tablet route renders only against a seeded authenticated API (gated routes client-redirect to /login without one — see app-targets.mjs); needs backend fixture",
  }, // Loading
  "RM.queue_new": {
    status: "BACKEND_GATED",
    reason: "merchant tablet route renders only against a seeded authenticated API (gated routes client-redirect to /login without one — see app-targets.mjs); needs backend fixture",
  }, // NEW ORDER · alarm
  "RM.queue_board": {
    status: "BACKEND_GATED",
    reason: "merchant tablet route renders only against a seeded authenticated API (gated routes client-redirect to /login without one — see app-targets.mjs); needs backend fixture",
  }, // Kitchen board · 3 live
  "RM.two_orders": {
    status: "BACKEND_GATED",
    reason: "merchant tablet route renders only against a seeded authenticated API (gated routes client-redirect to /login without one — see app-targets.mjs); needs backend fixture",
  }, // Two orders at once
  "RM.offline": {
    status: "BACKEND_GATED",
    reason: "merchant tablet route renders only against a seeded authenticated API (gated routes client-redirect to /login without one — see app-targets.mjs); needs backend fixture",
  }, // Connection lost
  "RM.offline_order": {
    status: "BACKEND_GATED",
    reason: "merchant tablet route renders only against a seeded authenticated API (gated routes client-redirect to /login without one — see app-targets.mjs); needs backend fixture",
  }, // Order arrived offline
  "RM.order_accept": {
    status: "BACKEND_GATED",
    reason: "merchant tablet route renders only against a seeded authenticated API (gated routes client-redirect to /login without one — see app-targets.mjs); needs backend fixture",
  }, // Accept + prep time
  "RM.call_confirm": {
    status: "BACKEND_GATED",
    reason: "merchant tablet route renders only against a seeded authenticated API (gated routes client-redirect to /login without one — see app-targets.mjs); needs backend fixture",
  }, // Call, then request payment
  "RM.awaiting_payment": {
    status: "BACKEND_GATED",
    reason: "merchant tablet route renders only against a seeded authenticated API (gated routes client-redirect to /login without one — see app-targets.mjs); needs backend fixture",
  }, // Awaiting payment · no clock
  "RM.reject_sheet": {
    status: "BACKEND_GATED",
    reason: "merchant tablet route renders only against a seeded authenticated API (gated routes client-redirect to /login without one — see app-targets.mjs); needs backend fixture",
  }, // Reject · reason
  "RM.waiting_rider": {
    status: "BACKEND_GATED",
    reason: "merchant tablet route renders only against a seeded authenticated API (gated routes client-redirect to /login without one — see app-targets.mjs); needs backend fixture",
  }, // Accepted · do not cook yet
  "RM.cook_now": {
    status: "BACKEND_GATED",
    reason: "merchant tablet route renders only against a seeded authenticated API (gated routes client-redirect to /login without one — see app-targets.mjs); needs backend fixture",
  }, // Rider secured · cook now
  "RM.mark_ready": {
    status: "BACKEND_GATED",
    reason: "merchant tablet route renders only against a seeded authenticated API (gated routes client-redirect to /login without one — see app-targets.mjs); needs backend fixture",
  }, // Mark ready
  "RM.no_rider_merchant": {
    status: "BACKEND_GATED",
    reason: "merchant tablet route renders only against a seeded authenticated API (gated routes client-redirect to /login without one — see app-targets.mjs); needs backend fixture",
  }, // NO_RIDER · never cooked
  "RM.rider_cancelled": {
    status: "BACKEND_GATED",
    reason: "merchant tablet route renders only against a seeded authenticated API (gated routes client-redirect to /login without one — see app-targets.mjs); needs backend fixture",
  }, // Rider cancelled · re-dispatch
  "RM.item_out": {
    status: "BACKEND_GATED",
    reason: "merchant tablet route renders only against a seeded authenticated API (gated routes client-redirect to /login without one — see app-targets.mjs); needs backend fixture",
  }, // Don't have an item
  "RM.item_out_wait": {
    status: "BACKEND_GATED",
    reason: "merchant tablet route renders only against a seeded authenticated API (gated routes client-redirect to /login without one — see app-targets.mjs); needs backend fixture",
  }, // New total · customer confirming
  "RM.pickup_cash": {
    status: "BACKEND_GATED",
    reason: "merchant tablet route renders only against a seeded authenticated API (gated routes client-redirect to /login without one — see app-targets.mjs); needs backend fixture",
  }, // Upfront · confirm cash
  "RM.pickup_collect": {
    status: "BACKEND_GATED",
    reason: "merchant tablet route renders only against a seeded authenticated API (gated routes client-redirect to /login without one — see app-targets.mjs); needs backend fixture",
  }, // Collect-and-return · release
  "RM.pickup_wallet": {
    status: "BACKEND_GATED",
    reason: "merchant tablet route renders only against a seeded authenticated API (gated routes client-redirect to /login without one — see app-targets.mjs); needs backend fixture",
  }, // WALLET · confirm before cooking
  "RM.wallet_mismatch": {
    status: "BACKEND_GATED",
    reason: "merchant tablet route renders only against a seeded authenticated API (gated routes client-redirect to /login without one — see app-targets.mjs); needs backend fixture",
  }, // Short payment blocked
  "RM.pickup_done": {
    status: "BACKEND_GATED",
    reason: "merchant tablet route renders only against a seeded authenticated API (gated routes client-redirect to /login without one — see app-targets.mjs); needs backend fixture",
  }, // Handed over
  "RM.cash_return": {
    status: "BACKEND_GATED",
    reason: "merchant tablet route renders only against a seeded authenticated API (gated routes client-redirect to /login without one — see app-targets.mjs); needs backend fixture",
  }, // Count the returned cash
  "RM.rider_noshow": {
    status: "BACKEND_GATED",
    reason: "merchant tablet route renders only against a seeded authenticated API (gated routes client-redirect to /login without one — see app-targets.mjs); needs backend fixture",
  }, // Rider no-show
  "RM.refund_exec": {
    status: "BACKEND_GATED",
    reason: "merchant tablet route renders only against a seeded authenticated API (gated routes client-redirect to /login without one — see app-targets.mjs); needs backend fixture",
  }, // Refund after wallet paid
  "RM.pickup_reveal": {
    status: "BACKEND_GATED",
    reason: "merchant tablet route renders only against a seeded authenticated API (gated routes client-redirect to /login without one — see app-targets.mjs); needs backend fixture",
  }, // Pickup code · hidden
  "RM.pickup_revealed": {
    status: "BACKEND_GATED",
    reason: "merchant tablet route renders only against a seeded authenticated API (gated routes client-redirect to /login without one — see app-targets.mjs); needs backend fixture",
  }, // Pickup code · revealed
  "RM.catalog": {
    status: "BACKEND_GATED",
    reason: "merchant tablet route renders only against a seeded authenticated API (gated routes client-redirect to /login without one — see app-targets.mjs); needs backend fixture",
  }, // Menu · grouped by category
  "RM.category_manage": {
    status: "BACKEND_GATED",
    reason: "merchant tablet route renders only against a seeded authenticated API (gated routes client-redirect to /login without one — see app-targets.mjs); needs backend fixture",
  }, // Categories · reorder & hide
  "RM.category_edit": {
    status: "BACKEND_GATED",
    reason: "merchant tablet route renders only against a seeded authenticated API (gated routes client-redirect to /login without one — see app-targets.mjs); needs backend fixture",
  }, // New category
  "RM.category_rename": {
    status: "BACKEND_GATED",
    reason: "merchant tablet route renders only against a seeded authenticated API (gated routes client-redirect to /login without one — see app-targets.mjs); needs backend fixture",
  }, // Edit / delete category
  "RM.catalog_empty": {
    status: "BACKEND_GATED",
    reason: "merchant tablet route renders only against a seeded authenticated API (gated routes client-redirect to /login without one — see app-targets.mjs); needs backend fixture",
  }, // No categories yet
  "RM.item_edit": {
    status: "BACKEND_GATED",
    reason: "merchant tablet route renders only against a seeded authenticated API (gated routes client-redirect to /login without one — see app-targets.mjs); needs backend fixture",
  }, // Edit dish · photo required
  "RM.dish_photo": {
    status: "BACKEND_GATED",
    reason: "merchant tablet route renders only against a seeded authenticated API (gated routes client-redirect to /login without one — see app-targets.mjs); needs backend fixture",
  }, // Dish photo · crop
  "RM.dish_draft": {
    status: "BACKEND_GATED",
    reason: "merchant tablet route renders only against a seeded authenticated API (gated routes client-redirect to /login without one — see app-targets.mjs); needs backend fixture",
  }, // Draft · needs a photo
  "RM.oos_sheet": {
    status: "BACKEND_GATED",
    reason: "merchant tablet route renders only against a seeded authenticated API (gated routes client-redirect to /login without one — see app-targets.mjs); needs backend fixture",
  }, // Out of stock today
  "RM.hours": {
    status: "BACKEND_GATED",
    reason: "merchant tablet route renders only against a seeded authenticated API (gated routes client-redirect to /login without one — see app-targets.mjs); needs backend fixture",
  }, // Operating hours
  "RM.statement": {
    status: "BACKEND_GATED",
    reason: "merchant tablet route renders only against a seeded authenticated API (gated routes client-redirect to /login without one — see app-targets.mjs); needs backend fixture",
  }, // Weekly statement
  "RM.eod": {
    status: "BACKEND_GATED",
    reason: "merchant tablet route renders only against a seeded authenticated API (gated routes client-redirect to /login without one — see app-targets.mjs); needs backend fixture",
  }, // End of day
  "RM.shop": {
    status: "BACKEND_GATED",
    reason: "merchant tablet route renders only against a seeded authenticated API (gated routes client-redirect to /login without one — see app-targets.mjs); needs backend fixture",
  }, // Shop profile
  "RM.cash_rule": {
    status: "BACKEND_GATED",
    reason: "merchant tablet route renders only against a seeded authenticated API (gated routes client-redirect to /login without one — see app-targets.mjs); needs backend fixture",
  }, // Your cash rule
  "RM.shop_crop": {
    status: "BACKEND_GATED",
    reason: "merchant tablet route renders only against a seeded authenticated API (gated routes client-redirect to /login without one — see app-targets.mjs); needs backend fixture",
  }, // Position the banner
  "RM.shop_upload": {
    status: "BACKEND_GATED",
    reason: "merchant tablet route renders only against a seeded authenticated API (gated routes client-redirect to /login without one — see app-targets.mjs); needs backend fixture",
  }, // Uploading · compressing
  "RM.shop_upload_failed": {
    status: "BACKEND_GATED",
    reason: "merchant tablet route renders only against a seeded authenticated API (gated routes client-redirect to /login without one — see app-targets.mjs); needs backend fixture",
  }, // Upload paused · offline
};

/** Convenience sets for the guardrail + tooling. */
export const PENDING_KEYS = Object.keys(PARITY_STATUS).filter((k) => PARITY_STATUS[k].status === "PENDING");
export const BACKEND_GATED_KEYS = Object.keys(PARITY_STATUS).filter(
  (k) => PARITY_STATUS[k].status === "BACKEND_GATED",
);
