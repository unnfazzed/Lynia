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
const PHARMACY = { ...BASE, name: "Avondale Pharmacy", businessType: "shop", shopKind: "pharmacy" };
const RIDER = { profileId: "11111111-1111-4111-8111-111111111111", firstName: "Tendai", lastName: "Moyo", photoUrl: null, ratingAvg: 4.8, ratingCount: 31, tripsCount: 120, vehicleInfo: null, plate: "Bike ABH 4721", kycVerified: true };
const ago = (min) => new Date(Date.now() - min * 60_000).toISOString();
const ahead = (min) => new Date(Date.now() + min * 60_000).toISOString();
const line = (n, name, priceUsd, quantity, note = null) => ({ itemId: `b000000${n}-0000-4000-8000-000000000000`, dishId: `d-${n}`, name, priceUsd, quantity, note, available: true });
const GAVA = [line(1, "Sadza & beef stew", 4.5, 2, "Extra gravy"), line(2, "Roast chicken (half)", 6, 1)];
const PHARM = [line(3, "Paracetamol 500mg (20 tabs)", 1.5, 1), line(4, "ORS sachets (x5)", 2, 1), line(5, "Plasters (20)", 1.8, 1)];
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

function apiRoute(route, scenario) {
  const path = new URL(route.request().url()).pathname.replace(/^\/__api/, "");
  const json = (status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  if (path === "/merchant/orders") return json(200, scenario.orders ?? []);
  const one = path.match(/^\/merchant\/orders\/([0-9a-f-]+)$/);
  if (one) return json(200, (scenario.orders ?? []).find((o) => o.id === one[1]) ?? {});
  if (/\/pickup-code\/reveal$/.test(path)) return json(200, { pickupCode: "731604" });
  if (path === "/merchant/summary/today") return json(200, { date: "2026-10-02", delivered: 6, rejected: 0, cashTaken: 30, walletTaken: 0, averagePrepMinutes: 15, orders: 7, sales: 59.5, cashOverdue: 0, overdue: [] });
  if (path === "/merchant/me") return json(200, scenario.me);
  if (path === "/merchant/branches") return json(200, { branches: [] });
  return json(200, []);
}

async function shootMerchant(browser, { name, path, scenario }) {
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
    const file = join(SHOTS, `app-${name}.png`);
    await page.screenshot({ path: file });
    return file;
  } finally {
    await ctx.close();
  }
}

const m = (id, label, path, me, sub) => ({ id, label, sub, shoot: (b) => shootMerchant(b, { name: id, path, scenario: { me, orders: [ORDERS[id]] } }) });
const MERCHANT_ROWS = [
  m("M1a", "M1a · Ringing, auto-accepted", "/queue", KITCHEN, "no customer name on a merchant order, so no '· Rudo'; the countdown is the 1 h auto-cancel"),
  m("M3a", "M3a · Cooking ticket", `/queue/${ORDERS.M3a.id}`, KITCHEN),
  m("M3b", "M3b · Packing ticket · pharmacy", `/queue/${ORDERS.M3b.id}`, PHARMACY, "seal note not drawn: it promises the pickup photo (needs backend)"),
  m("M4", "M4 · Hand-over", `/queue/${ORDERS.M4.id}`, KITCHEN, "before the rider types it; the sealed-bag photo row needs the backend; no rider number, so no call"),
  m("M5", "M5 · Tracking", `/queue/${ORDERS.M5.id}`, KITCHEN, "OSM map around the kitchen; no ETA pill or destination (not on the merchant read)"),
  m("M6a", "M6a · Cash back", `/queue/${ORDERS.M6a.id}`, KITCHEN),
  m("M6b", "M6b · Goods back", `/queue/${ORDERS.M6b.id}`, KITCHEN, "no delivery-attempt photo yet (needs backend)"),
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

async function shootRider(browser, { name, fixture, type }) {
  const js = await bundleScreen({ component: join(REPO, "apps/mobile/app/rider/food-job.tsx"), fixture: join(HERE, "mobile/fixtures", `${fixture}.mjs`) });
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
    const file = join(SHOTS, `app-${name}.png`);
    await (await page.$("#root")).screenshot({ path: file });
    return file;
  } finally {
    await ctx.close();
  }
}

const r = (id, label, fixture, type, sub) => ({ id, label, sub, shoot: (b) => shootRider(b, { name: id, fixture, type }) });
const RIDER_ROWS = [
  r("RD2a", "RD2a · At the kitchen · pickup code", "of_rd2a", "73160", "the mock's shop stop drawn at a restaurant; the phone's own keypad, not a drawn numpad (Rider v2)"),
  r("RD4a", "RD4a · At the door · collect cash", "of_rd4a", null, "① ticks once the customer confirmed paying (no server hand-over mark yet)"),
  r("RD4b", "RD4b · Delivery code", "of_rd4b", "4182", "'Can't use the code?' waits for the door-photo backend (RD4c/d)"),
];

await mkdir(SHOTS, { recursive: true });
const browser = await launch();
const rows = [];
try {
  const list = SET === "rider" ? RIDER_ROWS : SET === "all" ? [...MERCHANT_ROWS, ...RIDER_ROWS] : MERCHANT_ROWS;
  for (const row of list) {
    const app = await row.shoot(browser);
    rows.push({ label: row.label, sub: row.sub, mock: FRAME(row.id), app, logicalW: 360 });
    console.log(`ok ${row.label}`);
  }
} finally {
  await browser.close();
}
await buildSheet({ title: "Order flow v2 · PR 3 (D-59): merchant M1a–M6b and rider RD2a–RD4b, 6-digit pickup code", out: OUT, rows });
console.log(`sheet: ${OUT}.png (+ .html); shots in ${SHOTS}`);
