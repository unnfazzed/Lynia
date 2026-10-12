// Tests for finish-build.mjs and the offline shell it stamps — run with:
//   node --test apps/customer-web/finish-build.test.mjs
// Each case finishes a small fake Expo web export in a temp dir. No dependencies beyond Node itself.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { afterEach, test } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const ENTRY = "/_expo/static/js/web/entry-0123abcd.js";
const FONTS = [
  "/assets/assets/fonts/Inter-400Regular-subset.1a2b.ttf",
  "/assets/assets/fonts/Inter-600SemiBold-subset.3c4d.ttf",
  "/assets/assets/fonts/Inter-700Bold-subset.5e6f.ttf",
];
const temps = [];

function fakeExport() {
  const out = mkdtempSync(join(tmpdir(), "customer-web-"));
  temps.push(out);
  writeFileSync(
    join(out, "index.html"),
    `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width" /><title>LyniaGo</title></head>` +
      `<body><script src="${ENTRY}" defer></script></body></html>`,
  );
  for (const p of [ENTRY, ...FONTS, "/assets/node_modules/icon.abcd.png"]) {
    mkdirSync(dirname(join(out, p)), { recursive: true });
    writeFileSync(join(out, p), "x");
  }
  return out;
}

function finish(out, env = { EXPO_PUBLIC_API_URL: "https://api.example.test/v1" }) {
  const { EXPO_PUBLIC_API_URL: _drop, ...base } = process.env;
  execFileSync(process.execPath, [join(here, "finish-build.mjs"), out], { env: { ...base, ...env }, stdio: "pipe" });
  return readFileSync(join(out, "index.html"), "utf8");
}

afterEach(() => {
  while (temps.length) rmSync(temps.pop(), { recursive: true, force: true });
});

test("P27: preconnects (and dns-prefetches) the API origin the export was built with", () => {
  const html = finish(fakeExport());
  assert.match(html, /<link rel="preconnect" href="https:\/\/api\.example\.test" crossorigin \/>/);
  assert.match(html, /<link rel="dns-prefetch" href="https:\/\/api\.example\.test" \/>/);
});

test("P27: without EXPO_PUBLIC_API_URL there is no hint (never a guessed host)", () => {
  const html = finish(fakeExport(), {});
  assert.doesNotMatch(html, /rel="preconnect"/);
});

test("P38: preloads each Inter font the export emits, as a CORS font", () => {
  const html = finish(fakeExport());
  for (const f of FONTS) assert.ok(html.includes(`<link rel="preload" as="font" type="font/ttf" href="${f}" crossorigin />`), f);
  assert.doesNotMatch(html, /rel="preload"[^>]*icon/);
});

test("is idempotent: a second run adds nothing", () => {
  const out = fakeExport();
  const first = finish(out);
  assert.equal(finish(out), first);
});

/** Run the stamped sw.js's install handler against fake caches and return what each cache.add received. */
async function install(out) {
  const added = [];
  const listeners = {};
  class FakeRequest {
    constructor(url, init = {}) {
      this.url = url;
      this.cache = init.cache;
    }
  }
  const cache = { add: async (req) => void added.push(req) };
  const self = {
    addEventListener: (type, fn) => (listeners[type] = fn),
    skipWaiting: async () => undefined,
    location: { origin: "https://app.example.test" },
  };
  vm.runInNewContext(readFileSync(join(out, "sw.js"), "utf8"), { self, caches: { open: async () => cache }, Request: FakeRequest, URL, setTimeout });
  let done;
  listeners.install({ waitUntil: (p) => (done = p) });
  await done;
  return added;
}

test("P07: the install takes hashed files from the HTTP cache and reloads only the unhashed ones", async () => {
  const out = fakeExport();
  finish(out);
  const added = await install(out);
  const byUrl = new Map(added.map((r) => (typeof r === "string" ? [r, "default"] : [r.url, r.cache])));
  assert.equal(byUrl.get("/"), "reload");
  assert.equal(byUrl.get(ENTRY), "default");
  for (const f of FONTS) assert.equal(byUrl.get(f), "default", f);
  assert.equal(byUrl.get("/manifest.webmanifest"), "reload");
  assert.equal(byUrl.get("/sw-register.js"), "reload");
});

test("wide screens keep the phone layout: a 480px column, measured at 480 by the app", () => {
  const out = fakeExport();
  const html = finish(out);
  assert.ok(html.indexOf('src="/phone-frame.js"') < html.indexOf(ENTRY), "phone-frame.js must run before the app bundle");
  assert.match(html, /@media \(min-width: 481px\) \{[^}]*\}\s*body \{ max-width: 480px; margin: 0 auto;[^}]*transform: translateZ\(0\); \} \}/);

  // The bundle's Dimensions reads window.visualViewport: run the script against a 1440px desktop and a 360px phone.
  const src = readFileSync(join(out, "phone-frame.js"), "utf8");
  for (const [width, scale, expected] of [[1440, 1, 480], [360, 1, 360], [1440, 2, 240]]) {
    const real = { width, height: 900, scale, addEventListener() {}, removeEventListener() {} };
    const window = { visualViewport: real };
    vm.runInNewContext(src, { window });
    assert.equal(window.visualViewport.width, expected, `${width}@${scale}x`);
    assert.equal(window.visualViewport.height, 900);
  }
});
