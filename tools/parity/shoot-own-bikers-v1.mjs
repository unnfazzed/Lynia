#!/usr/bin/env node
/**
 * Own bikers v1's screenshot sheet (ledger D-117): each frame of the handoff
 * (packages/design/handoff/own-bikers-v1/Own bikers v1 - all screens.html, one `data-screen-label` per frame) beside
 * the app in the same state, at 360×720 (and 320×640 where the handoff draws it). `--set merchant-roster` (default):
 * OB-M1–M7, the invite sheet and the roster's states (lane B, PR 1). `--set merchant-book`: OB-M8–M12, Book a biker
 * with My bikers, the ringing sheet and its outcomes, and the kitchen's Book card (lane B, PR 2a). `--set merchant-money`:
 * OB-M13–M14, the board's fleet jobs, K5's cash card for an Own biker, and Money · This week's FLEET RIDES (PR 2b).
 *
 * The merchant API is stubbed in the browser (every call to `<origin>/__api/**`), so no seeded backend is needed:
 *
 *   API_BASE_URL=http://127.0.0.1:4312/__api node tools/parity/serve-web.mjs merchant
 *   node tools/parity/shoot-own-bikers-v1.mjs --out docs/parity/OWN-BIKERS-V1-MERCHANT-ROSTER-2026-10-19
 *
 * The data is the handoff's one data set: Chicken Inn has 4 bikers (Tendai on a job holding $14.00, Farai and Nyasha
 * online, Blessing offline with 2 cancels), Kuda is the open invite.
 */
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { contextDefaults, launch } from "./lib/browser.mjs";
import { buildSheet } from "./lib/sheet.mjs";

const ORIGIN = process.env.PARITY_MERCHANT_URL || "http://127.0.0.1:4312";
const setArg = process.argv.indexOf("--set");
const SET = setArg > 0 ? process.argv[setArg + 1] : "merchant-roster";
const outArg = process.argv.indexOf("--out");
const OUT = resolve(outArg > 0 ? process.argv[outArg + 1] : "out/own-bikers-v1");
const SHOTS = `${OUT}-shots`;
const MOCKS = `${pathToFileURL(resolve("../../packages/design/handoff/own-bikers-v1/Own bikers v1 - all screens.html")).href}?s=all`;

const SESSION = { accessToken: "parity", refreshToken: "parity.refresh", expiresIn: 900, issuedAt: Date.now(), profileId: "p-parity", role: "customer" };
const ALL_DAY = { open: "08:00", close: "22:00" };
const WEEK = { mon: ALL_DAY, tue: ALL_DAY, wed: ALL_DAY, thu: ALL_DAY, fri: ALL_DAY, sat: ALL_DAY, sun: ALL_DAY };
const ME = {
  id: "m-parity",
  name: "Chicken Inn Avondale",
  ownerPhoneMasked: "+263•••••4567",
  cashRule: "collect_and_return",
  busy: false,
  pilotEnabled: true,
  myRole: "owner",
  myName: "Rumbi Moyo",
  hours: WEEK,
  autoAccept: false,
  businessType: "restaurant",
  shopKind: null,
  location: { point: { lat: -17.8, lng: 31.04 }, landmark: "Avondale shops", contactPhone: "+263771234567" },
};
const STAFF_ME = { ...ME, myRole: "staff", myName: "Kuda Dube" };

