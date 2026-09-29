#!/usr/bin/env node
/**
 * The merchant web upgrade L1 screenshot sheet (ledger D-43, docs/DESIGN-DEVIATIONS.md): the drawn
 * screens it changes beside their RM mocks, and the undrawn sign-up screens on their own, at the
 * merchant's 1024×680 and the 320px phone check.
 *
 * The tablet's API is stubbed in the browser (every call to `<origin>/__api/**`), so no seeded backend
 * is needed: start the dev server with that same-origin base first —
 *
 *   API_BASE_URL=http://127.0.0.1:4312/__api node tools/parity/serve-web.mjs merchant
 *   node tools/parity/shoot-merchant-l1.mjs --out docs/parity/MERCHANT-L1-D43-2026-09-29
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
const OUT = resolve(outArg > 0 ? process.argv[outArg + 1] : "out/merchant-l1");
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
};

const SCENARIOS = {
  newcomer: { me: null },
  shop: { me: { ...PROFILE, name: "Mbare Auto Spares", businessType: "shop", shopKind: "auto_parts" } },
  restaurant: {
    me: {
      ...PROFILE,
      name: "Mai Tino's Kitchen",
      businessType: "restaurant",
      shopKind: null,
      hours: { mon: { open: "09:00", close: "21:00" }, tue: { open: "09:00", close: "21:00" } },
    },
    dishes: [{ id: "d1", name: "Sadza & beef stew", isDraft: false }],
  },
};

let tilesStubbed = false;

async function apiRoute(route, scenario) {
  const url = new URL(route.request().url());
  const path = url.pathname.replace(/^\/__api/, "");
  const json = (status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  if (path === "/auth/otp/request") return json(200, { sent: true, channel: "bird-verify", deliveryChannel: "whatsapp" });
  if (path === "/auth/me") return json(200, { firstName: "Tendai", lastName: "Moyo", phone: "+263771234567" });
  if (path === "/merchant/me") {
    return scenario.me
      ? json(200, scenario.me)
      : json(403, { reason: "not_a_member", message: "This number isn't on a business on LyniaGo yet." });
  }
  if (path === "/merchant/dishes") return json(200, scenario.dishes ?? []);
  if (path === "/merchant/orders") return json(200, []);
  return json(404, { message: "Not stubbed" });
}

async function shoot(browser, { name, path, viewport, scenario = SCENARIOS.newcomer, signedIn = true, full = false, before }) {
  const ctx = await browser.newContext(contextDefaults({ viewport, deviceScaleFactor: 2 }));
  if (signedIn) {
    await ctx.addCookies([
      { name: "lynia_merchant_session", value: encodeURIComponent(JSON.stringify(SESSION)), url: ORIGIN },
    ]);
  }
  await ctx.route("**/__api/**", (route) => apiRoute(route, scenario));
  await ctx.route("**/socket.io/**", (route) => route.abort());
  await ctx.route(/tile\.openstreetmap\.org/, async (route) => {
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

const toStep1 = (kind) => async (page) => {
  await page.getByText("What do you sell?").first().waitFor();
  await page.getByRole("radio", { name: /^Shop/ }).click();
  await page.getByRole("radio", { name: kind, exact: true }).click();
};

const toStep2 = async (page) => {
  await toStep1("Car parts")(page);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByLabel("Your name").waitFor();
  await page.waitForFunction(() => document.querySelector("#owner-name")?.value === "Tendai Moyo");
  await page.getByLabel("Business name").fill("Mbare Auto Spares");
  await page.getByLabel("A landmark riders look for").fill("Next to the Total garage, blue gate");
  await page.getByRole("button", { name: /Your business on the map/ }).press("ArrowLeft");
  await page.getByRole("checkbox").check();
};

const toCodeStep = async (page) => {
  await page.getByLabel("Phone number").fill("0771234567");
  await page.getByRole("button", { name: "Send code", exact: true }).click();
  const code = page.getByLabel("6-digit code");
  await code.waitFor();
  // The mock's own state: four digits typed, the fifth box next; no focus ring (the mock draws none).
  await code.fill("4910");
  await code.blur();
};

await mkdir(SHOTS, { recursive: true });
const browser = await launch();
const app = {};
try {
  app.loginCode = await shoot(browser, { name: "login-code-tablet", path: "/login", viewport: TABLET, signedIn: false, before: toCodeStep });
  app.loginPhone = await shoot(browser, { name: "login-phone-tablet", path: "/login", viewport: TABLET, signedIn: false });
  app.loginPhone320 = await shoot(browser, { name: "login-phone-320", path: "/login", viewport: PHONE, signedIn: false });
  app.setupRestaurant = await shoot(browser, { name: "setup-restaurant-tablet", path: "/setup", viewport: TABLET, scenario: SCENARIOS.restaurant });
  app.step1 = await shoot(browser, { name: "onboarding-step1-tablet", path: "/onboarding", viewport: TABLET, full: true, before: toStep1("Car parts") });
  app.step1Phone = await shoot(browser, { name: "onboarding-step1-320", path: "/onboarding", viewport: PHONE, full: true, before: toStep1("Pharmacy") });
  app.step2 = await shoot(browser, { name: "onboarding-step2-tablet", path: "/onboarding", viewport: TABLET, full: true, before: toStep2 });
  app.step2Phone = await shoot(browser, { name: "onboarding-step2-320", path: "/onboarding", viewport: PHONE, full: true, before: toStep2 });
  app.shopSetup = await shoot(browser, { name: "setup-shop-tablet", path: "/setup", viewport: TABLET, scenario: SCENARIOS.shop, full: true });
  app.shopSetupPhone = await shoot(browser, { name: "setup-shop-320", path: "/setup", viewport: PHONE, scenario: SCENARIOS.shop, full: true });
} finally {
  await browser.close();
}

const mock = {};
await withMockRenderer(async (render) => {
  for (const id of ["login", "setup"]) {
    const r = await render({ src: "RM", id, mode: "tablet", out: join(SHOTS, `mock-RM-${id}.png`) });
    if (r.ok) mock[id] = r.path;
    else console.error(`mock RM.${id} failed: ${r.error}`);
  }
});

const UNDRAWN = "undrawn: no RM mock (D-43)";
const tiles = tilesStubbed ? " · map tiles drawn as the lane's grey stand-in (OSM unreachable from this container)" : "";
await buildSheet({
  title: "Merchant web upgrade L1 — D-43 (PROPOSED): sign-in, sign-up, type-aware /setup",
  out: OUT,
  rows: [
    { label: "RM.login · code step", sub: "“Sign in”; the code line names WhatsApp (D-40 extended)", mock: mock.login, app: app.loginCode, logicalW: 512 },
    { label: "RM.setup · restaurant", sub: "the not-live line names the call within a day", mock: mock.setup, app: app.setupRestaurant, logicalW: 512 },
    { label: "Sign in · phone step", sub: "undrawn step of RM.login: channel-neutral", mockNote: UNDRAWN, app: app.loginPhone, logicalW: 512 },
    { label: "Sign in · phone step · 320", mockNote: UNDRAWN, app: app.loginPhone320, logicalW: 320 },
    { label: "Set up your business · step 1", sub: "Restaurant | Shop, then the kind", mockNote: UNDRAWN, app: app.step1, logicalW: 512 },
    { label: "Set up your business · step 1 · 320", sub: "a pharmacy sees the OTC note", mockNote: UNDRAWN, app: app.step1Phone, logicalW: 320 },
    { label: "Set up your business · step 2", sub: `name, business, the map pin, landmark, phone, privacy line${tiles}`, mockNote: UNDRAWN, app: app.step2, logicalW: 512 },
    { label: "Set up your business · step 2 · 320", mockNote: UNDRAWN, app: app.step2Phone, logicalW: 320 },
    { label: "A shop's /setup", sub: "L2/L3 steps shown as coming soon", mockNote: UNDRAWN, app: app.shopSetup, logicalW: 512 },
    { label: "A shop's /setup · 320", mockNote: UNDRAWN, app: app.shopSetupPhone, logicalW: 320 },
  ],
});
console.log(`sheet: ${OUT}.png (+ .html); shots in ${SHOTS}`);
