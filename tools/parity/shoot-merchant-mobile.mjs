#!/usr/bin/env node
/**
 * The merchant mobile redesign's screenshot sheet (ledger D-48): each redesigned merchant screen at
 * 360×720 beside the handoff prototype's own drawing of it (packages/design/handoff/merchant-mobile/
 * Merchant Prototype (standalone).html). The prototype fills the page as a phone below 760px wide, and
 * it restores the screen and mode it last showed from localStorage, which is how each one is picked.
 *
 * The tablet's API is stubbed in the browser (every call to `<origin>/__api/**`), so no seeded backend
 * is needed: start the dev server with that same-origin base first —
 *
 *   API_BASE_URL=http://127.0.0.1:4312/__api node tools/parity/serve-web.mjs merchant
 *   node tools/parity/shoot-merchant-mobile.mjs --out docs/parity/MERCHANT-MOBILE-PR1-2026-09-30
 *   node tools/parity/shoot-merchant-mobile.mjs --set orders --out docs/parity/MERCHANT-MOBILE-ORDERS-2026-09-30
 *   node tools/parity/shoot-merchant-mobile.mjs --set menu --out docs/parity/MERCHANT-MOBILE-MENU-MONEY-2026-09-30
 *   node tools/parity/shoot-merchant-mobile.mjs --set account --out docs/parity/MERCHANT-MOBILE-ACCOUNT-2026-09-30
 *   node tools/parity/shoot-merchant-mobile.mjs --set shop --out docs/parity/MERCHANT-MOBILE-SHOP-2026-09-30
 *   node tools/parity/shoot-merchant-mobile.mjs --set branches --out docs/parity/MERCHANT-MOBILE-BRANCHES-2026-10-01
 *
 * `PARITY_NARROW=1` renders the app at the 320×640 entry-phone check instead of 360×720.
 */
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { contextDefaults, launch } from "./lib/browser.mjs";
import { buildSheet } from "./lib/sheet.mjs";

const ORIGIN = process.env.PARITY_MERCHANT_URL || "http://127.0.0.1:4312";
const outArg = process.argv.indexOf("--out");
const OUT = resolve(outArg > 0 ? process.argv[outArg + 1] : "out/merchant-mobile");
const SHOTS = `${OUT}-shots`;
const PROTO = pathToFileURL(resolve("../../packages/design/handoff/merchant-mobile/Merchant Prototype (standalone).html")).href;

const PHONE = process.env.PARITY_NARROW ? { width: 320, height: 640 } : { width: 360, height: 720 };
const setArg = process.argv.indexOf("--set");
/** `--set orders` shoots PR 2b's Orders screens, `--set menu` PR 3a's Menu and Money, `--set account` PR 3b's
 *  Hours, Team and Riders; the default is PR 1's. */
const SET = setArg > 0 ? process.argv[setArg + 1] : "pr1";