const now = Date.now();
const H = 3_600_000;
const ago = (ms) => new Date(now - ms).toISOString();
const biker = (id, name, homeBranch, state, over = {}) => ({
  riderId: `00000000-0000-4000-8000-00000000000${id}`,
  name,
  phone: "+263 77 410 2290",
  homeBranch,
  state,
  joinedAt: ago(30 * 24 * H),
  cashHeld: null,
  cancelsThisWeek: 0,
  ...over,
});
const TENDAI = biker(1, "Tendai M.", "Avondale", "on_a_job", { cashHeld: "14.00" });
const FARAI = biker(2, "Farai K.", "Avondale", "online");
const NYASHA = biker(3, "Nyasha T.", "Borrowdale", "online");
const BLESSING = biker(4, "Blessing N.", "Borrowdale", "offline", { cancelsThisWeek: 2 });
const BIKERS = [TENDAI, FARAI, NYASHA, BLESSING];
const invite = (id, name, state, sharedMs) => ({
  id: `00000000-0000-4000-8000-0000000001${id}`,
  name,
  phoneMasked: "•• 0192",
  state,
  homeBranch: "Avondale",
  sharedAt: ago(sharedMs),
  expiresAt: new Date(now + 5 * 24 * H).toISOString(),
});
const KUDA = invite("01", "Kuda", "signing_up", 48 * H);
const INV2 = [KUDA, invite("02", "Rufaro", "waiting_id_check", 5 * H), invite("03", "+263 77 123 4567", "not_opened", 1 * H), invite("04", "Simba", "expired", 9 * 24 * H)];
const fleet = (over = {}) => ({ enabled: true, paused: false, role: "owner", bikers: BIKERS, invites: [KUDA], suggestions: [], ...over });
const LINK = { invite: { ...KUDA, sharedAt: new Date(now).toISOString(), state: "not_opened" }, link: "https://lyniago.co.zw/j/K7Q2-M9", phone: "263775550192", alreadyInvited: false };
const RESTAURANT_ME = { ...ME };
const fleetBooking = (state) => ({ id: "00000000-0000-4000-8000-00000000fb01", state: "finding", status: "fleet_searching", fleet: { state, rung: 2, endsAt: new Date(Date.now() + 84_000).toISOString() } });
const ALL_OFFLINE = BIKERS.map((b) => ({ ...b, state: "offline" }));
const BILLS = { thisWeek: { rides: 23, total: "34.50" }, bills: [{ id: "b1", periodStart: "2026-09-21", periodEnd: "2026-09-27", dueOn: "2026-10-02", total: "36.00", state: "overdue", daysOverdue: 2, paidAt: null, branches: [] }] };

// OB-M13/M14: one cooking order, Tendai's app order (#A311, $12.00 food + $2.00 delivery back) and Nyasha's phone booking.
const rider = (firstName, lastName, id) => ({ profileId: `00000000-0000-4000-8000-00000000000${id}`, firstName, lastName, photoUrl: null, ratingAvg: 4.9, ratingCount: 31, tripsCount: 120, vehicleInfo: null, plate: "AFG 2231", kycVerified: true });
const order = (over) => ({
  merchantId: "m-parity",
  note: null,
  paymentMethod: "cash",
  merchantCashRule: "collect_and_return",
  merchantPaymentPhone: null,
  acceptDeadlineAt: null,
  itemApprovalDeadlineAt: null,
  rejectionReason: null,
  paymentCallLoggedAt: null,
  paymentRequestedAt: null,
  merchantPaymentReference: null,
  merchantPaymentConfirmedAt: null,
  dispatchAttempt: 1,
  dispatchOfferExpiresAt: null,
  noRiderHoldAt: null,
  pickupCodeAttempts: 0,
  noShowCallTimestamps: [],
  createdAt: ago(0.4 * H),
  ...over,
});
const COOKING = order({
  id: "a3180000-0000-4000-8000-000000000318",
  status: "assigned",
  merchantPhase: "preparing",
  items: [{ dishId: "d1", name: "Quarter chicken", priceUsd: 4.5, quantity: 2, note: null, available: null }],
  merchantGoodsTotal: 9,
  deliveryFee: 2,
  total: 11,
  prepMinutes: 15,
  prepStartedAt: ago(9 * 60_000),
  readyAt: null,
  riderId: rider("Farai", "K.", 2).profileId,
  rider: rider("Farai", "K.", 2),
});
const A311 = order({
  id: "a3110000-0000-4000-8000-000000000311",
  status: "en_route_dropoff",
  merchantPhase: null,
  items: [
    { dishId: "d1", name: "Quarter chicken", priceUsd: 4.5, quantity: 2, note: null, available: null },
    { dishId: "d2", name: "Chips", priceUsd: 3, quantity: 1, note: null, available: null },
  ],
  merchantGoodsTotal: 12,
  deliveryFee: 2,
  total: 14,
  prepMinutes: 15,
  prepStartedAt: ago(0.4 * H),
  readyAt: ago(0.2 * H),
  riderId: rider("Tendai", "M.", 1).profileId,
  rider: rider("Tendai", "M.", 1),
  ownBiker: true,
  debtStatus: "open",
  debtAmount: 14,
  riderEtaAt: new Date(now + 6 * 60_000).toISOString(),
});
const NYASHA_BOOKING = {
  id: "00000000-0000-4000-8000-00000000fb02",
  state: "picked_up",
  status: "en_route_dropoff",
  createdAt: ago(0.3 * H),
  expiresAt: null,
  dropoff: { point: { lat: -17.81, lng: 31.05 }, landmark: "Blue gate opposite the church", contactPhone: "+263779982210" },
  itemsSummary: "Chicken & chips",
  declaredValue: "12.00",
  proposedFare: "0.00",
  agreedFare: null,
  bookedBy: "Rumbi",
  ownBiker: true,
  rider: { name: "Nyasha T.", phone: "+263774102290", bikeReg: "AFG 2231" },
  offerCount: 0,
  undeliveredReason: null,
  cancelledBy: null,
  cancelReason: null,
  rebroadcastedToId: null,
  rebroadcastOfId: null,
  codeIssuedAt: ago(0.3 * H),
  offers: [],
  cashOnDelivery: { amount: "12.00", status: "awaiting_delivery", dueAt: null },
  riderEtaAt: new Date(now + 10 * 60_000).toISOString(),
};
const keyOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const TODAY = keyOf(new Date(now));
const MONDAY = (() => {
  const d = new Date(now);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return keyOf(d);
})();
const addDays = (key, n) => {
  const d = new Date(`${key}T12:00:00`);
  d.setDate(d.getDate() + n);
  return keyOf(d);
};
const at = (h, m) => {
  const d = new Date(now);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};
