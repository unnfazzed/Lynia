/* LyniaGo — ALL SCREENS: the gallery map. Four categories, each ordered by journey stage with both
   services inside the same act; a service tag chip on every tile; exceptions & edge collected at the
   end of each category. Badges are generated per category (C1·1, R2·3, M4·1, A1) — never hand-typed.
   Tile: [source, id, title, tag]  ·  source: LJ (Send customer) | RC (Food customer) | RJ (rider,
   parcel-built) | RR (rider, food-built) | RJM (merged one-app rider) | RM (merchant tablet).
   Tag: "" (service-agnostic chrome) | "BOTH" | "PARCEL" | "FOOD".

   Retired here because the flow no longer contains them:
   · LJ home_launcher — the Food home IS the app home (RC home).
   · The PRE-8c customer home body (DS AppHome: green brand header, 62px round-square service tiles,
     bordered live-order cards, horizontal venues rail) — retired 2026-08-17 by the home-8c redesign.
     RC home is UNCHANGED as a screen id and keeps its badge; what it DRAWS is now
     explorations/home-redesign/home-8c.jsx (handoff/home-8c/, DS card ui_kits/mobile/home-8c.html).
     Never align to the pre-8c body, which survives only as the exploration's lineage record.
     LJ home_flag_off still draws the pre-8c body: the 8c wave shipped no flag-off mock, so that
     screen is out of scope until one is exported (docs/DESIGN-DEVIATIONS.md D-28).
   · RJ rider_offline / online_empty / board — replaced by the merged one-app board (RJM).
   · RJ offer_compose — replaced by RJM offer_parcel.
   · RJ earnings / earnings_new — the weekly-settlement model is retired (prepaid wallet for both).
   · RJ wallet — replaced by the merged Money tab (RJM money).
   · RJ profile — replaced by the merged rider Account (RJM account).
   · RJ gate_commission — replaced by the one balance gate (RJM gate_topup).

   2026-08 SH wave: the shipped-states screens (screens-shipped.jsx / rider-screens-shipped.jsx /
   r-merchant-shipped.jsx, sheet ui_kits/mobile/shipped-states.html) are APPENDED at band ends
   only, so no pre-existing generated badge moved.                                                */
