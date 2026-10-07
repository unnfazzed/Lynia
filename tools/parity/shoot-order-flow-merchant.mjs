#!/usr/bin/env node
/**
 * Order flow v2, PR 3 (ledger D-59): the merchant and rider hand-over screens beside the handoff's own
 * frames (packages/design/handoff/order-flow-v2/design/screens/<ID>.png, 360×720 @2x).
 *
 * Merchant (default set): the Next dev server with the API stubbed in the browser (every call to
 * `<origin>/__api/**`, same as shoot-merchant-mobile.mjs) — start it first:
 *
 *   API_BASE_URL=http://127.0.0.1:4312/__api node tools/parity/serve-web.mjs merchant
 *   node tools/parity/shoot-order-flow-merchant.mjs --out docs/parity/ORDER-FLOW-V2-MERCHANT-2026-10-02
 *
 * Rider (`--set rider`): the rider food job through react-native-web from the of_rd* fixtures
 * (tools/parity/mobile/fixtures/_order_flow_rider.mjs), no server needed:
 *
 *   node tools/parity/shoot-order-flow-merchant.mjs --set rider --out docs/parity/ORDER-FLOW-V2-RIDER-2026-10-02
 *
 * `--set all` shoots both into one sheet (the PR's docs/parity/ORDER-FLOW-V2-MERCHANT-RIDER-2026-10-02).
 *
 * Round 2 (`--set merchant2|rider2|all2`): the proposer and swap picker (U1a/U1b), the wait (M2), the
 * scheduled ring and list (M1c/M7a/M7b), the sealed-bag photo (M4b/M4), the door photo (M5b), the
 * prescription check (M8a/M8b); the rider's offer tags (RD1b–d), the camera step (RD2b), the Rx tick (RD3)
 * and "Can't use the code?" (RD4c) — docs/parity/ORDER-FLOW-V2-MERCHANT-RIDER-2-2026-10-02.
 */
import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { contextDefaults, launch } from "./lib/browser.mjs";
import { buildSheet } from "./lib/sheet.mjs";
import { bundleScreen } from "./mobile/bundle.mjs";
import { interFontCss } from "./mobile/fonts.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const ORIGIN = process.env.PARITY_MERCHANT_URL || "http://127.0.0.1:4312";
const outArg = process.argv.indexOf("--out");
const OUT = resolve(outArg > 0 ? process.argv[outArg + 1] : join(HERE, "out/order-flow-merchant"));
const SHOTS = `${OUT}-shots`;
const setArg = process.argv.indexOf("--set");
const SET = setArg > 0 ? process.argv[setArg + 1] : "merchant";
const PHONE = { width: 360, height: 720 };
const FRAME = (id) => join(REPO, "packages/design/handoff/order-flow-v2/design/screens", `${id}.png`);

