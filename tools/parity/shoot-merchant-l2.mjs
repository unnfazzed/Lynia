#!/usr/bin/env node
/**
 * The merchant web upgrade L2 screenshot sheet (ledger D-44, docs/DESIGN-DEVIATIONS.md): Book a rider
 * (Deliveries, the booking form, the pick screen and the delivery code), the shop's own nav, and shop
 * words on the drawn Items and Shop screens beside their RM mocks, at the merchant's 1024×680 and the
 * 320px phone check.
 *
 * The tablet's API is stubbed in the browser (every call to `<origin>/__api/**`), so no seeded backend
 * is needed: start the dev server with that same-origin base first —
 *
 *   API_BASE_URL=http://127.0.0.1:4312/__api node tools/parity/serve-web.mjs merchant
 *   node tools/parity/shoot-merchant-l2.mjs --out docs/parity/MERCHANT-L2-D44-2026-09-29
 *
 * OpenStreetMap tiles load through the container's proxy when it allows them; otherwise they're drawn
 * as the lane's plain grey stand-in, which the sheet says.
 */
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { contextDefaults, launch } from "./lib/browser.mjs";
import { withMockRenderer } from "./lib/mock.mjs";
import { buildSheet } from "./lib/sheet.mjs";

const ORIGIN = process.env.PARITY_MERCHANT_URL || "http://127.0.0.1:4312";
const outArg = process.argv.indexOf("--out");
const OUT = resolve(outArg > 0 ? process.argv[outArg + 1] : "out/merchant-l2");
const SHOTS = `${OUT}-shots`;

const TABLET = { width: 1024, height: 680 };
const PHONE = { width: 320, height: 640 };
const TILE_SVG = "<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256'><rect width='256' height='256' fill='#e4e8ea'/></svg>";

const SESSION = {
  accessToken: "parity",
  refreshToken: "parity.refresh",
  expiresIn: 900,
  issuedAt: Date.now(),
  profileId: "p-parity",
  role: "customer",
};

const PIN = { point: { lat: -17.8575, lng: 31.0367 }, landmark: "Next to the Total garage, blue gate", contactPhone: "+263771234567" };

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
  pilotEnabled: false,
  myRole: "owner",
  location: PIN,
};

const IDS = {
  finding: "11111111-1111-4111-8111-111111111111",
  coming: "22222222-2222-4222-8222-222222222222",
  delivered: "33333333-3333-4333-8333-333333333333",
  expired: "44444444-4444-4444-8444-444444444444",
};

const BLESSING = { name: "Blessing M.", phone: "+263772222222", bikeReg: "AFG 2231" };

function booking(id, over) {
  return {
    id,
    state: "finding",
    status: "broadcasting",
    createdAt: new Date(Date.now() - 20 * 60_000).toISOString(),
    expiresAt: null,
    dropoff: { point: { lat: -17.8105, lng: 31.0452 }, landmark: "Blue gate opposite the church, 12 Fife Ave", contactPhone: "+263773333333" },
    itemsSummary: "2 brake pads and an oil filter",
    declaredValue: "45.00",
    proposedFare: "3.50",
    agreedFare: null,
    bookedBy: "Tendai",
    rider: null,
    offerCount: 0,
    undeliveredReason: null,
    cancelledBy: null,
    cancelReason: null,
    rebroadcastedToId: null,
    rebroadcastOfId: null,
    codeIssuedAt: null,
    offers: [],
    ...over,
  };
}

function offer(id, over) {
  return {
    id,
    type: "accept",
    offeredFare: "3.50",
    etaMinutes: 6,
    rider: { name: "Blessing M.", photoUrl: null, ratingAvg: 4.8, ratingCount: 31, tripsCount: 120 },
    preferred: false,
    ownMember: false,
    ...over,
  };
}

