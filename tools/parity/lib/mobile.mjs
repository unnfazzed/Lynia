/**
 * App-side render core for the mobile (React Native) app, via react-native-web.
 *
 * Bundle the screen (esbuild + rn-web + shims) → drop it into a blank 360×720 page with Inter → wait
 * for the harness ready flag → screenshot #root. Mirrors renderMock's shape so the sheet driver treats
 * both sides the same. `withMobileRenderer` shares one browser across many screens.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launch, contextDefaults } from "./browser.mjs";
import { bundleScreen } from "../mobile/bundle.mjs";
import { interFontCss } from "../mobile/fonts.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../../..");
const MOBILE_APP = join(REPO, "apps/mobile");
const FIXTURES = resolve(HERE, "../mobile/fixtures");

const MODE_DIMS = { phone: { w: 360, h: 720 }, phone320: { w: 320, h: 640 } };

function harnessHtml(bundleJs, fontCss, dims) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${fontCss}
html,body{margin:0;padding:0;background:#fff;}
/* display:flex + column so a root SafeAreaView/View with flex:1 fills the full 720 the way the RN
   root does on device — otherwise flex:1 collapses to content height and screens render top-aligned. */
#root{width:${dims.w}px;height:${dims.h}px;overflow:hidden;display:flex;flex-direction:column;
  font-family:"Inter",-apple-system,"Segoe UI",Roboto,sans-serif;}
#root>*{flex:1 1 auto;min-height:0;}
</style></head><body><div id="root"></div>
<script>${bundleJs}</script></body></html>`;
}

/**
 * @param {object} o
 * @param {import('playwright-core').Browser} o.browser
 * @param {string} o.component  path to the screen component (absolute, or relative to apps/mobile/)
 * @param {string} [o.fixture]  fixture name (mobile/fixtures/<name>.mjs) or absolute path
 * @param {"phone"|"phone320"} [o.mode]
 * @param {number} [o.scale]
 * @param {string} [o.out]
 */
export async function renderMobile(o) {
  const mode = o.mode || "phone";
  const dims = MODE_DIMS[mode] || MODE_DIMS.phone;
  const scale = o.scale ?? 2;
  const component = isAbsolute(o.component) ? o.component : join(MOBILE_APP, o.component);
  const fixture = o.fixture
    ? isAbsolute(o.fixture)
      ? o.fixture
      : join(FIXTURES, `${o.fixture}.mjs`)
    : undefined;

  let bundleJs;
  try {
    bundleJs = await bundleScreen({ component, fixture });
  } catch (e) {
    return { ok: false, error: `bundle failed: ${String(e?.message || e).slice(0, 800)}`, width: dims.w * scale, height: dims.h * scale };
  }

  const ctx = await o.browser.newContext(
    contextDefaults({ viewport: { width: dims.w, height: dims.h }, deviceScaleFactor: scale }),
  );
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e?.message || e)));
  try {
    await page.setContent(harnessHtml(bundleJs, await interFontCss(), dims), { waitUntil: "load" });
    await page.waitForFunction(
      () => window.__PARITY_READY === true || typeof window.__PARITY_ERROR === "string",
      { timeout: 20000 },
    );
    const harnessErr = await page.evaluate(() => window.__PARITY_ERROR || null);
    if (harnessErr) return { ok: false, error: harnessErr, width: dims.w * scale, height: dims.h * scale };
    await page.evaluate(() => (document.fonts ? document.fonts.ready : null));
    // Settle async data: a fixture's fetch-router feeds the real hooks/queries, and use-feature-flags
    // fires its fetch a beat (250ms) after mount, so a populated flag-gated screen only paints after
    // that resolves. A fixture can tune the wait via window.__PARITY_SETTLE_MS (default 600).
    const settle = await page.evaluate(() => Number(window.__PARITY_SETTLE_MS) || 600);
    await page.waitForTimeout(settle);
    const el = await page.$("#root");
    const buffer = await el.screenshot({ type: "png" });
    if (o.out) {
      await mkdir(dirname(o.out), { recursive: true });
      await writeFile(o.out, buffer);
    }
    return { ok: true, path: o.out, buffer, width: dims.w * scale, height: dims.h * scale };
  } catch (e) {
    const msg = (errors[0] ? errors[0] + " | " : "") + String(e?.message || e);
    return { ok: false, error: msg, width: dims.w * scale, height: dims.h * scale };
  } finally {
    await ctx.close();
  }
}

export async function withMobileRenderer(fn) {
  const browser = await launch();
  try {
    return await fn((opts) => renderMobile({ browser, ...opts }));
  } finally {
    await browser.close();
  }
}

export async function renderMobileOne(opts) {
  return withMobileRenderer((render) => render(opts));
}