// ── Merchant ──────────────────────────────────────────────────────────────────────────────────────
const SESSION = { accessToken: "parity", refreshToken: "parity.refresh", expiresIn: 900, issuedAt: Date.now(), profileId: "p-parity", role: "customer" };
const PIN = { point: { lat: -17.8009, lng: 31.0389 }, landmark: "Gava's Kitchen", contactPhone: "+263771234567" };
const HOURS = Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, { open: "00:00", close: "23:59" }]));
const BASE = {
  id: "m-parity", ownerPhoneMasked: "+263•••••4567", description: null, coverPhotoUrl: null, logoUrl: null, cuisineTags: [], priceLevel: null,
  hours: HOURS, cashRule: "collect_and_return", busy: false, pilotEnabled: true, myRole: "owner", myName: "Farai Chari", location: PIN,
};
const KITCHEN = { ...BASE, name: "Gava's Kitchen", businessType: "restaurant", shopKind: null };
const PHARMACY = { ...BASE, name: "Avondale Pharmacy", businessType: "shop", shopKind: "pharmacy", myIsPharmacist: true };
const SHOP = { ...BASE, name: "Avondale Fresh", businessType: "shop", shopKind: "grocery" };
// A stand-in photo (the handoff draws a labelled placeholder): an SVG, so the sheet needs no network.
const PHOTO = (label) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#2a3035"/><text x="200" y="155" fill="#BFE6CD" font-family="monospace" font-size="18" text-anchor="middle">${label}</text></svg>`)}`;
const RIDER = { profileId: "11111111-1111-4111-8111-111111111111", firstName: "Tendai", lastName: "Moyo", photoUrl: null, ratingAvg: 4.8, ratingCount: 31, tripsCount: 120, vehicleInfo: null, plate: "Bike ABH 4721", kycVerified: true };
const ago = (min) => new Date(Date.now() - min * 60_000).toISOString();
const ahead = (min) => new Date(Date.now() + min * 60_000).toISOString();
const line = (n, name, priceUsd, quantity, note = null) => ({ itemId: `b000000${n}-0000-4000-8000-000000000000`, dishId: `d-${n}`, name, priceUsd, quantity, note, available: true });
const GAVA = [line(1, "Sadza & beef stew", 4.5, 2, "Extra gravy"), line(2, "Roast chicken (half)", 6, 1)];
const PHARM = [line(3, "Paracetamol 500mg (20 tabs)", 1.5, 1), line(4, "ORS sachets (x5)", 2, 1), line(5, "Plasters (20)", 1.8, 1)];
// Avondale Fresh, the handoff's shop sample ($14.60).
const AVF = [line(6, "Bread (Lobels 700g)", 1.1, 1), line(7, "Eggs (tray of 30)", 5.5, 1), line(8, "Mazoe orange 2L", 3.2, 1), line(9, "Cooking oil 2L", 4.8, 1)].map((l) => ({ ...l, available: null }));
const AVF_VENUE = { name: "Avondale Fresh", businessType: "shop", shopKind: "grocery", kycVerified: false };
const dish = (n, name, priceUsd) => ({ id: `d000000${n}-0000-4000-8000-000000000000`, categoryId: "c-1", name, description: null, priceUsd, photoUrl: null, isDraft: false, outOfStock: false, sortOrder: n });
const DISHES = [dish(1, "Bakers Inn 700g", 1.2), dish(2, "Lobels brown 700g", 1.1), dish(3, "Proton white 600g", 0.95), dish(4, "Olivine cooking oil 2L", 5)];
const slotAt = (h, m, dayOffset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};
const ROUND = {
  id: "c0000001-0000-4000-8000-000000000000", kind: "at_accept", status: "open", createdAt: ago(0.3), deadlineAt: ahead(2.7), resolvedAt: null, wasTotal: 14.6, keptSubtotal: 5.5,
  lines: [
    { id: "c1000001-0000-4000-8000-000000000000", itemId: AVF[0].itemId, action: "swap", name: "Bread (Lobels 700g)", priceUsd: 1.1, quantity: 1, newQuantity: null, swapDishId: DISHES[0].id, swapName: "Bakers Inn 700g", swapPriceUsd: 1.2, swapQuantity: 1, swapPhotoUrl: null, answer: null },
    { id: "c1000002-0000-4000-8000-000000000000", itemId: AVF[2].itemId, action: "remove", name: "Mazoe orange 2L", priceUsd: 3.2, quantity: 1, newQuantity: null, swapDishId: null, swapName: null, swapPriceUsd: null, swapQuantity: null, swapPhotoUrl: null, answer: null },
    { id: "c1000003-0000-4000-8000-000000000000", itemId: AVF[3].itemId, action: "swap", name: "Cooking oil 2L", priceUsd: 4.8, quantity: 1, newQuantity: null, swapDishId: DISHES[3].id, swapName: "Olivine 2L", swapPriceUsd: 5, swapQuantity: 1, swapPhotoUrl: null, answer: null },
  ],
};
function order(id, over) {
  return {
    id, merchantId: "m-parity", status: "requested", merchantPhase: "preparing", items: GAVA, note: null, paymentMethod: "cash", merchantPaymentPhone: null,
    merchantGoodsTotal: 15, deliveryFee: 1.5, total: 16.5, acceptDeadlineAt: null, itemApprovalDeadlineAt: null, prepMinutes: 20, prepStartedAt: ago(8),
    readyAt: null, rejectionReason: null, paymentCallLoggedAt: null, paymentRequestedAt: null, merchantPaymentReference: null, merchantPaymentConfirmedAt: null,
    riderId: null, dispatchAttempt: 0, dispatchOfferExpiresAt: null, noRiderHoldAt: null, pickupCodeAttempts: 0, noShowCallTimestamps: [], createdAt: ago(10),
    merchantCashRule: "collect_and_return", ...over,
  };
}
const ORDERS = {
  M1a: order("a1b20000-0000-4000-8000-000000000001", { autoAccepted: true, kitchenConfirmedAt: null, prepStartedAt: ago(0.5), createdAt: ago(2) }),
  M3a: order("a1b20000-0000-4000-8000-000000000002", { prepStartedAt: ago(8) }),
  M3b: order("f7c10000-0000-4000-8000-000000000003", { items: PHARM, merchantGoodsTotal: 5.3, prepMinutes: 10, prepStartedAt: ago(4) }),
  M4: order("a1b20000-0000-4000-8000-000000000004", { merchantPhase: null, status: "assigned", riderId: RIDER.profileId, rider: RIDER, merchantGoodsTotal: 14.6 }),
  M5: order("a1b20000-0000-4000-8000-000000000005", { merchantPhase: null, status: "en_route_dropoff", riderId: RIDER.profileId, rider: RIDER, debtStatus: "open", debtAmount: 15 }),
  M6a: order("a1b20000-0000-4000-8000-000000000006", {
    merchantPhase: null, status: "delivered", riderId: RIDER.profileId, rider: RIDER, debtStatus: "open", debtAmount: 15, deliveredAt: ago(0), cashDueAt: ahead(30),
  }),
  M6b: order("a1b20000-0000-4000-8000-000000000007", { merchantPhase: null, status: "undelivered", riderId: RIDER.profileId, rider: RIDER, debtStatus: "open", debtAmount: 15, cashDueAt: ahead(43) }),
};