/** Computed per request, so the 90-second window is always open when the page reads it. */
function bookings() {
  const finding = booking(IDS.finding, {
    expiresAt: new Date(Date.now() + 62_000).toISOString(),
    createdAt: new Date(Date.now() - 28_000).toISOString(),
    itemsSummary: "A car battery (N70)",
    declaredValue: "120.00",
    proposedFare: "4.20",
    dropoff: { point: { lat: -17.8292, lng: 31.0522 }, landmark: "Copacabana rank, the green kiosk", contactPhone: "+263774444444" },
    offerCount: 3,
    offers: [
      offer("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", { offeredFare: "4.20", etaMinutes: 4 }),
      offer("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", {
        type: "counter",
        offeredFare: "5.00",
        etaMinutes: 3,
        rider: { name: "Farai K.", photoUrl: null, ratingAvg: 4.6, ratingCount: 12, tripsCount: 44 },
      }),
      offer("cccccccc-cccc-4ccc-8ccc-cccccccccccc", {
        etaMinutes: 9,
        offeredFare: "4.20",
        rider: { name: "Tendai Moyo", photoUrl: null, ratingAvg: null, ratingCount: 0, tripsCount: 0 },
        ownMember: true,
      }),
    ],
  });
  const coming = booking(IDS.coming, {
    state: "coming",
    status: "assigned",
    createdAt: new Date(Date.now() - 9 * 60_000).toISOString(),
    rider: BLESSING,
    agreedFare: "3.50",
    codeIssuedAt: new Date(Date.now() - 8 * 60_000).toISOString(),
  });
  const delivered = booking(IDS.delivered, {
    state: "delivered",
    status: "completed",
    createdAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
    itemsSummary: "Spark plugs x4",
    declaredValue: "18.00",
    rider: { ...BLESSING, phone: null },
    agreedFare: "3.00",
    bookedBy: "Rudo",
  });
  const expired = booking(IDS.expired, {
    state: "expired",
    status: "expired",
    createdAt: new Date(Date.now() - 5 * 3600_000).toISOString(),
    itemsSummary: "Wiper blades",
    declaredValue: "12.00",
    proposedFare: "2.50",
  });
  return [finding, coming, delivered, expired];
}

const CATEGORIES = [
  { id: "c1", name: "Brakes", sortOrder: 0, availableFrom: null, availableTo: null, hidden: false, dishCount: 2 },
  { id: "c2", name: "Engine", sortOrder: 1, availableFrom: null, availableTo: null, hidden: false, dishCount: 1 },
];
const ITEMS = [
  { id: "d1", categoryId: "c1", name: "Brake pads (front)", description: "Toyota Corolla 2008–2013", priceUsd: 22, photoUrl: null, isDraft: true, outOfStock: false, sortOrder: 0 },
  { id: "d2", categoryId: "c1", name: "Brake fluid DOT 4", description: "500 ml", priceUsd: 6.5, photoUrl: null, isDraft: true, outOfStock: false, sortOrder: 1 },
  { id: "d3", categoryId: "c2", name: "Oil filter", description: null, priceUsd: 7, photoUrl: null, isDraft: true, outOfStock: false, sortOrder: 0 },
];

const SCENARIOS = {
  shop: {
    me: { ...PROFILE, name: "Mbare Auto Spares", businessType: "shop", shopKind: "auto_parts", cuisineTags: ["Brakes", "Batteries"] },
    bookings,
    categories: CATEGORIES,
    dishes: ITEMS,
  },
  newShop: {
    me: { ...PROFILE, name: "Mbare Auto Spares", businessType: "shop", shopKind: "auto_parts" },
    bookings: () => [],
    categories: [],
    dishes: [],
  },
  restaurant: {
    me: { ...PROFILE, name: "Mai Tino's Kitchen", businessType: "restaurant", shopKind: null, pilotEnabled: true },
    bookings: () => bookings().slice(0, 2),
    categories: [],
    dishes: [],
  },
};

let tilesStubbed = false;

