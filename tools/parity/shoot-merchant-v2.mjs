#!/usr/bin/env node
/**
 * Merchant v2's screenshot sheet (ledger D-77): each redesigned merchant screen at 360×720 beside the
 * handoff's own drawing of it (packages/design/handoff/merchant-v2/Merchant v2 - all screens.html, one
 * `data-screen-label` frame per screen).
 *
 * The merchant API is stubbed in the browser (every call to `<origin>/__api/**`), so no seeded backend
 * is needed: start the dev server with that same-origin base first —
 *
 *   API_BASE_URL=http://127.0.0.1:4312/__api node tools/parity/serve-web.mjs merchant
 *   node tools/parity/shoot-merchant-v2.mjs --set shell --out docs/parity/MERCHANT-V2-SHELL-2026-10-04
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
const OUT = resolve(outArg > 0 ? process.argv[outArg + 1] : "out/merchant-v2");
const SHOTS = `${OUT}-shots`;
const MOCKS = pathToFileURL(resolve("../../packages/design/handoff/merchant-v2/Merchant v2 - all screens.html")).href;
const PHONE = process.env.PARITY_NARROW ? { width: 320, height: 640 } : { width: 360, height: 720 };
const setArg = process.argv.indexOf("--set");
const SET = setArg > 0 ? process.argv[setArg + 1] : "shell";

// ── Fixtures ─────────────────────────────────────────────────────────────────────────────────────
const SESSION = { accessToken: "parity", refreshToken: "parity.refresh", expiresIn: 900, issuedAt: Date.now(), profileId: "p-parity", role: "customer" };
const PIN = { point: { lat: -17.8575, lng: 31.0367 }, landmark: "5th Street, Mbare", contactPhone: "+263771234567" };
const week = (open, close) => Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, { open, close }]));
const PROFILE = {
  id: "m-parity",
  ownerPhoneMasked: "+263•••••4567",
  description: null,
  coverPhotoUrl: null,
  logoUrl: null,
  cuisineTags: [],
  priceLevel: null,
  cashRule: "collect_and_return",
  busy: false,
  pilotEnabled: true,
  myRole: "owner",
  myName: "Farai Chari",
  location: PIN,
};
const KITCHEN = { ...PROFILE, name: "Sadza Republic", businessType: "restaurant", shopKind: null, hours: week("00:00", "23:59") };
const SHOP = { ...PROFILE, name: "Mbare Auto Spares", businessType: "shop", shopKind: "auto_parts", pilotEnabled: false, hours: week("00:00", "23:59") };

const RIDER = { profileId: "11111111-1111-4111-8111-111111111111", firstName: "Blessing", lastName: "Moyo", photoUrl: null, ratingAvg: 4.9, ratingCount: 31, tripsCount: 120, vehicleInfo: null, plate: "AFG 2231", kycVerified: true };
const ago = (min) => new Date(Date.now() - min * 60_000).toISOString();
const ahead = (min) => new Date(Date.now() + min * 60_000).toISOString();
const line = (name, priceUsd, quantity = 1, note = null) => ({ dishId: `d-${name.length}`, name, priceUsd, quantity, note, available: null });
function order(id, over) {
  return {
    id, merchantId: "m-parity", status: "requested", merchantPhase: "preparing", items: [line("Mazondo", 5)], note: null, paymentMethod: "cash",
    merchantPaymentPhone: null, merchantGoodsTotal: 5, deliveryFee: 3.2, total: 8.2, acceptDeadlineAt: null, itemApprovalDeadlineAt: null, prepMinutes: 15,
    prepStartedAt: ago(5.7), readyAt: null, rejectionReason: null, paymentCallLoggedAt: null, paymentRequestedAt: null, merchantPaymentReference: null,
    merchantPaymentConfirmedAt: null, riderId: null, dispatchAttempt: 0, dispatchOfferExpiresAt: null, noRiderHoldAt: null, pickupCodeAttempts: 0,
    noShowCallTimestamps: [], createdAt: ago(20), merchantCashRule: "collect_and_return", ...over,
  };
}
const BOARD = [
  order("a4440000-0000-4000-8000-000000000000", { merchantPhase: null, status: "assigned", riderId: RIDER.profileId, rider: RIDER, items: [line("Mazondo", 5, 2)], merchantGoodsTotal: 10 }),
  order("a2220000-0000-4000-8000-000000000000", { items: [line("Mazondo", 5), line("Sadza & greens", 4.5)], merchantGoodsTotal: 9.5, prepMinutes: 15, prepStartedAt: ago(7) }),
  order("a2230000-0000-4000-8000-000000000000", { prepMinutes: 15, prepStartedAt: ago(3) }),
  order("a1110000-0000-4000-8000-000000000000", { merchantPhase: null, status: "en_route_dropoff", riderId: RIDER.profileId, rider: RIDER, merchantGoodsTotal: 12, debtStatus: "open", debtAmount: 12 }),
];
const SUMMARY = { date: "2026-10-04", delivered: 6, rejected: 0, cashTaken: 30, walletTaken: 0, averagePrepMinutes: 15, orders: 7, sales: 59.5, cashOverdue: 0, cashDue: 9.5, overdue: [], lines: [] };
const cat = (id, name, sortOrder, dishCount) => ({ id, name, sortOrder, availableFrom: null, availableTo: null, hidden: false, dishCount });
const dish = (id, categoryId, name, priceUsd, over = {}) => ({ id, categoryId, name, description: null, priceUsd, photoUrl: null, isDraft: false, outOfStock: false, outOfStockUntil: null, sortOrder: 0, ...over });
const C_MAINS = "c1000000-0000-4000-8000-000000000000";
const MENU = {
  categories: [cat(C_MAINS, "Mains", 0, 3), cat("c2000000-0000-4000-8000-000000000000", "Drinks", 1, 1)],
  dishes: [
    dish("d1000000-0000-4000-8000-000000000000", C_MAINS, "Mazondo", 5),
    dish("d2000000-0000-4000-8000-000000000000", C_MAINS, "Sadza & beef stew", 4.5),
    dish("d3000000-0000-4000-8000-000000000000", C_MAINS, "Sadza & road-runner", 6, { outOfStock: true, outOfStockUntil: ahead(600) }),
  ],
};
const bookRider = { name: "Blessing Moyo", phone: "+263772222222", bikeReg: "AFG 2231" };
function booking(id, over) {
  return {
    id, state: "coming", status: "assigned", createdAt: ago(31), expiresAt: null,
    dropoff: { point: { lat: -17.79, lng: 31.04 }, landmark: "12 Fife Ave, Avondale", contactPhone: "+263779982210" },
    itemsSummary: "Brake pads", declaredValue: "51.00", proposedFare: "3.50", agreedFare: "3.50", bookedBy: "Farai",
    rider: bookRider, offerCount: 0, undeliveredReason: null, cancelledBy: null, cancelReason: null, rebroadcastedToId: null, rebroadcastOfId: null,
    codeIssuedAt: ago(20), offers: [], ...over,
  };
}
const BOOKINGS = [
  booking("b1000000-0000-4000-8000-000000000000", { state: "finding", status: "open_for_offers", itemsSummary: "Car battery", agreedFare: null, rider: null, expiresAt: ahead(0.95), offerCount: 3 }),
  booking("b2000000-0000-4000-8000-000000000000", { state: "picked_up", status: "en_route_dropoff" }),
];

function apiRoute(route, scenario) {
  const path = new URL(route.request().url()).pathname.replace(/^\/__api/, "");
  const json = (status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  if (path === "/merchant/orders") return json(200, scenario.orders ?? []);
  const one = path.match(/^\/merchant\/orders\/([0-9a-f-]+)$/);
  if (one) return json(200, (scenario.orders ?? []).find((o) => o.id === one[1]) ?? {});
  if (path === "/merchant/scheduled-orders") return json(200, []);
  if (/\/pickup-code\/reveal$/.test(path)) return json(200, { pickupCode: scenario.code ?? "720518" });
  if (path === "/merchant/bookings") return json(200, scenario.bookings ?? []);
  const bk = path.match(/^\/merchant\/bookings\/([0-9a-f-]+)$/);
  if (bk) return json(200, (scenario.bookings ?? []).find((b) => b.id === bk[1]) ?? {});
  if (path === "/merchant/summary/today") return json(200, scenario.summary ?? SUMMARY);
  if (path === "/merchant/categories") return json(200, scenario.menu?.categories ?? []);
  if (path === "/merchant/dishes") return json(200, scenario.menu?.dishes ?? []);
  if (path === "/auth/me") return json(200, { firstName: "Farai", lastName: "Chari", phone: "+263771234567" });
  if (path === "/merchant/me") return scenario.me ? json(200, scenario.me) : json(403, { reason: "not_a_member", message: "Not on a business." });
  if (path === "/merchant/invites") return json(200, { invites: [] });
  if (path === "/merchant/branches") return json(200, scenario.branches ?? { branches: [] });
  return json(200, []);
}

async function shootApp(browser, { name, path, scenario = {}, before }) {
  const ctx = await browser.newContext(contextDefaults({ viewport: PHONE, deviceScaleFactor: 2 }));
  await ctx.addCookies([{ name: "lynia_merchant_session", value: encodeURIComponent(JSON.stringify(SESSION)), url: ORIGIN }]);
  await ctx.route("**/__api/**", (route) => apiRoute(route, scenario));
  await ctx.route("**/socket.io/**", (route) => route.abort());
  const page = await ctx.newPage();
  try {
    await page.goto(ORIGIN + path, { waitUntil: "networkidle", timeout: 90000 });
    if (before) await before(page);
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    await page.evaluate(() => (document.fonts ? document.fonts.ready : null));
    await page.waitForTimeout(700);
    const file = join(SHOTS, `app-${name}.png`);
    await page.screenshot({ path: file });
    return file;
  } finally {
    await ctx.close();
  }
}

/** One drawn frame, cut out of the handoff's all-screens page by its `data-screen-label`. */
async function shootMock(page, label) {
  const file = join(SHOTS, `mock-${label.split(" ")[0]}.png`);
  await page.locator(`[data-screen-label="${label}"]`).screenshot({ path: file });
  return file;
}

