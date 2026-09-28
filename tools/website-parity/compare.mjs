#!/usr/bin/env node
/**
 * LyniaGo marketing-website pixel-parity harness.
 *
 * Measures whether the deployable static site (apps/website/site) renders pixel-identically to the
 * approved design reference (packages/design/handoff/lyniago-website/reference/LandingPage-reference-offline.html)
 * — "every parity claim becomes an image" (CLAUDE.md → Pixel parity). For each viewport it renders both
 * pages in the same headless Chromium, takes full-page screenshots, diffs them per pixel and writes
 * ref / site / diff / band-crop / side-by-side sheet PNGs plus report.json. For the SITE it also records
 * every failed or >=400 request, console errors and the Content-Type of each .webp/.woff2/.svg response
 * (handoff launch checklist: "no 404s", "WebP served as image/webp"), for the index page at every width
 * AND for the 404 page the host serves on a missing path.
 *
 * Usage (from anywhere; defaults resolve against the repo root) — see README.md / --help:
 *   node tools/website-parity/compare.mjs [--site <url|dir|file>] [--ref <file|url>]
 *        [--widths 360,390,768,1024,1280,1440,1920] [--out <dir>] [--threshold 0.001] [--tolerance 8]
 *        [--crops 3] [--raw] [--no-sheet] [--timeout 60000]
 *
 * Exit: 0 = every width within threshold with equal page heights, and no failed/>=400 site request;
 *       1 = a parity or network failure; 2 = the harness itself could not run.
 *
 * Measure-only: it never writes into the site or the design package.
 */
import http from "node:http";
import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "../parity/lib/args.mjs";
import { contextDefaults, launch } from "../parity/lib/browser.mjs";
import { buildSheet } from "../parity/lib/sheet.mjs";
import { decodePng, encodePng } from "./png.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const DEFAULT_SITE = join(REPO, "apps/website/site");
const DEFAULT_REF = join(REPO, "packages/design/handoff/lyniago-website/reference/LandingPage-reference-offline.html");
// Repo-local and gitignored (./.gitignore): never a predictable path in the shared OS temp dir.
const DEFAULT_OUT = join(HERE, "out");

// The handoff README's QA widths, each paired with ONE height used for both sides. Height matters:
// the desktop tier (min-width:961px) caps illustrations with calc(100vh - 200px).
const CANONICAL_HEIGHT = { 360: 720, 390: 844, 768: 1024, 1024: 768, 1280: 800, 1440: 900, 1920: 1080 };
const FALLBACK_HEIGHT = 900;
const DEFAULT_WIDTHS = Object.keys(CANONICAL_HEIGHT).join(",");
const CANONICAL_LIST = Object.entries(CANONICAL_HEIGHT)
  .map(([w, h]) => `${w}x${h}`)
  .join(" ");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
};
// What the handoff README requires the host to send (§ Deploy step 5, § Launch QA checklist).
const EXPECTED_TYPES = { ".webp": "image/webp", ".woff2": "font/woff2", ".svg": "image/svg+xml" };
const RASTER = /\.(webp|png|jpe?g|gif|avif)$/i;
// A path no deploy will ever contain: the host must answer it with its 404 page (404.html when the site
// ships one), whose own requests are then held to the same no-404 / no-console-error bar.
const NOT_FOUND_PATH = "__website-parity-missing-page__";

// "Rendered" = the page's content exists AND its inline script ran (icons + the JS-built Zimbabwe map),
// AND — for the reference — the bundler has swapped in the real document (its loader/thumbnail gone).
const READY = { present: [".hero", "#zmap svg"], absent: ["#__bundler_loading", "#__bundler_thumbnail"] };

// Injected identically into BOTH pages after they render: kill the Harare-dot pulse, hover transitions
// and smooth scrolling (html{scroll-behavior:smooth} would otherwise animate our scroll-through).
const FREEZE_CSS =
  "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}" +
  "html{scroll-behavior:auto!important}";