// Round 2's orders (Order flow v2 part 6, ledger D-59).
Object.assign(ORDERS, {
  U1a: order("a1b20000-0000-4000-8000-000000000011", {
    merchantPhase: "awaiting_accept", items: AVF, merchantGoodsTotal: 14.6, prepMinutes: null, prepStartedAt: null, acceptDeadlineAt: ahead(1.24), venue: AVF_VENUE,
  }),
  M1c: order("a1b20000-0000-4000-8000-000000000012", {
    autoAccepted: true, kitchenConfirmedAt: null, prepMinutes: 20, prepStartedAt: ago(0), createdAt: ago(60 * 20), scheduledFor: slotAt(new Date().getHours() + 1, 0), ringsAt: ago(0), scheduleStartedAt: ago(0),
  }),
  M2: order("a1b20000-0000-4000-8000-000000000013", {
    items: AVF.map((l, k) => ({ ...l, available: k === 1 })), merchantGoodsTotal: 11.6, venue: AVF_VENUE, substitution: ROUND, prepStartedAt: ago(1),
  }),
  M4b: order("a1b20000-0000-4000-8000-000000000014", { merchantPhase: null, status: "en_route_pickup", riderId: RIDER.profileId, rider: RIDER, items: AVF, merchantGoodsTotal: 14.6, venue: AVF_VENUE, pickupProofRequired: true }),
  M4p: order("a1b20000-0000-4000-8000-000000000015", {
    merchantPhase: null, status: "picked_up", riderId: RIDER.profileId, rider: RIDER, items: AVF, merchantGoodsTotal: 14.6, venue: AVF_VENUE, debtStatus: "open", debtAmount: 14.6,
    pickupProofRequired: true, pickupProof: { photoUrl: PHOTO("bag"), takenAt: ago(0), bagSealed: true },
  }),
  M5b: order("a1b20000-0000-4000-8000-000000000016", {
    merchantPhase: null, status: "en_route_dropoff", riderId: RIDER.profileId, rider: RIDER, debtStatus: "open", debtAmount: 15,
    doorProof: { photoUrl: PHOTO("door"), takenAt: ago(0), reason: "left_at_gate", handedTo: "Chipo" },
  }),
  M7b: order("a1b20000-0000-4000-8000-000000000017", {
    merchantPhase: "awaiting_accept", acceptDeadlineAt: null, prepMinutes: null, prepStartedAt: null, scheduledFor: slotAt(12, 30, 1), ringsAt: slotAt(12, 5, 1), scheduleStartedAt: null,
  }),
  M8a: order("f7c10000-0000-4000-8000-000000000018", {
    items: [{ ...line(10, "Amoxicillin 500mg (21 caps)", 6.2, 1), rxRequired: true }, line(3, "Paracetamol 500mg (20 tabs)", 1.5, 1)], merchantGoodsTotal: 7.7,
    prescription: { status: "pending", patientName: "Rudo Moyo", pageCount: 2 },
  }),
});
const SCHEDULED = [
  order("a1b20000-0000-4000-8000-000000000021", { merchantPhase: "awaiting_accept", scheduledFor: slotAt(12, 30, 1), ringsAt: slotAt(12, 5, 1), scheduleStartedAt: null }),
  order("c4d10000-0000-4000-8000-000000000022", {
    merchantPhase: "awaiting_accept", merchantGoodsTotal: 22.5, scheduledFor: slotAt(18, 0, 1), ringsAt: slotAt(17, 35, 1), scheduleStartedAt: null,
    items: [line(1, "Sadza & beef stew", 4.5, 2), line(2, "Roast chicken (half)", 6, 1), line(11, "Greens", 2, 1), line(12, "Mazoe 2L", 5.5, 1)],
  }),
];

