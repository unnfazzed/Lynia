#!/usr/bin/env node
//
// subset-fonts.mjs — regenerates the committed, self-hosted Inter subset assets
// (apps/mobile/assets/fonts/Inter-*-subset.ttf) from the full-charset TTFs the
// `@expo-google-fonts/inter` devDependency ships.
//
// This is a DEV-TIME tool, not a build step: the generated .ttf files are committed to the repo
// like any other asset (RN/Hermes loads native .ttf directly — there's no runtime transform), so
// CI/`expo export` never needs Python or fonttools. Re-run this manually whenever:
//   - Inter is upgraded to a new @expo-google-fonts/inter version (glyph shapes/hinting may change)
//   - font-safe-ranges.mjs's ranges change (e.g. widening for a newly-needed script)
//
// Requires Python 3 + fonttools on PATH (`pip install fonttools`) — NOT vendored into the JS
// dependency tree; check-bundle-size.mjs's "measure with zero added deps" rationale doesn't apply
// here since this script never runs in CI, only on a developer/routine machine regenerating assets.
//
// Usage (from apps/mobile): node scripts/subset-fonts.mjs
import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { toPyftsubsetArg } from "./font-safe-ranges.mjs";

const require = createRequire(import.meta.url);
const scriptDir = dirname(fileURLToPath(import.meta.url));
const mobileDir = join(scriptDir, "..");
const outDir = join(mobileDir, "assets", "fonts");

const WEIGHTS = [
  { key: "400Regular", out: "Inter-400Regular-subset.ttf" },
  { key: "600SemiBold", out: "Inter-600SemiBold-subset.ttf" },
  { key: "700Bold", out: "Inter-700Bold-subset.ttf" },
];

function findPython() {
  for (const bin of ["python3", "python"]) {
    try {
      execFileSync(bin, ["-c", "import fontTools"], { stdio: "ignore" });
      return bin;
    } catch {
      // try the next candidate
    }
  }
  console.error("subset-fonts: fontTools not found. Install it with `pip install fonttools` and re-run.");
  process.exit(1);
}

const python = findPython();
const unicodes = toPyftsubsetArg();

let totalBefore = 0;
let totalAfter = 0;
for (const { key, out } of WEIGHTS) {
  const src = require.resolve(`@expo-google-fonts/inter/${key}/Inter_${key}.ttf`);
  const dest = join(outDir, out);
  execFileSync(python, [
    "-m",
    "fontTools.subset",
    src,
    `--output-file=${dest}`,
    `--unicodes=${unicodes}`,
    "--no-hinting",
  ]);
  if (!existsSync(dest)) {
    console.error(`subset-fonts: expected output ${dest} was not written`);
    process.exit(1);
  }
  const before = statSync(src).size;
  const after = statSync(dest).size;
  totalBefore += before;
  totalAfter += after;
  console.log(`${key}: ${before} -> ${after} bytes (-${(100 * (1 - after / before)).toFixed(1)}%)`);
}
console.log(`total: ${totalBefore} -> ${totalAfter} bytes (-${(100 * (1 - totalAfter / totalBefore)).toFixed(1)}%)`);