const USAGE = `Usage: node tools/website-parity/compare.mjs [options]

  --site <url|dir|file>  page under test. Default: apps/website/site (served on 127.0.0.1, random port).
                         An https URL checks a live deploy, e.g. --site https://lyniago.com
  --ref <file|url>       approved design. Default: the handoff's LandingPage-reference-offline.html
  --widths <list>        comma list of W or WxH. Default: ${DEFAULT_WIDTHS}
                         (heights: ${CANONICAL_LIST}; any other W -> Wx${FALLBACK_HEIGHT})
  --out <dir>            output dir for PNGs + report.json. Default: ${DEFAULT_OUT}
  --threshold <pct>      max mismatched-pixel percentage per width. Default: 0.001
  --tolerance <0-255>    per-channel delta a pixel may differ by and still match. Default: 8
  --crops <n>            write the n largest mismatch bands per width as zoomed crops. Default: 3
  --raw                  render the reference with its OWN inlined raster images. By default the
                         reference shows the SITE's raster <img> files (matched by document order + alt),
                         which isolates markup/CSS/font/SVG parity from the handoff's sanctioned PNG->WebP
                         re-encode of the app screenshots (expect 0 mismatched pixels). A raw run always
                         differs inside those screenshots, so use it for picture evidence, with a higher
                         --threshold (about 0.5), not as the gate.
  --no-sheet             skip the side-by-side sheet (faster)
  --timeout <ms>         per-page render timeout. Default: 60000`;

// ───────────────────────────── static server ─────────────────────────────

/**
 * Tiny static host for a local site dir. Like the production host (Cloudflare static assets with
 * not_found_handling = "404-page"), a missing path gets the site's 404.html — if it ships one — with
 * status 404. _headers is NOT applied: real headers are only verifiable against a live --site URL.
 */
function serveStatic(root) {
  const server = http.createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
      let file = resolve(root, "." + pathname);
      if (file !== root && !file.startsWith(root + sep)) {
        res.writeHead(403).end("forbidden");
        return;
      }
      let st = await stat(file).catch(() => null);
      if (st?.isDirectory()) {
        file = join(file, "index.html");
        st = await stat(file).catch(() => null);
      }
      let status = 200;
      if (!st?.isFile()) {
        status = 404;
        file = join(root, "404.html");
        st = await stat(file).catch(() => null);
        if (!st?.isFile()) {
          res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("not found");
          return;
        }
      }
      res.writeHead(status, {
        "content-type": MIME[extname(file).toLowerCase()] || "application/octet-stream",
        "content-length": st.size,
        "cache-control": "no-store",
      });
      if (req.method === "HEAD") res.end();
      else createReadStream(file).pipe(res);
    } catch (err) {
      res.writeHead(500).end(String(err));
    }
  });
  return new Promise((ok, fail) => {
    server.once("error", fail);
    server.listen(0, "127.0.0.1", () =>
      ok({
        origin: `http://127.0.0.1:${server.address().port}`,
        close: () => {
          server.closeAllConnections?.();
          return new Promise((r) => server.close(() => r()));
        },
      }),
    );
  });
}