const closed = { ...KITCHEN, closedUntil: ahead(600), hours: week("08:00", "22:00") };
const LIVE_SHOP = { ...SHOP, pilotEnabled: true };
const item = (itemId, name, priceUsd, quantity = 1, note = null) => ({ itemId, dishId: `d-${itemId}`, name, priceUsd, quantity, note, available: null });
const SHOP_VENUE = { name: "Mbare Auto Spares", businessType: "shop", shopKind: "grocery" };
const ringingKitchen = order("a1b20000-0000-4000-8000-000000000000", {
  merchantPhase: "awaiting_accept", prepMinutes: null, prepStartedAt: null, acceptDeadlineAt: ahead(0.8),
  items: [item("i1000000-0000-4000-8000-000000000000", "Sadza & beef stew", 4.5, 2, "Extra gravy"), item("i2000000-0000-4000-8000-000000000000", "Roast chicken (half)", 6)],
  merchantGoodsTotal: 15,
});
const ringingShop = order("a1b20000-0000-4000-8000-000000000000", {
  merchantPhase: "awaiting_accept", prepMinutes: null, prepStartedAt: null, acceptDeadlineAt: ahead(1.15), venue: SHOP_VENUE, customerFirstName: "Rudo",
  items: [
    item("i1000000-0000-4000-8000-000000000000", "Bread (Lobels 700g)", 1.1),
    item("i2000000-0000-4000-8000-000000000000", "Eggs (tray of 30)", 5.5),
    item("i3000000-0000-4000-8000-000000000000", "Mazoe orange 2L", 3.2),
    item("i4000000-0000-4000-8000-000000000000", "Cooking oil 2L", 4.8),
  ],
  merchantGoodsTotal: 14.6,
});
const waitingShop = order("a1b20000-0000-4000-8000-000000000000", {
  merchantPhase: "awaiting_item_approval", venue: SHOP_VENUE, customerFirstName: "Rudo", itemApprovalDeadlineAt: ahead(2.47),
  items: [item("i1", "Bread", 1.1), item("i2", "Eggs", 5.5), item("i3", "Mazoe", 3.2), item("i4", "Oil", 4.8)],
  substitution: { id: "51000000-0000-4000-8000-000000000000", kind: "at_accept", status: "open", createdAt: ago(0.5), deadlineAt: ahead(2.47), resolvedAt: null, lines: [{}, {}], wasTotal: 14.6, keptSubtotal: 11.5 },
});
const removeItem = (name) => async (p) => {
  const d = p.getByRole("alertdialog");
  await d.getByRole("button", { name }).first().click();
  await d.getByRole("button", { name: "Remove it" }).click();
};
const cookingK3 = order("a2220000-0000-4000-8000-000000000000", {
  items: [line("Mazondo", 5), line("Sadza & greens", 4.5)], merchantGoodsTotal: 9.5, prepMinutes: 15, prepStartedAt: ago(6.02),
  riderId: RIDER.profileId, rider: RIDER, dispatchAttempt: 1,
});
const handK4 = order("a4440000-0000-4000-8000-000000000000", {
  merchantPhase: null, status: "assigned", riderId: RIDER.profileId, rider: RIDER, riderPhone: "+263772222222", items: [line("Mazondo", 5, 2)], merchantGoodsTotal: 10,
});
const wayK5 = order("a1110000-0000-4000-8000-000000000000", {
  merchantPhase: null, status: "en_route_dropoff", riderId: RIDER.profileId, rider: RIDER, items: [line("Sadza & beef stew", 4.5, 2), line("Mazoe", 3)],
  merchantGoodsTotal: 12, deliveryFee: 3.2, debtStatus: "open", debtAmount: 12,
});
const TENDAI = { ...RIDER, firstName: "Tendai", lastName: "Moyo", plate: "ABH 4721", ratingAvg: 4.8 };
const handS3 = order("a1b20000-0000-4000-8000-000000000000", {
  merchantPhase: null, status: "en_route_pickup", riderId: TENDAI.profileId, rider: TENDAI, riderPhone: "+263773333333", venue: SHOP_VENUE, pickupProofRequired: true,
  pickupProof: { photoUrl: null, takenAt: ago(1), bagSealed: true }, items: [line("Bread", 1.1), line("Eggs", 5.5), line("Oil", 4.8)], merchantGoodsTotal: 11.4,
});