const SESSION = { accessToken: "parity", refreshToken: "parity.refresh", expiresIn: 900, issuedAt: Date.now(), profileId: "p-parity", role: "customer" };
const PIN = { point: { lat: -17.8575, lng: 31.0367 }, landmark: "5th Street, Mbare", contactPhone: "+263771234567" };
const PROFILE = {
  id: "m-parity",
  ownerPhoneMasked: "+263•••••4567",
  description: null,
  coverPhotoUrl: null,
  logoUrl: null,
  cuisineTags: [],
  priceLevel: null,
  hours: null,
  cashRule: "collect_and_return",
  busy: false,
  pilotEnabled: true,
  myRole: "owner",
  myName: "Farai Chari",
  location: PIN,
};
const RESTAURANT = { ...PROFILE, name: "Sadza Republic", businessType: "restaurant", shopKind: null };
const SHOP = { ...PROFILE, name: "Mbare Auto Spares", businessType: "shop", shopKind: "other" };
const INVITES = {
  invites: [{ id: "55555555-5555-4555-8555-555555555555", businessName: "Siyaso Spares", businessType: "shop", ownerName: "Farai", role: "staff", name: "Tendai", expiresAt: "2026-10-13T10:00:00.000Z" }],
};
const TEAM = {
  members: [
    { profileId: "11111111-1111-4111-8111-111111111111", name: "Farai Chari", phoneMasked: "+263•••••4567", role: "owner", you: true, joinedAt: "2026-09-20T10:00:00.000Z" },
    { profileId: "22222222-2222-4222-8222-222222222222", name: "Tendai", phoneMasked: "+263•••••2210", role: "staff", you: false, joinedAt: "2026-09-21T10:00:00.000Z" },
  ],
  invites: [{ id: "33333333-3333-4333-8333-333333333333", name: "Rudo", phoneMasked: "+263•••••9034", invitePhone: "263778889034", createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString(), expiresAt: "2026-10-13T10:00:00.000Z" }],
};
const prefRider = (id, label, over) => ({ id, label, phoneMasked: "+263•••••0000", status: "on_lyniago", online: false, invitePhone: null, jobs: 0, ratingAvg: null, rider: null, addedAt: "2026-09-20T10:00:00.000Z", ...over });
const RIDERS = {
  cap: 20,
  riders: [
    prefRider("r1000000-0000-4000-8000-000000000000", "Big Farai", { online: true, jobs: 12, ratingAvg: 4.9 }),
    prefRider("r2000000-0000-4000-8000-000000000000", "Blessing", {}),
    prefRider("r3000000-0000-4000-8000-000000000000", "Nyasha (cousin)", { status: "not_on_lyniago", invitePhone: "263771000006" }),
    prefRider("r4000000-0000-4000-8000-000000000000", "Tino", { status: "unavailable" }),
  ],
};

// ── PR 2b: the Orders screens (B1–B7) ─────────────────────────────────────────────────────────
const RIDER = { profileId: "11111111-1111-4111-8111-111111111111", firstName: "Blessing", lastName: "Moyo", photoUrl: null, ratingAvg: 4.9, ratingCount: 31, tripsCount: 120, vehicleInfo: null, plate: "AFG 2231", kycVerified: true };
const ago = (min) => new Date(Date.now() - min * 60_000).toISOString();
const ahead = (min) => new Date(Date.now() + min * 60_000).toISOString();
const line = (name, priceUsd, quantity = 1, note = null) => ({ dishId: `d-${name.length}`, name, priceUsd, quantity, note, available: null });
function order(id, over) {
  return {
    id, merchantId: "m-parity", status: "requested", merchantPhase: "preparing", items: [line("Mazondo", 5)], note: null, paymentMethod: "cash",
    merchantPaymentPhone: null, merchantGoodsTotal: 5, deliveryFee: 2, total: 7, acceptDeadlineAt: null, itemApprovalDeadlineAt: null, prepMinutes: 15,
    prepStartedAt: ago(5.7), readyAt: null, rejectionReason: null, paymentCallLoggedAt: null, paymentRequestedAt: null, merchantPaymentReference: null,
    merchantPaymentConfirmedAt: null, riderId: null, dispatchAttempt: 0, dispatchOfferExpiresAt: null, noRiderHoldAt: null, pickupCodeAttempts: 0,
    noShowCallTimestamps: [], createdAt: ago(20), ...over,
  };
}
const ORDERS = {
  cooking: order("a2220000-0000-4000-8000-000000000000", { items: [line("Mazondo", 5), line("Sadza & greens", 4.5)], merchantGoodsTotal: 9.5 }),
  handover: order("a4440000-0000-4000-8000-000000000000", { merchantPhase: null, status: "assigned", riderId: RIDER.profileId, rider: RIDER, items: [line("Mazondo", 5, 2)], merchantGoodsTotal: 10 }),
  tracking: order("a1110000-0000-4000-8000-000000000000", {
    merchantPhase: null, status: "en_route_dropoff", riderId: RIDER.profileId, rider: RIDER, items: [line("Sadza & beef stew", 4.5, 2), line("Mazoe orange 2L", 3)],
    merchantGoodsTotal: 12, debtStatus: "open", debtAmount: 12, prepStartedAt: ago(27),
    timeline: [{ status: "requested", at: ago(27) }, { status: "assigned", at: ago(26) }, { status: "picked_up", at: ago(13) }, { status: "en_route_dropoff", at: ago(12) }],
  }),
  delivered: order("a9990000-0000-4000-8000-000000000000", {
    merchantPhase: null, status: "delivered", riderId: RIDER.profileId, rider: RIDER, merchantGoodsTotal: 12, debtStatus: "open", debtAmount: 12,
    deliveredAt: ago(8), cashDueAt: ahead(22), prepStartedAt: ago(35),
  }),
  ringing: order("a1110000-0000-4000-8000-000000000001", {
    merchantPhase: "awaiting_accept", prepMinutes: null, prepStartedAt: null, acceptDeadlineAt: ahead(1.24),
    items: [line("Sadza & beef stew", 4.5, 2, "Pack the sadza separately please"), line("Mazoe orange 2L", 3)], merchantGoodsTotal: 12,
  }),
};
const BOARD = [ORDERS.cooking, order("a2230000-0000-4000-8000-000000000000", {}), ORDERS.handover, ORDERS.tracking];
const SUMMARY = { date: "2026-09-30", delivered: 6, rejected: 0, cashTaken: 30, walletTaken: 0, averagePrepMinutes: 15, orders: 7, sales: 59.5, cashOverdue: 9.5, overdue: [] };
const KITCHEN = { ...PROFILE, name: "Sadza Republic", businessType: "restaurant", shopKind: null, hours: Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, { open: "08:00", close: "22:00" }])) };