/** Resolve a --site/--ref value to {label, url}, starting a local server for paths. */
async function resolveTarget(value, servers) {
  if (/^https?:\/\//i.test(value)) return { label: value, url: value, local: false };
  const abs = resolve(value);
  const st = await stat(abs).catch(() => null);
  if (!st) throw new Error(`not found: ${abs}`);
  const root = st.isDirectory() ? abs : dirname(abs);
  const page = st.isDirectory() ? "" : encodeURIComponent(basename(abs));
  if (!servers.has(root)) servers.set(root, await serveStatic(root));
  const rel = relative(REPO, abs);
  const label = rel && !rel.startsWith("..") ? rel : abs;
  return { label, url: `${servers.get(root).origin}/${page}`, local: true };
}

// ───────────────────────────── in-page helpers (serialized into the page) ─────────────────────────────

function readyInPage({ present, absent }) {
  return present.every((s) => document.querySelector(s)) && absent.every((s) => !document.querySelector(s));
}

async function prepareInPage({ freezeCss, imageTimeoutMs, swap }) {
  const frame2 = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const style = document.createElement("style");
  style.setAttribute("data-website-parity", "freeze");
  style.textContent = freezeCss;
  document.head.appendChild(style);

  const imgs = Array.from(document.images);
  // Raster normalization (default; --raw disables): point this page's raster <img>s at the site's files. Only valid when the two
  // documents carry the same images in the same order — checked, never assumed.
  let swapped = 0;
  if (swap) {
    if (swap.length !== imgs.length) {
      throw new Error(`raster normalization: ${imgs.length} <img> in the reference vs ${swap.length} on the site`);
    }
    swap.forEach((s, k) => {
      if (!s.raster) return;
      if (imgs[k].alt !== s.alt)
        throw new Error(`raster normalization: <img> #${k} alt "${imgs[k].alt}" vs site "${s.alt}"`);
      imgs[k].removeAttribute("srcset");
      imgs[k].src = s.src;
      swapped++;
    });
  }

  // Lazy images: switch to eager AND scroll the whole page in steps — whichever Chromium honours first.
  for (const img of imgs) if (img.loading === "lazy") img.loading = "eager";
  const de = document.documentElement;
  const step = Math.max(100, Math.floor(innerHeight * 0.75));
  for (let y = 0; y <= de.scrollHeight; y += step) {
    scrollTo({ top: y, left: 0, behavior: "instant" });
    await frame2();
  }
  const settled = (img) =>
    img.complete
      ? null
      : new Promise((r) => {
          img.addEventListener("load", r, { once: true });
          img.addEventListener("error", r, { once: true });
        });
  await Promise.race([Promise.all(Array.from(document.images, settled)), sleep(imageTimeoutMs)]);
  await Promise.race([
    Promise.all(Array.from(document.images, (i) => i.decode().catch(() => null))),
    sleep(imageTimeoutMs),
  ]);
  // Fonts: load every declared face (font-display:swap would otherwise screenshot the fallback).
  await Promise.all(Array.from(document.fonts, (f) => f.load().catch(() => null)));
  await document.fonts.ready;

  scrollTo({ top: 0, left: 0, behavior: "instant" });
  await frame2();
  // Layout settle: the document height must hold still for 3 consecutive checks.
  let last = -1;
  let same = 0;
  for (let i = 0; i < 60 && same < 3; i++) {
    await sleep(50);
    await frame2();
    const h = de.scrollHeight;
    same = h === last ? same + 1 : 0;
    last = h;
  }
  const name = (img) => {
    const src = img.getAttribute("src") || "";
    return /^(blob|data):/.test(src) || src.length > 80 ? `<img alt="${img.alt}">` : src;
  };
  return {
    images: imgs.length,
    swapped,
    imageList: imgs.map((i) => ({ src: i.currentSrc || i.src, alt: i.alt })),
    notLoaded: imgs.filter((i) => !i.complete).map(name),
    broken: imgs.filter((i) => i.complete && i.naturalWidth === 0).map(name),
  };
}

function measureInPage() {
  const de = document.documentElement;
  const b = document.body;
  const label = (e) =>
    e.tagName.toLowerCase() + (e.id ? `#${e.id}` : "") + Array.from(e.classList, (c) => `.${c}`).join("");
  const sections = Array.from(b.children)
    .filter((e) => !/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|LINK|META)$/.test(e.tagName))
    .map((e) => {
      const r = e.getBoundingClientRect();
      return {
        label: label(e),
        top: Math.round((r.top + scrollY) * 100) / 100,
        height: Math.round(r.height * 100) / 100,
      };
    })
    .filter((s) => s.height > 0);
  const cs = getComputedStyle(b);
  return {
    height: Math.max(de.scrollHeight, b.scrollHeight),
    scrollWidth: de.scrollWidth,
    innerWidth,
    innerHeight,
    scrollY,
    compatMode: document.compatMode,
    body: `${cs.display} / ${cs.backgroundColor} / ${cs.fontFamily}`,
    fonts: Array.from(document.fonts, (f) => `${f.family.replace(/"/g, "")} ${f.weight}: ${f.status}`).sort(),
    sections,
  };
}

// ───────────────────────────── rendering ─────────────────────────────

/**
 * Record the site's failed / >=400 requests, console errors and asset Content-Types. With
 * `expectMissingDoc` (the not-found probe) the main document's own 404 is the expected answer, so it
 * — and Chromium's matching "Failed to load resource" console line — is not counted.
 */
