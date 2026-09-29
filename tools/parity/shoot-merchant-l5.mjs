#!/usr/bin/env node
/**
 * The merchant web upgrade L5 screenshot sheet (ledger D-47, docs/DESIGN-DEVIATIONS.md): finishing the drawn
 * restaurant screens — the three-duration out-of-stock sheet, the top bar's business name and "Open for
 * orders" pill, and Help in the restaurant nav — beside their RM mocks, at the merchant's 1024×680 and the
 * 320px phone check.
 *
 * The tablet's API is stubbed in the browser (every call to `<origin>/__api/**`), so no seeded backend
 * is needed: start the dev server with that same-origin base first —
 *
 *   API_BASE_URL=http://127.0.0.1:4312/__api NEXT_PUBLIC_SUPPORT_WHATSAPP=263770000000 node tools/parity/serve-web.mjs merchant
 *   node tools/parity/shoot-merchant-l5.mjs --out docs/parity/MERCHANT-L5-D47-2026-09-29
 */
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { contextDefaults, launch } from "./lib/browser.mjs";
import { withMockRenderer } from "./lib/mock.mjs";
import { buildSheet } from "./lib/sheet.mjs";

const ORIGIN = process.env.PARITY_MERCHANT_URL || "http://127.0.0.1:4312";
const outArg = process.argv.indexOf("--out");
const OUT = resolve(outArg > 0 ? process.argv[outArg + 1] : "out/merchant-l5");
const SHOTS = `${OUT}-shots`;

const TABLET = { width: 1024, height: 680 };
const PHONE = { width: 320, height: 640 };

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
  hours: { mon: { open: "08:00", close: "20:00" }, tue: { open: "08:00", close: "20:00" }, sat: { open: "09:00", close: "14:00" } },
  cashRule: "collect_and_return",
  busy: false,
  pilotEnabled: false,
  myRole: "owner",
  myName: "Farai Chari",
  location: PIN,
};

// Open all day, every day, so the shot says "Open for orders" whatever the clock.
const ALL_DAY = { open: "00:00", close: "23:59" };
const RESTAURANT = {
  ...PROFILE,
  name: "Sadza Republic",
  businessType: "restaurant",
  shopKind: null,
  pilotEnabled: true,
  hours: { mon: ALL_DAY, tue: ALL_DAY, wed: ALL_DAY, thu: ALL_DAY, fri: ALL_DAY, sat: ALL_DAY, sun: ALL_DAY },
};

const CATEGORIES = [{ id: "66666666-6666-4666-8666-666666666666", name: "Mains", sortOrder: 0, availableFrom: null, availableTo: null, hidden: false, dishCount: 3 }];
const DISH = (id, name, price, over = {}) => ({
  id,
  categoryId: CATEGORIES[0].id,
  name,
  description: null,
  priceUsd: price,
  photoUrl: null,
  isDraft: false,
  outOfStock: false,
  sortOrder: 0,
  ...over,
});
const DISHES = [
  DISH("77777777-7777-4777-8777-777777777771", "Mazondo", 5),
  DISH("77777777-7777-4777-8777-777777777772", "Sadza & beef stew", 4.5),
  DISH("77777777-7777-4777-8777-777777777773", "Rice & chicken", 4),
];

async function apiRoute(route) {
  const url = new URL(route.request().url());
  const path = url.pathname.replace(/^\/__api/, "");
  const json = (status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  if (path === "/merchant/me") return json(200, RESTAURANT);
  if (path === "/merchant/categories") return json(200, CATEGORIES);
  if (path === "/merchant/dishes") return json(200, DISHES);
  if (path === "/merchant/orders" || path === "/merchant/bookings") return json(200, []);
  return json(404, { message: "Not stubbed" });
}

async function shoot(browser, { name, path, viewport, full = false, before }) {
  const ctx = await browser.newContext(contextDefaults({ viewport, deviceScaleFactor: 2 }));
  await ctx.addCookies([{ name: "lynia_merchant_session", value: encodeURIComponent(JSON.stringify(SESSION)), url: ORIGIN }]);
  await ctx.route("**/__api/**", (route) => apiRoute(route));
  await ctx.route("**/socket.io/**", (route) => route.abort());
  const page = await ctx.newPage();
  try {
    await page.goto(ORIGIN + path, { waitUntil: "networkidle", timeout: 90000 });
    if (before) await before(page);
    // Next's dev-mode badge is dev tooling, not the app.
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    if (full) {
      await page.addStyleTag({
        content:
          ".kitchen-shell { height: auto !important; min-height: 100dvh; overflow: visible !important; } " +
          ".kitchen-content, .kitchen-page { overflow: visible !important; height: auto !important; }",
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

const waitFor = (text) => async (page) => {
  await page.getByText(text).first().waitFor();
};

const oosOpen = async (page) => {
  await page.getByRole("button", { name: "Mark out of stock" }).first().click();
  await page.getByRole("radio", { name: "For the rest of today" }).waitFor();
};

await mkdir(SHOTS, { recursive: true });
const browser = await launch();
const app = {};
try {
  app.queue = await shoot(browser, { name: "queue-restaurant-tablet", path: "/queue", viewport: TABLET, before: waitFor("Open for orders") });
  // At 320 the business's name and the open pill give way (D-32/D-47): wait for the nav instead.
  app.queuePhone = await shoot(browser, { name: "queue-restaurant-320", path: "/queue", viewport: PHONE, before: waitFor("Statement") });
  app.oos = await shoot(browser, { name: "oos-sheet-tablet", path: "/menu", viewport: TABLET, before: oosOpen });
  app.oosPhone = await shoot(browser, { name: "oos-sheet-320", path: "/menu", viewport: PHONE, before: oosOpen });
} finally {
  await browser.close();
}

const mock = {};
await withMockRenderer(async (render) => {
  for (const id of ["queue_empty", "oos_sheet"]) {
    const r = await render({ src: "RM", id, mode: "tablet", out: join(SHOTS, `mock-RM-${id}.png`) });
    if (r.ok) mock[id] = r.path;
    else console.error(`mock RM.${id} failed: ${r.error}`);
  }
});

await buildSheet({
  title: "Merchant web upgrade L5 — D-47 (PROPOSED): finishing the drawn restaurant screens",
  out: OUT,
  rows: [
    { label: "RM.queue_empty · the bar and the nav", sub: "the business's name, Open for orders, Help (as drawn); who is signed in (D-46)", mock: mock.queue_empty, app: app.queue, logicalW: 512 },
    { label: "RM.oos_sheet", sub: "the three drawn durations, the rest of today chosen", mock: mock.oos_sheet, app: app.oos, logicalW: 512 },
    { label: "Orders · 320", sub: "phone tier: the open pill gives way (D-47)", mockNote: "phone tier: no RM mock (D-32)", app: app.queuePhone, logicalW: 320 },
    { label: "Out of stock · 320", mockNote: "phone tier: no RM mock (D-32)", app: app.oosPhone, logicalW: 320 },
  ],
});
console.log(`sheet: ${OUT}.png (+ .html); shots in ${SHOTS}`);
