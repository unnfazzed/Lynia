/**
 * Vendor the exact CDN libraries the design pages pin (react/react-dom/@babel/standalone/leaflet)
 * into a gitignored cache, so the mock harness loads them from LOOPBACK instead of unpkg.
 *
 * Why: this container's Chromium cannot complete a TLS handshake to external hosts through the agent
 * proxy (the egress MITM resets its BoringSSL ClientHello, though curl/node succeed). Rather than
 * fight TLS fingerprinting, we serve everything the browser needs from 127.0.0.1 — the render becomes
 * hermetic, deterministic and proxy-independent, exactly the "serve a local mirror" path the design
 * EXPORT-README sanctions. Fetching (here, in Node) still goes through the proxy, which works fine.
 *
 * Versions are pinned to match `All Screens Gallery.html` byte-for-byte, so the harness renders the
 * same React/Babel/Leaflet the gallery does.
 */
import { mkdir, writeFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
export const VENDOR_DIR = resolve(HERE, "../.vendor");

/** local filename -> pinned source URL (versions match the design gallery) */
export const VENDOR = {
  "react.js": "https://unpkg.com/react@18.3.1/umd/react.development.js",
  "react-dom.js": "https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js",
  "babel.js": "https://unpkg.com/@babel/standalone@7.29.0/babel.min.js",
  "leaflet.js": "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
  "leaflet.css": "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
};

async function exists(p) {
  return !!(await stat(p).catch(() => null));
}

async function download(url) {
  // curl honours HTTPS_PROXY + the CA bundle in this container. Fall back to a proxy-aware node fetch.
  try {
    const { stdout } = await execFileP("curl", ["-fsSL", url], {
      encoding: "buffer",
      maxBuffer: 64 * 1024 * 1024,
    });
    return stdout;
  } catch {
    const res = await fetch(url); // requires NODE_USE_ENV_PROXY=1 in env to use the proxy
    if (!res.ok) throw new Error(`vendor fetch ${url} -> ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
}

/** Ensure every vendored file is present; download the missing ones. Returns VENDOR_DIR. */
export async function ensureVendor() {
  await mkdir(VENDOR_DIR, { recursive: true });
  for (const [name, url] of Object.entries(VENDOR)) {
    const dest = join(VENDOR_DIR, name);
    if (await exists(dest)) continue;
    const buf = await download(url);
    await writeFile(dest, buf);
  }
  return VENDOR_DIR;
}
