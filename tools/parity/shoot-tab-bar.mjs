#!/usr/bin/env node
/**
 * The tab bar v1 screenshot sheet (ledger D-55): each state of the handoff prototype
 * (packages/design/handoff/tab-bar-v1/Tab Bar Prototype (standalone).html, driven through its own
 * control panel) beside the app's tab root rendered through react-native-web at 360×720 with the real
 * floating `TabBar` mounted over it (the tb_* fixtures, tools/parity/mobile/fixtures/_tab_bar.mjs).
 * Both sides run with a 0 bottom inset (the prototype's "3-button · 0"; the web safe-area shim is zero).
 *
 *   node tools/parity/shoot-tab-bar.mjs --out docs/parity/TAB-BAR-V1-2026-10-01
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
const OUT = resolve(outArg > 0 ? process.argv[outArg + 1] : join(HERE, "out/tab-bar-v1"));
const SHOTS = `${OUT}-shots`;
const MOCK = pathToFileURL(join(REPO, "packages/design/handoff/tab-bar-v1/Tab Bar Prototype (standalone).html")).href;
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

async function shootApp(browser, { name, component, fixture }) {
  const ctx = await browser.newContext(contextDefaults({ viewport: PHONE, deviceScaleFactor: 2 }));
  const page = await ctx.newPage();
  try {
    const js = await bundleScreen({ component, fixture: join(FIXTURES, `${fixture}.mjs`) });
    await page.setContent(harnessHtml(js, await interFontCss()), { waitUntil: "load" });
    await page.waitForFunction(() => window.__PARITY_READY === true || typeof window.__PARITY_ERROR === "string", { timeout: 20000 });
    const err = await page.evaluate(() => window.__PARITY_ERROR || null);
    if (err) throw new Error(err);
    await page.evaluate(() => (document.fonts ? document.fonts.ready : null));
    await page.waitForTimeout(1300);
    const file = join(SHOTS, `app-${name}.png`);
    await (await page.$("#root")).screenshot({ path: file });
    return file;
  } finally {
    await ctx.close();
  }
}

/** Click option `opt` in the prototype panel row labelled `row` (or a top-level segmented option). */
async function pick(page, row, opt) {
  const ok = await page.evaluate(
    ([rowLabel, option]) => {
      const exact = (el, t) => el.childElementCount === 0 && el.textContent.trim() === t;
      const all = [...document.querySelectorAll("body *")];
      let scope = document.body;
      if (rowLabel) {
        const label = all.find((el) => exact(el, rowLabel) && !el.closest('[role="tablist"]'));
        if (!label) return false;
        scope = label.parentElement;
        while (scope && ![...scope.querySelectorAll("*")].some((el) => exact(el, option))) scope = scope.parentElement;
        if (!scope) return false;
      }
      const target = [...scope.querySelectorAll("*")].find((el) => exact(el, option) && !el.closest('[role="tablist"]'));
      if (!target) return false;
      target.click();
      return true;
    },
    [row, opt],
  );
  if (!ok) throw new Error(`prototype control "${row ?? ""} → ${opt}" not found`);
  await page.waitForTimeout(250);
}

async function shootMock(browser, { name, steps }) {
  const ctx = await browser.newContext(contextDefaults({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 2 }));
  const page = await ctx.newPage();
  try {
    await page.goto(MOCK, { waitUntil: "load" });
    await page.waitForTimeout(2500);
    await pick(page, null, "3-button · 0");
    await pick(page, null, "Reduce motion");
    for (const s of steps) {
      if (s.tab) {
        await page.getByRole("tab", { name: new RegExp(`^${s.tab},`) }).click();
        await page.waitForTimeout(300);
      } else await pick(page, s.row ?? null, s.opt);
    }
    const handle = await page.evaluateHandle(() =>
      [...document.querySelectorAll("div")].find((d) => {
        const r = d.getBoundingClientRect();
        return Math.round(r.width) === 360 && Math.round(r.height) === 720;
      }),
    );
    const el = handle.asElement();
    if (!el) throw new Error("no 360×720 phone frame in the prototype");
    const file = join(SHOTS, `mock-${name}.png`);
    await el.screenshot({ path: file });
    return file;
  } finally {
    await ctx.close();
  }
}

const ROWS = [
  { name: "home", label: "Customer · Home active, Orders live", mock: [], app: { component: app("(tabs)/home.tsx"), fixture: "tb_home" } },
  { name: "orders", label: "Customer · Orders active", mock: [{ tab: "Orders" }], app: { component: app("(tabs)/orders.tsx"), fixture: "tb_orders" } },
  { name: "account", label: "Customer · Account active", mock: [{ tab: "Account" }], app: { component: app("(tabs)/account.tsx"), fixture: "tb_account" } },
  { name: "jobs", label: "Rider · Jobs active, Money warn", sub: "the prototype keeps the Jobs count while Jobs is open; the app clears it there (README: count clears when Jobs is opened)", mock: [{ opt: "Rider" }, { row: "Money", opt: "warn" }], app: { component: app("rider/(tabs)/index.tsx"), fixture: "tb_jobs" } },
  {
    name: "money",
    label: "Rider · Money active, 3 new jobs + warn",
    mock: [{ opt: "Rider" }, { row: "Money", opt: "warn" }, { tab: "Money" }],
    app: { component: app("rider/(tabs)/money.tsx"), fixture: "tb_money" },
  },
  {
    name: "raccount",
    label: "Rider · Account active, 3 new jobs + dot",
    mock: [{ opt: "Rider" }, { row: "Account", opt: "dot" }, { tab: "Account" }],
    app: { component: app("rider/(tabs)/account.tsx"), fixture: "tb_raccount" },
  },
  { name: "dock", label: "Rider · CTA dock (gate)", sub: "the app's gate is G4 KYC failed", mock: [{ opt: "Rider" }, { opt: "CTA bar above" }], app: { component: app("rider/(tabs)/index.tsx"), fixture: "tb_dock" } },
];

await mkdir(SHOTS, { recursive: true });
const browser = await launch();
const rows = [];
try {
  for (const r of ROWS) {
    let mock = null;
    let shot = null;
    try {
      mock = await shootMock(browser, { name: r.name, steps: r.mock });
    } catch (e) {
      console.log(`mock ${r.name}: ${String(e?.message || e).slice(0, 200)}`);
    }
    try {
      shot = await shootApp(browser, { name: r.name, ...r.app });
    } catch (e) {
      console.log(`app ${r.name}: ${String(e?.message || e).slice(0, 300)}`);
    }
    rows.push({ label: r.label, sub: r.sub, mock, app: shot, logicalW: 360 });
    console.log(`ok ${r.label}`);
  }
} finally {
  await browser.close();
}

await buildSheet({ title: "Tab bar v1 (D-55): handoff prototype (left) vs app (right), 360×720, inset 0", out: OUT, rows });
await writeFile(`${SHOTS}/README.txt`, "Generated by tools/parity/shoot-tab-bar.mjs\n");
console.log(`sheet: ${OUT}.png (+ .html); shots in ${SHOTS}`);