const SETS = {
  ticket: [
    { mock: "K3 Cooking ticket", label: "K3 · Cooking ticket", sub: "rider line: no arrival time on the read yet (D-77 §4)", app: { name: "K3", path: `/queue/${cookingK3.id}`, scenario: { me: KITCHEN, orders: [cookingK3] } } },
    { mock: "K4 Hand over", label: "K4 · Hand over", sub: "no “at your counter”: no arrival signal yet", app: { name: "K4", path: `/queue/${handK4.id}`, scenario: { me: KITCHEN, orders: [handK4] } } },
    { mock: "K5 On the way", label: "K5 · On the way + cash back", sub: "map: OSM around the kitchen; no arrival time on the read", app: { name: "K5", path: `/queue/${wayK5.id}`, scenario: { me: KITCHEN, orders: [wayK5] } } },
    { mock: "S3 Sealed bag hand over", label: "S3 · Hand over, sealed bag", sub: "photo stand-in (no URL in the fixture)", app: { name: "S3", path: `/queue/${handS3.id}`, scenario: { me: LIVE_SHOP, orders: [handS3], code: "731604" } } },
  ],
  board: [
    { mock: "K1 Orders home", label: "K1 · Orders board", sub: "“coming to your counter” (no arrival signal yet); no arrival ETA on the way (D-77 §4)", app: { name: "K1", path: "/queue", scenario: { me: KITCHEN, orders: BOARD } } },
    { mock: "S1 Shop home", label: "S1 · Shop board (APP + BOOKED)", app: { name: "S1", path: "/queue", scenario: { me: LIVE_SHOP, orders: [waitingShop], bookings: BOOKINGS } } },
    { mock: "K2 New order rings", label: "K2 · New order rings", sub: "the countdown is the server's 3-minute window (owner decision)", app: { name: "K2", path: "/queue", scenario: { me: KITCHEN, orders: [ringingKitchen] } } },
    {
      mock: "S2 Shop ringing",
      label: "S2 · Shop rings, with item changes",
      sub: "keyless run: the swap picker needs the shop's items, so this shows a removal",
      app: { name: "S2", path: "/queue", scenario: { me: LIVE_SHOP, orders: [ringingShop] }, before: removeItem(/Mazoe/) },
    },
  ],
  shell: [
    { mock: "K1 Orders home", label: "K1 · Orders home — top card, open pill, KPI strip, tab bar", sub: "the board below is still B1's segments until PR 2", app: { name: "K1", path: "/queue", scenario: { me: KITCHEN, orders: BOARD } } },
    { mock: "S1 Shop home", label: "S1 · Shop home — top card with Book a rider, no strip", sub: "the board below is still D1's list until PR 2", app: { name: "S1", path: "/deliveries", scenario: { me: SHOP, bookings: BOOKINGS } } },
    { mock: "T1 Menu", label: "T1 · the live bar on Menu", sub: "“coming to your counter”: no arrival signal yet (D-77 §4); the Menu body is restyled in PR 5", app: { name: "T1", path: "/menu", scenario: { me: KITCHEN, orders: BOARD, menu: MENU } } },
    { mock: "T4 Closed", label: "T4 · Closed", app: { name: "T4", path: "/queue", scenario: { me: closed, orders: [] } } },
  ],
};

await mkdir(SHOTS, { recursive: true });
const browser = await launch();
const rows = [];
try {
  const mctx = await browser.newContext(contextDefaults({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 }));
  const mpage = await mctx.newPage();
  await mpage.goto(MOCKS, { waitUntil: "load" });
  await mpage.waitForSelector("[data-screen-label]", { timeout: 30000 });
  await mpage.waitForTimeout(1500);
  for (const r of SETS[SET]) {
    const mock = await shootMock(mpage, r.mock);
    const app = await shootApp(browser, r.app);
    rows.push({ label: r.label, sub: r.sub, mock, app, logicalW: PHONE.width });
    console.log(`ok ${r.label}`);
  }
  await mctx.close();
} finally {
  await browser.close();
}

await buildSheet({ title: `Merchant v2 (D-77) · ${SET}: handoff (left) vs app (right)`, out: OUT, rows });
console.log(`sheet: ${OUT}.png (+ .html); shots in ${SHOTS}`);
