#!/usr/bin/env node
/**
 * The After Send screenshot sheet (ledger D-53, v2 round): each state of the customer's order screen
 * (app/order/[id].tsx rendered through react-native-web) beside the v2 handoff's own drawing of it
 * (packages/design/handoff/after-send-v2/design/After Send v2 (standalone).html, cell by cell via its
 * `#s-<id>` anchors). The app column is driven the way a customer would: taps by accessible name, from
 * the as_* / as2_* fixtures (tools/parity/mobile/fixtures/_after_send.mjs).
 *
 *   node tools/parity/shoot-after-send.mjs --out docs/parity/AFTER-SEND-V2-2026-10-01
 *
 * The native map is the react-native-maps web shim (a grey field, no markers), so the map half of each
 * frame is honest grey rather than the handoff's drawn streets, pins and rider marker.
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
const OUT = resolve(outArg > 0 ? process.argv[outArg + 1] : join(HERE, "out/after-send"));
const SHOTS = `${OUT}-shots`;
const MOCK = pathToFileURL(join(REPO, "packages/design/handoff/after-send-v2/design/After Send v2 (standalone).html")).href;
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
async function bundleFor(fixture) {
  if (!bundles.has(fixture)) bundles.set(fixture, await bundleScreen({ component: SCREEN, fixture: join(FIXTURES, `${fixture}.mjs`) }));
  return bundles.get(fixture);
}

const tap = (name) => async (page) => {
  await page.getByRole("button", { name }).first().click();
  await page.waitForTimeout(600);
};
const seq = (...steps) => async (page) => {
  for (const s of steps) await s(page);
};
const rate = (stars, tags) =>
  seq(tap(new RegExp(`^${stars} stars?,`)), ...tags.map((t) => async (p) => {
    await p.getByRole("checkbox", { name: t }).first().click();
    await p.waitForTimeout(200);
  }));

async function shootApp(browser, { name, fixture, before, phone }) {
  const ctx = await browser.newContext(contextDefaults({ viewport: phone, deviceScaleFactor: 2 }));
  const page = await ctx.newPage();
  try {
    await page.setContent(harnessHtml(await bundleFor(fixture), await interFontCss(), phone), { waitUntil: "load" });
    await page.waitForFunction(() => window.__PARITY_READY === true || typeof window.__PARITY_ERROR === "string", { timeout: 20000 });
    const err = await page.evaluate(() => window.__PARITY_ERROR || null);
    if (err) throw new Error(err);
    await page.evaluate(() => (document.fonts ? document.fonts.ready : null));
    await page.waitForTimeout(900);
    if (before) await before(page);
    await page.waitForTimeout(500);
    const file = join(SHOTS, `app-${name}.png`);
    await page.screenshot({ path: file, clip: { x: 0, y: 0, width: phone.width, height: phone.height } });
    return file;
  } finally {
    await ctx.close();
  }
}

let mockPage = null;
async function shootMock(browser, id, phone) {
  if (!mockPage) {
    const ctx = await browser.newContext(contextDefaults({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 }));
    mockPage = await ctx.newPage();
    await mockPage.goto(MOCK, { waitUntil: "load" });
    await mockPage.waitForTimeout(2500);
  }
  // An attribute selector needs no CSS escaping for the dots in a state id ("2.1").
  const anchor = `[id="s-${id}${phone.width < 360 ? "-320" : ""}"]`;
  const cell = mockPage.locator(anchor).first();
  await cell.scrollIntoViewIfNeeded();
  await mockPage.waitForTimeout(900);
  const handle = await cell.evaluateHandle((c, w) => [...c.querySelectorAll("div")].find((d) => Math.round(d.getBoundingClientRect().width) === w && d.getBoundingClientRect().height > 500), phone.width);
  const el = handle.asElement();
  if (!el) throw new Error(`no mock frame for ${anchor}`);
  const file = join(SHOTS, `mock-${id}${phone.width < 360 ? "-320" : ""}.png`);
  await el.screenshot({ path: file });
  return file;
}

const P360 = { width: 360, height: 720 };
const P320 = { width: 320, height: 640 };

const wait = (ms) => async (p) => p.waitForTimeout(ms);

// Not shot: 2.33 (Home live-order bar). It is superseded by Calm Mint v2's live-order bar on Home
// (ledger D-67, owner 2026-10-02) and is not built, so there is no app frame to pair it with.
const ROWS = [
  { id: "2.1", label: "2.1 · Opening an order", app: { fixture: "as2_1" } },
  { id: "2.2", label: "2.2 · Couldn't load", app: { fixture: "as2_2", before: wait(1500) } },
  { id: "2.3", label: "2.3 · Not found", app: { fixture: "as2_3", before: wait(1500) } },
  { id: "1", label: "1 · Finding, just sent", app: { fixture: "as_1" } },
  { id: "1b", label: "1b · Cancel request confirm", app: { fixture: "as_1", before: tap("Cancel request") } },
  { id: "2", label: "2 · No riders online", app: { fixture: "as_2" } },
  { id: "2.8a", label: "2.8a · Notify me, confirmed", app: { fixture: "as2_8a", before: tap("Notify me when a rider's online") } },
  { id: "2.8b", label: "2.8b · Reminders unavailable", app: { fixture: "as2_8b", before: tap("Notify me when a rider's online") } },
  { id: "2.6", label: "2.6 · + $0.50 failed", app: { fixture: "as2_6", before: tap("Raise your price by 50 cents") } },
  { id: "5", label: "5 · Price raised in place", app: { fixture: "as_1", before: tap("Raise your price by 50 cents") } },
  { id: "3", label: "3 · Offers", app: { fixture: "as_3" } },
  { id: "4", label: "4 · Select race", app: { fixture: "as_4", before: async (p) => {
    await p.getByRole("button", { name: /^Choose / }).first().click();
    await p.waitForTimeout(1200);
  } } },
  { id: "2.7", label: "2.7 · Price raised while offers show", app: { fixture: "as_3", before: tap("Raise your price by 50 cents") } },
  { id: "2.10", label: "2.10 · Timer hit 0 with offers", app: { fixture: "as2_10" } },
  { id: "6", label: "6 · Matched, to pickup", app: { fixture: "as_6" } },
  { id: "2.12", label: "2.12 · No GPS fix yet", app: { fixture: "as2_12" } },
  { id: "2.14", label: "2.14 · Code being issued", app: { fixture: "as2_14" } },
  { id: "2.15", label: "2.15 · Number not available", app: { fixture: "as2_15" } },
  { id: "7", label: "7 · Picked up, to drop-off", app: { fixture: "as_7" } },
  { id: "2.16", label: "2.16 · Pickup photo viewer", app: { fixture: "as_7", before: tap(/^View Pickup photo/) } },
  { id: "8", label: "8 · Hand-off", app: { fixture: "as_8" } },
  { id: "9", label: "9 · GPS paused", app: { fixture: "as_9" } },
  { id: "19", label: "19 · Offline", app: { fixture: "as_19" } },
  { id: "10a", label: "10a · Cancel before pickup", app: { fixture: "as_6", before: tap("Cancel order · free until pickup") } },
  { id: "10b", label: "10b · Cancel after pickup", app: { fixture: "as_7", before: tap(/^Cancel order$/) } },
  { id: "2.22c", label: "2.22c · Cancel failed", app: { fixture: "as2_22c", before: seq(tap("Cancel order · free until pickup"), tap(/^Cancel order$/), wait(800)) } },
  { id: "11", label: "11 · Get help", app: { fixture: "as_7", before: tap("Get help") } },
  { id: "2.17a", label: "2.17a · Report a problem", app: { fixture: "as_7", before: seq(tap("Get help"), tap(/^Report a problem/), async (p) => { await p.getByRole("checkbox", { name: "Damaged" }).first().click(); await p.waitForTimeout(400); }) } },
  { id: "2.18", label: "2.18 · Back from the emergency call", app: { fixture: "as_7", before: seq(tap("Get help"), tap(/^Emergency\?/)) } },
  { id: "12", label: "12 · No match", app: { fixture: "as_12" } },
  { id: "2.21b", label: "2.21b · Send again failed", app: { fixture: "as2_21b", before: seq(tap(/^Send again at/), wait(800)) } },
  { id: "13", label: "13 · Rider cancelled before pickup (reopened)", app: { fixture: "as_13" } },
  { id: "14a", label: "14a · Delivered, rate", app: { fixture: "as_14", before: rate(4, ["On time", "Careful with parcel"]) } },
  { id: "14b", label: "14b · Low rating", app: { fixture: "as_14", before: rate(2, ["Late"]) } },
  { id: "15", label: "15 · Rated, undo", app: { fixture: "as_14", before: seq(rate(4, ["On time"]), tap("Submit rating")) } },
  { id: "2.24", label: "2.24 · Rating didn't save", sub: "after the 10 s undo window", app: { fixture: "as2_24", before: seq(rate(4, ["On time", "Careful with parcel"]), tap("Submit rating"), wait(11500)) } },
  { id: "2.26", label: "2.26 · Trip complete, rated", app: { fixture: "as2_26" } },
  { id: "2.25", label: "2.25 · Trip complete, not rated", app: { fixture: "as2_25" } },
  { id: "17", label: "17 · Not delivered", app: { fixture: "as_17" } },
  { id: "2.29a", label: "2.29a · Refused", app: { fixture: "as2_29a" } },
  { id: "2.29b", label: "2.29b · Wrong address", app: { fixture: "as2_29b" } },
  { id: "2.29c", label: "2.29c · Bike broke down", app: { fixture: "as2_29c" } },
  { id: "18a", label: "18a · Cancelled by you", app: { fixture: "as_18a" } },
  { id: "2.30", label: "2.30 · Cancelled by you, no reason", app: { fixture: "as2_30" } },
  { id: "18b", label: "18b · Cancelled by the rider (after pickup)", app: { fixture: "as_18b" } },
  { id: "2.31a", label: "2.31a · LyniaGo, ops reason", app: { fixture: "as2_31a" } },
  { id: "2.31b", label: "2.31b · LyniaGo, generic", app: { fixture: "as_18c" } },
  { id: "3", label: "3 · Offers at 320×640", app: { fixture: "as_3", phone: P320 } },
  { id: "6", label: "6 · Matched at 320×640", app: { fixture: "as_6", phone: P320 } },
  { id: "8", label: "8 · Hand-off at 320×640", app: { fixture: "as_8", phone: P320 } },
  { id: "14a", label: "14a · Rate at 320×640", app: { fixture: "as_14", phone: P320, before: rate(4, ["On time", "Careful with parcel"]) } },
];

await mkdir(SHOTS, { recursive: true });
const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1].split(",") : null;
const browser = await launch();
const rows = [];
try {
  for (const r of ROWS) {
    if (only && !only.includes(r.id)) continue;
    const phone = r.app.phone ?? P360;
    const name = `${r.id}${phone.width < 360 ? "-320" : ""}-${r.app.fixture}`;
    let mock = null;
    let app = null;
    try {
      mock = await shootMock(browser, r.id, phone);
    } catch (e) {
      console.log(`mock ${r.label}: ${String(e?.message || e).slice(0, 200)}`);
    }
    try {
      app = await shootApp(browser, { ...r.app, name, phone });
    } catch (e) {
      console.log(`app ${r.label}: ${String(e?.message || e).slice(0, 300)}`);
    }
    rows.push({ label: r.label, sub: r.sub, mock, app, logicalW: phone.width });
    console.log(`ok ${r.label}`);
  }
} finally {
  await browser.close();
}

await buildSheet({ title: "After Send v2 · the order screen (D-53): handoff (left) vs app (right)", out: OUT, rows });
await writeFile(`${SHOTS}/README.txt`, "Generated by tools/parity/shoot-after-send.mjs\n");
console.log(`sheet: ${OUT}.png (+ .html); shots in ${SHOTS}`);
