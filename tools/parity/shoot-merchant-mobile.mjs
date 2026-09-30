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

const PHONE = { width: 360, height: 720 };

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
  members: [{ profileId: "11111111-1111-4111-8111-111111111111", name: "Farai Chari", phoneMasked: "+263•••••4567", role: "owner", you: true, joinedAt: "2026-09-20T10:00:00.000Z" }],
  invites: [{ id: "33333333-3333-4333-8333-333333333333", name: "Rudo", phoneMasked: "+263•••••9034", invitePhone: "263778889034", createdAt: "2026-09-29T10:00:00.000Z", expiresAt: "2026-10-13T10:00:00.000Z" }],
};

function apiRoute(route, scenario) {
  const path = new URL(route.request().url()).pathname.replace(/^\/__api/, "");
  const json = (status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  if (path === "/auth/otp/request") return json(200, { sent: true, channel: "bird-verify", deliveryChannel: "whatsapp" });
  if (path === "/auth/me") return json(200, { firstName: "Farai", lastName: "Chari", phone: "+263771234567" });
  if (path === "/merchant/me") return scenario.me ? json(200, scenario.me) : json(403, { reason: "not_a_member", message: "Not on a business." });
  if (path === "/merchant/invites") return json(200, scenario.invites ?? { invites: [] });
  if (path === "/merchant/team") return json(200, TEAM);
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

const ROWS = [
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
  for (const r of ROWS) {
    const mock = r.id ? await shootProto(browser, r.id, r.mode) : undefined;
    const app = await shootApp(browser, r.app);
    rows.push({ label: r.label, sub: r.sub, mock, app, logicalW: 360, ...(r.id ? {} : { mockNote: "drawn by the prototype's wiring, not as a screen" }) });
    console.log(`ok ${r.label}`);
  }
} finally {
  await browser.close();
}

await buildSheet({ title: "Merchant mobile redesign · PR 1 (D-48): get in + shell + Account", out: OUT, rows });
console.log(`sheet: ${OUT}.png (+ .html); shots in ${SHOTS}`);
