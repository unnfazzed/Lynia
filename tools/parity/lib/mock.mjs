/**
 * Mock-side render core: drive the single-screen harness to a PNG.
 *
 * `withMockRenderer` starts the design server + one browser, hands you a `render()` you can call for
 * many screens (cheap — a fresh page per screen, shared browser), then tears both down. `renderOne`
 * is the one-shot convenience the CLI uses.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { startDesignServer } from "./design-server.mjs";
import { launch, contextDefaults } from "./browser.mjs";

const MODE_DIMS = {
  phone: { w: 360, h: 720 },
  phone320: { w: 320, h: 640 },
  tablet: { w: 1024, h: 680 },
};

/**
 * @param {object} o
 * @param {string} o.origin  design server origin
 * @param {import('playwright-core').Browser} o.browser
 * @param {string} o.src     registry global (LJ|RC|RJ|RR|RJM|RM)
 * @param {string} o.id      screen id
 * @param {"phone"|"phone320"|"tablet"} [o.mode]
 * @param {boolean} [o.full] capture whole scroll height instead of clipping to the viewport
 * @param {number} [o.scale] deviceScaleFactor (default 2)
 * @param {string} [o.out]   file to write; if omitted returns the PNG buffer only
 * @returns {Promise<{ok:boolean, error?:string, path?:string, buffer?:Buffer, width:number, height:number}>}
 */
export async function renderMock(o) {
  const mode = o.mode || "phone";
  const dims = MODE_DIMS[mode] || MODE_DIMS.phone;
  const scale = o.scale ?? 2;
  const ctx = await o.browser.newContext(
    contextDefaults({
      viewport: { width: Math.max(dims.w, 1024), height: Math.max(dims.h, 900) },
      deviceScaleFactor: scale,
    }),
  );
  await stubExternals(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e?.message || e)));
  try {
    const u = new URL(o.origin + "/explorations/journey/__parity_harness.html");
    u.searchParams.set("src", o.src);
    u.searchParams.set("id", o.id);
    u.searchParams.set("mode", mode);
    if (o.full) u.searchParams.set("full", "1");

    await page.goto(u.toString(), { waitUntil: "load", timeout: 45000 });
    // Registries compile via babel-standalone after load; wait for our ready/error flag.
    await page.waitForFunction(
      () => window.__PARITY_READY === true || typeof window.__PARITY_ERROR === "string",
      { timeout: 45000 },
    );
    const harnessErr = await page.evaluate(() => window.__PARITY_ERROR || null);
    if (harnessErr) return fail(harnessErr, dims, scale);

    // Let leaflet tiles / food photos settle, then a beat for any final measure pass.
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(250);

    const el = await page.$("#screen");
    const buffer = await el.screenshot({ type: "png" });
    if (o.out) {
      await mkdir(dirname(o.out), { recursive: true });
      await writeFile(o.out, buffer);
    }
    return { ok: true, path: o.out, buffer, width: dims.w * scale, height: dims.h * scale };
  } catch (e) {
    return fail((errors[0] ? errors[0] + " | " : "") + String(e?.message || e), dims, scale);
  } finally {
    await ctx.close();
  }
}

function fail(error, dims, scale) {
  return { ok: false, error, width: dims.w * scale, height: dims.h * scale };
}

// A neutral gray stub for OSM map tiles. The design's real-map frames pull live tiles; the kit
// FauxMap is fully local. We stub the tiles so the render stays hermetic AND honest — a parity shot
// never claims the live map matches (a native-map device spot-check covers that separately). Anything
// else external is aborted so `networkidle` resolves instead of hanging on a reset.
const TILE_SVG = "<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256'><rect width='256' height='256' fill='#e4e8ea'/></svg>";
const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export async function stubExternals(ctx) {
  await ctx.route("**/*", (route) => {
    let u;
    try {
      u = new URL(route.request().url());
    } catch {
      return route.continue();
    }
    if (LOOPBACK.has(u.hostname)) return route.continue();
    const isTile = /(^|\.)tile\.openstreetmap\.org$/.test(u.hostname) || /\/\d+\/\d+\/\d+\.png$/.test(u.pathname);
    if (isTile) return route.fulfill({ status: 200, contentType: "image/svg+xml", body: TILE_SVG });
    return route.abort();
  });
}

/**
 * Render a whole design HTML page (not a registry screen) to PNG — used for the admin/merchant MOCK
 * side, whose designs are standalone kit pages under packages/design/ui_kits/, not gallery-registry
 * screens. Served from the same hermetic design server, so its local styles/icons resolve.
 * @param {object} o { origin, browser, path:"/ui_kits/admin/index.html", w, h, scale?, out? }
 */
export async function renderDesignPage(o) {
  const scale = o.scale ?? 2;
  const ctx = await o.browser.newContext(
    contextDefaults({ viewport: { width: o.w, height: o.h }, deviceScaleFactor: scale }),
  );
  await stubExternals(ctx);
  const page = await ctx.newPage();
  try {
    await page.goto(o.origin + o.path, { waitUntil: "load", timeout: 30000 });
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    await page.evaluate(() => (document.fonts ? document.fonts.ready : null));
    await page.waitForTimeout(200);
    const buffer = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: o.w, height: o.h } });
    if (o.out) {
      await mkdir(dirname(o.out), { recursive: true });
      await writeFile(o.out, buffer);
    }
    return { ok: true, path: o.out, buffer, width: o.w * scale, height: o.h * scale };
  } catch (e) {
    return { ok: false, error: String(e?.message || e), width: o.w * scale, height: o.h * scale };
  } finally {
    await ctx.close();
  }
}

/** Start server+browser, run `fn(render)`, tear down. `render(opts)` omits origin/browser. */
export async function withMockRenderer(fn) {
  const server = await startDesignServer();
  const browser = await launch();
  try {
    const render = (opts) => renderMock({ origin: server.origin, browser, ...opts });
    return await fn(render, { origin: server.origin, browser });
  } finally {
    await browser.close();
    await server.close();
  }
}

/** One-shot render (own server+browser). */
export async function renderOne(opts) {
  return withMockRenderer((render) => render(opts));
}
