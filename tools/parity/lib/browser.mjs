/**
 * Resolve and launch a headless Chromium for the parity lane.
 *
 * This lane is designed to run inside the Claude execution container, where Playwright and its
 * Chromium are already installed globally (PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers). So we resolve
 * `playwright-core` in three steps, most-portable last:
 *   1. a normal ESM import (works if `npm i` was run in tools/parity, or on a repo that vendors it);
 *   2. the container's global node_modules (the common case here);
 *   3. an explicit PARITY_PLAYWRIGHT override.
 * Chromium itself is found by Playwright's own resolution (it honours PLAYWRIGHT_BROWSERS_PATH); a
 * PARITY_CHROMIUM env var can pin an explicit executable if ever needed.
 */
import { createRequire } from "node:module";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

// Global installs FIRST: in this container the pre-installed browsers under PLAYWRIGHT_BROWSERS_PATH
// are the ones the GLOBAL playwright was validated against. A locally `npm i`-ed playwright-core can
// pin a newer revision whose browser was never downloaded ("Executable doesn't exist"). On a laptop
// with no global install, the local copy is used (with `npx playwright install`).
const GLOBAL_CANDIDATES = [
  process.env.PARITY_PLAYWRIGHT,
  "/opt/node22/lib/node_modules/playwright",
  "/opt/node22/lib/node_modules/playwright-core",
  "/usr/local/lib/node_modules/playwright",
  "/usr/local/lib/node_modules/playwright-core",
].filter(Boolean);

let cached;

export async function loadPlaywright() {
  if (cached) return cached;
  const require = createRequire(import.meta.url);
  for (const cand of GLOBAL_CANDIDATES) {
    try {
      cached = await import(require.resolve(cand));
      return cached;
    } catch {
      /* try next */
    }
  }
  try {
    cached = await import("playwright-core"); // local node_modules fallback
    return cached;
  } catch {
    throw new Error(
      "parity: could not load playwright. Run `npm i` in tools/parity (+ `npx playwright install chromium`), or set PARITY_PLAYWRIGHT to a playwright install path.",
    );
  }
}

/**
 * Find a pre-installed Chromium under PLAYWRIGHT_BROWSERS_PATH (highest revision), so whichever
 * playwright module we loaded launches the browser that actually exists on disk. Returns null if none
 * found (then Playwright resolves its own).
 */
export function resolveChromium() {
  if (process.env.PARITY_CHROMIUM) return process.env.PARITY_CHROMIUM;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!base || !existsSync(base)) return null;
  let best = null;
  for (const dir of readdirSync(base)) {
    const m = /^chromium-(\d+)$/.exec(dir); // full chromium, not chromium_headless_shell
    if (!m) continue;
    const rev = Number(m[1]);
    for (const sub of ["chrome-linux/chrome", "chrome-linux64/chrome"]) {
      const exe = join(base, dir, sub);
      if (existsSync(exe) && (!best || rev > best.rev)) best = { rev, exe };
    }
  }
  return best?.exe || null;
}

/**
 * Launch a headless Chromium. Returns the browser; caller owns closing it.
 *
 * Outbound HTTPS in this container only works through the agent proxy ($HTTPS_PROXY) — a plain
 * Chromium gets ERR_CONNECTION_RESET reaching unpkg/tiles. So we point Chromium at that proxy and
 * bypass loopback (our own design/dev servers must NOT be proxied). The proxy terminates TLS with
 * its own CA; contexts pass `ignoreHTTPSErrors` (see makeContext) rather than importing the CA into
 * an NSS store. If no proxy is set (e.g. a dev laptop with direct egress), we launch without one.
 */
export async function launch() {
  const pw = await loadPlaywright();
  const chromium = pw.chromium ?? pw.default?.chromium;
  const opts = { headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] };
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  // `<-loopback>` is load-bearing: setting an explicit --proxy-server disables Chromium's implicit
  // loopback bypass, so without it our own 127.0.0.1 servers get proxied and answer 405. The parity
  // renders are hermetic (loopback + intercepted externals), so the proxy is mostly a safety net.
  if (proxy) opts.proxy = { server: proxy, bypass: "<-loopback>,127.0.0.1,localhost,::1" };
  const exe = resolveChromium();
  if (exe) opts.executablePath = exe;
  return chromium.launch(opts);
}

/** Context options shared by every parity render: accept the proxy's MITM cert + a retina-ish DSF. */
export function contextDefaults(extra = {}) {
  return { ignoreHTTPSErrors: true, ...extra };
}
