/**
 * App-side render for the Next.js surfaces (admin, merchant). These are real web apps, so Playwright
 * screenshots a running dev/preview server directly — no rn-web, no shims.
 *
 * This module CONNECTS to an already-running server (its base URL from env, or a conventional port),
 * so the pair driver doesn't own the server lifecycle. Bring one up with `node serve-web.mjs admin`
 * (see serve-web.mjs) or point PARITY_ADMIN_URL / PARITY_MERCHANT_URL at any reachable instance. When
 * nothing is reachable the render returns a pending result and the sheet shows an honest placeholder.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { contextDefaults } from "./browser.mjs";

const MODE_DIMS = {
  admin: { w: 1440, h: 900 },
  tablet: { w: 1024, h: 680 },
  phone: { w: 360, h: 720 },
};

export function baseUrlFor(app) {
  if (app === "admin") return process.env.PARITY_ADMIN_URL || "http://127.0.0.1:4311";
  if (app === "merchant") return process.env.PARITY_MERCHANT_URL || "http://127.0.0.1:4312";
  return null;
}

/**
 * @param {object} o
 * @param {import('playwright-core').Browser} o.browser
 * @param {"admin"|"merchant"} o.app
 * @param {string} o.route      e.g. "/orders"
 * @param {"admin"|"tablet"} [o.mode]
 * @param {string} [o.waitFor]  optional CSS selector to await before shooting
 * @param {number} [o.scale]
 * @param {string} [o.out]
 */
export async function renderWeb(o) {
  const base = baseUrlFor(o.app);
  const mode = o.mode || (o.app === "merchant" ? "tablet" : "admin");
  const dims = MODE_DIMS[mode] || MODE_DIMS.admin;
  const scale = o.scale ?? 2;
  if (!base) return { ok: false, error: `no base URL for app "${o.app}"`, width: dims.w * scale, height: dims.h * scale };

  const ctx = await o.browser.newContext(
    contextDefaults({ viewport: { width: dims.w, height: dims.h }, deviceScaleFactor: scale }),
  );
  const page = await ctx.newPage();
  try {
    const url = base.replace(/\/$/, "") + o.route;
    const resp = await page.goto(url, { waitUntil: "networkidle", timeout: 20000 }).catch((e) => {
      throw new Error(`cannot reach ${url} — is the ${o.app} dev server up? (${String(e.message).slice(0, 80)})`);
    });
    if (resp && resp.status() >= 400) throw new Error(`${url} -> HTTP ${resp.status()}`);
    if (o.waitFor) await page.waitForSelector(o.waitFor, { timeout: 8000 }).catch(() => {});
    await page.evaluate(() => (document.fonts ? document.fonts.ready : null));
    await page.waitForTimeout(200);
    const buffer = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: dims.w, height: dims.h } });
    if (o.out) {
      await mkdir(dirname(o.out), { recursive: true });
      await writeFile(o.out, buffer);
    }
    return { ok: true, path: o.out, buffer, width: dims.w * scale, height: dims.h * scale };
  } catch (e) {
    return { ok: false, error: String(e?.message || e), width: dims.w * scale, height: dims.h * scale };
  } finally {
    await ctx.close();
  }
}