const SUMMARY_TODAY = { date: TODAY, dateKey: TODAY, delivered: 7, cashTaken: 61, walletTaken: 0, rejected: 0, averagePrepMinutes: 12, orders: 7, sales: 61, cashDue: 0, cashOverdue: 0, overdue: [], lines: [] };
const SUMMARY_WEEK = { start: `${MONDAY}T00:00:00+02:00`, startKey: MONDAY, orders: 41, sales: 386, days: [{ date: TODAY, orders: 7, sales: 61, cashLate: 0, cashDue: 0, rejected: 0 }] };
const ride = (ref, biker, h, m, kind = "booking", fee = "1.50", reason = null) => ({ orderId: `00000000-0000-4000-8000-000000${ref.slice(1).toLowerCase()}00`, ref, at: at(h, m), kind, fee, reason, biker });
const RIDES = {
  weekStart: MONDAY,
  weekEnd: addDays(MONDAY, 6),
  rides: 15,
  total: "22.50",
  lines: [ride("#B204", "Tendai", 12, 40), ride("#B201", "Farai", 11, 55, "marketplace"), ride("#B198", "Tendai", 11, 20), ride("#B190", "Tendai", 10, 5), ride("#B190", null, 10, 30, "adjustment", "-1.50", "wrong fee")],
};
const WEEK_BRANCHES = { rides: 23, total: "34.50", branches: [{ merchantId: "m-parity", name: "Avondale", rides: 15, total: "22.50" }, { merchantId: "m-bo", name: "Borrowdale", rides: 8, total: "12.00" }] };
const OVERDUE = { id: "b-overdue", periodStart: addDays(MONDAY, -14), periodEnd: addDays(MONDAY, -8), dueOn: addDays(MONDAY, -3), total: "36.00", state: "overdue", daysOverdue: 2, paidAt: null, branches: [] };
const PAID = { id: "b-paid", periodStart: addDays(MONDAY, -7), periodEnd: addDays(MONDAY, -1), dueOn: addDays(MONDAY, 4), total: "34.50", state: "paid", daysOverdue: 0, paidAt: ago(H), branches: [] };
const MONEY_CACHE = { merchantId: "m-parity", at: at(12, 40), data: { rides: RIDES, bills: { thisWeek: WEEK_BRANCHES, bills: [] } } };

