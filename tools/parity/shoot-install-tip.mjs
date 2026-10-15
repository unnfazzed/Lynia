#!/usr/bin/env node
/**
 * The customer web app's Add to Home Screen tip (handoff download-qr-install-tip-2026-10 §2, web-only):
 * each iPhone frame of the handoff's reference canvas beside the real Home screen (app/(tabs)/home.tsx)
 * rendered through react-native-web with the web-build flag on, an iPhone Safari user agent and the
 * state's storage (the `?install=1` capture in sessionStorage, the dismissals in localStorage).
 *
 *   node tools/parity/shoot-install-tip.mjs --out docs/parity/INSTALL-TIP-2026-10-15
 *
 * The launched frame needs `EXPO_PUBLIC_APP_STORE_URL`, which is read when the hook's module loads, so it
 * is staged through the page's `process.env` before the bundle runs.
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
const OUT = resolve(outArg > 0 ? process.argv[outArg + 1] : join(HERE, "out/install-tip"));
const SHOTS = `${OUT}-shots`;
const MOCK = pathToFileURL(join(REPO, "packages/design/handoff/download-qr-install-tip-2026-10/Download QR and Install Tip.html")).href;
const HOME = join(REPO, "apps/mobile/app/(tabs)/home.tsx");
const FIXTURE = join(HERE, "mobile/fixtures/_install_tip.mjs");
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

const ORIGIN = "https://app.lyniago.test/";
const PHONE = { width: 360, height: 720 };
const NARROW = { width: 320, height: 640 };

/** `mockIndex` is the frame's position among the canvas's `.f.ph` phones. */
const ROWS = [
  { id: "first", label: "§2.1 · First seen (?install=1)", vp: PHONE, mockIndex: 0, storage: { pending: true } },
  { id: "small", label: "§2.2 · Small phone 320×640", vp: NARROW, mockIndex: 1, storage: { pending: true } },
  { id: "dismissed", label: "§2.3 · Dismissed: pin row on Home", vp: PHONE, mockIndex: 2, storage: { pending: true, tip: true } },
  { id: "installed", label: "§2.4 · Already installed (standalone)", vp: PHONE, mockIndex: 3, storage: { pending: true }, standalone: true },
  { id: "launched", label: "§2.5 · App Store launched", vp: PHONE, mockIndex: 4, storage: {}, appStore: "https://apps.apple.com/app/id0000000000" },
];

function harnessHtml(js, fontCss, vp) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${fontCss}
html,body{margin:0;padding:0;background:#fff;}
#root{width:${vp.width}px;height:${vp.height}px;overflow:hidden;display:flex;flex-direction:column;
  font-family:"Inter",-apple-system,"Segoe UI",Roboto,sans-serif;}
#root>*{flex:1 1 auto;min-height:0;}
</style></head><body><div id="root"></div><script>${js}</script></body></html>`;
}

async function shootApp(browser, row) {
  const ctx = await browser.newContext(contextDefaults({ viewport: row.vp, deviceScaleFactor: 2, userAgent: IPHONE, hasTouch: true }));
  await ctx.addInitScript((s) => {
    if (s.storage.pending) sessionStorage.setItem("lyniago.installTip.pending", "1");
    if (s.storage.tip) localStorage.setItem("lyniago.installTip.dismissed", "1");
    if (s.standalone) Object.defineProperty(navigator, "standalone", { value: true });
    globalThis.process = { env: { NODE_ENV: "development", ...(s.appStore ? { EXPO_PUBLIC_APP_STORE_URL: s.appStore } : {}) } };
  }, { storage: row.storage, standalone: !!row.standalone, appStore: row.appStore || "" });
  const page = await ctx.newPage();
  try {
    const js = await bundleScreen({ component: HOME, fixture: FIXTURE });
    // Served from a real origin, not setContent's about:blank, whose opaque origin makes web storage throw.
    const html = harnessHtml(js, await interFontCss(), row.vp);
    await page.route(ORIGIN, (route) => route.fulfill({ status: 200, contentType: "text/html", body: html }));
    await page.goto(ORIGIN, { waitUntil: "load" });
    await page.waitForFunction(() => window.__PARITY_READY === true || typeof window.__PARITY_ERROR === "string", { timeout: 20000 });
    const err = await page.evaluate(() => window.__PARITY_ERROR || null);
    if (err) throw new Error(err);
    await page.evaluate(() => (document.fonts ? document.fonts.ready : null));
    await page.waitForTimeout(1800);
    const file = join(SHOTS, `app-${row.id}.png`);
    // The sheet is a Modal, portalled outside #root: shoot the viewport, which is the phone.
    await page.screenshot({ path: file, clip: { x: 0, y: 0, ...row.vp } });
    return file;
  } finally {
    await ctx.close();
  }
}

async function shootMock(browser, row) {
  const ctx = await browser.newContext(contextDefaults({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 }));
  const page = await ctx.newPage();
  try {
    await page.goto(MOCK, { waitUntil: "load" });
    await page.waitForTimeout(1000);
    const file = join(SHOTS, `mock-${row.id}.png`);
    await page.locator(".f.ph").nth(row.mockIndex).screenshot({ path: file });
    return file;
  } finally {
    await ctx.close();
  }
}

await mkdir(SHOTS, { recursive: true });
const browser = await launch();
const rows = [];
try {
  for (const r of ROWS) {
    const mock = await shootMock(browser, r);
    let appShot = null;
    let note = null;
    try {
      appShot = await shootApp(browser, r);
    } catch (e) {
      note = String(e.message || e).slice(0, 200);
    }
    rows.push({ label: r.label, mock, app: appShot, appNote: note || undefined, logicalW: r.vp.width });
    console.log(`${r.id}: ${appShot ? "ok" : `app failed — ${note}`}`);
  }
} finally {
  await browser.close();
}
await buildSheet({ title: "Add to Home Screen tip (download-qr-install-tip-2026-10 §2): handoff (left) vs app (right)", out: OUT, rows });
await writeFile(`${SHOTS}/README.txt`, "Generated by tools/parity/shoot-install-tip.mjs\n");
console.log(`sheet: ${OUT}.png (+ .html); shots in ${SHOTS}`);