function attachNetwork(page, net, tag, { expectMissingDoc = false } = {}) {
  const docUrls = new Set();
  const isDoc = (req) => req.isNavigationRequest() && req.frame() === page.mainFrame();
  page.on("request", (req) => isDoc(req) && docUrls.add(req.url()));
  page.on("requestfailed", (req) =>
    net.failed.push({ url: req.url(), error: req.failure()?.errorText || "failed", type: req.resourceType(), at: tag }),
  );
  page.on("response", (res) => {
    const url = res.url();
    if (!/^https?:/i.test(url)) return;
    net.responses++;
    if (res.status() >= 400 && !(expectMissingDoc && isDoc(res.request())))
      net.bad.push({ url, status: res.status(), at: tag });
    const ext = extname(new URL(url).pathname).toLowerCase();
    if (EXPECTED_TYPES[ext]) net.types.set(url, { ext, contentType: res.headers()["content-type"] || "(none)" });
  });
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    if (expectMissingDoc && docUrls.has(m.location()?.url) && /^Failed to load resource/.test(m.text())) return;
    net.console.push(`[${tag}] ${m.text()}${m.location()?.url ? ` (${m.location().url})` : ""}`);
  });
  page.on("pageerror", (e) => net.console.push(`[${tag}] pageerror: ${e.message}`));
}

async function renderSide(browser, vp, target, { net, diag, timeout, swap = null }) {
  const ctx = await browser.newContext(
    contextDefaults({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1 }),
  );
  try {
    const page = await ctx.newPage();
    if (net) attachNetwork(page, net, vp.name);
    else {
      page.on("pageerror", (e) => diag.push(`[${vp.name}] pageerror: ${e.message}`));
      page.on("console", (m) => {
        // The reference declares no icon, so Chromium probes /favicon.ico on its own — not the page's doing.
        if (m.type() !== "error" || /\/favicon\.ico(\?|$)/.test(m.location()?.url || "")) return;
        diag.push(`[${vp.name}] ${m.text()}`);
      });
    }
    await page.goto(target.url, { waitUntil: "load", timeout });
    await page.waitForFunction(readyInPage, READY, { timeout, polling: 100 }).catch((err) => {
      throw new Error(`${target.label} never became ready (${JSON.stringify(READY)}): ${err.message.split("\n")[0]}`);
    });
    const prep = await page.evaluate(prepareInPage, {
      freezeCss: FREEZE_CSS,
      imageTimeoutMs: Math.min(timeout, 30000),
      swap,
    });
    const m = await page.evaluate(measureInPage);
    // Clip to the viewport width: body{overflow-x:hidden} hides the blobs' overflow from users, but a
    // plain fullPage capture would still widen to document.scrollWidth.
    const png = await page.screenshot({
      clip: { x: 0, y: 0, width: vp.w, height: m.height },
      fullPage: true,
      animations: "disabled",
      caret: "hide",
      scale: "css",
      timeout,
    });
    return { png, ...m, ...prep };
  } finally {
    await ctx.close();
  }
}

/** Load a guaranteed-missing path on the site and hold the 404 page it gets to the no-404 bar. */
async function probeNotFound(browser, vp, site, net, timeout) {
  const url = new URL(NOT_FOUND_PATH, site.url).href;
  const ctx = await browser.newContext(
    contextDefaults({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1 }),
  );
  try {
    const page = await ctx.newPage();
    attachNetwork(page, net, `404-page@${vp.name}`, { expectMissingDoc: true });
    const res = await page.goto(url, { waitUntil: "load", timeout });
    const info = await page.evaluate(async () => {
      await Promise.all(Array.from(document.fonts, (f) => f.load().catch(() => null)));
      await document.fonts.ready;
      return {
        title: document.title,
        branded: !!document.querySelector("header.nav"),
        broken: Array.from(document.images)
          .filter((i) => i.complete && i.naturalWidth === 0)
          .map((i) => i.getAttribute("src")),
      };
    });
    return { url, status: res ? res.status() : null, ...info };
  } finally {
    await ctx.close();
  }
}

// ───────────────────────────── diff ─────────────────────────────

