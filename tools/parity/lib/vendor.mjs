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
 * Integrity: every file is pinned to a sha256 and verified before it is put in place — the vendored
 * bytes are tamper-evident (the same guarantee the gallery gets from its SRI hashes). curl streams the
 * download straight to a temp file, so the network bytes are never handled/written by this process; a
 * mismatch or a curl failure throws and leaves no partial file in the cache. Versions are pinned to
 * match `All Screens Gallery.html`, so the harness renders the same React/Babel/Leaflet the gallery does.
 */
import { mkdir, rename, unlink, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";

const execFileP = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
export const VENDOR_DIR = resolve(HERE, "../.vendor");

/** local filename -> { url (pinned version, matches the gallery), sha256 (integrity pin) } */
export const VENDOR = {
  "react.js": {
    url: "https://unpkg.com/react@18.3.1/umd/react.development.js",
    sha256: "28348fef6cb0ed8b2ceeb22deaf824428fd13875d84c73d38f77dd216fc24e7f",
  },
  "react-dom.js": {
    url: "https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js",
    sha256: "f9044a5e9c39db8bb1a204dff924e526ec0a621e695bb69de1035811be8709e4",
  },
  "babel.js": {
    url: "https://unpkg.com/@babel/standalone@7.29.0/babel.min.js",
    sha256: "2623a9e22809915ce789b4461154e277ddce520d5a4320c14d44332a5d0dcea0",
  },
  "leaflet.js": {
    url: "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
    sha256: "db49d009c841f5ca34a888c96511ae936fd9f5533e90d8b2c4d57596f4e5641a",
  },
  "leaflet.css": {
    url: "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
    sha256: "a7837102824184820dfa198d1ebcd109ff6d0ff9a2672a074b9a1b4d147d04c6",
  },
};

/** sha256 of a file, or null if it isn't there — one read, no separate existence check (no TOCTOU). */
async function sha256OrNull(path) {
  const buf = await readFile(path).catch((e) => {
    if (e?.code === "ENOENT") return null;
    throw e;
  });
  return buf ? createHash("sha256").update(buf).digest("hex") : null;
}

/**
 * Download `url` to `dest`, verified against `expectedSha`. curl (which honours HTTPS_PROXY + the CA
 * bundle in this container) writes the bytes straight to a temp file; we hash the file, and only an
 * exact match is renamed into place. A failed download or a hash mismatch throws and cleans up.
 */
async function downloadVerified(url, dest, expectedSha) {
  const tmp = `${dest}.download`;
  await unlink(tmp).catch(() => {});
  try {
    await execFileP("curl", ["-fsSL", "--output", tmp, url], { maxBuffer: 8 * 1024 * 1024 });
  } catch (e) {
    await unlink(tmp).catch(() => {});
    throw new Error(
      `vendor: could not download ${url} (needs curl + network). Install curl or pre-populate ${VENDOR_DIR}. (${String(e?.message || e).slice(0, 120)})`,
    );
  }
  const got = await sha256OrNull(tmp);
  if (got !== expectedSha) {
    await unlink(tmp).catch(() => {});
    throw new Error(`vendor: integrity check failed for ${url}\n  expected ${expectedSha}\n  got      ${got}`);
  }
  await rename(tmp, dest);
}

/** Ensure every vendored file is present and integrity-verified; download the missing ones. */
export async function ensureVendor() {
  await mkdir(VENDOR_DIR, { recursive: true });
  for (const [name, { url, sha256 }] of Object.entries(VENDOR)) {
    const dest = join(VENDOR_DIR, name);
    // Re-verify a cached copy; absent or a hash mismatch (corruption/tamper) → fresh verified download.
    if ((await sha256OrNull(dest)) === sha256) continue;
    await downloadVerified(url, dest, sha256);
  }
  return VENDOR_DIR;
}