function apiRoute(route, scenario) {
  const path = new URL(route.request().url()).pathname.replace(/^\/__api/, "");
  const json = (status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  if (path === "/merchant/orders") return json(200, scenario.orders ?? []);
  if (path === "/merchant/scheduled-orders") return json(200, scenario.scheduled ?? []);
  if (path === "/merchant/dishes") return json(200, DISHES);
  if (path === "/app/order-flags") return json(200, { rxEnabled: true });
  if (/\/prescription$/.test(path)) return json(200, { photos: [{ page: 1, url: PHOTO("prescription photo · page 1 of 2") }, { page: 2, url: PHOTO("page 2") }], expiresInSeconds: 300 });
  const one = path.match(/^\/merchant\/orders\/([0-9a-f-]+)$/);
  if (one) return json(200, (scenario.orders ?? []).find((o) => o.id === one[1]) ?? {});
  if (/\/pickup-code\/reveal$/.test(path)) return json(200, { pickupCode: "731604" });
  if (path === "/merchant/summary/today") return json(200, { date: "2026-10-02", delivered: 6, rejected: 0, cashTaken: 30, walletTaken: 0, averagePrepMinutes: 15, orders: 7, sales: 59.5, cashOverdue: 0, overdue: [] });
  if (path === "/merchant/me") return json(200, scenario.me);
  if (path === "/merchant/branches") return json(200, { branches: [] });
  return json(200, []);
}

async function shootMerchant(browser, { name, path, scenario, steps }) {
  const ctx = await browser.newContext(contextDefaults({ viewport: PHONE, deviceScaleFactor: 2 }));
  await ctx.addCookies([{ name: "lynia_merchant_session", value: encodeURIComponent(JSON.stringify(SESSION)), url: ORIGIN }]);
  await ctx.route("**/__api/**", (route) => apiRoute(route, scenario));
  await ctx.route("**/socket.io/**", (route) => route.abort());
  const page = await ctx.newPage();
  try {
    await page.goto(ORIGIN + path, { waitUntil: "networkidle", timeout: 90000 });
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; } *, *::before { animation: none !important; }" });
    await page.evaluate(() => (document.fonts ? document.fonts.ready : null));
    await page.waitForTimeout(700);
    for (const step of steps ?? []) {
      await step(page);
      await page.waitForTimeout(350);
    }
    const file = join(SHOTS, `app-${name}.png`);
    await page.screenshot({ path: file });
    return file;
  } finally {
    await ctx.close();
  }
}

