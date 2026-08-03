#!/usr/bin/env node
//
// check-font-charset.mjs — regression guard for the subsetted self-hosted Inter fonts (A-O13 /
// LC-A05, docs/APP-SIZE.md). The committed assets in apps/mobile/assets/fonts/ only carry glyphs
// for the Unicode ranges in font-safe-ranges.mjs (Latin script + common symbols/punctuation/emoji;
// deliberately NOT Cyrillic/Greek/Vietnamese-extensions/CJK — confirmed unused).
//
// Scans every literal non-ASCII character in apps/mobile/app + apps/mobile/src source files and
// FAILS if any codepoint falls outside the safe ranges — that would mean a new UI string uses a
// character the shipped font can't render (a tofu box on-device), silently, unless caught here.
//
// Zero dependencies (same rationale as check-bundle-size.mjs): this runs on every `pnpm lint`.
//
// Usage (from apps/mobile): node scripts/check-font-charset.mjs
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { isSafeCodepoint } from "./font-safe-ranges.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const mobileDir = join(scriptDir, "..");
const SCAN_DIRS = ["app", "src"].map((d) => join(mobileDir, d));
const SCAN_EXTS = new Set([".ts", ".tsx"]);

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "__tests__" || entry.name === "node_modules") continue;
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(abs));
    } else if (entry.isFile() && SCAN_EXTS.has(extname(entry.name))) {
      out.push(abs);
    }
  }
  return out;
}

const offenders = new Map(); // codepoint -> Set of "relPath:line"

for (const dir of SCAN_DIRS) {
  if (!statSync(dir, { throwIfNoEntry: false })) continue;
  for (const file of walk(dir)) {
    const text = readFileSync(file, "utf8");
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      for (const ch of lines[i]) {
        const cp = ch.codePointAt(0);
        if (cp > 0x7f && !isSafeCodepoint(cp)) {
          const key = cp;
          const loc = `${relative(mobileDir, file)}:${i + 1}`;
          if (!offenders.has(key)) offenders.set(key, new Set());
          offenders.get(key).add(loc);
        }
      }
    }
  }
}

if (offenders.size > 0) {
  console.error("check-font-charset: found character(s) outside the self-hosted Inter subset's safe ranges:");
  for (const [cp, locs] of offenders) {
    const char = String.fromCodePoint(cp);
    console.error(`  U+${cp.toString(16).toUpperCase().padStart(4, "0")} (${JSON.stringify(char)}) — ${[...locs].join(", ")}`);
  }
  console.error(
    "\nEither remove/replace the character, or widen apps/mobile/scripts/font-safe-ranges.mjs and " +
      "re-run `node scripts/subset-fonts.mjs` to regenerate the committed font assets, then re-run this check.",
  );
  process.exit(1);
}

console.log("check-font-charset: OK — every non-ASCII character in app/ + src/ is inside the shipped font's safe ranges.");
