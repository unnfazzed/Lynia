#!/usr/bin/env node
/**
 * The Order flow v2 Review & place screenshot sheet (ledger D-59, build step 2): each R state of the
 * merged cart + checkout (apps/mobile/app/food/checkout.tsx rendered through react-native-web at
 * 360×720) beside the handoff's own frame of it (packages/design/handoff/order-flow-v2/design/screens/
 * <id>.png, rendered from `Order flow v2.1 - all screens.html?screen=<id>`). The app column is staged
 * by the of_r* fixtures (tools/parity/mobile/fixtures/_review.mjs) and driven by accessible name.
 *
 *   node tools/parity/shoot-order-flow-review.mjs --out docs/parity/ORDER-FLOW-V2-REVIEW-2026-10-02
 *
 * The native map is the react-native-maps web shim (a grey field). Out of scope for this PR and so not
 * shot: R2a/R2b (shop/pharmacy ordering), R5a–c (scheduled), R8a/b (Rx).
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
const OUT = resolve(outArg > 0 ? process.argv[outArg + 1] : join(HERE, "out/order-flow-v2-review"));
const SHOTS = `${OUT}-shots`;
const FRAMES = join(REPO, "packages/design/handoff/order-flow-v2/design/screens");
const SCREEN = join(REPO, "apps/mobile/app/food/checkout.tsx");
const FIXTURES = join(HERE, "mobile/fixtures");
const PHONE = { width: 360, height: 720 };

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
async function bundleFor(fixture) {
  if (!bundles.has(fixture)) bundles.set(fixture, await bundleScreen({ component: SCREEN, fixture: join(FIXTURES, `${fixture}.mjs`) }));
  return bundles.get(fixture);
}

async function shootApp(browser, { name, fixture, before }) {
  const ctx = await browser.newContext(contextDefaults({ viewport: PHONE, deviceScaleFactor: 2 }));
  const page = await ctx.newPage();
  try {
    await page.setContent(harnessHtml(await bundleFor(fixture), await interFontCss()), { waitUntil: "load" });
    await page.waitForFunction(() => window.__PARITY_READY === true || typeof window.__PARITY_ERROR === "string", { timeout: 20000 });
    const err = await page.evaluate(() => window.__PARITY_ERROR || null);
    if (err) throw new Error(err);
    await page.evaluate(() => (document.fonts ? document.fonts.ready : null));
    await page.waitForTimeout(900);
    if (before) await before(page);
    await page.waitForTimeout(500);
    const file = join(SHOTS, `app-${name}.png`);
    await (await page.$("#root")).screenshot({ path: file });
    return file;
  } finally {
    await ctx.close();
  }
}

const tap = (name) => async (p) => {
  await p.getByRole("button", { name, exact: typeof name === "string" }).first().click();
};
const editAddress = async (p) => {
  // The first "Edit" on the page is DELIVER TO's (Items edits in place and has none).
  await p.getByRole("button", { name: "Edit", exact: true }).first().click();
};
const place = async (p) => {
  await tap(/^Place order · /)(p);
  await p.waitForTimeout(700);
};

const ROWS = [
  { id: "R1", label: "R1 · Review · restaurant", app: { name: "R1", fixture: "of_r1" } },
  { id: "R3a", label: "R3a · Editing the address", sub: "inline, Send v2 step-1 card; the map is the web shim", app: { name: "R3a", fixture: "of_r1", before: editAddress } },
  { id: "R3b", label: "R3b · Address out of area", sub: "hint, never a red line", app: { name: "R3b", fixture: "of_r3b", before: editAddress } },
  { id: "R4", label: "R4 · Under the $4.00 minimum", sub: "the mock draws a pharmacy cart; restaurants share the rule", app: { name: "R4", fixture: "of_r4" } },
  { id: "R6a", label: "R6a · Changed since the cart", sub: "sold out + price change", app: { name: "R6a", fixture: "of_r6a" } },
  { id: "R6b", label: "R6b · Venue just closed", sub: "'Schedule for …' waits for the slots API (R5) — not rendered", app: { name: "R6b", fixture: "of_r6b" } },
  { id: "R7a", label: "R7a · Placing", app: { name: "R7a", fixture: "of_r7a", before: place } },
  { id: "R7b", label: "R7b · Couldn’t place", sub: "toast + Try again, staying on Review", app: { name: "R7b", fixture: "of_r7b", before: place } },
  { id: "R7c", label: "R7c · Offline", app: { name: "R7c", fixture: "of_r7c" } },
  { id: "R9a", label: "R9a · Empty cart", app: { name: "R9a", fixture: "of_r9a" } },
  { id: "R9b", label: "R9b · No location yet", sub: "no fee, no ETA", app: { name: "R9b", fixture: "of_r9b" } },
];

await mkdir(SHOTS, { recursive: true });
const browser = await launch();
const rows = [];
try {
  for (const r of ROWS) {
    let app = null;
    try {
      app = await shootApp(browser, r.app);
    } catch (e) {
      console.log(`app ${r.label}: ${String(e?.message || e).slice(0, 200)}`);
    }
    rows.push({ label: r.label, sub: r.sub, mock: join(FRAMES, `${r.id}.png`), app, logicalW: 360 });
    console.log(`ok ${r.label}`);
  }
} finally {
  await browser.close();
}

await buildSheet({ title: "Order flow v2 · Review & place (D-59): handoff (left) vs app (right), 360×720", out: OUT, rows });
await writeFile(`${SHOTS}/README.txt`, "Generated by tools/parity/shoot-order-flow-review.mjs\n");
console.log(`sheet: ${OUT}.png (+ .html); shots in ${SHOTS}`);
