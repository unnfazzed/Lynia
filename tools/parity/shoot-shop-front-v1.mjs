#!/usr/bin/env node
/**
 * Shop front v1's screenshot sheet (ledger D-115): each frame of the handoff
 * (packages/design/handoff/shop-front-v1/Shop front v1 - all screens.html, one `data-screen-label` per frame)
 * beside the app's Shop front in the same state, at 360×720 (and 320×640 where the handoff draws it).
 *
 * The merchant API is stubbed in the browser (every call to `<origin>/__api/**`), so no seeded backend is
 * needed: start the dev server with that same-origin base first —
 *
 *   API_BASE_URL=http://127.0.0.1:4312/__api node tools/parity/serve-web.mjs merchant
 *   node tools/parity/shoot-shop-front-v1.mjs --out docs/parity/SHOP-FRONT-V1-2026-10-18
 *
 * The photos are stand-ins drawn here (a striped banner, an initials logo), like the handoff's own.
 */
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { contextDefaults, launch } from "./lib/browser.mjs";
import { buildSheet } from "./lib/sheet.mjs";

const ORIGIN = process.env.PARITY_MERCHANT_URL || "http://127.0.0.1:4312";
const outArg = process.argv.indexOf("--out");
const OUT = resolve(outArg > 0 ? process.argv[outArg + 1] : "out/shop-front-v1");
const SHOTS = `${OUT}-shots`;
const MOCKS = pathToFileURL(resolve("../../packages/design/handoff/shop-front-v1/Shop front v1 - all screens.html")).href;

const SESSION = { accessToken: "parity", refreshToken: "parity.refresh", expiresIn: 900, issuedAt: Date.now(), profileId: "p-parity", role: "customer" };
const week = { mon: { open: "00:00", close: "23:59" } };
const base = {
  id: "m-parity",
  ownerPhoneMasked: "+263•••••4567",
  cashRule: "collect_and_return",
  busy: false,
  pilotEnabled: true,
  myRole: "owner",
  myName: "Farai Chari",
  hours: week,
  location: { point: { lat: -17.8575, lng: 31.0367 }, landmark: "5th Street, Mbare", contactPhone: "+263771234567" },
  coverPhotoUrl: "https://img.parity/banner.png",
  logoUrl: "https://img.parity/logo.png",
};
const FOOD = { ...base, name: "Sadza Republic", description: "Home-cooked sadza, grills and stews since 2015", cuisineTags: ["Sadza", "Grill", "Traditional"], priceLevel: 1, businessType: "restaurant", shopKind: null };
const SHOP = { ...base, name: "Mbare Auto Spares", description: "Genuine spares, Mbare Musika", cuisineTags: ["Brake pads", "Batteries"], priceLevel: 2, businessType: "shop", shopKind: "auto_parts", pilotEnabled: false };
const RX = { ...base, name: "Avondale Family Pharmacy", description: "Medicines and baby care, delivered to your gate", cuisineTags: ["Pain relief", "Vitamins", "Cold & flu"], priceLevel: 2, businessType: "shop", shopKind: "pharmacy" };
const EMPTY = { ...FOOD, coverPhotoUrl: null, logoUrl: null, cuisineTags: [], description: "", priceLevel: null };
const LONG = { ...SHOP, pilotEnabled: true, name: "Siyaso Genuine Auto Spares & Accessories", description: "Genuine spares for Toyota and Nissan, Mbare Musika", cuisineTags: ["Batteries & alternators", "Headlights & tail lamps", "Toyota & Nissan parts"] };

let IMAGES = {};
async function drawImages(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1600 } });
  const page = await ctx.newPage();
  await page.setContent(`<body style="margin:0"><div id="b" style="width:1200px;height:400px;background-color:#ffd9cc;background-image:repeating-linear-gradient(135deg,transparent 0 30px,rgba(255,255,255,.45) 30px 60px)"></div><div id="p" style="width:1600px;height:1066px;background-color:#ffd9cc;background-image:repeating-linear-gradient(135deg,transparent 0 30px,rgba(255,255,255,.45) 30px 60px)"></div><div id="l" style="width:400px;height:400px;background:#ffd9cc;color:#c2412a;display:flex;align-items:center;justify-content:center;font:700 140px Inter,sans-serif">SR</div></body>`);
  IMAGES = { banner: await page.locator("#b").screenshot(), logo: await page.locator("#l").screenshot(), photo: await page.locator("#p").screenshot() };
  await ctx.close();
}

