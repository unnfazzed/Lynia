#!/usr/bin/env node
/**
 * The Browse v2 screenshot sheet (ledger D-57): each landed screen of the browse-v2 handoff
 * (packages/design/handoff/browse-v2/Browse v2 - all screens.html?screen=<ID>) beside the app screen
 * rendered through react-native-web from the parity fixtures. Venue and dish photos are the handoff's
 * own samples, served to the app at https://parity.local/food/<name>.jpg.
 *
 *   node tools/parity/shoot-browse-v2.mjs --out docs/parity/BROWSE-V2-RESTAURANTS-2026-10-01
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { contextDefaults, launch } from "./lib/browser.mjs";
import { buildSheet } from "./lib/sheet.mjs";
import { bundleScreen } from "./mobile/bundle.mjs";
import { interFontCss } from "./mobile/fonts.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const outArg = process.argv.indexOf("--out");
const OUT = resolve(outArg > 0 ? process.argv[outArg + 1] : join(HERE, "out/browse-v2"));
const SHOTS = `${OUT}-shots`;
const MOCK = pathToFileURL(join(REPO, "packages/design/handoff/browse-v2/Browse v2 - all screens.html")).href;
const FIXTURES = join(HERE, "mobile/fixtures");
const PHOTOS = join(REPO, "packages/design/handoff/browse-v2/assets/food");
const app = (p) => join(REPO, "apps/mobile/app", p);

function harnessHtml(js, fontCss, vp) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${fontCss}
html,body{margin:0;padding:0;background:#fff;}
#root{width:${vp.width}px;height:${vp.height}px;overflow:hidden;display:flex;flex-direction:column;
  font-family:"Inter",-apple-system,"Segoe UI",Roboto,sans-serif;}
#root>*{flex:1 1 auto;min-height:0;}
</style></head><body><div id="root"></div><script>${js}</script></body></html>`;
}

async function shootApp(browser, { name, component, fixture, vp, before }) {
  const ctx = await browser.newContext(contextDefaults({ viewport: vp, deviceScaleFactor: 2 }));
  await ctx.route("https://parity.local/food/**", async (route) => {
    const name = route.request().url().split("/").pop();
    await route.fulfill({ status: 200, contentType: "image/jpeg", body: await readFile(join(PHOTOS, name)) });
  });
  const page = await ctx.newPage();
  try {
    const js = await bundleScreen({ component, fixture: join(FIXTURES, `${fixture}.mjs`) });
    await page.setContent(harnessHtml(js, await interFontCss(), vp), { waitUntil: "load" });
    await page.waitForFunction(() => window.__PARITY_READY === true || typeof window.__PARITY_ERROR === "string", { timeout: 20000 });
    const err = await page.evaluate(() => window.__PARITY_ERROR || null);
    if (err) throw new Error(err);
    await page.evaluate(() => (document.fonts ? document.fonts.ready : null));
    await page.waitForTimeout(1200);
    if (before) await before(page);
    await page.waitForTimeout(500);
    const file = join(SHOTS, `app-${name}.png`);
    await (await page.$("#root")).screenshot({ path: file });
    return file;
  } finally {
    await ctx.close();
  }
}

async function shootMock(browser, id, vp) {
  const ctx = await browser.newContext(contextDefaults({ viewport: vp, deviceScaleFactor: 2 }));
  const page = await ctx.newPage();
  try {
    await page.goto(`${MOCK}?screen=${id}`, { waitUntil: "load" });
    await page.waitForTimeout(1200);
    const file = join(SHOTS, `mock-${id}.png`);
    await (await page.$(".ph")).screenshot({ path: file });
    return file;
  } finally {
    await ctx.close();
  }
}

const PHONE = { width: 360, height: 720 };
const NARROW = { width: 320, height: 640 };
const tap = (name) => async (p) => {
  await p.getByRole("button", { name }).first().click();
  await p.waitForTimeout(900);
};
/** Scroll the screen's main scroller down by `px` (the storefront's ScrollView / the list's FlatList). */
const scroll = (px) => async (p) => {
  await p.evaluate((y) => {
    const els = [...document.querySelectorAll("#root div")].filter((e) => e.scrollHeight > e.clientHeight + 50 && getComputedStyle(e).overflowY !== "visible");
    const el = els.sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
    if (el) {
      el.scrollTop = y;
      el.dispatchEvent(new Event("scroll"));
    }
  }, px);
  await p.waitForTimeout(700);
};

const ROWS = [
  { id: "B1", label: "B1 · Restaurants list", vp: PHONE, app: { name: "B1", component: app("food/index.tsx"), fixture: "bv2_list" } },
  { id: "B1·320", label: "B1 · at 320×640", vp: NARROW, app: { name: "B1-320", component: app("food/index.tsx"), fixture: "bv2_list" } },
  { id: "B5a", label: "B5 · Sort sheet", vp: PHONE, app: { name: "B5a", component: app("food/index.tsx"), fixture: "bv2_list", before: tap(/^Sort: /) } },
  { id: "B7", label: "B7 · No location yet", vp: PHONE, app: { name: "B7", component: app("food/index.tsx"), fixture: "bv2_list_noloc" } },
  { id: "B8", label: "B8 · First load", vp: PHONE, app: { name: "B8", component: app("food/index.tsx"), fixture: "food_list_loading" } },
  { id: "B11", label: "B11 · Couldn’t load", vp: PHONE, app: { name: "B11", component: app("food/index.tsx"), fixture: "food_list_error" } },
  { id: "S1", label: "S1 · Storefront, open", vp: PHONE, app: { name: "S1", component: app("food/[id].tsx"), fixture: "bv2_store" } },
  { id: "S5", label: "S5 · In the cart (scrolled)", vp: PHONE, app: { name: "S5", component: app("food/[id].tsx"), fixture: "bv2_store_cart", before: scroll(560) } },
  { id: "S8a", label: "S8a · Closed", vp: PHONE, app: { name: "S8a", component: app("food/[id].tsx"), fixture: "bv2_store_closed" } },
  { id: "I1a", label: "I1 · Item sheet", vp: PHONE, app: { name: "I1a", component: app("food/[id].tsx"), fixture: "bv2_store", before: tap(/^Sadza & beef stew, \$4\.50/) } },
  { id: "I3", label: "I3 · Start a new cart?", vp: PHONE, app: { name: "I3", component: app("food/[id].tsx"), fixture: "bv2_store_switch", before: tap("Add Roast chicken (half)") } },
];

await mkdir(SHOTS, { recursive: true });
const browser = await launch();
const rows = [];
try {
  for (const r of ROWS) {
    const mock = await shootMock(browser, r.id, r.vp);
    let appShot = null;
    let note = null;
    try {
      appShot = await shootApp(browser, { ...r.app, vp: r.vp });
    } catch (e) {
      note = String(e.message || e).slice(0, 200);
    }
    rows.push({ label: r.label, mock, app: appShot, appNote: note || undefined, logicalW: r.vp.width });
    console.log(`${r.id}: ${appShot ? "ok" : `app failed — ${note}`}`);
  }
} finally {
  await browser.close();
}
await buildSheet({ title: "Browse v2 · Restaurants list + storefront (D-57): handoff (left) vs app (right)", out: OUT, rows });
await writeFile(`${SHOTS}/README.txt`, "Generated by tools/parity/shoot-browse-v2.mjs\n");
console.log(`sheet: ${OUT}.png (+ .html); shots in ${SHOTS}`);