// ── PR 3a: Menu (C1, C2, E1) and Money (C3) ───────────────────────────────────────────────────
const at = (h, m) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.toISOString(); };
const cat = (id, name, sortOrder, dishCount) => ({ id, name, sortOrder, availableFrom: null, availableTo: null, hidden: false, dishCount });
const dish = (id, categoryId, name, priceUsd, over = {}) => ({ id, categoryId, name, description: null, priceUsd, photoUrl: null, isDraft: false, outOfStock: false, outOfStockUntil: null, sortOrder: 0, ...over });
const C_MAINS = "c1000000-0000-4000-8000-000000000000";
const C_DRINKS = "c2000000-0000-4000-8000-000000000000";
const MENU = {
  categories: [cat(C_MAINS, "Mains", 0, 3), cat(C_DRINKS, "Drinks", 1, 1)],
  dishes: [
    dish("d1000000-0000-4000-8000-000000000000", C_MAINS, "Mazondo", 5),
    dish("d2000000-0000-4000-8000-000000000000", C_MAINS, "Sadza & beef stew", 4.5),
    dish("d3000000-0000-4000-8000-000000000000", C_MAINS, "Sadza & road-runner", 6, { outOfStock: true, outOfStockUntil: at(23, 59) }),
    dish("d4000000-0000-4000-8000-000000000000", C_DRINKS, "Mazoe orange 2L", 3),
  ],
};
const C_BRAKES = "c3000000-0000-4000-8000-000000000000";
const ITEMS = {
  categories: [cat(C_BRAKES, "Brakes", 0, 2), cat("c4000000-0000-4000-8000-000000000000", "Engine", 1, 0)],
  dishes: [dish("d5000000-0000-4000-8000-000000000000", C_BRAKES, "Brake pads", 18), dish("d6000000-0000-4000-8000-000000000000", C_BRAKES, "Car battery", 65)],
};
const MONEY_SUMMARY = {
  ...SUMMARY,
  overdue: [{ orderId: "a0980000-0000-4000-8000-000000000000", amount: 9.5, riderName: "Tino", dueAt: at(11, 40) }],
  lines: [
    { orderId: "a1110000-0000-4000-8000-000000000000", at: at(12, 31), outcome: "delivered", amount: 12 },
    { orderId: "a0980000-0000-4000-8000-000000000000", at: at(11, 52), outcome: "delivered", amount: 9.5 },
    { orderId: "a0950000-0000-4000-8000-000000000000", at: at(11, 30), outcome: "delivered", amount: 14 },
    { orderId: "a0900000-0000-4000-8000-000000000000", at: at(11, 10), outcome: "rejected", amount: 0 },
  ],
};
const WEEK = { rangeStart: ago(7 * 1440), rangeEnd: ago(0), ordersDelivered: 0, foodSalesTotal: 0, commissionRatePct: 0, commissionCharged: 0, illustrativeRatePct: 10, illustrativeCommission: 0, cookedFoodLossTotal: 0, lineItems: [] };

