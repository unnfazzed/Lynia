#!/usr/bin/env node
/**
 * The splash v1 screenshot sheet (ledger D-64, CHANGE-2026-10-06): each state of the handoff prototype
 * (packages/design/handoff/splash-v1/Splash.html, driven through its own Network / Screen / Motion
 * controls) beside the app's cold-start splash (src/boot/splash/BootSplash.tsx) rendered through
 * react-native-web at the same size, driven through the _splash fixture. The handoff's check matrix:
 * 320×640, 320×700 and 360×780 · loading, slow and offline · full and reduced motion. Both sides run
 * with zero insets (the prototype frame has no system bars; the web safe-area shim is zero).
 *
 * The orbit angle, the dove's bob and the blobs' drift are live loops, so they differ between the two
 * sides at any instant; the reduced-motion rows show both at rest.
 *
 *   node tools/parity/shoot-splash.mjs --out docs/parity/SPLASH-V1-NO-STEPS-2026-10-06
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
const OUT = resolve(outArg > 0 ? process.argv[outArg + 1] : join(HERE, "out/splash-v1"));
const SHOTS = `${OUT}-shots`;
const MOCK = pathToFileURL(join(REPO, "packages/design/handoff/splash-v1/Splash.html")).href;
const FIXTURE = join(HERE, "mobile/fixtures/_splash.mjs");
const COMPONENT = join(REPO, "apps/mobile/src/boot/splash/BootSplash.tsx");

const SIZES = [
  { width: 320, height: 640 },
  { width: 320, height: 700 },
  { width: 360, height: 780 },
];

/**
 * When to shoot each state, in ms from launch, and how the prototype gets there. Prototype: Fast is
 * loading from 1300 until it is done at 2900; Slow shows the pill at 5300; Offline drops to the panel
 * at 4200. The app is held in the same phase by the fixture (Home's tasks never land).
 */
const STATES = [
  { key: "loading", label: "loading", net: "fast", mockAt: 2200, appAt: 2200 },
  { key: "slow", label: "slow network", net: "slow", mockAt: 6000, appAt: 6000 },
  { key: "offline", label: "offline", net: "offline", mockAt: 5000, appAt: 3000, appOfflineAt: 2000 },
];

let appJs;
function harnessHtml(js, fontCss, { width, height }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${fontCss}
html,body{margin:0;padding:0;background:#fff;}
#root{position:relative;width:${width}px;height:${height}px;overflow:hidden;display:flex;flex-direction:column;
  font-family:"Inter",-apple-system,"Segoe UI",Roboto,sans-serif;}
#root>*{flex:1 1 auto;min-height:0;}
</style></head><body><div id="root"></div><script>${js}</script></body></html>`;
}

async function shootApp(browser, { name, size, state, reduce }) {
  const ctx = await browser.newContext(contextDefaults({ viewport: size, deviceScaleFactor: 2, reducedMotion: reduce ? "reduce" : "no-preference" }));
  const page = await ctx.newPage();
  try {
    appJs ??= await bundleScreen({ component: COMPONENT, fixture: FIXTURE });
    await page.setContent(harnessHtml(appJs, await interFontCss(), size), { waitUntil: "load" });
    await page.waitForFunction(() => window.__PARITY_READY === true || typeof window.__PARITY_ERROR === "string", { timeout: 20000 });
    const started = Date.now();
    await page.evaluate(() => window.__splash.home());
    const err = await page.evaluate(() => window.__PARITY_ERROR || null);
    if (err) throw new Error(err);
    if (state.appOfflineAt != null) {
      await page.waitForTimeout(Math.max(0, state.appOfflineAt - (Date.now() - started)));
      await page.evaluate(() => window.__splash.offline());
    }
    await page.waitForTimeout(Math.max(0, state.appAt - (Date.now() - started)));
    const file = join(SHOTS, `app-${name}.png`);
    await (await page.$("#root")).screenshot({ path: file });
    return file;
  } finally {
    await ctx.close();
  }
}

async function shootMock(browser, { name, size, state, reduce }) {
  const ctx = await browser.newContext(contextDefaults({ viewport: { width: 1200, height: 1000 }, deviceScaleFactor: 2 }));
  const page = await ctx.newPage();
  try {
    await page.goto(MOCK, { waitUntil: "load" });
    await page.click(`#size button[data-s="${size.width}x${size.height}"]`);
    await page.click(`#rm button[data-v="${reduce ? 1 : 0}"]`);
    await page.waitForTimeout(400); // the frame's .3s resize
    await page.evaluate(() => (document.fonts ? document.fonts.ready : null));
    // The network control restarts the prototype from launch: the clock starts here.
    await page.click(`#net button[data-m="${state.net}"]`);
    await page.waitForTimeout(state.mockAt);
    const file = join(SHOTS, `mock-${name}.png`);
    await (await page.$("#scr")).screenshot({ path: file });
    return file;
  } finally {
    await ctx.close();
  }
}

await mkdir(SHOTS, { recursive: true });
const browser = await launch();
const rows = [];
try {
  for (const reduce of [false, true]) {
    for (const size of SIZES) {
      for (const state of STATES) {
        const name = `${size.width}x${size.height}-${state.key}${reduce ? "-rm" : ""}`;
        const label = `${size.width}×${size.height} · ${state.label}${reduce ? " · reduced motion" : ""}`;
        let mock = null;
        let shot = null;
        try {
          mock = await shootMock(browser, { name, size, state, reduce });
        } catch (e) {
          console.log(`mock ${name}: ${String(e?.message || e).slice(0, 200)}`);
        }
        try {
          shot = await shootApp(browser, { name, size, state, reduce });
        } catch (e) {
          console.log(`app ${name}: ${String(e?.message || e).slice(0, 300)}`);
        }
        rows.push({ label, mock, app: shot, logicalW: size.width });
        console.log(`ok ${label}`);
      }
    }
  }
} finally {
  await browser.close();
}

await buildSheet({ title: "Splash v1, no steps card (D-64, CHANGE-2026-10-06): handoff prototype (left) vs app (right), insets 0", out: OUT, rows });
await writeFile(`${SHOTS}/README.txt`, "Generated by tools/parity/shoot-splash.mjs\n");
console.log(`sheet: ${OUT}.png (+ .html); shots in ${SHOTS}`);