async function apiRoute(route, scenario) {
  const url = new URL(route.request().url());
  const path = url.pathname.replace(/^\/__api/, "");
  const json = (status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  if (path === "/merchant/me") return json(200, scenario.me);
  if (path === "/merchant/dishes") return json(200, scenario.dishes);
  if (path === "/merchant/categories") return json(200, scenario.categories);
  if (path === "/merchant/orders") return json(200, []);
  if (path === "/merchant/bookings") return json(200, scenario.bookings());
  const one = /^\/merchant\/bookings\/([0-9a-f-]{36})$/.exec(path);
  if (one) {
    const b = scenario.bookings().find((x) => x.id === one[1]);
    return b ? json(200, b) : json(404, { message: "Not found" });
  }
  return json(404, { message: "Not stubbed" });
}

async function shoot(browser, { name, path, viewport, scenario = SCENARIOS.shop, full = false, before, codes }) {
  const ctx = await browser.newContext(contextDefaults({ viewport, deviceScaleFactor: 2 }));
  await ctx.addCookies([{ name: "lynia_merchant_session", value: encodeURIComponent(JSON.stringify(SESSION)), url: ORIGIN }]);
  if (codes) {
    // The browser that picked the rider keeps the code (lib/booking rememberCode).
    await ctx.addInitScript((entries) => {
      for (const [id, code] of entries) window.sessionStorage.setItem(`lynia_booking_code:${id}`, code);
    }, Object.entries(codes));
  }
  await ctx.route("**/__api/**", (route) => apiRoute(route, scenario));
  await ctx.route("**/socket.io/**", (route) => route.abort());
  // Match on the parsed host, not a regex over the whole URL (CodeQL js/regex/missing-regexp-anchor).
  await ctx.route((url) => url.hostname === "tile.openstreetmap.org" || url.hostname.endsWith(".tile.openstreetmap.org"), async (route) => {
    try {
      const res = await route.fetch({ timeout: 8000 });
      if (res.ok()) return route.fulfill({ response: res });
    } catch {
      // fall through to the stand-in
    }
    tilesStubbed = true;
    return route.fulfill({ status: 200, contentType: "image/svg+xml", body: TILE_SVG });
  });
  const page = await ctx.newPage();
  try {
    await page.goto(ORIGIN + path, { waitUntil: "networkidle", timeout: 90000 });
    if (before) await before(page);
    // Next's dev-mode badge is dev tooling, not the app.
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    if (full) {
      // The shell is one screen tall and scrolls inside; let a full-length shot show the whole screen,
      // from its top.
      await page.addStyleTag({
        content:
          ".kitchen-shell { height: auto !important; min-height: 100dvh; overflow: visible !important; } " +
          ".kitchen-content, .kitchen-page { overflow: visible !important; height: auto !important; }",
      });
      await page.evaluate(() => {
        for (const el of document.querySelectorAll(".kitchen-content, .kitchen-page")) el.scrollTop = 0;
        window.scrollTo(0, 0);
      });
    }
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await page.evaluate(() => (document.fonts ? document.fonts.ready : null));
    await page.waitForTimeout(400);
    const file = join(SHOTS, `${name}.png`);
    await page.screenshot({ path: file, fullPage: full });
    return file;
  } finally {
    await ctx.close();
  }
}

const fillForm = async (page) => {
  await page.getByRole("button", { name: "Find a rider" }).waitFor();
  await page.getByLabel("Where is it going?").fill("-17.8105, 31.0452");
  await page.getByText("Got it. Check the pin below.").waitFor();
  await page.getByLabel("What should the rider look for?").fill("Blue gate opposite the church, 12 Fife Ave");
  await page.getByLabel("Buyer's phone").fill("0773333333");
  await page.getByLabel("What's going?").fill("2 brake pads and an oil filter");
  await page.getByLabel("What is it worth? (US$)").fill("45");
  await page.getByRole("checkbox").check();
  await page.getByLabel("Buyer's phone").blur();
};

const waitFor = (text) => async (page) => {
  await page.getByText(text).first().waitFor();
};

await mkdir(SHOTS, { recursive: true });
const browser = await launch();
const app = {};
try {
  app.queue = await shoot(browser, { name: "queue-restaurant-tablet", path: "/queue", viewport: TABLET, scenario: SCENARIOS.restaurant, before: waitFor(/bookings live/) });
  app.deliveries = await shoot(browser, { name: "deliveries-shop-tablet", path: "/deliveries", viewport: TABLET, full: true, before: waitFor("Live now") });
  app.deliveriesPhone = await shoot(browser, { name: "deliveries-shop-320", path: "/deliveries", viewport: PHONE, full: true, before: waitFor("Live now") });
  app.deliveriesEmpty = await shoot(browser, { name: "deliveries-empty-tablet", path: "/deliveries", viewport: TABLET, scenario: SCENARIOS.newShop, before: waitFor("Book your first rider") });
  app.form = await shoot(browser, { name: "book-form-tablet", path: "/deliveries/new", viewport: TABLET, full: true, before: fillForm });
  app.formPhone = await shoot(browser, { name: "book-form-320", path: "/deliveries/new", viewport: PHONE, full: true, before: fillForm });
  app.pick = await shoot(browser, { name: "pick-tablet", path: `/deliveries/booking?id=${IDS.finding}`, viewport: TABLET, full: true, before: waitFor("Stay here to pick a rider") });
  app.pickPhone = await shoot(browser, { name: "pick-320", path: `/deliveries/booking?id=${IDS.finding}`, viewport: PHONE, full: true, before: waitFor("Stay here to pick a rider") });
  app.code = await shoot(browser, {
    name: "code-tablet",
    path: `/deliveries/booking?id=${IDS.coming}`,
    viewport: TABLET,
    full: true,
    codes: { [IDS.coming]: "482910" },
    before: waitFor("Send the code to the buyer on WhatsApp"),
  });
  app.expired = await shoot(browser, { name: "expired-tablet", path: `/deliveries/booking?id=${IDS.expired}`, viewport: TABLET, before: waitFor("Try again") });
  app.items = await shoot(browser, { name: "items-shop-tablet", path: "/menu", viewport: TABLET, before: waitFor("Brake pads (front)") });
  app.itemsEmpty = await shoot(browser, { name: "items-empty-shop-tablet", path: "/menu", viewport: TABLET, scenario: SCENARIOS.newShop, before: waitFor("+ Engine") });
  app.shopProfile = await shoot(browser, { name: "shop-profile-shop-tablet", path: "/shop", viewport: TABLET, full: true, before: waitFor("WHAT YOU SELL") });
  app.setup = await shoot(browser, { name: "setup-shop-tablet", path: "/setup", viewport: TABLET, scenario: SCENARIOS.newShop, full: true, before: waitFor("Book a rider") });
  app.setupPhone = await shoot(browser, { name: "setup-shop-320", path: "/setup", viewport: PHONE, scenario: SCENARIOS.newShop, full: true, before: waitFor("Book a rider") });
} finally {
  await browser.close();
}

const mock = {};
await withMockRenderer(async (render) => {
  for (const id of ["queue_empty", "catalog", "catalog_empty", "shop", "setup"]) {
    const r = await render({ src: "RM", id, mode: "tablet", out: join(SHOTS, `mock-RM-${id}.png`) });
    if (r.ok) mock[id] = r.path;
    else console.error(`mock RM.${id} failed: ${r.error}`);
  }
});

const UNDRAWN = "undrawn: no RM mock (D-44)";
const tiles = tilesStubbed ? " · map tiles drawn as the lane's grey stand-in (OSM unreachable from this container)" : "";
await buildSheet({
  title: "Merchant web upgrade L2 — D-44 (PROPOSED): Book a rider, the shop's shell, shop words",
  out: OUT,
  rows: [
    { label: "RM.queue · restaurant", sub: "the Book a rider strip under the heading (“2 bookings live · View”)", mock: mock.queue_empty, app: app.queue, logicalW: 512 },
    { label: "RM.catalog · a shop's Items", sub: "shop words, the shop nav (Deliveries · Items · Shop)", mock: mock.catalog, app: app.items, logicalW: 512 },
    { label: "RM.catalog_empty · a shop", sub: "starting categories for car parts", mock: mock.catalog_empty, app: app.itemsEmpty, logicalW: 512 },
    { label: "RM.shop · a shop", sub: "“What you sell”; no cash-order rule", mock: mock.shop, app: app.shopProfile, logicalW: 512 },
    { label: "RM.setup · a shop", sub: "in the shop's shell; Book your first rider is live (D-43 row)", mock: mock.setup, app: app.setup, logicalW: 512 },
    { label: "A shop's /setup · 320", mockNote: UNDRAWN, app: app.setupPhone, logicalW: 320 },
    { label: "Deliveries · a shop's home", sub: "live first: finding a rider (countdown, offers), rider coming; then earlier", mockNote: UNDRAWN, app: app.deliveries, logicalW: 512 },
    { label: "Deliveries · 320", mockNote: UNDRAWN, app: app.deliveriesPhone, logicalW: 320 },
    { label: "Deliveries · none yet", mockNote: UNDRAWN, app: app.deliveriesEmpty, logicalW: 512 },
    { label: "Book a rider", sub: `a pasted location, Send's fare, the value cap, the terms${tiles}`, mockNote: UNDRAWN, app: app.form, logicalW: 512 },
    { label: "Book a rider · 320", mockNote: UNDRAWN, app: app.formPhone, logicalW: 320 },
    { label: "Pick a rider", sub: "90-second countdown; a teammate's offer can't be picked", mockNote: UNDRAWN, app: app.pick, logicalW: 512 },
    { label: "Pick a rider · 320", mockNote: UNDRAWN, app: app.pickPhone, logicalW: 320 },
    { label: "Rider coming · the code", sub: "send it on WhatsApp, copy it, or send a new one", mockNote: UNDRAWN, app: app.code, logicalW: 512 },
    { label: "No rider picked in time", sub: "Try again, with the fare", mockNote: UNDRAWN, app: app.expired, logicalW: 512 },
  ],
});
console.log(`sheet: ${OUT}.png (+ .html); shots in ${SHOTS}`);
