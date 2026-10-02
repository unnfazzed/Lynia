#!/usr/bin/env node
/**
 * The Order flow v2 customer sheet (ledger D-59, build step 1): each state of a RESTAURANT order on the
 * one order screen (app/order/[id].tsx rendered through react-native-web) beside the handoff's own frame
 * of it (packages/design/handoff/order-flow-v2/design/screens/<ID>.png — the prototype rendered at
 * 360×720 from `?screen=<ID>`, with the `_320` re-checks). The app column is staged from the of_*
 * fixtures (tools/parity/mobile/fixtures/_order_flow.mjs) and driven by accessible name where a state
 * needs a tap (cancel, help, rating).
 *
 *   node tools/parity/shoot-order-flow-customer.mjs --out docs/parity/ORDER-FLOW-V2-CUSTOMER-2026-10-02
 *
 * The native map is the react-native-maps web shim (a grey field, no markers), so the map half of each
 * frame is honest grey rather than the handoff's drawn streets, venue pin and route.
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
const OUT = resolve(outArg > 0 ? process.argv[outArg + 1] : join(HERE, "out/order-flow-customer"));
const SHOTS = `${OUT}-shots`;
const FRAMES = join(REPO, "packages/design/handoff/order-flow-v2/design/screens");
const SCREEN = join(REPO, "apps/mobile/app/order/[id].tsx");
const FIXTURES = join(HERE, "mobile/fixtures");

function harnessHtml(js, fontCss, phone) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${fontCss}
html,body{margin:0;padding:0;background:#fff;}
#root{width:${phone.width}px;height:${phone.height}px;overflow:hidden;display:flex;flex-direction:column;
  font-family:"Inter",-apple-system,"Segoe UI",Roboto,sans-serif;}
#root>*{flex:1 1 auto;min-height:0;}
</style></head><body><div id="root"></div><script>${js}</script></body></html>`;
}

const bundles = new Map();
async function bundleFor(fixture, component = SCREEN) {
  const key = `${component}|${fixture}`;
  if (!bundles.has(key)) bundles.set(key, await bundleScreen({ component, fixture: join(FIXTURES, `${fixture}.mjs`) }));
  return bundles.get(key);
}

/**
 * G1 / G2 / G3 have no rendered PNG in design/screens: render the handoff's own frame live from
 * `Order flow v2.1 - all screens.html?screen=<ID>` (the panel at its natural size) into the shots dir.
 */
const HANDOFF = join(REPO, "packages/design/handoff/order-flow-v2/Order flow v2.1 - all screens.html");
async function shootMock(browser, id) {
  const ctx = await browser.newContext(contextDefaults({ viewport: { width: 400, height: 900 }, deviceScaleFactor: 1 }));
  const page = await ctx.newPage();
  try {
    await page.goto(`${pathToFileURL(HANDOFF).href}?screen=${id}`, { waitUntil: "load" });
    await page.evaluate(() => (document.fonts ? document.fonts.ready : null));
    await page.waitForTimeout(600);
    const file = join(SHOTS, `mock-${id}.png`);
    await page.locator("body > *").first().screenshot({ path: file });
    return file;
  } finally {
    await ctx.close();
  }
}

const tap = (name) => async (page) => {
  await page.getByRole("button", { name }).first().click();
  await page.waitForTimeout(700);
};
const check = (name) => async (page) => {
  await page.getByRole("checkbox", { name }).first().click();
  await page.waitForTimeout(500);
};
const seq = (...steps) => async (page) => {
  for (const s of steps) await s(page);
};
const wait = (ms) => async (p) => p.waitForTimeout(ms);

async function shootApp(browser, { name, fixture, before, phone, component }) {
  const ctx = await browser.newContext(contextDefaults({ viewport: phone, deviceScaleFactor: 1 }));
  const page = await ctx.newPage();
  try {
    await page.setContent(harnessHtml(await bundleFor(fixture, component), await interFontCss(), phone), { waitUntil: "load" });
    await page.waitForFunction(() => window.__PARITY_READY === true || typeof window.__PARITY_ERROR === "string", { timeout: 20000 });
    const err = await page.evaluate(() => window.__PARITY_ERROR || null);
    if (err) throw new Error(err);
    await page.evaluate(() => (document.fonts ? document.fonts.ready : null));
    await page.waitForTimeout(1200);
    if (before) await before(page);
    await page.waitForTimeout(500);
    const file = join(SHOTS, `app-${name}.png`);
    await page.screenshot({ path: file, clip: { x: 0, y: 0, width: phone.width, height: phone.height } });
    return file;
  } finally {
    await ctx.close();
  }
}

const P360 = { width: 360, height: 720 };
const P320 = { width: 320, height: 640 };