const m = (id, label, path, me, sub, extra = {}) => ({
  id: extra.frame ?? id,
  label,
  sub,
  shoot: (b) => shootMerchant(b, { name: extra.name ?? id, path, steps: extra.steps, scenario: { me, orders: extra.orders ?? [ORDERS[extra.order ?? id]], scheduled: extra.scheduled } }),
});
// Inside the top overlay when one is up (the ringing takeover sits over the Orders home).
const scope = async (page) => ((await page.locator(".m-overlay").count()) > 0 ? page.locator(".m-overlay").last() : page);
const tap = (text) => async (page) => (await scope(page)).getByText(text, { exact: false }).first().click();
const tapRole = (role, name) => async (page) => (await scope(page)).getByRole(role, { name }).first().click();
const MERCHANT2_ROWS = [
  m("U1a", "U1a · Ringing · shop · proposer", "/queue", SHOP, "Mazoe removed, the oil swapped, Bread open; no customer name (not on a merchant order)", {
    steps: [tap("Mazoe orange 2L"), tapRole("button", "Remove it"), tap("Cooking oil 2L"), tapRole("button", "Swap for…"), tap("Olivine cooking oil 2L"), tapRole("button", "Swap for Olivine cooking oil 2L"), tap("Bread (Lobels 700g)")],
  }),
  m("U1b", "U1b · Swap picker", "/queue", SHOP, "the shop's own live items with the price difference", {
    order: "U1a",
    steps: [tap("Bread (Lobels 700g)"), tapRole("button", "Swap for…"), tap("Bakers Inn 700g")],
  }),
  m("M1c", "M1c · Scheduled order rings at start", "/queue", KITCHEN, "an auto-accepting kitchen: 'Start cooking · ready …'"),
  m("M2", "M2 · Waiting for the customer", `/queue/order?id=${ORDERS.M2.id}`, SHOP, "'the customer' for the handoff's Rudo"),
  m("M3b", "M3b · Packing ticket · pharmacy (seal note)", `/queue/order?id=${ORDERS.M3b.id}`, PHARMACY, "", { name: "M3b-2" }),
  m("M4b", "M4b · Hand-over · waiting for photo", `/queue/order?id=${ORDERS.M4b.id}`, SHOP, "the code isn't typed yet (a shop's pickup needs the photo first)"),
  m("M4", "M4 · Hand-over with the sealed-bag photo", `/queue/order?id=${ORDERS.M4p.id}`, SHOP, "", { name: "M4-photo", order: "M4p" }),
  m("M5b", "M5b · Tracking · door photo", `/queue/order?id=${ORDERS.M5b.id}`, KITCHEN, "on the way: the photo is evidence only, the order isn't delivered by it"),
  m("M7a", "M7a · Scheduled list", "/queue", KITCHEN, "", {
    orders: [ORDERS.M3a],
    scheduled: SCHEDULED,
    steps: [tapRole("tab", /Scheduled/)],
  }),
  m("M7b", "M7b · Scheduled ticket", `/queue/order?id=${ORDERS.M7b.id}`, KITCHEN),
  m("M8a", "M8a · Prescription check", `/queue/rx?id=${ORDERS.M8a.id}`, PHARMACY, "photo stand-in"),
  m("M8b", "M8b · Decline a prescription", `/queue/rx?id=${ORDERS.M8a.id}`, PHARMACY, "", {
    order: "M8a",
    steps: [tapRole("button", "Decline"), tapRole("radio", "Expired"), (page) => page.getByLabel("Note for the customer").fill("Dated March 2026")],
  }),
];
const MERCHANT_ROWS = [
  m("M1a", "M1a · Ringing, auto-accepted", "/queue", KITCHEN, "no customer name on a merchant order, so no '· Rudo'; the countdown is the 1 h auto-cancel"),
  m("M3a", "M3a · Cooking ticket", `/queue/order?id=${ORDERS.M3a.id}`, KITCHEN),
  m("M3b", "M3b · Packing ticket · pharmacy", `/queue/order?id=${ORDERS.M3b.id}`, PHARMACY, "seal note not drawn: it promises the pickup photo (needs backend)"),
  m("M4", "M4 · Hand-over", `/queue/order?id=${ORDERS.M4.id}`, KITCHEN, "before the rider types it; the sealed-bag photo row needs the backend; no rider number, so no call"),
  m("M5", "M5 · Tracking", `/queue/order?id=${ORDERS.M5.id}`, KITCHEN, "OSM map around the kitchen; no ETA pill or destination (not on the merchant read)"),
  m("M6a", "M6a · Cash back", `/queue/order?id=${ORDERS.M6a.id}`, KITCHEN),
  m("M6b", "M6b · Goods back", `/queue/order?id=${ORDERS.M6b.id}`, KITCHEN, "no delivery-attempt photo yet (needs backend)"),
];

// ── Rider ─────────────────────────────────────────────────────────────────────────────────────────
function harnessHtml(js, fontCss) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${fontCss}
html,body{margin:0;padding:0;background:#fff;}
#root{width:${PHONE.width}px;height:${PHONE.height}px;overflow:hidden;display:flex;flex-direction:column;
  font-family:"Inter",-apple-system,"Segoe UI",Roboto,sans-serif;}