function apiRoute(route, sc) {
  const req = route.request();
  const path = new URL(req.url()).pathname.replace(/^\/__api/, "");
  const json = (status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  if (path === "/merchant/me") {
    if (sc.load === "hang") return; // Loading: never answers
    if (sc.load === "fail") return json(503, { message: "" });
    return json(200, sc.me);
  }
  if (path === "/merchant/profile" && req.method() === "PATCH") {
    if (sc.save === "hang") return;
    if (sc.save === "fail") return json(500, {});
    return json(200, { ...sc.me, ...JSON.parse(req.postData() || "{}") });
  }
  if (path === "/uploads/merchant-banner-photo") return json(200, { uploadUrl: `${ORIGIN}/__upload/x.jpg`, headers: {}, key: "banner/p-parity/aaaaaaaa-0000-4000-8000-000000000009.jpg" });
  if (path === "/auth/me") return json(200, { firstName: "Farai", lastName: "Chari", phone: "+263771234567" });
  if (path === "/merchant/branches") return json(200, { branches: [] });
  return json(200, []);
}

async function shootApp(browser, { name, w = 360, scenario, before }) {
  const ctx = await browser.newContext(contextDefaults({ viewport: { width: w, height: w === 320 ? 640 : 720 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }));
  await ctx.addCookies([{ name: "lynia_merchant_session", value: encodeURIComponent(JSON.stringify(SESSION)), url: ORIGIN }]);
  await ctx.route("**/__api/**", (route) => apiRoute(route, scenario));
  await ctx.route("**/socket.io/**", (route) => route.abort());
  await ctx.route("https://img.parity/**", (route) => route.fulfill({ status: 200, contentType: "image/png", body: route.request().url().includes("logo") ? IMAGES.logo : IMAGES.banner }));
  await ctx.route("**/__upload/**", (route) => {
    if (scenario.upload === "hang") return;
    return route.fulfill({ status: scenario.upload === "fail" ? 500 : 200, body: "" });
  });
  const page = await ctx.newPage();
  try {
    await page.goto(`${ORIGIN}/shop`, { waitUntil: scenario.load === "hang" ? "domcontentloaded" : "networkidle", timeout: 90000 });
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; } *, *::before, *::after { caret-color: transparent !important; animation-play-state: paused !important; }" });
    if (scenario.load !== "hang" && scenario.load !== "fail") await page.locator(".m-sf-page, .m-sf-fail").first().waitFor();
    else await page.waitForTimeout(1500);
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

const tapBanner = (p) => p.getByRole("button", { name: "Change banner photo" }).click();
// A phone photo is never already 3:1: the crop frames use a 3:2 one, zoomed to the handoff's 1.4×.
const pick = (kind, file = "photo") => async (p) => {
  await p.getByRole("button", { name: kind === "banner" ? "Change banner photo" : "Change logo" }).click();
  const [chooser] = await Promise.all([p.waitForEvent("filechooser"), p.getByRole("button", { name: "Choose from your phone" }).click()]);
  await chooser.setFiles({ name: `${file}.png`, mimeType: "image/png", buffer: IMAGES[file] });
  await p.locator(".m-crop-sheet .m-crop-frame").waitFor();
  await p.waitForTimeout(600);
  for (let i = 0; i < 2; i++) await p.getByRole("button", { name: "Zoom in" }).click();
};
const cropThenSave = (kind) => async (p) => {
  await pick(kind)(p);
  await p.getByRole("button", { name: kind === "banner" ? "Save banner" : "Save logo" }).click();
  await p.waitForTimeout(1500);
};
const scrollEnd = (p) => p.locator("main.m-scroll").evaluate((el) => (el.scrollTop = el.scrollHeight));
const editSome = async (p) => {
  await p.getByRole("button", { name: "$$", exact: true }).click();
  await p.getByLabel("One line customers read").fill("Home-cooked sadza, grills and stews");
  await p.getByLabel("One line customers read").blur();
};

const ROWS = [
  ["Restaurant filled", { scenario: { me: FOOD } }],
  ["Restaurant filled · scrolled", { scenario: { me: FOOD }, before: scrollEnd }],
  ["Shop filled · not live yet", { scenario: { me: SHOP } }],
  ["Pharmacy filled", { scenario: { me: RX } }],
  ["Empty / first time", { scenario: { me: EMPTY } }],
  ["Empty / first time · 320", { w: 320, scenario: { me: EMPTY } }],
  ["Loading", { scenario: { me: FOOD, load: "hang" } }],
  ["Couldn't load", { scenario: { me: FOOD, load: "fail" } }],
  ["Staff (not owner)", { scenario: { me: { ...FOOD, myRole: "staff" } } }],
  ["Unsaved changes", { scenario: { me: FOOD }, before: editSome }],
  ["Unsaved · leaving", { scenario: { me: FOOD }, before: async (p) => { await editSome(p); await p.getByRole("button", { name: "Back" }).click(); } }],
  ["Saving…", { scenario: { me: FOOD, save: "hang" }, before: async (p) => { await editSome(p); await p.getByRole("button", { name: "Save changes" }).click(); } }],
  ["Saved", { scenario: { me: FOOD }, before: async (p) => { await editSome(p); await p.getByRole("button", { name: "Save changes" }).click(); await p.locator(".m-toast").waitFor(); } }],
  ["Save failed", { scenario: { me: FOOD, save: "fail" }, before: async (p) => { await editSome(p); await p.getByRole("button", { name: "Save changes" }).click(); await p.locator(".m-cta [role=alert]").waitFor(); } }],
  ["Name missing", { scenario: { me: FOOD }, before: (p) => p.getByLabel("Shop name").fill("") }],
  ["Photo · choosing", { scenario: { me: EMPTY }, before: tapBanner }],
  ["Photo · Uploading…", { scenario: { me: FOOD, upload: "hang" }, before: cropThenSave("banner") }],
  ["Photo · upload failed", { scenario: { me: FOOD, upload: "fail" }, before: cropThenSave("banner") }],
  ["Photo · has photo (replace / remove)", { scenario: { me: FOOD }, before: tapBanner }],
  ["Photo · removed", { scenario: { me: FOOD }, before: async (p) => { await tapBanner(p); await p.getByRole("button", { name: "Remove banner" }).click(); } }],
  ["Crop banner · 360", { scenario: { me: FOOD }, before: pick("banner") }],
  ["Crop logo · 360", { scenario: { me: FOOD }, before: pick("logo") }],
  ["Crop banner · 320", { w: 320, scenario: { me: FOOD }, before: pick("banner") }],
  ["Crop logo · 320", { w: 320, scenario: { me: FOOD }, before: pick("logo") }],
  ["Tags · limit of 3 reached", { scenario: { me: { ...FOOD, cuisineTags: ["Sadza", "Grill"] } }, before: async (p) => { await p.getByPlaceholder("Type a tag").fill("Road-runner"); await p.getByRole("button", { name: "Add", exact: true }).click(); await scrollEnd(p); } }],
  ["Tags · duplicate ignored", { scenario: { me: { ...FOOD, cuisineTags: ["Sadza", "Grill"] } }, before: async (p) => { await p.getByPlaceholder("Type a tag").fill("grill"); await p.getByPlaceholder("Type a tag").press("Enter"); await p.getByPlaceholder("Type a tag").evaluate((el) => el.scrollIntoView({ block: "center" })); } }],
  ["320 · 40-character name, 3 long tags", { w: 320, scenario: { me: LONG } }],
];

await mkdir(SHOTS, { recursive: true });
const browser = await launch();
await drawImages(browser);
const mctx = await browser.newContext(contextDefaults({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 }));
const mpage = await mctx.newPage();
await mpage.goto(MOCKS, { waitUntil: "load" });
await mpage.waitForTimeout(1500);
const rows = [];
for (const [label, app] of ROWS) {
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
await buildSheet({ title: "Shop front v1 (D-115): handoff (left) vs app (right)", out: OUT, rows, browser });
await browser.close();
