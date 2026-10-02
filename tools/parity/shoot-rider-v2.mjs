#!/usr/bin/env node
/**
 * The Rider v2 screenshot sheet (ledger D-54): each landed state of the rider-v2 handoff
 * (packages/design/handoff/rider-v2/design/Rider v2 (standalone).html, cell by cell via its
 * `data-screen-label`) beside the app screen rendered through react-native-web at 360×720 from the
 * rv2_* fixtures (tools/parity/mobile/fixtures/_rider_v2.mjs).
 *
 *   node tools/parity/shoot-rider-v2.mjs --out docs/parity/RIDER-V2-2026-10-01
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
const OUT = resolve(outArg > 0 ? process.argv[outArg + 1] : join(HERE, "out/rider-v2"));
const SHOTS = `${OUT}-shots`;
const MOCK = pathToFileURL(join(REPO, "packages/design/handoff/rider-v2/design/Rider v2 (standalone).html")).href;
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

let mockPage = null;
async function shootMock(browser, id) {
  if (!mockPage) {
    const ctx = await browser.newContext(contextDefaults({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 }));
    mockPage = await ctx.newPage();
    await mockPage.goto(MOCK, { waitUntil: "load" });
    await mockPage.waitForTimeout(2500);
  }
  const handle = await mockPage.evaluateHandle(async (cellId) => {
    const cell = document.getElementById(`s-${cellId}`);
    if (!cell) return null;
    cell.scrollIntoView();
    await new Promise((r) => setTimeout(r, 600));
    return [...cell.querySelectorAll("div")].find((d) => {
      const r = d.getBoundingClientRect();
      return Math.round(r.width) === 360 && Math.round(r.height) === 720;
    });
  }, id);
  const el = handle.asElement();
  if (!el) throw new Error(`no mock cell "${id}"`);
  const file = join(SHOTS, `mock-${id}.png`);
  await el.screenshot({ path: file });
  return file;
}

const press = (name) => async (p) => {
  await p.getByRole("radio", { name, exact: true }).first().click();
  await p.waitForTimeout(500);
};
const next = (n) => async (p) => {
  for (let i = 0; i < n; i += 1) {
    await p.getByRole("button", { name: "Next", exact: true }).first().click();
    await p.waitForTimeout(300);
  }
};
const scrollBy = (y) => async (p) => {
  await p.evaluate((dy) => {
    const els = [...document.querySelectorAll("#root div")].filter((d) => d.scrollHeight > d.clientHeight + 4 && getComputedStyle(d).overflowY !== "visible");
    els.forEach((d) => (d.scrollTop = dy));
  }, y);
};

const ROWS = [
  { id: "J1", label: "J1 · Jobs board", sub: "harness: grey map, inert socket (so Reconnecting)", app: { name: "J1", component: app("rider/(tabs)/index.tsx"), fixture: "rv2_board" } },
  { id: "J4", label: "J4 · Board, empty", app: { name: "J4", component: app("rider/(tabs)/index.tsx"), fixture: "rv2_board_empty" } },
  { id: "O1", label: "O1 · Make an offer", app: { name: "O1", component: app("rider/offer/[jobId].tsx"), fixture: "rv2_offer" } },
  { id: "G2", label: "G2 · KYC under review", app: { name: "G2", component: app("rider/(tabs)/index.tsx"), fixture: "rv2_gate_pending" } },
  { id: "G4", label: "G4 · KYC failed", app: { name: "G4", component: app("rider/(tabs)/index.tsx"), fixture: "rv2_gate_failed" } },
  { id: "F1", label: "F1 · Food offer", sub: "harness: grey map", app: { name: "F1", component: app("rider/food-offer.tsx"), fixture: "rv2_food_offer" } },
  { id: "F2", label: "F2 · Food offer, pay the kitchen upfront", app: { name: "F2", component: app("rider/food-offer.tsx"), fixture: "rv2_food_offer_upfront" } },
  { id: "A1", label: "A1 · Heading to pickup", app: { name: "A1", component: app("rider/job.tsx"), fixture: "rv2_job_pickup" } },
  { id: "A2", label: "A2 · At pickup, check items", app: { name: "A2", component: app("rider/job.tsx"), fixture: "rv2_job_check" } },
  { id: "A8", label: "A8 · Delivery code", sub: "the mock draws a keypad for layout; the app uses the phone's", app: { name: "A8", component: app("rider/job.tsx"), fixture: "rv2_job_code" } },
  { id: "M1", label: "M1 · Money, today", app: { name: "M1", component: app("rider/(tabs)/money.tsx"), fixture: "rv2_money" } },
  { id: "M2", label: "M2 · Money, this week", app: { name: "M2", component: app("rider/(tabs)/money.tsx"), fixture: "rv2_money", before: press("This week") } },
  { id: "M6", label: "M6 · Below the floor", app: { name: "M6", component: app("rider/(tabs)/money.tsx"), fixture: "rv2_money_floor" } },
  { id: "M7", label: "M7 · Owes commission", app: { name: "M7", component: app("rider/(tabs)/money.tsx"), fixture: "rv2_money_owes" } },
  { id: "T1", label: "T1 · Top up, provider", app: { name: "T1", component: app("wallet/top-up.tsx"), fixture: "rv2_topup" } },
  { id: "T2", label: "T2 · Top up, amount", app: { name: "T2", component: app("wallet/top-up.tsx"), fixture: "rv2_topup", before: next(1) } },
  { id: "T3", label: "T3 · Top up, phone", app: { name: "T3", component: app("wallet/top-up.tsx"), fixture: "rv2_topup", before: next(2) } },
  { id: "C1", label: "C1 · Rider Account", app: { name: "C1", component: app("rider/(tabs)/account.tsx"), fixture: "rv2_account_rider" } },
  { id: "C3", label: "C3 · One strike from a pause", sub: "the app shows the whole screen unscrolled", app: { name: "C3", component: app("rider/(tabs)/account.tsx"), fixture: "rv2_account_risk" } },
  { id: "C4", label: "C4 · Switch confirm", app: { name: "C4", component: app("rider/(tabs)/account.tsx"), fixture: "rv2_account_rider", before: press("Customer") } },
  { id: "C6", label: "C6 · Customer Account, rider", app: { name: "C6", component: app("(tabs)/account.tsx"), fixture: "rv2_account_customer" } },
  { id: "C7", label: "C7 · Customer Account, become a rider", app: { name: "C7", component: app("(tabs)/account.tsx"), fixture: "rv2_account_become" } },
  { id: "C9", label: "C9 · Become a rider, under review", app: { name: "C9", component: app("(tabs)/account.tsx"), fixture: "rv2_account_review" } },
  { id: "C12", label: "C12 · Job history", app: { name: "C12", component: app("history/index.tsx"), fixture: "rv2_history_rider" } },
  { id: "S1", label: "S1 · Settings, rider", app: { name: "S1", component: app("settings/index.tsx"), fixture: "rv2_settings_rider" } },
  { id: "S2", label: "S2 · Settings, rider section", app: { name: "S2", component: app("settings/index.tsx"), fixture: "rv2_settings_rider", before: scrollBy(400) } },
  { id: "S5", label: "S5 · Bike & documents", sub: "no expiry dates or licence disc on record yet (D-54 §4)", app: { name: "S5", component: app("rider/documents.tsx"), fixture: "rv2_docs" } },
  { id: "S4", label: "S4 · Settings, customer only", app: { name: "S4", component: app("settings/index.tsx"), fixture: "rv2_settings_customer" } },
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

await buildSheet({ title: "Rider v2 (D-54): handoff (left) vs app (right), 360×720", out: OUT, rows });
await writeFile(`${SHOTS}/README.txt`, "Generated by tools/parity/shoot-rider-v2.mjs\n");
console.log(`sheet: ${OUT}.png (+ .html); shots in ${SHOTS}`);
