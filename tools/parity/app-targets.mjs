/**
 * App-side targets, keyed by `${src}.${id}` (the same key as screens.generated.json).
 *
 * This is the ONE hand-maintained half of the registry, and it grows per-screen as each screen is
 * aligned. A screen with no entry here still renders its MOCK; its app column shows an honest
 * "pending". Phase 1 seeded 4 screens to prove each render path; Phase 2 wired the primary populated
 * state of every top-level app route across all four surfaces (customer food + send/auth/account,
 * rider, admin, merchant login).
 *
 * Shapes:
 *   mobile:  { kind:"mobile", component:"app/(tabs)/home.tsx", fixture:"home", mode?:"phone" }
 *            component = path (from apps/mobile/) of the default-exported screen; fixture = a key in
 *            tools/parity/mobile/fixtures/ providing the mocked router/providers/props for that screen.
 *   web:     { kind:"web", app:"admin"|"merchant", route:"/orders", mode?:"admin"|"tablet",
 *              waitFor?:"css-selector" }  — Playwright screenshots the running Next dev server.
 *
 * Bring the web servers up first for the web rows: `node serve-web.mjs admin` (:4311) and
 * `node serve-web.mjs merchant` (:4312), in separate shells (or the harness background flag).
 */
export const APP_TARGETS = {
  // ─────────────────────────── MOBILE — customer · food (RC) ───────────────────────────
  "RC.home": { kind: "mobile", component: "app/(tabs)/home.tsx", fixture: "food_home" },
  "RC.orders": { kind: "mobile", component: "app/(tabs)/orders.tsx", fixture: "food_orders" },
  "RC.list": { kind: "mobile", component: "app/food/index.tsx", fixture: "food_list" },
  "RC.search": { kind: "mobile", component: "app/food/search.tsx", fixture: "food_search" },
  "RC.menu": { kind: "mobile", component: "app/food/[id].tsx", fixture: "food_menu" },
  "RC.cart": { kind: "mobile", component: "app/food/cart.tsx", fixture: "food_cart" },
  "RC.checkout_cash": { kind: "mobile", component: "app/food/checkout.tsx", fixture: "food_checkout_cash" },
  "RC.checkout_wallet": { kind: "mobile", component: "app/food/checkout.tsx", fixture: "food_checkout_wallet" },
  "RC.track_way": { kind: "mobile", component: "app/food/order/[orderId].tsx", fixture: "food_track_way" },
  "RC.pay_now": { kind: "mobile", component: "app/food/order/[orderId].tsx", fixture: "food_pay_now" },
  "RC.delivered_rate": { kind: "mobile", component: "app/food/order/[orderId].tsx", fixture: "food_delivered_rate" },
  "RC.await_accept": { kind: "mobile", component: "app/food/order/[orderId].tsx", fixture: "food_await_accept" },
  "RC.item_removed": { kind: "mobile", component: "app/food/order/[orderId].tsx", fixture: "food_item_removed" },
  "RC.pay_confirmed": { kind: "mobile", component: "app/food/order/[orderId].tsx", fixture: "food_pay_confirmed" },
  "RC.rejected": { kind: "mobile", component: "app/food/order/[orderId].tsx", fixture: "food_rejected" },
  "RC.refunded": { kind: "mobile", component: "app/food/order/[orderId].tsx", fixture: "food_refunded" },
  "RC.orders_empty": { kind: "mobile", component: "app/(tabs)/orders.tsx", fixture: "food_orders_empty" },
  "RC.cart_empty": { kind: "mobile", component: "app/food/cart.tsx", fixture: "food_cart_empty" },
  "RC.menu_closed": { kind: "mobile", component: "app/food/[id].tsx", fixture: "food_menu_closed" },
  "RC.list_loading": { kind: "mobile", component: "app/food/index.tsx", fixture: "food_list_loading" },
  "RC.list_error": { kind: "mobile", component: "app/food/index.tsx", fixture: "food_list_error" },

  // ─────────────────────── MOBILE — customer · send + auth + account (LJ) ───────────────────────
  // The RN splash (app/index.tsx's boot state) is the drawn `Splash` mock; its tree lives in
  // app/splash.view.tsx, which is what the lane mounts — the native expo-splash-screen frame before
  // JS starts is the same picture and has no component to render.
  "LJ.splash": { kind: "mobile", component: "app/splash.view.tsx", fixture: "splash" },
  "LJ.force_update": { kind: "mobile", component: "app/force-update.tsx", fixture: "force_update" },
  "LJ.login": { kind: "mobile", component: "app/phone.tsx", fixture: "auth_phone" },
  "LJ.otp": { kind: "mobile", component: "app/verify.tsx", fixture: "auth_otp" },
  "LJ.otp_cooldown": { kind: "mobile", component: "app/verify.tsx", fixture: "auth_otp_cooldown" },
  "LJ.otp_resent": { kind: "mobile", component: "app/verify.tsx", fixture: "auth_otp_resent" },
  "LJ.otp_locked": { kind: "mobile", component: "app/verify.tsx", fixture: "auth_otp_locked" },
  "LJ.onboard": { kind: "mobile", component: "app/onboarding.tsx", fixture: "onboard_food" },
  "LJ.onboard_send": { kind: "mobile", component: "app/onboarding.tsx", fixture: "onboard_send" },
  "LJ.onboard_shared": { kind: "mobile", component: "app/onboarding.tsx", fixture: "onboard_shared" },
  "LJ.onboard_flag_off": { kind: "mobile", component: "app/onboarding.tsx", fixture: "onboard_flag_off" },
  "LJ.role_select": { kind: "mobile", component: "app/role.tsx", fixture: "auth_role" },
  "LJ.role_select_flag_off": { kind: "mobile", component: "app/role.tsx", fixture: "auth_role_flag_off" },
  "LJ.perm_loc": { kind: "mobile", component: "app/permissions.tsx", fixture: "auth_perms_loc" },
  "LJ.perm_notif": { kind: "mobile", component: "app/permissions.tsx", fixture: "auth_perms_notif" },
  "LJ.register": { kind: "mobile", component: "app/profile/setup.tsx", fixture: "auth_register" },
  "LJ.home_empty": { kind: "mobile", component: "app/send.tsx", fixture: "send_empty" },
  "LJ.home_pins": { kind: "mobile", component: "app/send.tsx", fixture: "send_pins" },
  "LJ.track_active": { kind: "mobile", component: "app/order/[id].tsx", fixture: "parcel_track_active" },
  "LJ.track_code": { kind: "mobile", component: "app/order/[id].tsx", fixture: "parcel_track_code" },
  "LJ.profile": { kind: "mobile", component: "app/(tabs)/account.tsx", fixture: "account_home" },
  "LJ.notifications": { kind: "mobile", component: "app/notifications/index.tsx", fixture: "notifications" },
  "LJ.notif_empty": { kind: "mobile", component: "app/notifications/index.tsx", fixture: "notifications_empty" },
  "LJ.privacy": { kind: "mobile", component: "app/settings/privacy.tsx", fixture: "privacy" },
  "LJ.delete_account": { kind: "mobile", component: "app/settings/delete-account.tsx", fixture: "delete_account" },
  "LJ.delete_final": { kind: "mobile", component: "app/settings/delete-account.tsx", fixture: "delete_final" },
  "LJ.help": { kind: "mobile", component: "app/help/index.tsx", fixture: "help" },
  "LJ.settings": { kind: "mobile", component: "app/settings/index.tsx", fixture: "settings" },
  "LJ.settings_perms": { kind: "mobile", component: "app/settings/index.tsx", fixture: "settings_perms" },
  "LJ.settings_perms_ok": { kind: "mobile", component: "app/settings/index.tsx", fixture: "settings_perms_ok" },
  "LJ.history": { kind: "mobile", component: "app/history/index.tsx", fixture: "history" },

  // ─────────────────────────── MOBILE — rider (RJM / RJ / RR) ───────────────────────────
  // The current rider design is RJM (one app: Jobs · Money · Account). RR/RJ food + parcel job
  // screens share the same app components, keyed by the state each mock draws.
  "RJM.board": { kind: "mobile", component: "app/rider/(tabs)/index.tsx", fixture: "rider_board" },
  "RJM.board_empty": { kind: "mobile", component: "app/rider/(tabs)/index.tsx", fixture: "rider_board_empty" },
  "RJM.money": { kind: "mobile", component: "app/rider/(tabs)/money.tsx", fixture: "rider_money" },
  "RJM.account": { kind: "mobile", component: "app/rider/(tabs)/account.tsx", fixture: "rider_account" },
  "RJM.offer_food": { kind: "mobile", component: "app/rider/food-offer.tsx", fixture: "rider_food_offer" },
  "RR.offer_cash": { kind: "mobile", component: "app/rider/food-offer.tsx", fixture: "rider_food_offer" },
  "RJM.active_food": { kind: "mobile", component: "app/rider/food-job.tsx", fixture: "rider_food_job" },
  "RR.nav_rest": { kind: "mobile", component: "app/rider/food-job.tsx", fixture: "rider_food_nav" },
  "RJ.job_assigned": { kind: "mobile", component: "app/rider/job.tsx", fixture: "rider_parcel_job" },
  "RJ.kyc_intro": { kind: "mobile", component: "app/rider/become.tsx", fixture: "rider_kyc_intro" },
  "RJ.bike_docs": { kind: "mobile", component: "app/rider/documents.tsx", fixture: "rider_documents" },
  "RJ.topup_amount": { kind: "mobile", component: "app/wallet/top-up.tsx", fixture: "rider_topup" },

  // ─────────────────────────── WEB — admin console (Next.js, :4311) ───────────────────────────
  // Rendered offline: with no API_BASE_URL the console paints its "API not connected" empty shell —
  // a faithful render of the console chrome with no API/DB/auth to stand up.
  "ADMIN.index.html": { kind: "web", app: "admin", route: "/", mode: "admin" },
  "ADMIN.orders.html": { kind: "web", app: "admin", route: "/orders", mode: "admin" },
  "ADMIN.riders.html": { kind: "web", app: "admin", route: "/riders", mode: "admin" },
  "ADMIN.customers.html": { kind: "web", app: "admin", route: "/customers", mode: "admin" },
  "ADMIN.cash.html": { kind: "web", app: "admin", route: "/cash", mode: "admin" },
  "ADMIN.kyc.html": { kind: "web", app: "admin", route: "/riders?kyc=pending", mode: "admin" },
  "ADMIN.issues.html": { kind: "web", app: "admin", route: "/issues", mode: "admin" },

  // ─────────────────────────── WEB — merchant tablet (Next.js, :4312) ───────────────────────────
  // Only /login renders offline. Every gated route client-redirects to sign-in without a live
  // authenticated API (its connection provider signs out when its token refresh can't reach the
  // backend) — point PARITY_MERCHANT_URL at a seeded instance to shoot the queue/menu/shop states.
  "RM.login": { kind: "web", app: "merchant", route: "/login", mode: "tablet" },
};
