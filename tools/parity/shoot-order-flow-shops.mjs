#!/usr/bin/env node
/**
 * The Order flow v2 part 5 screenshot sheet (ledger D-59): shop & pharmacy ordering on the storefronts
 * (Browse v2 S3/S4/S5/S6/I1b/I1c, now with +, steppers, the item sheet's Add and the cart bar), the shop
 * and pharmacy Review (R2a/R2b), scheduled orders (R5a sheet, R5b review, R5c the closed venue's cart bar)
 * and the prescription block behind `rxEnabled` (R8a/R8b). Each app state (react-native-web at the frame's
 * size) sits beside the handoff's own frame (order-flow-v2/design/screens/<id>.png and
 * browse-v2/screens/<id>.png). The app column is staged by the of_* fixtures (tools/parity/mobile/fixtures)
 * and driven by accessible name.
 *
 *   node tools/parity/shoot-order-flow-shops.mjs --out docs/parity/ORDER-FLOW-V2-SHOPS-2026-10-02
 *
 * Tall frames (R2a, R2b, R8b — the full scroll) are shot at the frame's own height so the whole Review
 * shows. Photos are the placeholder tint (no product photos staged); the browse frames draw striped
 * placeholders. The R8b pages come from the expo-image-picker web shim (a striped "page N").
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { contextDefaults, launch } from "./lib/browser.mjs";
import { buildSheet } from "./lib/sheet.mjs";
import { bundleScreen } from "./mobile/bundle.mjs";
import { interFontCss } from "./mobile/fonts.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const outArg = process.argv.indexOf("--out");
const OUT = resolve(outArg > 0 ? process.argv[outArg + 1] : join(HERE, "out/order-flow-v2-shops"));
const SHOTS = `${OUT}-shots`;
const OF_FRAMES = join(REPO, "packages/design/handoff/order-flow-v2/design/screens");
const BV_FRAMES = join(REPO, "packages/design/handoff/browse-v2/screens");
const FIXTURES = join(HERE, "mobile/fixtures");
const app = (p) => join(REPO, "apps/mobile/app", p);
const REVIEW = app("food/checkout.tsx");
const PHONE = { width: 360, height: 720 };
const tall = (h) => ({ width: 360, height: h });

function harnessHtml(js, fontCss, vp) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${fontCss}
html,body{margin:0;padding:0;background:#fff;}
#root{width:${vp.width}px;height:${vp.height}px;overflow:hidden;display:flex;flex-direction:column;
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

async function shootApp(browser, { name, component = REVIEW, fixture, vp = PHONE, before }) {
  const ctx = await browser.newContext(contextDefaults({ viewport: vp, deviceScaleFactor: 2 }));
  const page = await ctx.newPage();
  try {
    await page.setContent(harnessHtml(await bundleFor(component, fixture), await interFontCss(), vp), { waitUntil: "load" });
    await page.waitForFunction(() => window.__PARITY_READY === true || typeof window.__PARITY_ERROR === "string", { timeout: 20000 });
    const err = await page.evaluate(() => window.__PARITY_ERROR || null);
    if (err) throw new Error(err);
    await page.evaluate(() => (document.fonts ? document.fonts.ready : null));
    await page.waitForTimeout(1200);
    if (before) await before(page);
    await page.waitForTimeout(600);
    const file = join(SHOTS, `app-${name}.png`);
    await (await page.$("#root")).screenshot({ path: file });
    return file;
  } finally {
    await ctx.close();
  }
}

const tap = (name, role = "button") => async (p) => {
  await p.getByRole(role, { name, exact: typeof name === "string" }).first().click();
  await p.waitForTimeout(500);
};
const seq = (...steps) => async (p) => {
  for (const s of steps) await s(p);
};
const fill = (label, text) => async (p) => {
  await p.getByLabel(label, { exact: true }).first().fill(text);
  await p.waitForTimeout(300);
};
/** Scroll the screen's main scroller down by `px`. */
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