(() => {
const CUSTOMER = [
  ["First run", "First install only — one sign-in for both services, then the role fork and permission priming.", [
    ["LJ", "splash", "Splash", ""], ["LJ", "onboard", "Onboarding · food", "FOOD"], ["LJ", "onboard_send", "Onboarding · send", "PARCEL"],
    ["LJ", "onboard_shared", "Onboarding · one app", "BOTH"], ["LJ", "login", "Phone login", ""], ["LJ", "otp", "SMS OTP", ""],
    ["LJ", "role_select", "Choose your role", ""], ["LJ", "register", "Profile registration", ""],
    ["LJ", "perm_loc", "Permission · location", ""], ["LJ", "perm_notif", "Permission · notifications", ""],
    ["LJ", "onboard_flag_off", "Onboarding · food off", "PARCEL"], ["LJ", "role_select_flag_off", "Choose your role · food off", ""],
  ]],
  ["Home & orders", "One home for both services: tiles, a live-order card per running job, restaurants near you. One Orders list across everything.", [
    ["RC", "home", "Home · service tiles", "BOTH"], ["RC", "orders", "Orders · all services", "BOTH"], ["RC", "orders_empty", "Orders · empty", "BOTH"],
    ["LJ", "home_flag_off", "Home · Food tile soon", "BOTH"], ["LJ", "order_restore", "Cold start · order running", "BOTH"], ["LJ", "stale_cache", "Orders · saved copy", "BOTH"],
  ]],
  ["Browse & compose", "Where the two services diverge most: food is a catalogue, a parcel is a route you build.", [
    ["RC", "list", "Restaurant list", "FOOD"], ["RC", "list_loading", "List loading", "FOOD"], ["RC", "search", "Search", "FOOD"],
    ["RC", "menu", "Menu", "FOOD"], ["RC", "item", "Item sheet", "FOOD"],
    ["LJ", "home_empty", "Send composer · no address", "PARCEL"], ["LJ", "addr_search", "Address search", "PARCEL"],
    ["LJ", "addr_map_confirm", "Confirm pin on map", "PARCEL"], ["LJ", "home_pins", "Send · both set", "PARCEL"],
    ["LJ", "home_expanded", "Send · sheet expanded", "PARCEL"], ["LJ", "disclaimer", "Broadcast disclaimer", "PARCEL"],
    ["LJ", "draft_restored", "Draft restored", "PARCEL"], ["LJ", "addr_unavailable", "Address search down", "PARCEL"],
    ["LJ", "map_failed", "Map didn't load", "PARCEL"], ["LJ", "loc_off", "Location off · composer", "PARCEL"],
  ]],
  ["Commit & pay", "Food is priced and paid; a parcel is priced by the market — you name it and riders answer.", [
    ["RC", "cart", "Cart", "FOOD"], ["RC", "cart_note", "Note for the kitchen", "FOOD"], ["RC", "checkout_cash", "Checkout · CASH", "FOOD"],
    ["RC", "checkout_wallet", "Checkout · WALLET", "FOOD"], ["RC", "placing", "Placing", "FOOD"],
    ["LJ", "auction_finding", "Auction · finding", "PARCEL"], ["LJ", "auction_live", "Auction · offers live", "PARCEL"],
    ["LJ", "auction_counter", "Counter-offer review", "PARCEL"],
  ]],
  ["The kitchen confirms", "Food only: no payment clock. The kitchen calls, then requests the money — and the money only moves to the merchant.", [
    ["RC", "await_accept", "Waiting on the kitchen", "FOOD"], ["RC", "confirm_call", "They call to confirm", "FOOD"],
    ["RC", "pay_push", "Push · payment requested", "FOOD"], ["RC", "pay_now", "Pay the restaurant", "FOOD"],
    ["RC", "pay_wait", "Prompt sent", "FOOD"], ["RC", "pay_manual", "Paid another way", "FOOD"], ["RC", "pay_confirmed", "Waiting to be confirmed", "FOOD"],
  ]],
  ["Track", "One tracker grammar, two step vocabularies — plus the prep countdown food adds.", [
    ["RC", "track_prep", "Prep countdown", "FOOD"], ["RC", "track_secured", "Rider secured", "FOOD"], ["RC", "track_way", "On the way", "FOOD"],
    ["LJ", "track_code", "Tracking · code issued", "PARCEL"], ["LJ", "track_active", "Tracking · live", "PARCEL"],
  ]],
  ["Hand-off & close", "The same 6-digit code closes both. Food adds the money handshake before the code appears.", [
    ["RC", "handoff", "Pay at the door", "FOOD"], ["RC", "handoff_wait", "Waiting for rider confirm", "FOOD"], ["RC", "handoff_code", "Both confirmed · code", "FOOD"],
    ["RC", "delivered_rate", "Delivered · rate the food", "FOOD"],
    ["LJ", "delivered_rate", "Delivered · rate the rider", "PARCEL"], ["LJ", "completed", "Completed", "PARCEL"],
    ["LJ", "rate_undo", "Rating sent · undo", "PARCEL"],
  ]],
  ["Account & support", "One account, one history, one help desk for everything the customer orders.", [
    ["LJ", "profile", "Account", ""], ["LJ", "history", "Orders · all services", "BOTH"], ["LJ", "notifications", "Notifications", ""],
    ["LJ", "notif_empty", "Notifications · empty", ""], ["LJ", "help", "Help & support", ""], ["LJ", "settings", "Settings", ""],
    ["LJ", "settings_perms", "Settings · real permissions", ""], ["LJ", "settings_perms_ok", "Settings · all granted", ""],
    ["LJ", "privacy", "Privacy", ""], ["LJ", "delete_account", "Delete account", ""], ["LJ", "delete_final", "Delete · final confirm", ""],
    ["LJ", "phone_masked", "Order ended · numbers masked", "BOTH"],
  ]],
  ["Trust & safety", "SOS, report + block, and get-help-with-this-order — identical whichever service is running.", [
    ["LJ", "sos_idle", "SOS · live-trip control", "BOTH"], ["LJ", "sos_confirm", "SOS · confirm", "BOTH"], ["LJ", "sos_contacts", "SOS · contacts", "BOTH"],
    ["LJ", "sos_error", "SOS · log failed (offline)", "BOTH"], ["LJ", "report", "Report + block rider", "BOTH"], ["LJ", "report_done", "Report sent", "BOTH"],
    ["LJ", "trip_help", "Get help with this order", "BOTH"], ["LJ", "trip_help_sent", "Issue logged", "BOTH"],
  ]],
  ["Exceptions & edge", "Every branch that isn't the happy path, plus the overlays that can interrupt any screen.", [
    ["RC", "list_empty", "Nothing open", "FOOD"], ["RC", "list_error", "Offline list", "FOOD"], ["RC", "menu_closed", "Closed restaurant", "FOOD"],
    ["RC", "closed_interrupt", "Closes while browsing", "FOOD"], ["RC", "cart_oos", "Item sold out", "FOOD"], ["RC", "cart_price", "Price changed", "FOOD"],
    ["RC", "cart_empty", "Empty cart", "FOOD"], ["RC", "cart_min", "Under the minimum", "FOOD"], ["RC", "checkout_offline", "Offline mid-checkout", "FOOD"],
    ["RC", "pay_open", "Still unpaid · reminder", "FOOD"], ["RC", "pay_failed", "Payment declined", "FOOD"], ["RC", "item_removed", "One item unavailable", "FOOD"],
    ["RC", "no_rider", "NO_RIDER", "FOOD"], ["RC", "track_paused", "Live paused", "FOOD"], ["RC", "rejected", "Rejected · refund pending", "FOOD"], ["RC", "refunded", "Refunded", "FOOD"],
    ["RC", "cancel_sheet", "Cancel pre-pickup", "FOOD"], ["RC", "rider_cancelled", "Rider cancelled · re-finding", "FOOD"],
    ["RC", "handoff_dispute", "Rider didn't confirm", "FOOD"], ["RC", "failed_noshow", "No-show · returned", "FOOD"], ["RC", "resume", "App resumed mid-order", "FOOD"],
    ["LJ", "no_riders", "No riders online", "PARCEL"], ["LJ", "select_race", "Rider just taken", "PARCEL"], ["LJ", "auction_expired", "Auction expired", "PARCEL"],
    ["LJ", "rider_cancelled", "Rider cancelled", "PARCEL"], ["LJ", "track_paused", "Live paused", "PARCEL"], ["LJ", "cancel", "Cancel · reason", "PARCEL"],
    ["LJ", "cancelled", "Cancelled", "PARCEL"], ["LJ", "undelivered", "Not delivered", "PARCEL"], ["LJ", "track_dark", "Rider went dark", "PARCEL"],
    ["LJ", "otp_cooldown", "OTP · resend cooldown", ""], ["LJ", "otp_resent", "OTP · code re-sent", ""], ["LJ", "otp_locked", "OTP · expired / locked", ""],
    ["LJ", "offline", "Offline banner", ""], ["LJ", "on_hold", "Account on hold", ""], ["LJ", "force_update", "Force update", ""],
    ["LJ", "no_gps", "Location off / no GPS", ""], ["LJ", "generic_error", "Generic error", ""],
    ["LJ", "conn_reconnecting", "Reconnecting banner", ""], ["LJ", "stale_cache_empty", "Offline · nothing saved", ""],
    ["LJ", "order_restore_error", "Restore failed", "BOTH"], ["LJ", "draft_discard", "Discard draft · confirm", "PARCEL"],
  ]],
];

const RIDER = [
  ["First run & sign in", "Identical to the customer up to the role fork — one app, one account.", [
    ["RJ", "splash", "Splash", ""], ["RJ", "onboard", "Onboarding · rider", ""], ["RJ", "login", "Phone sign-in", ""],
    ["RJ", "otp", "SMS OTP", ""], ["RJ", "role_select", "Choose your role", ""],
    ["RJ", "perm_loc", "Permission · location", ""], ["RJ", "perm_notif", "Permission · notifications", ""],
  ]],
  ["Become a rider (KYC)", "A verified ID and bike before anything else — the same gate whichever service sends the job.", [
    ["RJ", "kyc_intro", "Become a rider", ""], ["RJ", "kyc_form", "KYC form + consent", ""], ["RJ", "photo_capture", "ID photo · capture", ""],
    ["RJ", "photo_preview", "ID photo · preview", ""], ["RJ", "photo_uploading", "ID photo · uploading", ""],
    ["RJ", "kyc_pending", "Verification pending", ""],
    ["RJ", "kyc_unfinished", "Verification not finished", ""], ["RJ", "kyc_cant_start", "Couldn't open the ID check", ""],
    ["RJ", "kyc_verified", "Verified", ""],
  ]],
  ["Online & the one board", "Online means online for everything: parcels and food land in one list, each card tagged. Taken jobs simply leave the list.", [
    ["RJM", "offline", "Offline", "BOTH"], ["RJM", "board", "Jobs · one list", "BOTH"], ["RJM", "board_empty", "Online · nothing in range", "BOTH"],
    ["RJM", "notifications", "One inbox", "BOTH"],
    ["RJM", "board_food_off", "Jobs · food dispatch off", "PARCEL"], ["RJM", "board_empty_food_off", "Food off · nothing in range", "PARCEL"],
  ]],
  ["Taking a job", "The only real difference between the services: a food fare is fixed and accepted, a parcel fare is yours to name.", [
    ["RJM", "offer_parcel", "Parcel · name your fare", "PARCEL"], ["RJ", "offer_sent", "Offer sent · waiting", "PARCEL"], ["RJ", "picked", "Customer picked you", "PARCEL"],
    ["RJM", "offer_food", "Food · accept the job", "FOOD"], ["RR", "offer_cash", "Food · CASH collect", "FOOD"],
    ["RR", "offer_upfront", "Food · kitchen wants upfront", "FOOD"], ["RR", "offer_wallet", "Food · already paid", "FOOD"],
  ]],
  ["The active job", "One job at a time, one screen, one tracker with per-service step copy. Cash you carry is split: yours vs owed to a kitchen.", [
    ["RJM", "active_parcel", "Active · parcel", "PARCEL"], ["RJ", "job_assigned", "Job · assigned", "PARCEL"], ["RJ", "job_pickup", "En route to pickup", "PARCEL"],
    ["RJ", "job_verify", "Verify items at pickup", "PARCEL"], ["RJ", "job_collect", "Parcel collected", "PARCEL"], ["RJ", "job_dropoff", "En route to drop-off", "PARCEL"],
    ["RJM", "active_food", "Active · food", "FOOD"], ["RR", "nav_rest", "To the restaurant", "FOOD"], ["RR", "pay_merchant", "Pay the merchant", "FOOD"],
    ["RR", "pickup_confirm", "Collect · CASH job", "FOOD"], ["RR", "pickup_paid", "Collect · already PAID", "FOOD"], ["RR", "nav_cust", "To the customer", "FOOD"],
    ["RR", "doorstep", "Collect · confirm cash", "FOOD"],
    ["RJM", "handoff", "Delivery code", "BOTH"], ["RJ", "job_handoff", "Hand-off · parcel", "PARCEL"], ["RJ", "job_delivered", "Delivered", "PARCEL"],
    ["RR", "delivered", "Delivered · food", "FOOD"], ["RR", "return_cash", "Return the kitchen's cash", "FOOD"],
    ["RJM", "pickup_photo", "Proof of pickup · capture", "PARCEL"], ["RJM", "pickup_photo_preview", "Proof of pickup · preview", "PARCEL"],
  ]],
  ["Money", "One prepaid commission balance for both services, one ledger, one gate when it runs out.", [
    ["RJM", "money", "Money tab", "BOTH"], ["RJM", "gate_topup", "Gate · top up to keep riding", "BOTH"], ["RJ", "topup_amount", "Top up · amount", "BOTH"],
    ["RJ", "topup_wait", "Payment prompt · wait", "BOTH"], ["RJ", "topup_success", "Top up · success", "BOTH"], ["RJ", "wallet_low", "Balance low", "BOTH"],
  ]],
  ["Account & support", "One identity, one set of documents, one job history — whatever the rider carries.", [
    ["RJM", "account", "Account", ""], ["RJ", "bike_docs", "Bike & documents", ""], ["RJ", "history", "Job history", "BOTH"],
    ["RJ", "settings", "Settings", ""], ["RJ", "help", "Help & support", ""],
    ["RJM", "strikes", "Reliability · strikes", ""],
  ]],
  ["Trust & safety", "SOS, report + block, get-help-with-this-job — one set for both services.", [
    ["RJ", "sos_idle", "SOS · live-job control", "BOTH"], ["RJ", "sos_confirm", "SOS · confirm", "BOTH"], ["RJ", "sos_contacts", "SOS · contacts", "BOTH"],
    ["RJ", "report", "Report + block customer", "BOTH"], ["RJ", "report_done", "Report sent", "BOTH"],
    ["RJ", "job_help", "Get help with this job", "BOTH"], ["RJ", "job_help_sent", "Issue logged", "BOTH"],
  ]],
  ["Exceptions & edge", "Lost jobs, refused hand-offs, gate refusals and the overlays that can interrupt any screen.", [
    ["RJ", "missed_order", "Job taken first", "PARCEL"], ["RJ", "not_chosen", "Not chosen", "PARCEL"], ["RJ", "bid_expired", "Auction expired · no pick", "PARCEL"],
    ["RJ", "handoff_wrong", "Wrong code · lockout", "PARCEL"], ["RJ", "undelivered", "Not delivered", "PARCEL"], ["RJ", "job_bail", "Rider cancels (bail)", "PARCEL"],
    ["RJ", "job_offline", "Connection lost mid-job", "PARCEL"], ["RJ", "job_cancelled", "Customer cancelled", "PARCEL"],
    ["RR", "offer_expired", "Offer expired", "FOOD"], ["RR", "cancel_reason", "Drop the job · before pickup", "FOOD"], ["RR", "cancel_blocked", "Can't drop after collecting", "FOOD"],
    ["RR", "cash_dispute", "Customer confirmed, you didn't", "FOOD"], ["RR", "code_wrong", "Wrong code", "FOOD"], ["RR", "unreachable", "Customer unreachable", "FOOD"],
    ["RR", "return_rest", "Return to restaurant", "FOOD"], ["RR", "handback", "Hand back confirm", "FOOD"], ["RR", "offline_resume", "Resumed mid-delivery", "FOOD"],
    ["RJ", "kyc_failed", "Verification failed", ""], ["RJ", "kyc_expired", "ID expired (later)", ""], ["RJ", "photo_failed", "ID photo · upload failed", ""],
    ["RJ", "gate_out_of_area", "Gate · out of area", ""], ["RJ", "gate_cooldown", "Gate · cooldown", ""], ["RJ", "gate_banned", "Gate · account closed", ""],
    ["RJ", "gate_kyc_locked", "Gate · verification locked", ""], ["RJ", "topup_declined", "Top up · declined", "BOTH"],
    ["RJ", "offline", "Offline banner", ""], ["RJ", "on_hold", "Account on hold", ""], ["RJ", "force_update", "Force update", ""],
    ["RJ", "no_gps", "Location off / no GPS", ""], ["RJ", "generic_error", "Generic error", ""],
    ["RJM", "pickup_photo_failed", "Proof photo · upload failed", "PARCEL"], ["RJM", "strikes_final", "One strike from a pause", ""],
  ]],
];

/* Merchant — the kitchen tablet. Food-only by definition, so no service tags. */
const MERCHANT = (window.RGD ? window.RGD.MERCHANT : []).map(([title, sub, tiles]) => [
  title.replace(/^Act \d+ · /, ""), sub, tiles.map(([id, , t]) => ["RM", id, t, ""]),
]);

window.GMAP = { CUSTOMER, RIDER, MERCHANT };
})();