function apiRoute(route, sc) {
  const req = route.request();
  const path = new URL(req.url()).pathname.replace(/^\/__api/, "");
  const json = (status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  if (sc.down) return route.abort(); // the connection dropped: every call (and the /healthz probe) fails
  if (path === "/merchant/me") return json(200, sc.me ?? ME);
  if (path === "/merchant/fleet") {
    if (sc.load === "hang") return undefined; // Loading: never answers
    if (sc.load === "fail") return json(500, { message: "" });
    return sc.fleet ? json(200, sc.fleet) : json(503, { message: "Own bikers isn't available yet." });
  }
  if (path === "/merchant/fleet/bills") return json(200, sc.bills ?? BILLS);
  if (path === "/merchant/fleet/rides") {
    if (sc.rides === "hang") return undefined;
    if (sc.rides === "fail") return json(500, { message: "" });
    if (sc.rides === "net") return route.abort();
    return json(200, sc.rides ?? RIDES);
  }
  if (path === "/merchant/orders" && sc.orders) return json(200, sc.orders);
  if (path.startsWith("/merchant/orders/") && sc.orders) return json(200, sc.orders.find((o) => path.endsWith(o.id)) ?? sc.orders[0]);
  if (path === "/merchant/bookings" && sc.booking) return json(200, [sc.booking]);
  if (path.startsWith("/merchant/bookings/") && sc.booking) return json(200, sc.booking);
  if (path === "/merchant/summary/week") return json(200, SUMMARY_WEEK);
  if (path === "/merchant/summary/today" && sc.money) return json(200, { ...SUMMARY_TODAY, orders: 9, sales: 86, cashDue: 26 });
  if (path === "/merchant/fleet/invites" && req.method() === "POST") {
    if (sc.invite === "hang") return undefined;
    if (sc.invite === "fail") return json(500, {});
    if (sc.invite === "net") return route.abort();
    return json(200, sc.invite === "dup" ? { ...LINK, alreadyInvited: true, invite: KUDA } : LINK);
  }
  if (path === "/merchant/fleet/bookings" && req.method() === "POST") {
    if (sc.ring === "net") return route.abort();
    return json(200, { booking: fleetBooking(sc.ring ?? "ringing"), deliveryCode: "482910" });
  }
  if (path.startsWith("/merchant/bookings/")) return json(200, fleetBooking(sc.ring ?? "ringing"));
  if (path === "/merchant/summary/today") return json(200, { orders: 9, sales: 86, cashDue: 26 });
  if (path === "/app/order-flags") return json(200, { rxEnabled: true, preferredRetired: sc.retired ?? false });
  if (path === "/merchant/team") return json(200, { members: [], invites: [{ id: "t1" }] });
  if (path === "/merchant/riders") return json(200, { riders: [], cap: 20 });
  if (path === "/merchant/branches") return json(200, { branches: [{ id: "a" }, { id: "b" }] });
  if (path === "/merchant/invites") return json(200, { invites: [] });
  if (path === "/auth/me") return json(200, { firstName: "Rumbi", lastName: "Moyo", phone: "+263771234567" });
  return json(200, []);
}

async function shootApp(browser, { name, w = 360, path = "/own-bikers", scenario, before, knownFleet = false, moneyCache = false }) {
  const ctx = await browser.newContext(contextDefaults({ viewport: { width: w, height: w === 320 ? 640 : 720 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }));
  await ctx.addCookies([{ name: "lynia_merchant_session", value: encodeURIComponent(JSON.stringify(SESSION)), url: ORIGIN }]);
  await ctx.route("**/__api/**", (route) => apiRoute(route, scenario));
  await ctx.route("**/socket.io/**", (route) => route.abort());
  // A tab that last saw the business with Own bikers (lib/use-fleet.ts `likelyFleet`).
  if (knownFleet) await ctx.addInitScript(() => window.sessionStorage.setItem("lynia.merchant.fleet", "1"));
  // The last good Fleet rides read (lib/fleet-money.ts), for the offline frame.
  if (moneyCache) await ctx.addInitScript((c) => window.localStorage.setItem("lynia.merchant.fleetMoney", c), JSON.stringify(MONEY_CACHE));
  const page = await ctx.newPage();
  try {
    await page.goto(`${ORIGIN}${path}`, { waitUntil: scenario.load === "hang" ? "domcontentloaded" : "networkidle", timeout: 90000 });
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; } *, *::before, *::after { caret-color: transparent !important; animation-play-state: paused !important; }" });
    await page.waitForTimeout(scenario.load === "hang" ? 1500 : 800);
    if (before) await before(page);
    await page.evaluate(() => (document.fonts ? document.fonts.ready : null));
    await page.waitForTimeout(500);
    const file = join(SHOTS, `app-${name}.png`);
    await page.screenshot({ path: file });
    return file;
  } catch (err) {
    console.error(`app ${name}: ${err.message}`);
    return null;
  } finally {
    await ctx.close();
  }
}

/** The offline frame's scenario, switched off once the roster has loaded. */
const ROWS_DOWN = { fleet: fleet(), down: false };
const openInvite = (p) => p.getByRole("button", { name: /Invite a biker/ }).last().click();
const fillInvite = (phone = "775550192", nm = "Kuda") => async (p) => {
  await openInvite(p);
  await p.getByLabel("Phone").fill(phone);
  await p.getByLabel("Name").fill(nm);
};
const getLink = (wait) => async (p) => {
  await fillInvite()(p);
  await p.getByRole("button", { name: /Get invite link/ }).click();
  if (wait) await p.getByText(wait).first().waitFor();
};
const scroll = (px) => (p) => p.locator("main.m-scroll").evaluate((el, y) => (el.scrollTop = y), px);

/** OB-M8: the drawing's booking, Pin the buyer sent, +263 77 998 2210, 2× Quarter chicken and 1× Chips ($12.00), cash. */
const fillBook = async (p) => {
  await p.getByLabel("Search street or area, or paste the buyer's location").fill("-17.81, 31.05");
  await p.getByLabel("Buyer’s phone").fill("779982210");
  for (const [name, qty, price] of [["Quarter chicken", "2", "4.50"], ["Chips", "1", "3.00"]]) {
    await p.getByRole("button", { name: "Add", exact: true }).click();
    await p.getByRole("dialog", { name: "Your items" }).getByRole("button", { name: /Type one/ }).click();
    const sheet = p.getByRole("dialog", { name: "Type an item" });
    await sheet.getByLabel("What it is").fill(name);
    await sheet.getByLabel("How many").fill(qty);
    await sheet.getByLabel("Price of one ($)").fill(price);
    await sheet.getByRole("button", { name: "Add", exact: true }).click();
  }
  await p.getByRole("switch").click();
};
const ring = async (p) => {
  await fillBook(p);
  await p.getByRole("button", { name: /Ring my bikers/ }).click();
  await p.getByRole("dialog").or(p.getByRole("alertdialog")).last().waitFor();
};
const BOOK_ROWS = [
  ["OB-M8 Kitchen orders · Book card", { path: "/queue", scenario: { me: RESTAURANT_ME, fleet: fleet() } }],
  ["OB-M8 Book · My bikers", { path: "/deliveries/new", scenario: { fleet: fleet() }, before: fillBook }],
  ["OB-M8 Book · My bikers · 320", { w: 320, path: "/deliveries/new", scenario: { fleet: fleet() }, before: fillBook }],
  ["OB-M8 Book · Any biker", { path: "/deliveries/new", scenario: { fleet: fleet() }, before: async (p) => { await fillBook(p); await p.getByRole("radio", { name: "Any biker" }).click(); } }],
  ["OB-M8 Book · 0 online", { path: "/deliveries/new", scenario: { fleet: fleet({ bikers: ALL_OFFLINE }) }, before: fillBook }],
  ["OB-M8 Book · loading count", { path: "/deliveries/new", knownFleet: true, scenario: { fleet: fleet(), load: "hang" }, before: fillBook }],
  ["OB-M8 Book · can't reach", { path: "/deliveries/new", scenario: { fleet: fleet(), ring: "net" }, before: async (p) => { await fillBook(p); await p.getByRole("button", { name: /Ring my bikers/ }).click(); await p.getByText("Can't reach LyniaGo").waitFor(); } }],
  ["OB-M9 Ringing my bikers", { path: "/deliveries/new", scenario: { fleet: fleet(), ring: "ringing" }, before: ring }],
  ["OB-M10 None took it", { path: "/deliveries/new", scenario: { fleet: fleet(), ring: "none_took" }, before: ring }],
  [
    "OB-M11 Nobody online",
    { path: "/deliveries/new", scenario: { fleet: fleet({ bikers: ALL_OFFLINE }), ring: "none_online" }, before: async (p) => { await p.getByRole("radio", { name: /My bikers/ }).click(); await ring(p); } },
  ],
  ["OB-M12 Paused", { path: "/deliveries/new", scenario: { fleet: fleet({ paused: true }) }, before: fillBook }],
];

const week = (wait = "FLEET RIDES") => async (p) => {
  await p.getByRole("tab", { name: "This week" }).click();
  await p.getByText(wait).first().waitFor();
  await p.waitForTimeout(400);
};
const MONEY = (bills, over = {}) => ({ money: true, fleet: fleet(), bills: { thisWeek: WEEK_BRANCHES, bills }, ...over });
const MONEY_ROWS = [
  ["OB-M13 Board · fleet jobs", { path: "/queue", scenario: { me: RESTAURANT_ME, fleet: fleet(), money: true, orders: [COOKING, A311], booking: NYASHA_BOOKING } }],
  ["OB-M13 K5 · app order, Own biker", { path: `/queue/order?id=${A311.id}`, scenario: { money: true, orders: [A311] } }],
  ["OB-M13 K5 · phone booking", { path: `/deliveries/booking?id=${NYASHA_BOOKING.id}`, scenario: { money: true, booking: NYASHA_BOOKING } }],
  ["OB-M14 Money · fleet rides · unpaid", { path: "/statement", scenario: MONEY([]), before: week() }],
  ["OB-M14 Money · overdue", { path: "/statement", scenario: MONEY([OVERDUE]), before: week() }],
  ["OB-M14 Money · paid", { path: "/statement", scenario: MONEY([PAID]), before: week() }],
  [
    "OB-M14 Money · no fleet rides",
    { path: "/statement", scenario: MONEY([], { rides: { ...RIDES, rides: 0, total: "0.00", lines: [] }, bills: { thisWeek: { rides: 0, total: "0.00", branches: [] }, bills: [] } }), before: week("No fleet rides this week") },
  ],
  ["Fleet rides · loading", { path: "/statement", scenario: MONEY([], { rides: "hang" }), before: week() }],
  ["Fleet rides · couldn't load", { path: "/statement", scenario: MONEY([], { rides: "fail" }), before: week("Couldn't load fleet rides") }],
  ["Fleet rides · offline", { path: "/statement", moneyCache: true, scenario: MONEY([], { rides: "net" }), before: week("as of") }],
];

const ROWS = [
  ["OB-M1 Account · owner", { path: "/account", scenario: { fleet: fleet() } }],
  ["OB-M1 Account · paused", { path: "/account", scenario: { fleet: fleet({ paused: true }) } }],
  ["OB-M1 Account · staff", { path: "/account", scenario: { me: STAFF_ME, fleet: fleet({ role: "staff" }) } }],
  ["OB-M1 Account · nonfleet", { path: "/account", scenario: { retired: true } }],
  ["OB-M2 Roster · owner", { scenario: { fleet: fleet() } }],
  ["OB-M2 Roster · owner · scrolled", { scenario: { fleet: fleet({ invites: INV2 }) }, before: scroll(300) }],
  ["OB-M2 Roster · owner · 320", { w: 320, scenario: { fleet: fleet() } }],
  ["OB-M2 Biker sheet · owner", { scenario: { fleet: fleet() }, before: (p) => p.getByRole("button", { name: /Tendai M\./ }).click() }],
  [
    "OB-M2 Remove confirm",
    { scenario: { fleet: fleet() }, before: async (p) => { await p.getByRole("button", { name: /Tendai M\./ }).click(); await p.getByRole("button", { name: "Remove from my bikers" }).click(); } },
  ],
  ["OB-M3 Roster · staff", { scenario: { me: STAFF_ME, fleet: fleet({ role: "staff", invites: INV2 }) } }],
  ["OB-M4 Roster · first time", { scenario: { fleet: fleet({ bikers: [], invites: [] }) } }],
  [
    "OB-M5 Preferred suggestions",
    { scenario: { fleet: fleet({ bikers: [FARAI], invites: [], suggestions: [{ name: "Tino K.", phone: "+263 77 302 1188" }, { name: "Chipo R.", phone: "+263 78 220 4411" }] }) } },
  ],
  ["OB-M7 First biker joined", { scenario: { fleet: fleet({ bikers: [FARAI], invites: [KUDA] }), bills: { thisWeek: { rides: 0, total: "0.00" }, bills: [] } } }],
  ["OB-M6 Invite · typing", { scenario: { fleet: fleet() }, before: async (p) => { await openInvite(p); await p.getByLabel("Phone").fill("7755501"); } }],
  ["OB-M6 Invite · getting link", { scenario: { fleet: fleet(), invite: "hang" }, before: getLink() }],
  ["OB-M6 Invite · link ready", { scenario: { fleet: fleet() }, before: getLink("Invite link for Kuda") }],
  [
    "OB-M6 Invite · link copied",
    {
      scenario: { fleet: fleet() },
      before: async (p) => {
        await p.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: ORIGIN });
        await getLink("Invite link for Kuda")(p);
        await p.getByRole("button", { name: "Copy link" }).click();
      },
    },
  ],
  ["OB-M6 Invite · already invited", { scenario: { fleet: fleet(), invite: "dup" }, before: getLink("Already invited · same link") }],
  ["OB-M6 Invite · couldn't get a link", { scenario: { fleet: fleet(), invite: "fail" }, before: getLink("Couldn't get a link") }],
  ["OB-M6 Invite · no network", { scenario: { fleet: fleet(), invite: "net" }, before: getLink("Can't reach LyniaGo") }],
  ["Roster · loading", { scenario: { fleet: fleet(), load: "hang" } }],
  ["Roster · couldn't load", { scenario: { fleet: fleet(), load: "fail" } }],
  // Reachability probes every 20 s (lib/reachability.ts), so the shot waits for the offline toast itself.
  [
    "Roster · offline",
    {
      scenario: ROWS_DOWN,
      before: async (p) => {
        ROWS_DOWN.down = true; // the reachability probe (every 20 s) then fails
        await p.locator(".m-toast").waitFor({ timeout: 45000 });
      },
    },
  ],
];

await mkdir(SHOTS, { recursive: true });
const browser = await launch();
const mctx = await browser.newContext(contextDefaults({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 }));
const mpage = await mctx.newPage();
await mpage.goto(MOCKS, { waitUntil: "load" });
await mpage.waitForTimeout(1500);
const rows = [];
for (const [label, app] of SET === "merchant-book" ? BOOK_ROWS : SET === "merchant-money" ? MONEY_ROWS : ROWS) {
  let mock = null;
  try {
    mock = join(SHOTS, `mock-${rows.length}.png`);
    await mpage.locator(`[data-screen-label="${label}"]`).first().screenshot({ path: mock });
  } catch (err) {
    console.error(`mock ${label}: ${err.message}`);
    mock = null;
  }
  const shot = await shootApp(browser, { name: String(rows.length), ...app });
  console.error(`${shot ? "ok" : "--"} ${label}`);
  rows.push({ label, mock, app: shot, logicalW: app.w ?? 360 });
}
await mctx.close();
await buildSheet({ title: `Own bikers v1 (D-117) · ${SET}: handoff (left) vs app (right)`, out: OUT, rows, browser });
await browser.close();
