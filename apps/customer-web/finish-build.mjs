#!/usr/bin/env node
// Finishes apps/mobile's web export for app.lyniago.com (docs/CUSTOMER-WEB.md):
//   1. copies public/ (Add to Home Screen manifest + icons, _headers) into the export, and
//   2. adds the iPhone Home Screen tags and a safe-area viewport to index.html (owner decision W5), and
//   3. loads public/ios-viewport.js, which stops iPhone Safari zooming in when a text field is focused, and
//   4. lets text fields shrink to their row (min-width: 0). A browser <input> keeps a built-in minimum width
//      (about 20 characters) that react-native-web's flex: 1 can't shrink, so the phone field ran ~45px past a
//      320px screen and focusing it slid the whole page sideways. Native TextInputs have no such minimum.
//   5. registers the offline shell (public/sw.js, via sw-register.js) and stamps it with this export's build id
//      and the files its page loads, so each deploy installs a worker that caches that deploy.
//   6. warms the API connection (preconnect + dns-prefetch to EXPO_PUBLIC_API_URL's origin, the same variable
//      the export was built with) while the bundle downloads and evaluates (P27), and preloads the Inter fonts
//      so Home's text doesn't wait for the bundle to ask for them (P38).
// Usage: EXPO_PUBLIC_API_URL=<api base> node apps/customer-web/finish-build.mjs <export dir>.
// Idempotent; fails loudly if Expo's index.html no longer has the tags it edits, so a template change can't
// silently drop them. Tests: node --test apps/customer-web/finish-build.test.mjs
import { createHash } from "node:crypto";
import { cpSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2];
if (!out) {
  console.error("usage: finish-build.mjs <export dir>");
  process.exit(2);
}

cpSync(join(here, "public"), out, { recursive: true });

const indexPath = join(out, "index.html");
let html = readFileSync(indexPath, "utf8");
const MARK = "<!-- lyniago-customer-web -->";

const assetsDir = join(out, "assets");
const assetFiles = existsSync(assetsDir)
  ? readdirSync(assetsDir, { recursive: true, withFileTypes: true })
      .filter((d) => d.isFile())
      .map((d) => `/${relative(out, join(d.parentPath, d.name)).split(sep).join("/")}`)
  : [];

// The API is another origin, so its first request paid DNS + TCP + TLS only after the whole bundle had
// evaluated. `crossorigin`: apiFetch's requests are CORS, which use the anonymous connection pool.
const apiUrl = process.env.EXPO_PUBLIC_API_URL;
const apiOrigin = apiUrl ? new URL(apiUrl).origin : null;
if (!apiOrigin) console.warn("finish-build: EXPO_PUBLIC_API_URL is not set; no API preconnect");
const apiHints = apiOrigin ? [`<link rel="preconnect" href="${apiOrigin}" crossorigin />`, `<link rel="dns-prefetch" href="${apiOrigin}" />`] : [];
// expo-font loads these from the bundle (src/ui/fonts.ts), i.e. only after it has evaluated. Fonts are
// fetched in CORS mode, so the preload needs `crossorigin` to be reused rather than fetched twice.
const fontPreloads = assetFiles
  .filter((p) => /\/Inter-[^/]*\.ttf$/.test(p))
  .sort()
  .map((p) => `<link rel="preload" as="font" type="font/ttf" href="${p}" crossorigin />`);

if (!html.includes(MARK)) {
  // viewport-fit=cover lets the app's safe-area insets (notch, home bar) reach the page.
  const viewport = /<meta name="viewport"[^>]*>/;
  if (!viewport.test(html)) throw new Error("index.html has no viewport meta tag");
  html = html.replace(viewport, '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />');

  const head = [
    MARK,
    ...apiHints,
    ...fontPreloads,
    '<meta name="theme-color" content="#00B14F" />',
    '<meta name="description" content="Parcels and food across town." />',
    '<link rel="manifest" href="/manifest.webmanifest" />',
    '<link rel="apple-touch-icon" href="/apple-touch-icon.png" />',
    '<meta name="apple-mobile-web-app-capable" content="yes" />',
    '<meta name="mobile-web-app-capable" content="yes" />',
    '<meta name="apple-mobile-web-app-title" content="LyniaGo" />',
    '<meta name="apple-mobile-web-app-status-bar-style" content="default" />',
    '<script src="/ios-viewport.js"></script>',
    '<script src="/sw-register.js" defer></script>',
    '<style id="lyniago-web">input, textarea { min-width: 0; }</style>',
  ].join("\n    ");
  if (!html.includes("</head>")) throw new Error("index.html has no </head>");
  html = html.replace("</head>", `    ${head}\n  </head>`);
  writeFileSync(indexPath, html);
}
// The offline shell. cpSync above copied a fresh sw.js with its placeholders, so this runs every time.
// Precache what the page itself loads (the entry bundle, its CSS, the small scripts, the manifest + icons) and
// everything under assets/ (about 0.5 MB, mostly the three fonts the first paint waits on): the worker installs
// after the first load, so anything left to "save on first use" would already have been fetched and missed.
const swPath = join(out, "sw.js");
const sw = readFileSync(swPath, "utf8");
if (!sw.includes('"__LYNIA_BUILD__"') || !sw.includes('["__LYNIA_PRECACHE__"]')) throw new Error("sw.js lost its build placeholders");
const referenced = [...html.matchAll(/(?:src|href)="(\/[^"/][^"]*)"/g)].map((m) => m[1].split(/[?#]/)[0]);
const precache = [...new Set([...referenced, ...assetFiles, "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"])]
  .filter((p) => p !== "/sw.js" && existsSync(join(out, p)))
  .sort();
const build = createHash("sha256").update(html).digest("hex").slice(0, 16);
writeFileSync(
  swPath,
  sw.replace('"__LYNIA_BUILD__"', JSON.stringify(build)).replace('["__LYNIA_PRECACHE__"]', JSON.stringify(precache)),
);
console.log(`finish-build: offline shell ${build} precaches ${precache.length} files`);
console.log(`finish-build: ${out} ready for app.lyniago.com`);
