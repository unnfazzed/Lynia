#!/usr/bin/env node
/**
 * Generate the mock-side screen inventory (screens.generated.json) from the design's own gallery
 * data — never hand-typed, so a future design export can regenerate it. We eval the two plain-script
 * data files (`r-gallery-data.js` → window.RGD, `gallery-map.js` → window.GMAP) in a VM sandbox and
 * flatten window.GMAP into one row per screen. Admin pages (7) come from the fixed list in
 * gallery.jsx. Run: `node gen-manifest.mjs`.
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import vm from "node:vm";

const HERE = dirname(fileURLToPath(import.meta.url));
const JOURNEY = resolve(HERE, "../../packages/design/explorations/journey");
const RESTAURANTS = resolve(HERE, "../../packages/design/explorations/restaurants");

// Admin console pages (from gallery.jsx ADMIN array) — desktop, screenshot at 1440×900.
const ADMIN = [
  ["index.html", "Overview dashboard", "/"],
  ["orders.html", "Orders — monitor & detail", "/orders"],
  ["riders.html", "Riders — directory & profile", "/riders"],
  ["customers.html", "Customers — directory & profile", "/customers"],
  ["cash.html", "Cash & settlements", "/cash"],
  ["kyc.html", "KYC — queue & review", "/kyc"],
  ["issues.html", "Issues — disputes", "/issues"],
];

const ctx = { window: {}, location: { search: "" }, document: {} };
vm.createContext(ctx);
for (const f of [`${RESTAURANTS}/r-gallery-data.js`, `${JOURNEY}/gallery-map.js`]) {
  vm.runInContext(await readFile(f, "utf8"), ctx, { filename: f });
}
const GMAP = ctx.window.GMAP;
if (!GMAP) throw new Error("window.GMAP not produced — check gallery-map.js load");

const rows = [];
const seen = new Map();
function push(row) {
  if (seen.has(row.key)) {
    seen.get(row.key).dupeOf = (seen.get(row.key).dupeOf || 0) + 1;
    return;
  }
  seen.set(row.key, row);
  rows.push(row);
}

for (const [category, bands] of [["customer", GMAP.CUSTOMER], ["rider", GMAP.RIDER], ["merchant", GMAP.MERCHANT]]) {
  for (const [band, , tiles] of bands || []) {
    for (const [src, id, title, tag] of tiles || []) {
      push({
        key: `${src}.${id}`,
        category,
        band,
        src,
        id,
        title,
        tag: tag || "",
        mode: src === "RM" ? "tablet" : "phone",
      });
    }
  }
}
for (const [page, title, route] of ADMIN) {
  push({ key: `ADMIN.${page}`, category: "admin", band: "Admin console", src: "ADMIN", id: page, title, tag: "", mode: "admin", route });
}

const out = {
  generatedFrom: "packages/design/explorations/journey/gallery-map.js + restaurants/r-gallery-data.js + gallery.jsx ADMIN",
  count: rows.length,
  byCategory: rows.reduce((a, r) => ((a[r.category] = (a[r.category] || 0) + 1), a), {}),
  screens: rows,
};
const dest = resolve(HERE, "screens.generated.json");
await writeFile(dest, JSON.stringify(out, null, 2) + "\n");
console.log(`wrote ${dest}: ${rows.length} screens`, out.byCategory);
