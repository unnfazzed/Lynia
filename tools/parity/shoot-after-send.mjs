#!/usr/bin/env node
/**
 * The After Send screenshot sheet (ledger D-53): each state of the customer's order screen
 * (app/order/[id].tsx rendered through react-native-web) beside the handoff's own 2× render of it
 * (packages/design/handoff/after-send/screens/*.png). The app column is driven the way a customer would:
 * taps by accessible name, from the as_* fixtures (tools/parity/mobile/fixtures/_after_send.mjs).
 *
 *   node tools/parity/shoot-after-send.mjs --out docs/parity/AFTER-SEND-2026-10-01
 *
 * The native map is the react-native-maps web shim (a grey field, no markers), so the map half of each
 * frame is honest grey rather than the handoff's drawn streets, pins and rider marker.
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
const OUT = resolve(outArg > 0 ? process.argv[outArg + 1] : join(HERE, "out/after-send"));
const SHOTS = `${OUT}-shots`;
const MOCKS = join(REPO, "packages/design/handoff/after-send/screens");
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

const P360 = { width: 360, height: 720 };
const P320 = { width: 320, height: 640 };

const ROWS = [
  { mock: "01-finding", label: "1 · Finding, just sent", app: { fixture: "as_1" } },
  { mock: "01b-finding-cancel-confirm", label: "1b · Cancel request confirm", app: { fixture: "as_1", before: tap("Cancel request") } },
  { mock: "02-no-riders-online", label: "2 · No riders online", app: { fixture: "as_2" } },
  { mock: "03-offers", label: "3 · Offers", app: { fixture: "as_3" } },
  { mock: "04-select-race", label: "4 · Select race", sub: "Choose on the first card answers 409; the list re-ranks", app: { fixture: "as_4", before: async (p) => {
    await p.getByRole("button", { name: /^Choose / }).first().click();
    await p.waitForTimeout(1200);
  } } },
  { mock: "05-price-raised", label: "5 · Price raised in place", app: { fixture: "as_1", before: tap("Raise your price by 50 cents") } },
  { mock: "06-matched-to-pickup", label: "6 · Matched, to pickup", app: { fixture: "as_6" } },
  { mock: "07-picked-up-to-dropoff", label: "7 · Picked up, to drop-off", app: { fixture: "as_7" } },
  { mock: "08-handoff-code", label: "8 · Hand-off", sub: "real codes are six digits (D-53 §4)", app: { fixture: "as_8" } },
  { mock: "09-gps-paused", label: "9 · GPS paused", app: { fixture: "as_9" } },
  { mock: "10a-cancel-before-pickup", label: "10a · Cancel before pickup", app: { fixture: "as_6", before: tap("Cancel order · free until pickup") } },
  { mock: "10b-cancel-after-pickup", label: "10b · Cancel after pickup", app: { fixture: "as_7", before: tap(/^Cancel order$/) } },
  { mock: "11-get-help", label: "11 · Get help", app: { fixture: "as_7", before: tap("Get help") } },
  { mock: "12-retry-no-match", label: "12 · No match", app: { fixture: "as_12" } },
  { mock: "13-retry-rider-cancelled", label: "13 · Rider cancelled", app: { fixture: "as_13" } },
  { mock: "14a-delivered-rate", label: "14a · Delivered, rate", app: { fixture: "as_14", before: rate(4, ["On time", "Careful with parcel"]) } },
  { mock: "14b-delivered-low-rating", label: "14b · Low rating", app: { fixture: "as_14", before: rate(2, ["Late"]) } },
  { mock: "15-rated-undo-receipt", label: "15 · Rated, undo", app: { fixture: "as_14", before: seq(rate(4, ["On time"]), tap("Submit rating")) } },
  { mock: "16-completed", label: "16 · Completed", app: { fixture: "as_16" } },
  { mock: "17-not-delivered", label: "17 · Not delivered", app: { fixture: "as_17" } },
  { mock: "18a-cancelled-by-you", label: "18a · Cancelled by you", app: { fixture: "as_18a" } },
  { mock: "18b-cancelled-by-rider", label: "18b · Cancelled by the rider", sub: "after pickup — before pickup it is state 13", app: { fixture: "as_18b" } },
  { mock: "18c-cancelled-by-lyniago", label: "18c · Cancelled by LyniaGo", app: { fixture: "as_18c" } },
  { mock: "19-offline", label: "19 · Offline", app: { fixture: "as_19" } },
  { mock: "320-03-offers", label: "3 · Offers at 320×640", app: { fixture: "as_3", phone: P320 } },
  { mock: "320-06-matched", label: "6 · Matched at 320×640", app: { fixture: "as_6", phone: P320 } },
  { mock: "320-08-handoff", label: "8 · Hand-off at 320×640", app: { fixture: "as_8", phone: P320 } },
  { mock: "320-14a-rate", label: "14a · Rate at 320×640", app: { fixture: "as_14", phone: P320, before: rate(4, ["On time", "Careful with parcel"]) } },
];

await mkdir(SHOTS, { recursive: true });
const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1].split(",") : null;
const browser = await launch();
const rows = [];
try {
  for (const r of ROWS) {
    if (only && !only.includes(r.mock.split("-")[0]) && !only.includes(r.mock)) continue;
    const phone = r.app.phone ?? P360;
    let app = null;
    try {
      app = await shootApp(browser, { ...r.app, name: r.mock, phone });
    } catch (e) {
      console.log(`app ${r.label}: ${String(e?.message || e).slice(0, 300)}`);
    }
    rows.push({ label: r.label, sub: r.sub, mock: join(MOCKS, `${r.mock}.png`), app, logicalW: phone.width });
    console.log(`ok ${r.label}`);
  }
} finally {
  await browser.close();
}

await buildSheet({ title: "After Send · the order screen (D-53): handoff (left) vs app (right)", out: OUT, rows });
await writeFile(`${SHOTS}/README.txt`, "Generated by tools/parity/shoot-after-send.mjs\n");
console.log(`sheet: ${OUT}.png (+ .html); shots in ${SHOTS}`);
