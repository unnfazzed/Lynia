#!/usr/bin/env node
/**
 * Own bikers v1's biker sheet (ledger D-117): each biker frame of the handoff
 * (packages/design/handoff/own-bikers-v1/Own bikers v1 - all screens.html, one `data-screen-label` per frame) beside
 * the app screen rendered through react-native-web at 360×720 from the ob_* fixtures
 * (tools/parity/mobile/fixtures/_own_bikers.mjs). No server: the API is stubbed in the page.
 *
 *   node tools/parity/shoot-own-bikers-v1-biker.mjs --out docs/parity/OWN-BIKERS-V1-BIKER-JOIN-BOARD-2026-10-19
 */
import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { contextDefaults, launch } from "./lib/browser.mjs";
import { buildSheet } from "./lib/sheet.mjs";
import { bundleScreen } from "./mobile/bundle.mjs";
import { interFontCss } from "./mobile/fonts.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const outArg = process.argv.indexOf("--out");
const OUT = resolve(outArg > 0 ? process.argv[outArg + 1] : join(HERE, "out/own-bikers-v1-biker"));
const SHOTS = `${OUT}-shots`;
const MOCKS = `${pathToFileURL(join(REPO, "packages/design/handoff/own-bikers-v1/Own bikers v1 - all screens.html")).href}?s=all`;
const FIXTURES = join(HERE, "mobile/fixtures");
const PHONE = { width: 360, height: 720 };
const app = (p) => join(REPO, "apps/mobile/app", p);

function harnessHtml(js, fontCss) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${fontCss}
html,body{margin:0;padding:0;background:#fff;}
#root{width:${PHONE.width}px;height:${PHONE.height}px;overflow:hidden;display:flex;flex-direction:column;
  font-family:"Inter",-apple-system,"Segoe UI",Roboto,sans-serif;}
#root>*{flex:1 1 auto;min-height:0;}
</style></head><body><div id="root"></div><script>${js}</script></body></html>`;
}

const bundles = new Map();
async function bundleFor(component, fixture) {
  const k = `${component}|${fixture}`;
  if (!bundles.has(k)) bundles.set(k, await bundleScreen({ component, fixture: join(FIXTURES, `${fixture}.mjs`) }));
  return bundles.get(k);
}

async function shootApp(browser, { name, component, fixture, before }) {
  const ctx = await browser.newContext(contextDefaults({ viewport: PHONE, deviceScaleFactor: 2 }));
  const page = await ctx.newPage();
  try {
    await page.setContent(harnessHtml(await bundleFor(component, fixture), await interFontCss()), { waitUntil: "load" });
    await page.waitForFunction(() => window.__PARITY_READY === true || typeof window.__PARITY_ERROR === "string", { timeout: 20000 });
    const err = await page.evaluate(() => window.__PARITY_ERROR || null);
    if (err) throw new Error(err);
    await page.evaluate(() => (document.fonts ? document.fonts.ready : null));
    await page.waitForTimeout(900);
    if (before) await before(page);
    await page.waitForTimeout(400);
    const file = join(SHOTS, `app-${name}.png`);
    await (await page.$("#root")).screenshot({ path: file });
    return file;
  } catch (err) {
    console.error(`app ${name}: ${err.message}`);
    return null;
  } finally {
    await ctx.close();
  }
}

const tap = (name) => async (p) => {
  await p.getByRole("button", { name, exact: true }).first().click();
  await p.waitForTimeout(800);
};
const board = app("rider/(tabs)/index.tsx");
const offer = app("rider/fleet-offer.tsx");
const ROWS = [
  ["OB-R1 Invite waiting for ID check", { component: board, fixture: "ob_invite_waiting" }],
  ["OB-R2 Join card", { component: board, fixture: "ob_join" }],
  ["OB-R3 Refused · shop staff", { component: board, fixture: "ob_join_staff", before: tap("Join") }],
  ["OB-R3 Refused · in another fleet", { component: board, fixture: "ob_join_fleet", before: tap("Join") }],
  ["OB-R3 Refused · invite ended", { component: board, fixture: "ob_join_ended", before: tap("Join") }],
  ["OB-R4 Fleet board", { component: board, fixture: "ob_fleet_board" }],
  ["OB-R5 Fleet board · empty", { component: board, fixture: "ob_fleet_board_empty" }],
  ["OB-R5 Fleet board · couldn't load", { component: board, fixture: "ob_fleet_board_fail" }],
  ["OB-R6 Paused", { component: board, fixture: "ob_fleet_board_paused" }],
  ["OB-R7 Fleet job offer", { component: offer, fixture: "ob_fleet_offer" }],
  ["OB-R7 Offer expired (F4)", { component: offer, fixture: "ob_fleet_offer_expired" }],
];

await mkdir(SHOTS, { recursive: true });
const browser = await launch();
const mctx = await browser.newContext(contextDefaults({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 }));
const mpage = await mctx.newPage();
await mpage.goto(MOCKS, { waitUntil: "load" });
await mpage.waitForTimeout(1500);
const rows = [];
for (const [label, a] of ROWS) {
  let mock = null;
  try {
    mock = join(SHOTS, `mock-${rows.length}.png`);
    await mpage.locator(`[data-screen-label="${label}"]`).first().screenshot({ path: mock });
  } catch (err) {
    console.error(`mock ${label}: ${err.message}`);
    mock = null;
  }
  const shot = await shootApp(browser, { name: String(rows.length), ...a });
  console.error(`${shot ? "ok" : "--"} ${label}`);
  rows.push({ label, mock, app: shot, logicalW: 360 });
}
await mctx.close();
await buildSheet({ title: "Own bikers v1 (D-117) · biker: handoff (left) vs app (right)", out: OUT, rows, browser });
await browser.close();
