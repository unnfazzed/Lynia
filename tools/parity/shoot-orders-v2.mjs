#!/usr/bin/env node
/**
 * The Orders v2 screenshot sheet (ledger D-63): each landed state of the orders-v2 handoff
 * (packages/design/handoff/orders-v2/design/Orders v2.html?screen=<id>) beside the Orders tab rendered
 * through react-native-web at 360×720 from the ov2_* fixtures (tools/parity/mobile/fixtures/_orders_v2.mjs).
 *
 *   node tools/parity/shoot-orders-v2.mjs --out docs/parity/ORDERS-V2-2026-10-02
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { contextDefaults, launch } from "./lib/browser.mjs";
import { buildSheet } from "./lib/sheet.mjs";
import { bundleScreen } from "./mobile/bundle.mjs";
import { interFontCss } from "./mobile/fonts.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const outArg = process.argv.indexOf("--out");
const OUT = resolve(outArg > 0 ? process.argv[outArg + 1] : join(HERE, "out/orders-v2"));
const SHOTS = `${OUT}-shots`;
const MOCK = pathToFileURL(join(REPO, "packages/design/handoff/orders-v2/design/Orders v2.html")).href;
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
  } finally {
    await ctx.close();
  }
}

async function shootMock(browser, id) {
  const ctx = await browser.newContext(contextDefaults({ viewport: { width: 600, height: 900 }, deviceScaleFactor: 2 }));
  const page = await ctx.newPage();
  try {
    await page.goto(`${MOCK}?screen=${id}`, { waitUntil: "load" });
    await page.waitForTimeout(800);
    const el = await page.$(".ph");
    if (!el) throw new Error(`no mock frame "${id}"`);
    const file = join(SHOTS, `mock-${id}.png`);
    await el.screenshot({ path: file });
    return file;
  } finally {
    await ctx.close();
  }
}

const press = (name) => async (p) => {
  await p.getByRole("button", { name, exact: true }).first().click();
  await p.waitForTimeout(500);
};

const TAB = app("(tabs)/orders.tsx");
const ROWS = [
  { id: "O1", label: "O1 · One running parcel + history", app: { name: "O1", component: TAB, fixture: "ov2_o1" } },
  { id: "O2", label: "O2 · Three running orders", sub: "the cards carry Order flow v2's own stage copy and four-step track (owner 2026-10-02)", app: { name: "O2", component: TAB, fixture: "ov2_o2" } },
  { id: "O5", label: "O5 · History only", sub: "a merchant row files under Food until the history row carries the venue type (NEEDS BACKEND)", app: { name: "O5", component: TAB, fixture: "ov2_o5" } },
  { id: "O9a", label: "O9a · Filter · Parcels", app: { name: "O9a", component: TAB, fixture: "ov2_o5", before: press("Parcels") } },
  { id: "O16", label: "O16 · Empty, every service on", app: { name: "O16", component: TAB, fixture: "ov2_o16" } },
  { id: "O17", label: "O17 · Empty, parcels only", app: { name: "O17", component: TAB, fixture: "ov2_o17" } },
  { id: "O18", label: "O18 · Only a running order", app: { name: "O18", component: TAB, fixture: "ov2_o18" } },
  { id: "O21", label: "O21 · Couldn’t load", app: { name: "O21", component: TAB, fixture: "ov2_o21" } },
];

await mkdir(SHOTS, { recursive: true });
const browser = await launch();
const rows = [];
try {
  for (const r of ROWS) {
    let mock = null;
    let shot = null;
    try {
      mock = await shootMock(browser, r.id);
    } catch (e) {
      console.log(`mock ${r.id}: ${String(e?.message || e).slice(0, 200)}`);
    }
    try {
      shot = await shootApp(browser, r.app);
    } catch (e) {
      console.log(`app ${r.label}: ${String(e?.message || e).slice(0, 300)}`);
    }
    rows.push({ label: r.label, sub: r.sub, mock, app: shot, logicalW: 360 });
    console.log(`ok ${r.label}`);
  }
} finally {
  await browser.close();
}

await buildSheet({ title: "Orders v2 (D-63): handoff (left) vs app (right), 360×720", out: OUT, rows });
await writeFile(`${SHOTS}/README.txt`, "Generated by tools/parity/shoot-orders-v2.mjs\n");
console.log(`sheet: ${OUT}.png (+ .html); shots in ${SHOTS}`);