// ── PR 4a: the shop (D1–D5, D7) ───────────────────────────────────────────────────────────────
const bookRider = { name: "Blessing Moyo", phone: "+263772222222", bikeReg: "AFG 2231" };
function booking(id, over) {
  return {
    id, state: "coming", status: "assigned", createdAt: ago(31), expiresAt: null,
    dropoff: { point: { lat: -17.79, lng: 31.04 }, landmark: "12 Fife Ave, Avondale", contactPhone: "+263779982210" },
    itemsSummary: "2× Brake pads (front) · 1× Oil filter", declaredValue: "51.00", proposedFare: "3.50", agreedFare: "3.50", bookedBy: "Farai",
    rider: bookRider, offerCount: 0, undeliveredReason: null, cancelledBy: null, cancelReason: null, rebroadcastedToId: null, rebroadcastOfId: null,
    codeIssuedAt: ago(20), offers: [], ...over,
  };
}
const offer = (id, name, fare, eta, rating, trips, over = {}) => ({
  id, type: "counter", offeredFare: fare, etaMinutes: eta, rider: { name, photoUrl: null, ratingAvg: rating, ratingCount: 20, tripsCount: trips }, preferred: false, ownMember: false, ...over,
});
const BOOKINGS = {
  finding: booking("b1000000-0000-4000-8000-000000000000", {
    state: "finding", status: "open_for_offers", itemsSummary: "Car battery", proposedFare: "4.20", agreedFare: null, rider: null, expiresAt: ahead(1.03), offerCount: 3,
    dropoff: { point: { lat: -17.83, lng: 31.05 }, landmark: "Copacabana rank", contactPhone: "+263779982210" },
    offers: [
      offer("o1000000-0000-4000-8000-000000000000", "Kuda Moyo", "3.80", 4, 4.7, 150),
      offer("o2000000-0000-4000-8000-000000000000", "Tendai Phiri", "5.00", 3, 4.4, 44),
      offer("o3000000-0000-4000-8000-000000000000", "Farai Chari", "4.20", 6, 4.9, 120, { preferred: true, type: "accept" }),
    ],
  }),
  coming: booking("b2000000-0000-4000-8000-000000000000", { state: "picked_up", status: "en_route_dropoff", itemsSummary: "Brake pads" }),
  tracking: booking("b3000000-0000-4000-8000-000000000000", {
    state: "picked_up", status: "en_route_dropoff", cashOnDelivery: { amount: "51.00", status: "awaiting_delivery", dueAt: null },
  }),
  delivered: booking("b4000000-0000-4000-8000-000000000000", { state: "delivered", status: "delivered", cashOnDelivery: { amount: "51.00", status: "due", dueAt: ahead(29) } }),
};
const SHOP_ME = { ...SHOP, hours: Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, { open: "08:00", close: "18:00" }])) };
const SHOP_ITEMS = [
  { id: "d7000000-0000-4000-8000-000000000000", categoryId: "c3000000-0000-4000-8000-000000000000", name: "Brake pads (front)", description: null, priceUsd: 22, photoUrl: null, isDraft: false, outOfStock: false, sortOrder: 0 },
  { id: "d8000000-0000-4000-8000-000000000000", categoryId: "c3000000-0000-4000-8000-000000000000", name: "Oil filter", description: null, priceUsd: 7, photoUrl: null, isDraft: false, outOfStock: false, sortOrder: 1 },
];

