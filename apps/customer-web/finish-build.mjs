#!/usr/bin/env node
// Finishes apps/mobile's web export for app.lyniago.com (docs/CUSTOMER-WEB.md):
//   1. copies public/ (Add to Home Screen manifest + icons, _headers) into the export, and
//   2. adds the iPhone Home Screen tags and a safe-area viewport to index.html (owner decision W5).
// Usage: node apps/customer-web/finish-build.mjs <export dir>. Idempotent; fails loudly if Expo's
// index.html no longer has the tags it edits, so a template change can't silently drop them.
import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
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

if (!html.includes(MARK)) {
  // viewport-fit=cover lets the app's safe-area insets (notch, home bar) reach the page.
  const viewport = /<meta name="viewport"[^>]*>/;
  if (!viewport.test(html)) throw new Error("index.html has no viewport meta tag");
  html = html.replace(viewport, '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />');

  const head = [
    MARK,
    '<meta name="theme-color" content="#00B14F" />',
    '<meta name="description" content="Parcels and food across town." />',
    '<link rel="manifest" href="/manifest.webmanifest" />',
    '<link rel="apple-touch-icon" href="/apple-touch-icon.png" />',
    '<meta name="apple-mobile-web-app-capable" content="yes" />',
    '<meta name="mobile-web-app-capable" content="yes" />',
    '<meta name="apple-mobile-web-app-title" content="LyniaGo" />',
    '<meta name="apple-mobile-web-app-status-bar-style" content="default" />',
  ].join("\n    ");
  if (!html.includes("</head>")) throw new Error("index.html has no </head>");
  html = html.replace("</head>", `    ${head}\n  </head>`);
  writeFileSync(indexPath, html);
}
console.log(`finish-build: ${out} ready for app.lyniago.com`);
