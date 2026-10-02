#!/usr/bin/env node
/**
 * The Notifications v1 screenshot sheet (ledger D-65): each landed frame of the notifications-v1 handoff
 * (packages/design/handoff/notifications-v1/Notifications v1 (standalone).html?only=<id>) beside the
 * Notifications screen rendered through react-native-web at 360×720 from the nv1_* fixtures
 * (tools/parity/mobile/fixtures/_notifications_v1.mjs).
 *
 *   node tools/parity/shoot-notifications-v1.mjs --out docs/parity/NOTIFICATIONS-V1-2026-10-02
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
const OUT = resolve(outArg > 0 ? process.argv[outArg + 1] : join(HERE, "out/notifications-v1"));
const SHOTS = `${OUT}-shots`;
const MOCK = pathToFileURL(join(REPO, "packages/design/handoff/notifications-v1/Notifications v1 (standalone).html")).href;
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
  const ctx = await browser.newContext(contextDefaults({ viewport: { width: 900, height: 1000 }, deviceScaleFactor: 2 }));
  const page = await ctx.newPage();
  try {
    await page.goto(`${MOCK}?only=${id}`, { waitUntil: "load" });
    await page.waitForTimeout(2500);
    // The frame is the first 360×720 box the page draws (AFrame).
    const el = (await page.evaluateHandle(() => [...document.querySelectorAll("div")].find((d) => d.style.width === "360px" && d.style.height === "720px") || null)).asElement();
    if (!el) throw new Error(`no mock frame "${id}"`);
    const file = join(SHOTS, `mock-${id}.png`);
    await el.screenshot({ path: file });
    return file;
  } finally {
    await ctx.close();
  }
}

const press = (name) => async (p) => {
  await p.getByText(name, { exact: true }).first().click();
  await p.waitForTimeout(500);
};

const SCREEN = app("notifications/index.tsx");
const ROWS = [
  { id: "N1", label: "N1 · Customer, populated", sub: "the feed keeps one day (STREAMLINE-01), so the handoff's MON 28 SEP group isn't staged", app: { name: "N1", component: SCREEN, fixture: "nv1_n1" } },
  { id: "N2", label: "N2 · One order opened to its timeline", app: { name: "N2", component: SCREEN, fixture: "nv1_n1", before: press("4 earlier updates") } },
  { id: "N1c", label: "N1c · Live SOS pinned", app: { name: "N1c", component: SCREEN, fixture: "nv1_n1c" } },
  { id: "N3", label: "N3 · Rider, account paused (pinned)", app: { name: "N3", component: SCREEN, fixture: "nv1_n3" } },
  { id: "N5", label: "N5 · Needs you", app: { name: "N5", component: SCREEN, fixture: "nv1_n5" } },
  { id: "N8a", label: "N8a · Empty, customer", app: { name: "N8a", component: SCREEN, fixture: "nv1_n8a" } },
  { id: "N8b", label: "N8b · Empty, rider", app: { name: "N8b", component: SCREEN, fixture: "nv1_n8b" } },
  { id: "N10", label: "N10 · Couldn’t load", app: { name: "N10", component: SCREEN, fixture: "nv1_n10" } },
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

await buildSheet({ title: "Notifications v1 (D-65): handoff (left) vs app (right), 360×720", out: OUT, rows });
await writeFile(`${SHOTS}/README.txt`, "Generated by tools/parity/shoot-notifications-v1.mjs\n");
console.log(`sheet: ${OUT}.png (+ .html); shots in ${SHOTS}`);