#root>*{flex:1 1 auto;min-height:0;}
</style></head><body><div id="root"></div><script>${js}</script></body></html>`;
}

async function shootRider(browser, { name, fixture, type, clicks, component = "food-job.tsx" }) {
  const js = await bundleScreen({ component: join(REPO, "apps/mobile/app/rider", component), fixture: join(HERE, "mobile/fixtures", `${fixture}.mjs`) });
  const ctx = await browser.newContext(contextDefaults({ viewport: PHONE, deviceScaleFactor: 2 }));
  const page = await ctx.newPage();
  try {
    await page.setContent(harnessHtml(js, await interFontCss()), { waitUntil: "load" });
    await page.waitForFunction(() => window.__PARITY_READY === true || typeof window.__PARITY_ERROR === "string", { timeout: 20000 });
    const err = await page.evaluate(() => window.__PARITY_ERROR || null);
    if (err) throw new Error(err);
    await page.evaluate(() => (document.fonts ? document.fonts.ready : null));
    await page.waitForTimeout(900);
    if (type) {
      await page.locator("input").first().fill(type);
      await page.waitForTimeout(400);
    }
    for (const text of clicks ?? []) {
      await page.getByText(text, { exact: true }).last().click();
      await page.waitForTimeout(500);
    }
    const file = join(SHOTS, `app-${name}.png`);
    await (await page.$("#root")).screenshot({ path: file });
    return file;
  } finally {
    await ctx.close();
  }
}

const r = (id, label, fixture, type, sub, extra = {}) => ({ id, label, sub, shoot: (b) => shootRider(b, { name: id, fixture, type, ...extra }) });
const RIDER2_ROWS = [
  r("RD1b", "RD1b · Offer · PHARMACY", "of_rd1b", null, "harness: grey map", { component: "food-offer.tsx" }),
  r("RD1c", "RD1c · Offer · scheduled", "of_rd1c", null, "harness: grey map", { component: "food-offer.tsx" }),
  r("RD1d", "RD1d · Offer · Rx order", "of_rd1d", null, "harness: grey map", { component: "food-offer.tsx" }),
  r("RD2b", "RD2b · Sealed-bag tick + photo", "of_rd2b", "731604", "the phone's own camera takes the shot (the shutter opens it); the viewfinder is the frame", {
    clicks: ["Photo of the sealed bag", "Bag is sealed"],
  }),
  r("RD3", "RD3 · Rx stop card", "of_rd3", null, "the mock's sample names; the drop-off is the kitchen fixture's"),
  r("RD4c", "RD4c · Can't use the code", "of_rd4c", null, "", { clicks: ["Can’t use the code?", "Left at the gate — the customer agreed"] }),
];
const RIDER_ROWS = [
  r("RD2a", "RD2a · At the kitchen · pickup code", "of_rd2a", "73160", "the mock's shop stop drawn at a restaurant; the phone's own keypad, not a drawn numpad (Rider v2)"),
  r("RD4a", "RD4a · At the door · collect cash", "of_rd4a", null, "① ticks once the customer confirmed paying (no server hand-over mark yet)"),
  r("RD4b", "RD4b · Delivery code", "of_rd4b", "4182", "'Can't use the code?' waits for the door-photo backend (RD4c/d)"),
];

await mkdir(SHOTS, { recursive: true });
const browser = await launch();
const rows = [];
try {
  const list =
    SET === "rider"
      ? RIDER_ROWS
      : SET === "all"
        ? [...MERCHANT_ROWS, ...RIDER_ROWS]
        : SET === "merchant2"
          ? MERCHANT2_ROWS
          : SET === "rider2"
            ? RIDER2_ROWS
            : SET === "all2"
              ? [...MERCHANT2_ROWS, ...RIDER2_ROWS]
              : MERCHANT_ROWS;
  for (const row of list) {
    const app = await row.shoot(browser);
    rows.push({ label: row.label, sub: row.sub, mock: FRAME(row.id), app, logicalW: 360 });
    console.log(`ok ${row.label}`);
  }
} finally {
  await browser.close();
}
const TITLE = SET.endsWith("2")
  ? "Order flow v2 · part 6 (D-59): merchant proposer, wait, photos, Scheduled, Rx check; rider tags, sealed bag, Rx tick, door photo"
  : "Order flow v2 · PR 3 (D-59): merchant M1a–M6b and rider RD2a–RD4b, 6-digit pickup code";
await buildSheet({ title: TITLE, out: OUT, rows });
console.log(`sheet: ${OUT}.png (+ .html); shots in ${SHOTS}`);