function apiRoute(route, scenario) {
  const path = new URL(route.request().url()).pathname.replace(/^\/__api/, "");
  const json = (status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  if (path === "/merchant/orders") return json(200, scenario.orders ?? []);
  if (path === "/merchant/bookings") return json(200, scenario.bookings ?? []);
  const bk = path.match(/^\/merchant\/bookings\/([0-9a-f-]+)$/);
  if (bk) return json(200, (scenario.bookings ?? []).find((b) => b.id === bk[1]) ?? {});
  const one = path.match(/^\/merchant\/orders\/([0-9a-f-]+)$/);
  if (one) return json(200, (scenario.orders ?? []).find((o) => o.id === one[1]) ?? {});
  if (/\/pickup-code\/reveal$/.test(path)) return json(200, { pickupCode: "7205" });
  if (path === "/merchant/summary/today") return json(200, scenario.summary ?? SUMMARY);
  if (path === "/merchant/statement/weekly") return json(200, WEEK);
  if (path === "/merchant/categories") return json(200, scenario.menu?.categories ?? []);
  if (path === "/merchant/dishes") return json(200, scenario.menu?.dishes ?? []);
  if (path === "/merchant/bookings" && route.request().method() === "POST") return json(201, BOOKINGS.finding);
  if (path === "/auth/otp/request") return json(200, { sent: true, channel: "bird-verify", deliveryChannel: "whatsapp" });
  if (path === "/auth/me") return json(200, { firstName: "Farai", lastName: "Chari", phone: "+263771234567" });
  if (path === "/merchant/me") return scenario.me ? json(200, scenario.me) : json(403, { reason: "not_a_member", message: "Not on a business." });
  if (path === "/merchant/invites") return json(200, scenario.invites ?? { invites: [] });
  if (path === "/merchant/team") return json(200, TEAM);
  if (path === "/merchant/riders") return json(200, RIDERS);
  if (path === "/merchant/branches") return json(200, scenario.branches ?? { branches: [] });
  return json(200, []);
}

async function shootApp(browser, { name, path, scenario = {}, signedIn = true, before }) {
  const ctx = await browser.newContext(contextDefaults({ viewport: PHONE, deviceScaleFactor: 2 }));
  if (signedIn) await ctx.addCookies([{ name: "lynia_merchant_session", value: encodeURIComponent(JSON.stringify(SESSION)), url: ORIGIN }]);
  await ctx.route("**/__api/**", (route) => apiRoute(route, scenario));
  await ctx.route("**/socket.io/**", (route) => route.abort());
  await ctx.grantPermissions(["geolocation"], { origin: ORIGIN });
  await ctx.setGeolocation({ latitude: PIN.point.lat, longitude: PIN.point.lng });
  const page = await ctx.newPage();
  try {
    await page.goto(ORIGIN + path, { waitUntil: "networkidle", timeout: 90000 });
    if (before) await before(page);
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    await page.evaluate(() => (document.fonts ? document.fonts.ready : null));
    await page.waitForTimeout(500);
    const file = join(SHOTS, `app-${name}.png`);
    await page.screenshot({ path: file });
    return file;
  } finally {
    await ctx.close();
  }
}

async function shootProto(browser, id, mode = "rest") {
  const ctx = await browser.newContext(contextDefaults({ viewport: PHONE, deviceScaleFactor: 2 }));
  await ctx.addInitScript(([screen, m]) => {
    localStorage.setItem("lgm-screen", screen);
    localStorage.setItem("lgm-mode", m);
  }, [id, mode]);
  const page = await ctx.newPage();
  try {
    await page.goto(PROTO, { waitUntil: "load" });
    await page.waitForTimeout(2500);
    const file = join(SHOTS, `mock-${id}.png`);
    await page.screenshot({ path: file });
    return file;
  } finally {
    await ctx.close();
  }
}

const toCode = async (page) => {
  await page.getByLabel("Phone number").fill("771234567");
  await page.getByRole("button", { name: "Send code", exact: true }).click();
  await page.getByLabel("6-digit code").fill("481");
};
const toStep2 = async (page) => {
  await page.getByRole("radio", { name: "Restaurant" }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByLabel("Business name").fill("Sadza Republic");
  await page.getByRole("button", { name: "Use my current location" }).click();
  await page.getByText("From your phone’s location").waitFor();
};
const pickRestaurant = async (page) => page.getByRole("radio", { name: "Restaurant" }).click();
const signOutSheet = async (page) => page.getByRole("button", { name: "Sign out" }).click();

const ORDER_ROWS = [
  { id: "B1", label: "B1 · Orders home", sub: "Cooking selected here: a new order always rings full-screen (B2), so the New card sits under it", app: { name: "B1", path: "/queue", scenario: { me: KITCHEN, orders: BOARD }, before: async (p) => p.getByRole("tab", { name: /Cooking/ }).click() } },
  { id: "B2", label: "B2 · New order ringing", app: { name: "B2", path: "/queue", scenario: { me: KITCHEN, orders: [ORDERS.ringing] } } },
  { id: "B3", label: "B3 · Cooking ticket", sub: "no 'Rider secured' — dispatch stays at 'Food is ready' (owner decision)", app: { name: "B3", path: `/queue/order?id=${ORDERS.cooking.id}`, scenario: { me: KITCHEN, orders: [ORDERS.cooking] } } },
  { id: "B4", label: "B4 · Handover", sub: "the code is the rider's to type (owner decision); ✓ appears once they have", app: { name: "B4", path: `/queue/order?id=${ORDERS.handover.id}`, scenario: { me: KITCHEN, orders: [ORDERS.handover] } } },
  { id: "B5", label: "B5 · Closed", sub: "the offline bar shows only when the connection is really lost", app: { name: "B5", path: "/queue", scenario: { me: { ...KITCHEN, closedUntil: ahead(600) }, orders: [] } } },
  { id: "B6", label: "B6 · Tracking", sub: "map: OSM around the kitchen (no live rider position yet), no ETA pill", app: { name: "B6", path: `/queue/order?id=${ORDERS.tracking.id}`, scenario: { me: KITCHEN, orders: [ORDERS.tracking] } } },
  { id: "B7", label: "B7 · Delivered + cash back", app: { name: "B7", path: `/queue/order?id=${ORDERS.delivered.id}`, scenario: { me: KITCHEN, orders: [ORDERS.delivered] } } },
];

const MENU_ROWS = [
  { id: "C1", label: "C1 · Menu", sub: "the off line reads until when it comes back (from the API)", app: { name: "C1", path: "/menu", scenario: { me: KITCHEN, menu: MENU } } },
  {
    id: "C2",
    label: "C2 · Out-of-stock sheet",
    app: { name: "C2", path: "/menu", scenario: { me: KITCHEN, menu: MENU }, before: async (p) => p.getByRole("switch", { name: "Mazondo in stock" }).click() },
  },
  { id: "C3", label: "C3 · Money", app: { name: "C3", path: "/statement", scenario: { me: KITCHEN, summary: MONEY_SUMMARY } } },
  { id: "E1", label: "E1 · Items (shop)", mode: "shop", app: { name: "E1", path: "/menu", scenario: { me: { ...SHOP, hours: KITCHEN.hours }, menu: ITEMS } } },
];

const ACCOUNT_ROWS = [
  {
    id: "C5",
    label: "C5 · Opening hours",
    app: { name: "C5", path: "/hours", scenario: { me: { ...KITCHEN, hours: Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat"].map((d) => [d, { open: "08:00", close: "22:00" }])) } } },
  },
  { id: "E2", label: "E2 · Team", app: { name: "E2", path: "/team", scenario: { me: KITCHEN } } },
  { id: "E3", label: "E3 · Person sheet", sub: "no Owner / Staff switch: the API keeps one owner per business (ledgered)", app: { name: "E3", path: "/team", scenario: { me: KITCHEN }, before: async (p) => p.getByRole("button", { name: /Tendai/ }).click() } },
  { id: "E4", label: "E4 · Preferred riders", app: { name: "E4", path: "/riders", scenario: { me: KITCHEN } } },
];

const toD3 = async (p) => {
  await p.getByLabel("Search street or area, or paste the buyer's location").fill("-17.79, 31.04");
  await p.getByLabel("Buyer’s phone").fill("779982210");
  await p.getByRole("button", { name: "Next", exact: true }).click();
  for (const name of [/Brake pads \(front\)/, /Brake pads \(front\)/, /Oil filter/]) {
    await p.getByRole("button", { name: "From your items" }).click();
    await p.getByRole("dialog", { name: "Your items" }).getByRole("button", { name }).click();
  }
  await p.getByRole("switch", { name: "Buyer pays cash on delivery" }).click();
};
const SHOP_ROWS = [
  {
    id: "D1",
    label: "D1 · Shop Orders home",
    mode: "shop",
    sub: "no New · Packing · Ready yet: shops take no customer orders (owner decision)",
    app: { name: "D1", path: "/deliveries", scenario: { me: SHOP_ME, bookings: [BOOKINGS.finding, BOOKINGS.coming] } },
  },
  {
    id: "D2",
    label: "D2 · Book · where",
    mode: "shop",
    sub: "keyless run: a pasted location stands in for a Places result",
    app: {
      name: "D2",
      path: "/deliveries/new",
      scenario: { me: SHOP_ME },
      before: async (p) => {
        await p.getByLabel("Search street or area, or paste the buyer's location").fill("-17.79, 31.04");
        await p.getByLabel("Buyer’s phone").fill("779982210");
      },
    },
  },
  { id: "D3", label: "D3 · Book · what + fare", mode: "shop", app: { name: "D3", path: "/deliveries/new", scenario: { me: SHOP_ME, menu: { dishes: SHOP_ITEMS } }, before: toD3 } },
  { id: "D4", label: "D4 · Offers", mode: "shop", app: { name: "D4", path: `/deliveries/booking?id=${BOOKINGS.finding.id}`, scenario: { me: SHOP_ME, bookings: [BOOKINGS.finding] } } },
  {
    id: "D5",
    label: "D5 · Tracking",
    mode: "shop",
    sub: "code shown to whoever picked; this browser didn't · no ETA · a cash-on-delivery booking (PR 4b)",
    app: { name: "D5", path: `/deliveries/booking?id=${BOOKINGS.tracking.id}`, scenario: { me: SHOP_ME, bookings: [BOOKINGS.tracking] } },
  },
  { id: "D7", label: "D7 · Delivered + cash back", mode: "shop", sub: "no delivered time in the booking payload", app: { name: "D7", path: `/deliveries/booking?id=${BOOKINGS.delivered.id}`, scenario: { me: SHOP_ME, bookings: [BOOKINGS.delivered] } } },
];

// ── Branches (ledger D-51): the header chevron, C6, the C4 row, C7 and the not-live home ─────────
const BRANCHES = {
  branches: [
    { id: "m-parity", name: "Sadza Republic", landmark: "5th Street, Mbare", role: "owner", active: true, pilotEnabled: true },
    { id: "m-avondale", name: "Sadza Republic · Avondale", landmark: "Fife Ave, Avondale", role: "owner", active: false, pilotEnabled: false },
  ],
};
const NOT_LIVE = {
  branches: [
    { ...BRANCHES.branches[1], id: "m-parity", active: true },
    { ...BRANCHES.branches[0], id: "m-cbd", active: false },
  ],
};
/** The export's own 360×720 frames (handoff branches/screenshots): the prototype renders the new rows
 *  only partly styled, so the drawn frames are the mock for this set. */
const FRAME = (f) => resolve(`../../packages/design/handoff/merchant-mobile/branches/screenshots/branches/${f}.png`);
const BRANCH_ROWS = [
  { id: "B1", frame: FRAME("29-b1-d1-2-branches"), label: "B1 · header with 2 branches", sub: "name + chevron, one 44px target", app: { name: "B1-branches", path: "/queue", scenario: { me: KITCHEN, orders: BOARD, branches: BRANCHES } } },
  {
    id: "C6",
    frame: FRAME("30-c6-branches-2-one-not-live"),
    label: "C6 · Branches",
    app: { name: "C6", path: "/queue", scenario: { me: KITCHEN, orders: BOARD, branches: BRANCHES }, before: async (p) => p.getByRole("button", { name: "Sadza Republic", exact: true }).click() },
  },
  { id: "C4", frame: FRAME("34-c4-account-branches-row"), label: "C4 · Account with Branches", sub: "D-50's owner-only “Taking orders” stays, after Branches", app: { name: "C4-branches", path: "/account", scenario: { me: KITCHEN, branches: BRANCHES } } },
  { id: "C7", frame: FRAME("36-c7-empty"), label: "C7 · Add a branch (empty)", app: { name: "C7", path: "/branches/new", scenario: { me: KITCHEN, menu: MENU, branches: BRANCHES } } },
  {
    id: "C7",
    frame: FRAME("37-c7-from-gps"),
    label: "C7 · from GPS, name typed",
    sub: "keyless run: no Places key, so the card reads “Your current location”",
    app: {
      name: "C7-gps",
      path: "/branches/new",
      scenario: { me: KITCHEN, menu: MENU, branches: BRANCHES },
      before: async (p) => {
        await p.getByLabel("Branch name").fill("Sadza Republic · Avondale");
        await p.getByRole("button", { name: "Use my current location" }).click();
        await p.getByText("From your phone’s location").waitFor();
      },
    },
  },
  {
    id: "B1n",
    frame: FRAME("35-b1-d1-just-created-not-live"),
    label: "B1 · not live yet",
    app: { name: "B1n", path: "/queue", scenario: { me: { ...KITCHEN, name: "Sadza Republic · Avondale", pilotEnabled: false }, orders: [], branches: NOT_LIVE } },
  },
];

const PR1_ROWS = [
  { id: "A1", label: "A1 · Sign in", app: { name: "A1", path: "/login", signedIn: false } },
  { id: "A2", label: "A2 · Code", app: { name: "A2", path: "/login", signedIn: false, before: toCode } },
  { id: "A3", label: "A3 · What do you sell?", app: { name: "A3", path: "/onboarding", before: pickRestaurant } },
  {
    id: "A4",
    label: "A4 · Your business",
    sub: "location from GPS; the address line needs a Places key, so this keyless run shows “Your current location”",
    app: { name: "A4", path: "/onboarding", before: toStep2 },
  },
  { id: "A5", label: "A5 · Join a team", mode: "shop", app: { name: "A5", path: "/join", scenario: { invites: INVITES } } },
  { id: "C4", label: "C4 · Account (restaurant)", app: { name: "C4", path: "/account", scenario: { me: RESTAURANT } } },
  { id: "C4", label: "C4 · Account (shop)", mode: "shop", app: { name: "C4-shop", path: "/account", scenario: { me: SHOP } } },
  { id: null, label: "Sign out · confirm sheet", sub: "the handoff's ConfirmSheet (proto.js C4 → Sign out)", app: { name: "C4-signout", path: "/account", scenario: { me: RESTAURANT }, before: signOutSheet } },
];

await mkdir(SHOTS, { recursive: true });
const browser = await launch();
const rows = [];
try {
  for (const r of SET === "orders" ? ORDER_ROWS : SET === "menu" ? MENU_ROWS : SET === "account" ? ACCOUNT_ROWS : SET === "shop" ? SHOP_ROWS : SET === "branches" ? BRANCH_ROWS : PR1_ROWS) {
    const mock = r.frame ?? (r.id ? await shootProto(browser, r.id, r.mode) : undefined);
    const app = await shootApp(browser, r.app);
    rows.push({ label: r.label, sub: r.sub, mock, app, logicalW: 360, ...(r.id ? {} : { mockNote: "drawn by the prototype's wiring, not as a screen" }) });
    console.log(`ok ${r.label}`);
  }
} finally {
  await browser.close();
}

await buildSheet({
  title:
    SET === "orders"
      ? "Merchant mobile redesign · PR 2b (D-48): Orders B1–B7"
      : SET === "menu"
        ? "Merchant mobile redesign · PR 3a (D-48): Menu C1–C2, Money C3, Items E1"
        : SET === "account"
          ? "Merchant mobile redesign · PR 3b (D-48): Hours C5, Team E2–E3, Riders E4"
          : SET === "shop"
            ? "Merchant mobile redesign · PR 4 (D-48): the shop D1–D5, D7, with cash on delivery"
            : SET === "branches"
              ? "Merchant branches (D-51): header chevron, C6 Branches, C4 row, C7 Add a branch, not live yet"
        : "Merchant mobile redesign · PR 1 (D-48): get in + shell + Account",
  out: OUT,
  rows,
});
console.log(`sheet: ${OUT}.png (+ .html); shots in ${SHOTS}`);
