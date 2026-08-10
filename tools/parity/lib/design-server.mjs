/**
 * A tiny static HTTP server for the vendored design mirror (`packages/design/`), plus ONE virtual
 * path that returns a generated single-screen harness.
 *
 * Why a server (not file://): the design pages load their registries as `<script type="text/babel">`
 * with `src=`, and @babel/standalone FETCHES those. Under file:// that fetch is blocked; over http it
 * works. The DS bundle, icons, fonts (via styles.css @import) and food photos are all relative paths,
 * so we serve `packages/design/` as the web root and everything resolves exactly as the real gallery
 * resolves it — byte-identical, nothing written into the design tree.
 *
 * The harness lives at the SAME directory depth as the real gallery
 * (`/explorations/journey/__parity_harness.html`) so every `../../` and `../restaurants/` path inside
 * it — and inside the assets it pulls — resolves identically to `All Screens Gallery.html`. We never
 * write that file to disk; the server answers that one path from memory.
 *
 * unpkg (react/react-dom/babel/leaflet) and tile.openstreetmap.org are absolute https URLs, fetched
 * straight through the container's proxy — not our concern here.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize, resolve, extname } from "node:path";
import { harnessHtml } from "./harness-html.mjs";
import { ensureVendor, VENDOR_DIR } from "./vendor.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DESIGN_ROOT = resolve(HERE, "../../../packages/design");
export const HARNESS_PATH = "/explorations/journey/__parity_harness.html";
export const VENDOR_PREFIX = "/__vendor__/";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".jsx": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
};

function contentType(p) {
  return TYPES[extname(p).toLowerCase()] ?? "application/octet-stream";
}

/**
 * Start the design server. Returns { origin, harnessUrl, close }.
 * @param {string} designRoot absolute path to packages/design (defaults to the repo copy)
 */
export async function startDesignServer(designRoot = DESIGN_ROOT) {
  await ensureVendor(); // download pinned react/babel/leaflet once, then serve them from loopback

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      const pathname = decodeURIComponent(url.pathname);

      if (pathname === HARNESS_PATH) {
        const body = harnessHtml();
        res.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
          "access-control-allow-origin": "*",
        });
        res.end(body);
        return;
      }

      // Vendored CDN libs, served from the gitignored cache (see vendor.mjs).
      const root = pathname.startsWith(VENDOR_PREFIX) ? VENDOR_DIR : designRoot;
      const under = pathname.startsWith(VENDOR_PREFIX)
        ? pathname.slice(VENDOR_PREFIX.length)
        : pathname;

      // Static file, sandboxed to its root (block path traversal).
      const rel = normalize(under).replace(/^(\.\.[/\\])+/, "");
      const filePath = join(root, rel);
      if (!filePath.startsWith(root)) {
        res.writeHead(403).end("forbidden");
        return;
      }
      // Read directly and classify the failure — no stat-then-read (that check-then-use window is a
      // TOCTOU race). A missing path or a directory both map to 404; anything else is a real 500.
      let buf;
      try {
        buf = await readFile(filePath);
      } catch (readErr) {
        if (readErr?.code === "ENOENT" || readErr?.code === "EISDIR") {
          res.writeHead(404).end(`not found: ${rel}`);
          return;
        }
        throw readErr;
      }
      res.writeHead(200, {
        "content-type": contentType(filePath),
        "access-control-allow-origin": "*",
        "cache-control": "no-store",
      });
      res.end(buf);
    } catch (err) {
      res.writeHead(500).end(String(err?.stack || err));
    }
  });

  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;
  return {
    origin,
    harnessUrl: origin + HARNESS_PATH,
    close: () => new Promise((ok) => server.close(ok)),
  };
}
