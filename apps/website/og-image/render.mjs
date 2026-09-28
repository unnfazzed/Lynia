#!/usr/bin/env node
// Renders og-image.html to ../site/assets/og-image.png at exactly 1200×630 (Open Graph size).
// Uses the screenshot lane's Playwright loader (tools/parity/lib/browser.mjs).
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadPlaywright, resolveChromium } from "../../../tools/parity/lib/browser.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] || join(here, "../site/assets/og-image.png");
const pw = await loadPlaywright();
const chromium = pw.chromium ?? pw.default?.chromium;
const executablePath = resolveChromium() || undefined;
const browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(join(here, "og-image.html")).href);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1200, height: 630 } });
await browser.close();
console.log(`wrote ${out}`);