const schedule = seq(tap("Schedule", "radio"), tap("12:30–13:00", "radio"));
const ROWS = [
  { mock: join(BV_FRAMES, "S3.png"), label: "S3 · Shop storefront, with ordering", sub: "+ inside each tile (D-58 browse-only rows closed)", app: { name: "S3", component: app("shops/[id].tsx"), fixture: "of_shop" } },
  { mock: join(BV_FRAMES, "S5.png"), label: "S5 · In the cart — a shop", sub: "the mock draws the restaurant; the shop tile's stepper spans the tile", app: { name: "S5-shop", component: app("shops/[id].tsx"), fixture: "of_shop_cart", before: scroll(560) } },
  { mock: join(BV_FRAMES, "I1b.png"), label: "I1b · Item sheet — shop", sub: "Quantity, Note for the shop, Add · $x", app: { name: "I1b", component: app("shops/[id].tsx"), fixture: "of_shop", before: tap(/^Eggs \(tray of 30\), \$5\.50/) } },
  { mock: join(BV_FRAMES, "S4.png"), label: "S4 · Pharmacy storefront, with ordering", sub: "+ on each row", app: { name: "S4", component: app("pharmacy/[id].tsx"), fixture: "of_pharmacy" } },
  { mock: join(BV_FRAMES, "S6.png"), label: "S6 · In the cart — pharmacy (rxEnabled on)", sub: "stepper under the row; “Prescription needed” on the Rx item", app: { name: "S6", component: app("pharmacy/[id].tsx"), fixture: "of_pharmacy_cart", before: scroll(560) } },
  { mock: join(BV_FRAMES, "I1c.png"), label: "I1c · Item sheet — pharmacy", sub: "Note for the pharmacy + the OTC line", app: { name: "I1c", component: app("pharmacy/[id].tsx"), fixture: "of_pharmacy", before: tap(/^Paracetamol 500mg \(20 tabs\), \$1\.50/) } },
  { mock: join(OF_FRAMES, "R2a.png"), label: "R2a · Review · shop", sub: "full scroll; If something’s out of stock: Ask me", app: { name: "R2a", fixture: "of_r2a", vp: tall(1587) } },
  { mock: join(OF_FRAMES, "R2b.png"), label: "R2b · Review · pharmacy", sub: "full scroll; OTC notice; Remove it picked", app: { name: "R2b", fixture: "of_r2b", vp: tall(1586), before: tap("Remove it", "radio") } },
  { mock: join(OF_FRAMES, "R5a.png"), label: "R5a · Schedule sheet", sub: "Today / Tomorrow, 30-min slots, Full can’t be picked", app: { name: "R5a", fixture: "of_r5", before: schedule } },
  { mock: join(OF_FRAMES, "R5b.png"), label: "R5b · Review · scheduled", app: { name: "R5b", fixture: "of_r5", before: seq(schedule, tap("Arrive tomorrow 12:30–13:00")) } },
  { mock: join(OF_FRAMES, "R5c.png"), label: "R5c · Closed venue · order for when they open", sub: "the storefront cart bar (first slot)", app: { name: "R5c", component: app("food/[id].tsx"), fixture: "of_r5c" } },
  { mock: join(OF_FRAMES, "R8a.png"), label: "R8a · Prescription block · empty", sub: "rxEnabled on; place blocked with one hint", app: { name: "R8a", fixture: "of_r8" } },
  {
    mock: join(OF_FRAMES, "R8b.png"),
    label: "R8b · Prescription block · added",
    sub: "full scroll; 2 pages, patient, consent",
    app: {
      name: "R8b",
      fixture: "of_r8",
      vp: tall(2033),
      before: seq(tap("Take photo"), tap("Add a photo of your prescription"), fill("Patient name", "Rudo Moyo"), tap("I’ll show the original prescription to the rider", "checkbox")),
    },
  },
];

await mkdir(SHOTS, { recursive: true });
const browser = await launch();
const rows = [];
try {
  for (const r of ROWS) {
    let shot = null;
    try {
      shot = await shootApp(browser, r.app);
    } catch (e) {
      console.log(`app ${r.label}: ${String(e?.message || e).slice(0, 200)}`);
    }
    rows.push({ label: r.label, sub: r.sub, mock: r.mock, app: shot, logicalW: 360 });
    console.log(`ok ${r.label}`);
  }
} finally {
  await browser.close();
}

await buildSheet({ title: "Order flow v2 · part 5 — shops & pharmacy ordering, scheduled, Rx (D-59): handoff (left) vs app (right)", out: OUT, rows });
await writeFile(`${SHOTS}/README.txt`, "Generated by tools/parity/shoot-order-flow-shops.mjs\n");
console.log(`sheet: ${OUT}.png (+ .html); shots in ${SHOTS}`);
