#!/usr/bin/env node
/**
 * The Send flow v2 screenshot sheet (ledger D-52): each state of the redesigned customer Send flow
 * (app/send.tsx rendered through react-native-web at 360×720) beside the handoff's own drawing of it
 * (packages/design/handoff/send-compose-v2/design/Send Compose v2 (standalone).html, cell by cell via
 * its `data-screen-label`). The app column is driven the way a customer would: clicks and typing by
 * accessible name, from the send_v2_* fixtures (tools/parity/mobile/fixtures/_send_v2.mjs).
 *
 *   node tools/parity/shoot-send-v2.mjs --out docs/parity/SEND-COMPOSE-V2-2026-10-01
 *
 * The native map is the react-native-maps web shim (a grey field), and this build has no Places key, so
 * the inline search shows the handoff's state 3c ("Search is limited right now…") rather than state 2.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname } from "node:path";
import { contextDefaults, launch } from "./lib/browser.mjs";
import { buildSheet } from "./lib/sheet.mjs";
import { bundleScreen } from "./mobile/bundle.mjs";
import { interFontCss } from "./mobile/fonts.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const outArg = process.argv.indexOf("--out");
const OUT = resolve(outArg > 0 ? process.argv[outArg + 1] : join(HERE, "out/send-compose-v2"));
const SHOTS = `${OUT}-shots`;
const MOCK = pathToFileURL(join(REPO, "packages/design/handoff/send-compose-v2/design/Send Compose v2 (standalone).html")).href;
const SCREEN = join(REPO, "apps/mobile/app/send.tsx");
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

const btn = (page, name) => page.getByRole("button", { name, exact: true }).first();

async function shootApp(browser, { name, fixture, before }) {
  const ctx = await browser.newContext(contextDefaults({ viewport: PHONE, deviceScaleFactor: 2 }));
  const page = await ctx.newPage();
  try {
    await page.setContent(harnessHtml(await bundleFor(fixture), await interFontCss()), { waitUntil: "load" });
    await page.waitForFunction(() => window.__PARITY_READY === true || typeof window.__PARITY_ERROR === "string", { timeout: 20000 });
    const err = await page.evaluate(() => window.__PARITY_ERROR || null);
    if (err) throw new Error(err);
    await page.evaluate(() => (document.fonts ? document.fonts.ready : null));
    await page.waitForTimeout(700);
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
async function shootMock(browser, label) {
  if (!mockPage) {
    const ctx = await browser.newContext(contextDefaults({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 }));
    mockPage = await ctx.newPage();
    await mockPage.goto(MOCK, { waitUntil: "load" });
    await mockPage.waitForTimeout(2500);
  }
  const handle = await mockPage.evaluateHandle((l) => {
    const cell = document.querySelector(`[data-screen-label="${l}"]`);
    if (!cell) return null;
    return [...cell.querySelectorAll("div")].find((d) => {
      const r = d.getBoundingClientRect();
      return Math.round(r.width) === 360 && Math.round(r.height) === 720;
    });
  }, label);
  const el = handle.asElement();
  if (!el) throw new Error(`no mock cell "${label}"`);
  const file = join(SHOTS, `mock-${label.split(" ")[0]}.png`);
  await el.screenshot({ path: file });
  return file;
}

// ── app drivers ─────────────────────────────────────────────────────────────────────────────────────
const toWhereBoth = async (p) => {
  await btn(p, "Back").click();
};
const editDrop = async (p) => {
  await p.getByRole("button", { name: /^DROP-OFF\./ }).click();
  await p.getByLabel("DROP-OFF address").fill("14 Glenara");
  await p.waitForTimeout(900);
};
const fillPhones = async (p, rcpt = "0715550090") => {
  await p.getByLabel("Your phone (sender)").fill("0772451180");
  await p.getByLabel("Recipient phone").fill(rcpt);
};
const badPhone = async (p) => {
  await fillPhones(p, "077 12");
  await p.getByLabel("Recipient phone").blur();
};
const toPrice = async (p) => {
  await fillPhones(p);
  await btn(p, "Next").click();
};
const price = (v) => async (p) => {
  await toPrice(p);
  await p.getByLabel("Your price in US dollars").fill(v);
  await p.getByLabel("Your price in US dollars").blur();
};
const toReview = async (p) => {
  await toPrice(p);
  await btn(p, "Review").click();
};
const failSend = async (p) => {
  await toReview(p);
  await btn(p, "Send to riders").click();
  await p.waitForTimeout(800);
};

const ROWS = [
  { mock: "1 Step 1, open", label: "1 · Step 1, open", sub: "GPS pickup named by the device geocoder", app: { name: "1", fixture: "send_v2_open" } },
  { mock: "3c Step 1, no Places key / offline", label: "3c · Editing the drop-off inline (no Places key)", sub: "this build has no Places key, so state 2's list is the limited fallback", app: { name: "3c", fixture: "send_v2_open", before: editDrop } },
  { mock: "4 Step 1, both pins set", label: "4 · Step 1, both pins set", sub: "reached with Back from a Send again", app: { name: "4", fixture: "send_v2_again", before: toWhereBoth } },
  { mock: "6 Step 2, empty", label: "6 / 16 · Step 2 from Send again", sub: "a re-sent order never carries the recipient's phone, so Send again opens on step 2 with the banner (D-52)", app: { name: "6", fixture: "send_v2_again" } },
  { mock: "9 Step 2, invalid recipient phone", label: "9 · Invalid recipient phone", sub: "error on blur", app: { name: "9", fixture: "send_v2_again", before: badPhone } },
  { mock: "10 Step 3, suggested price", label: "10 · Step 3, price", app: { name: "10", fixture: "send_v2_again", before: toPrice } },
  { mock: "11 Step 3, below the band", label: "11 · Below the band", app: { name: "11", fixture: "send_v2_again", before: price("2.00") } },
  { mock: "12 Step 3, far above the band", label: "12 · Far above the band", app: { name: "12", fixture: "send_v2_again", before: price("33.60") } },
  { mock: "13 Step 4, summary", label: "13 · Review", app: { name: "13", fixture: "send_v2_again", before: toReview } },
  { mock: "14b Send failed", label: "14b · Send failed", app: { name: "14b", fixture: "send_v2_fail", before: failSend } },
  { mock: "15 Offline (step 4)", label: "15 · Offline", sub: "the API is unreachable for the whole run", app: { name: "15", fixture: "send_v2_offline", before: toReview } },
  { mock: "17 Account on hold", label: "17 · Account on hold", app: { name: "17", fixture: "send_v2_hold" } },
];

await mkdir(SHOTS, { recursive: true });
const browser = await launch();
const rows = [];
try {
  for (const r of ROWS) {
    const mock = await shootMock(browser, r.mock);
    let app = null;
    try {
      app = await shootApp(browser, r.app);
    } catch (e) {
      console.log(`app ${r.label}: ${String(e?.message || e).slice(0, 200)}`);
    }
    rows.push({ label: r.label, sub: r.sub, mock, app, logicalW: 360 });
    console.log(`ok ${r.label}`);
  }
} finally {
  await browser.close();
}

await buildSheet({ title: "Send a parcel · v2 stepped flow (D-52): handoff (left) vs app (right), 360×720", out: OUT, rows });
await writeFile(`${SHOTS}/README.txt`, "Generated by tools/parity/shoot-send-v2.mjs\n");
console.log(`sheet: ${OUT}.png (+ .html); shots in ${SHOTS}`);