function diffImages(a, b, tolerance) {
  const W = Math.max(a.width, b.width);
  const H = Math.max(a.height, b.height);
  const out = Buffer.alloc(W * H * 4);
  const rowCount = new Uint32Array(H);
  const rowMin = new Int32Array(H).fill(W);
  const rowMax = new Int32Array(H).fill(-1);
  let mismatched = 0;
  let subTolerance = 0;
  let maxDelta = 0;
  const A = a.data;
  const B = b.data;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      let bad;
      if (x >= a.width || y >= a.height || x >= b.width || y >= b.height) {
        bad = true; // present on one side only (page heights differ) → magenta
        out[o] = 255;
        out[o + 1] = 0;
        out[o + 2] = 255;
      } else {
        const i = (y * a.width + x) * 4;
        const j = (y * b.width + x) * 4;
        const d = Math.max(
          Math.abs(A[i] - B[j]),
          Math.abs(A[i + 1] - B[j + 1]),
          Math.abs(A[i + 2] - B[j + 2]),
          Math.abs(A[i + 3] - B[j + 3]),
        );
        if (d > maxDelta) maxDelta = d;
        bad = d > tolerance;
        if (bad) {
          out[o] = 255; // beyond tolerance → red
          out[o + 1] = 0;
          out[o + 2] = 0;
        } else if (d > 0) {
          subTolerance++; // differs, but within tolerance → amber
          out[o] = 255;
          out[o + 1] = 200;
          out[o + 2] = 80;
        } else {
          const g = 255 - (((255 - (A[i] * 0.299 + A[i + 1] * 0.587 + A[i + 2] * 0.114)) * 0.18) | 0); // faded reference
          out[o] = out[o + 1] = out[o + 2] = g;
        }
      }
      out[o + 3] = 255;
      if (bad) {
        mismatched++;
        rowCount[y]++;
        if (x < rowMin[y]) rowMin[y] = x;
        if (x > rowMax[y]) rowMax[y] = x;
      }
    }
  }
  return { width: W, height: H, data: out, mismatched, subTolerance, maxDelta, rowCount, rowMin, rowMax };
}

/** Group mismatched rows into vertical bands (rows closer than `gap` merge), largest first. */
function mismatchBands(d, sections, gap = 16) {
  const bands = [];
  let cur = null;
  for (let y = 0; y < d.height; y++) {
    if (!d.rowCount[y]) continue;
    if (cur && y - cur.y1 <= gap) {
      cur.y1 = y;
      cur.px += d.rowCount[y];
      cur.x0 = Math.min(cur.x0, d.rowMin[y]);
      cur.x1 = Math.max(cur.x1, d.rowMax[y]);
    } else {
      cur = { y0: y, y1: y, x0: d.rowMin[y], x1: d.rowMax[y], px: d.rowCount[y] };
      bands.push(cur);
    }
  }
  for (const band of bands) {
    band.sections = sections.filter((s) => band.y1 >= s.top && band.y0 < s.top + s.height).map((s) => s.label);
  }
  return bands.sort((p, q) => q.px - p.px);
}

function mismatchBySection(d, sections) {
  const acc = new Map();
  for (let y = 0; y < d.height; y++) {
    if (!d.rowCount[y]) continue;
    const s = sections.find((s) => y >= s.top && y < s.top + s.height);
    const key = s ? s.label : "(between sections)";
    acc.set(key, (acc.get(key) || 0) + d.rowCount[y]);
  }
  return [...acc].map(([label, px]) => ({ label, px })).sort((p, q) => q.px - p.px);
}

function sectionDeltas(refSections, siteSections) {
  const out = [];
  for (let i = 0; i < Math.max(refSections.length, siteSections.length); i++) {
    const r = refSections[i];
    const s = siteSections[i];
    if (!r || !s || r.label !== s.label || Math.abs(r.top - s.top) > 0.5 || Math.abs(r.height - s.height) > 0.5) {
      out.push({ ref: r || null, site: s || null });
    }
  }
  return out;
}

function crop(img, x0, y0, w, h) {
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const sx = x0 + x;
      const sy = y0 + y;
      if (sx < img.width && sy < img.height)
        img.data.copy(out, o, (sy * img.width + sx) * 4, (sy * img.width + sx) * 4 + 4);
      else out.set([255, 0, 255, 255], o); // no pixels on this side
    }
  }
  return { width: w, height: h, data: out };
}

function hconcat(images, gutter = 12) {
  const H = Math.max(...images.map((i) => i.height));
  const W = images.reduce((s, i) => s + i.width, 0) + gutter * (images.length - 1);
  const out = Buffer.alloc(W * H * 4);
  for (let p = 0; p < out.length; p += 4) out.set([46, 52, 58, 255], p);
  let xo = 0;
  for (const img of images) {
    for (let y = 0; y < img.height; y++)
      img.data.copy(out, (y * W + xo) * 4, y * img.width * 4, (y + 1) * img.width * 4);
    xo += img.width + gutter;
  }
  return { width: W, height: H, data: out };
}

