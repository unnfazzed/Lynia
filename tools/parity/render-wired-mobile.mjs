#!/usr/bin/env node
/**
 * Render every WIRED mobile screen (a `kind:"mobile"` entry in app-targets.mjs) to a PNG in out/,
 * for the non-blocking parity-render CI evidence job (see .github/workflows/ci.yml). Pure evidence:
 * it produces app-side screenshots to attach to the PR — it does not compare or gate. Failures for
 * an individual screen are logged and skipped so one bad fixture can't sink the whole run.
 *
 *   node render-wired-mobile.mjs [--out out]
 */
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { APP_TARGETS } from "./app-targets.mjs";
import { renderMobileOne } from "./lib/mobile.mjs";
import { parseArgs } from "./lib/args.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const a = parseArgs(process.argv.slice(2));
const outDir = resolve(HERE, a.out || "out");
await mkdir(outDir, { recursive: true });

const mobile = Object.entries(APP_TARGETS).filter(([, t]) => t.kind === "mobile");
console.log(`render-wired-mobile: ${mobile.length} wired mobile screen(s) → ${outDir}`);

let ok = 0;
const failed = [];
for (const [key, t] of mobile) {
  const out = resolve(outDir, `app-${key}.png`);
  try {
    const res = await renderMobileOne({ component: t.component, fixture: t.fixture, mode: t.mode || "phone", out });
    if (res.ok) {
      ok++;
      console.log(`  ✓ ${key} → ${res.width}x${res.height}`);
    } else {
      failed.push(`${key}: ${String(res.error).slice(0, 120)}`);
      console.log(`  ✗ ${key}: ${String(res.error).slice(0, 120)}`);
    }
  } catch (e) {
    failed.push(`${key}: ${String(e).slice(0, 120)}`);
    console.log(`  ✗ ${key}: ${String(e).slice(0, 120)}`);
  }
}

console.log(`render-wired-mobile: ${ok}/${mobile.length} rendered, ${failed.length} failed.`);
// Evidence job is non-blocking; exit 0 as long as SOMETHING rendered so the artifact uploads.
process.exit(ok > 0 ? 0 : 1);