const ROWS = [
  { id: "T2", label: "T2 · Confirming (auto-accepted)", fixture: "of_t2" },
  { id: "T3", label: "T3 · Waiting for accept", fixture: "of_t3" },
  { id: "T4", label: "T4 · Cooking", fixture: "of_t4" },
  { id: "T6", label: "T6 · Rider heading to the venue", fixture: "of_t6" },
  { id: "T7", label: "T7 · Rider collecting", fixture: "of_t7" },
  { id: "T8", label: "T8 · Collected", sub: "sealed-bag photo row (placeholder tile: no image bytes in the harness)", fixture: "of_t8" },
  { id: "T8b", label: "T8b · Pickup-photo viewer", fixture: "of_t8", before: tap("View") },
  { id: "T9", label: "T9 · On the way", fixture: "of_t9" },
  { id: "T11a", label: "T11a · Finding a rider is slow", fixture: "of_t11a" },
  { id: "T11b", label: "T11b · Rider dropped", fixture: "of_t11b" },
  { id: "T12a", label: "T12a · No location fix", fixture: "of_t12a" },
  { id: "T12b", label: "T12b · Rider GPS paused", fixture: "of_t12b" },
  { id: "T14a", label: "T14a · Loading", fixture: "of_t14a" },
  { id: "T14b", label: "T14b · Couldn't load", fixture: "of_t14b", before: wait(1500) },
  { id: "T14c", label: "T14c · Not found", fixture: "of_t14c", before: wait(1500) },
  { id: "T14d", label: "T14d · Offline", fixture: "of_t14d", before: wait(800) },
  { id: "T15a", label: "T15a · Cancel · free", sub: "before the rider collects", fixture: "of_t6", before: tap("Cancel order · free") },
  { id: "T15b", label: "T15b · Cancel · after collection", sub: "entry: a 'Cancel order' link under the rider card (the handoff draws the sheet, not its entry)", fixture: "of_t9", before: tap("Cancel order") },
  { id: "T16a", label: "T16a · Get help", fixture: "of_t9", before: tap(/^Get help$/) },
  { id: "T16b", label: "T16b · Report a problem", fixture: "of_t9", before: seq(tap(/^Get help$/), tap(/^Report a problem/)) },
  { id: "U2a", label: "U2a · One swap that raises the total", sub: "restaurant sample names; the frame is a shop", fixture: "of_u2a" },
  { id: "U2b", label: "U2b · Three lines, answered", fixture: "of_u2b", before: seq(tap("Accept swap"), async (page) => { await page.getByRole("button", { name: "Remove it" }).nth(1).click(); await page.waitForTimeout(500); }) },
  { id: "U3", label: "U3 · No answer in time", fixture: "of_u3" },
  { id: "U4a", label: "U4a · Mid-prep change", fixture: "of_u4a" },
  { id: "U4b", label: "U4b · Reduce-only change", fixture: "of_u4b" },
  { id: "U5", label: "U5 · Everything out of stock", fixture: "of_u5" },
  { id: "P1", label: "P1 · At your door · pay", fixture: "of_p1" },
  { id: "P1b", label: "P1b · Waiting for the rider", fixture: "of_p1b" },
  { id: "P2", label: "P2 · Code revealed", fixture: "of_p2", before: wait(800) },
  { id: "P3a", label: "P3a · Ring lapsed", fixture: "of_p3a" },
  { id: "D1", label: "D1 · Delivered · rate + receipt", sub: "venue rated 5 + Tasty / Well packed, rider not yet", fixture: "of_d1", before: seq(tap(/^5 stars/), check("Tasty"), check("Well packed")) },
  { id: "D1b", label: "D1b · Rated + Undo", fixture: "of_d1", before: seq(tap(/^5 stars/), async (page) => { await page.getByRole("button", { name: /^4 stars/ }).nth(1).click(); await page.waitForTimeout(400); }, tap("Send rating")) },
  { id: "P5", label: "P5 · Customer door photo", fixture: "of_p5" },
  { id: "D2a", label: "D2a · Completed later · rated", fixture: "of_d2a" },
  { id: "D2b", label: "D2b · Completed later · not rated", fixture: "of_d2b" },
  { id: "D3a", label: "D3a · Cancelled by you", fixture: "of_d3a" },
  { id: "D3b", label: "D3b · Venue couldn't take it", fixture: "of_d3b" },
  { id: "D3c", label: "D3c · Kitchen didn't confirm in 1 h", fixture: "of_d3c" },
  { id: "D3d", label: "D3d · No rider found", fixture: "of_d3d" },
  { id: "D3e", label: "D3e · Cancelled by LyniaGo", fixture: "of_d3e" },
  { id: "D3f", label: "D3f · Cancelled after pickup", fixture: "of_d3f" },
  { id: "D4", label: "D4 · Not delivered", fixture: "of_d4" },
  { id: "T4", label: "T4 · Cooking at 320×640", fixture: "of_t4", phone: P320 },
  { id: "T9", label: "T9 · On the way at 320×640", fixture: "of_t9", phone: P320 },
  { id: "P2", label: "P2 · Code at 320×640", fixture: "of_p2", phone: P320, before: wait(800) },
  { id: "D1", label: "D1 · Delivered at 320×640", fixture: "of_d1", phone: P320 },
];