// ───────────────────────────── main ─────────────────────────────

function parseViewports(spec) {
  return String(spec)
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => {
      const m = /^(\d+)(?:x(\d+))?$/i.exec(t);
      if (!m) throw new Error(`bad --widths entry "${t}" (want W or WxH)`);
      const w = Number(m[1]);
      const h = m[2] ? Number(m[2]) : CANONICAL_HEIGHT[w] || FALLBACK_HEIGHT;
      return { w, h, name: m[2] ? `${w}x${h}` : String(w) };
    });
}

function numberArg(args, key, fallback) {
  if (args[key] === undefined) return fallback;
  const n = Number(args[key]);
  if (!Number.isFinite(n) || n < 0) throw new Error(`--${key} must be a non-negative number`);
  return n;
}

const pct = (n, total) => (total ? (n / total) * 100 : 0);
const fmtPct = (p) => `${p.toFixed(4)}%`;
const num = (n) => n.toLocaleString("en-US");

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    console.log(USAGE);
    return 0;
  }
  const viewports = parseViewports(args.widths === true ? DEFAULT_WIDTHS : args.widths || DEFAULT_WIDTHS);
  if (!viewports.length) throw new Error("--widths selected no viewport");
  const threshold = numberArg(args, "threshold", 0.001);
  const tolerance = numberArg(args, "tolerance", 8);
  const crops = numberArg(args, "crops", 3);
  const timeout = numberArg(args, "timeout", 60000);
  const normalize = args.raw === undefined;
  const outDir = resolve(typeof args.out === "string" ? args.out : DEFAULT_OUT);
  await mkdir(outDir, { recursive: true });

  const servers = new Map();
  const browser = await launch();
  const net = { failed: [], bad: [], types: new Map(), console: [], responses: 0 };
  const refDiag = [];
  const results = [];
  const notFound = [];
  let site;
  let ref;
  try {
    site = await resolveTarget(typeof args.site === "string" ? args.site : DEFAULT_SITE, servers);
    ref = await resolveTarget(typeof args.ref === "string" ? args.ref : DEFAULT_REF, servers);
    console.log(
      `website-parity · chromium ${browser.version()} · tolerance ±${tolerance}/channel · threshold ${threshold}%` +
        (normalize ? " · reference shows the site's raster files (--raw to disable)" : ""),
    );
    console.log(
      `  ref : ${ref.label}\n  site: ${site.label}${site.local ? ` (${site.url})` : ""}\n  out : ${outDir}\n`,
    );

    for (const vp of viewports) {
      const t0 = Date.now();
      const row = { name: vp.name, viewport: { width: vp.w, height: vp.h }, reasons: [], files: {} };
      results.push(row);
      try {
        const s = await renderSide(browser, vp, site, { net, timeout });
        const swap = normalize
          ? s.imageList.map((i) => ({ ...i, raster: RASTER.test(new URL(i.src).pathname) }))
          : null;
        const r = await renderSide(browser, vp, ref, { diag: refDiag, timeout, swap });
        if (normalize && !r.swapped) throw new Error("raster normalization: the site has no raster <img> to swap in");
        const files = {
          ref: join(outDir, `ref-${vp.name}.png`),
          site: join(outDir, `site-${vp.name}.png`),
          diff: join(outDir, `diff-${vp.name}.png`),
        };
        await writeFile(files.ref, r.png);
        await writeFile(files.site, s.png);
        const refImg = decodePng(r.png);
        const siteImg = decodePng(s.png);
        const d = diffImages(refImg, siteImg, tolerance);
        await writeFile(files.diff, encodePng(d));
        const bands = mismatchBands(d, s.sections);
        files.crops = [];
        for (const [k, band] of bands.slice(0, crops).entries()) {
          const x0 = Math.max(0, band.x0 - 48);
          const y0 = Math.max(0, band.y0 - 24);
          const w = Math.min(d.width, band.x1 + 49) - x0;
          const h = Math.min(d.height, band.y1 + 25, y0 + 1600) - y0;
          const f = join(outDir, `band-${vp.name}-${k + 1}.png`);
          await writeFile(
            f,
            encodePng(hconcat([crop(refImg, x0, y0, w, h), crop(siteImg, x0, y0, w, h), crop(d, x0, y0, w, h)])),
          );
          files.crops.push(f);
        }

        const { png: _r, imageList: _ri, ...refInfo } = r;
        const { png: _s, imageList: _si, ...siteInfo } = s;
        row.ref = refInfo;
        row.site = siteInfo;
        row.diff = {
          width: d.width,
          height: d.height,
          mismatched: d.mismatched,
          mismatchPct: pct(d.mismatched, d.width * d.height),
          subTolerance: d.subTolerance,
          maxChannelDelta: d.maxDelta,
          bySection: mismatchBySection(d, s.sections),
          bands: bands.slice(0, 10),
        };
        row.sectionDeltas = sectionDeltas(r.sections, s.sections);
        if (r.height !== s.height) row.reasons.push(`page height ref ${r.height} ≠ site ${s.height}`);
        if (row.diff.mismatchPct > threshold)
          row.reasons.push(`mismatch ${fmtPct(row.diff.mismatchPct)} > ${threshold}%`);
        for (const [side, info] of [
          ["ref", r],
          ["site", s],
        ]) {
          if (info.innerWidth !== vp.w) row.reasons.push(`${side} innerWidth ${info.innerWidth} ≠ viewport ${vp.w}`);
          if (info.broken.length) row.reasons.push(`${side} broken images: ${info.broken.join(", ")}`);
          if (info.notLoaded.length) row.reasons.push(`${side} images never loaded: ${info.notLoaded.join(", ")}`);
        }
        if (typeof args["no-sheet"] === "undefined") {
          const sheet = await buildSheet({
            title: `LyniaGo website parity · ${vp.w}×${vp.h}`,
            rows: [
              {
                label: `${vp.w}×${vp.h} — reference | site`,
                sub: `mismatch ${fmtPct(row.diff.mismatchPct)} · height ${r.height} / ${s.height}`,
                mock: files.ref,
                app: files.site,
                mockNote: normalize ? "reference, raster <img>s = site files" : "reference (approved design)",
                appNote: `site · ${site.label}`,
                logicalW: vp.w,
              },
            ],
            out: join(outDir, `sheet-${vp.name}`),
            browser,
          });
          files.sheet = sheet.pngPath;
        }
        row.files = files;
      } catch (err) {
        row.error = err.message;
        row.reasons.push(`render failed: ${err.message.split("\n")[0]}`);
      }
      try {
        notFound.push({ at: vp.name, ...(await probeNotFound(browser, vp, site, net, timeout)) });
      } catch (err) {
        notFound.push({ at: vp.name, error: err.message.split("\n")[0] });
      }
      row.pass = row.reasons.length === 0;
      row.seconds = Math.round((Date.now() - t0) / 100) / 10;
      const status = row.pass ? "PASS" : "FAIL";
      const mm = row.diff ? `${fmtPct(row.diff.mismatchPct)} (${num(row.diff.mismatched)} px)` : "—";
      console.log(
        `  ${vp.name.padEnd(9)} ${status}  mismatch ${mm}  height ${row.ref?.height ?? "?"}/${row.site?.height ?? "?"}  ${row.seconds}s`,
      );
    }
  } finally {
    await browser.close().catch(() => {});
    for (const s of servers.values()) await s.close();
  }

  // ── network verdicts (site only: the index page at every width + the not-found page) ──
  const uniq = (list, key) => [...new Map(list.map((e) => [key(e), e])).values()];
  const failedRequests = uniq(net.failed, (e) => `${e.url}|${e.error}`);
  const badResponses = uniq(net.bad, (e) => `${e.url}|${e.status}`);
  const contentTypes = [...net.types].map(([url, t]) => ({ url, ...t, expected: EXPECTED_TYPES[t.ext] }));
  const wrongTypes = contentTypes.filter((t) => t.contentType.split(";")[0].trim().toLowerCase() !== t.expected);
  const consoleErrors = [...new Set(net.console)];
  const notFoundProblems = notFound.filter((p) => p.error || p.broken?.length);
  const softNotFound = notFound.filter((p) => !p.error && p.status !== 404);

  const networkPass = failedRequests.length === 0 && badResponses.length === 0 && notFoundProblems.length === 0;
  const pass = networkPass && results.every((r) => r.pass);
  const report = {
    generatedAt: new Date().toISOString(),
    pass,
    mode: normalize ? "normalize-raster" : "raw",
    ref: ref?.label,
    site: site?.label,
    tolerance,
    thresholdPct: threshold,
    viewports: results,
    siteNetwork: {
      responses: net.responses,
      failedRequests,
      badResponses,
      wrongContentTypes: wrongTypes,
      contentTypes,
      consoleErrors,
      notFoundPage: notFound,
    },
    refDiagnostics: [...new Set(refDiag)],
  };
  await writeFile(join(outDir, "report.json"), JSON.stringify(report, null, 2));

  // ── summary ──
  console.log("\n  width     viewport     ref h    site h   mismatch            sub-tol px  max Δ  result");
  for (const r of results) {
    const d = r.diff;
    console.log(
      "  " +
        [
          r.name.padEnd(9),
          `${r.viewport.width}×${r.viewport.height}`.padEnd(12),
          String(r.ref?.height ?? "—").padStart(6),
          String(r.site?.height ?? "—").padStart(9),
          (d ? `${fmtPct(d.mismatchPct)} (${num(d.mismatched)})` : "—").padStart(20).padEnd(22),
          (d ? num(d.subTolerance) : "—").padStart(9),
          (d ? String(d.maxChannelDelta) : "—").padStart(6),
          r.pass ? " PASS" : " FAIL",
        ].join(" "),
    );
  }
  for (const r of results.filter((r) => !r.pass || r.diff?.mismatched)) {
    console.log(`\n  ${r.name}: ${r.reasons.length ? r.reasons.join("; ") : "within threshold"}`);
    for (const sd of r.sectionDeltas || []) {
      console.log(
        `    layout: ${sd.ref?.label ?? "—"} ref ${sd.ref?.top}+${sd.ref?.height} vs site ${sd.site?.top}+${sd.site?.height}`,
      );
    }
    for (const s of r.diff?.bySection.slice(0, 5) || []) console.log(`    ${num(s.px).padStart(9)} px in ${s.label}`);
    for (const b of r.diff?.bands.slice(0, 5) || []) {
      console.log(
        `    band y ${b.y0}–${b.y1} x ${b.x0}–${b.x1}: ${num(b.px)} px [${b.sections.join(", ") || "between sections"}]`,
      );
    }
  }
  console.log(
    `\n  site network: ${net.responses} responses, ${failedRequests.length} failed, ${badResponses.length} ≥400`,
  );
  for (const f of failedRequests) console.log(`    FAILED ${f.url} — ${f.error} (${f.at})`);
  for (const b of badResponses) console.log(`    ${b.status} ${b.url} (${b.at})`);
  const byExt = {};
  for (const t of contentTypes) (byExt[t.ext] ??= new Set()).add(t.contentType);
  for (const [ext, types] of Object.entries(byExt)) {
    const n = contentTypes.filter((t) => t.ext === ext).length;
    const ok = [...types].every((t) => t.split(";")[0].trim().toLowerCase() === EXPECTED_TYPES[ext]);
    console.log(
      `    ${ext.padEnd(6)} ×${String(n).padEnd(3)} ${[...types].join(", ")}${ok ? "" : `  ← expected ${EXPECTED_TYPES[ext]}`}`,
    );
  }
  const nf = uniq(notFound, (p) => `${p.status}|${p.title}|${p.branded}|${p.error}`);
  for (const p of nf) {
    console.log(
      p.error
        ? `  404 page: /${NOT_FOUND_PATH} → probe failed: ${p.error}`
        : `  404 page: /${NOT_FOUND_PATH} → HTTP ${p.status}, "${p.title}"${p.branded ? " (site-branded)" : " (host default, not the site's 404.html)"}${p.broken.length ? `, broken images: ${p.broken.join(", ")}` : ""}`,
    );
  }
  if (softNotFound.length)
    console.log(`  warning: a missing path answered HTTP ${softNotFound[0].status}, not 404 (soft 404)`);
  if (consoleErrors.length) console.log(`  site console errors:\n${consoleErrors.map((e) => `    ${e}`).join("\n")}`);
  else console.log("  site console errors: none");
  if (report.refDiagnostics.length)
    console.log(
      `  reference page errors (the baseline may be invalid):\n${report.refDiagnostics.map((e) => `    ${e}`).join("\n")}`,
    );
  console.log(`\n  ${pass ? "PASS" : "FAIL"} · report: ${join(outDir, "report.json")}`);
  return pass ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`website-parity: ${err.stack || err.message}`);
    process.exit(2);
  },
);