// Round 3 (`--round 3`): shops, pharmacy, scheduled, Rx; G1 Home's live bar and G2 the Orders tab's Now
// cards (their frames render live from the handoff — design/screens has no G PNGs).
const HOME = join(REPO, "apps/mobile/app/(tabs)/home.tsx");
const ORDERS = join(REPO, "apps/mobile/app/(tabs)/orders.tsx");
const ROUND3 = [
  { id: "T3", label: "T3 · Waiting for a shop to accept", sub: "shops never auto-accept: the 3-minute window", fixture: "of_t3s" },
  { id: "T5a", label: "T5a · Packing · shop", fixture: "of_t5a" },
  { id: "T5b", label: "T5b · Packing · pharmacy", sub: "+ the seal note under the prep bar", fixture: "of_t5b" },
  { id: "T5c", label: "T5c · Pharmacist checking the prescription", fixture: "of_t5c" },
  { id: "T13a", label: "T13a · Scheduled", fixture: "of_t13a" },
  { id: "R5a", label: "T13a → Change time (the R5a schedule sheet)", sub: "frame: R5a, the same sheet on Review", fixture: "of_t13a", before: tap("Change time") },
  { id: "T13b", label: "T13b · Scheduled → started", sub: "slot = the fixture's today 23:00", fixture: "of_t13b" },
  { id: "P1s", label: "P1s · At your door · pharmacy (check the seal)", fixture: "of_p1s" },
  { id: "D5a", label: "D5a · Prescription declined · the rest continues", fixture: "of_d5a" },
  { id: "D5b", label: "D5b · Prescription declined · cancelled", fixture: "of_d5b" },
  { id: "G1", label: "G1 · Home live bar · restaurant cooking", sub: "frame: every G1 bar; app: one bar per lead order (+6 orders)", fixture: "of_g1", component: HOME, live: true },
  { id: "G1", label: "G1 · Home live bar · shop needs your answer", fixture: "of_g1a", component: HOME, live: true },
  { id: "G1", label: "G1 · Home live bar · pharmacy at the door", fixture: "of_g1d", component: HOME, live: true },
  { id: "G1", label: "G1 · Home live bar · scheduled", fixture: "of_g1s", component: HOME, live: true },
  { id: "G2", label: "G2 · Orders tab · Now cards", fixture: "of_g2", component: ORDERS, live: true },
];

await mkdir(SHOTS, { recursive: true });
const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1].split(",") : null;
const round3 = process.argv.includes("--round") && process.argv[process.argv.indexOf("--round") + 1] === "3";
const mocks = new Map();
const browser = await launch();
const rows = [];
try {
  for (const r of round3 ? ROUND3 : ROWS) {
    if (only && !only.includes(r.id)) continue;
    const phone = r.phone ?? P360;
    const narrow = phone.width < 360;
    const name = `${r.id}${narrow ? "-320" : ""}-${r.fixture}`;
    let app = null;
    try {
      app = await shootApp(browser, { name, fixture: r.fixture, before: r.before, phone, component: r.component });
    } catch (e) {
      console.log(`app ${r.label}: ${String(e?.message || e).slice(0, 300)}`);
    }
    let mock = join(FRAMES, `${r.id}${narrow ? "_320" : ""}.png`);
    if (r.live) {
      if (!mocks.has(r.id)) mocks.set(r.id, await shootMock(browser, r.id).catch((e) => (console.log(`mock ${r.id}: ${String(e?.message || e).slice(0, 200)}`), null)));
      mock = mocks.get(r.id);
    }
    rows.push({ label: r.label, sub: r.sub, mock, app, logicalW: phone.width });
    console.log(`ok ${r.label}`);
  }
} finally {
  await browser.close();
}

const TITLE = round3
  ? "Order flow v2 · round 3 (D-59): shop / pharmacy / scheduled / Rx order states, G1 live bar, G2 Now cards — handoff (left) vs app (right)"
  : "Order flow v2 · the customer order screen for restaurant orders, round 2 (D-59): handoff (left) vs app (right)";
await buildSheet({ title: TITLE, out: OUT, rows });
await writeFile(`${SHOTS}/README.txt`, "Generated by tools/parity/shoot-order-flow-customer.mjs\n");
console.log(`sheet: ${OUT}.png (+ .html); shots in ${SHOTS}`);
