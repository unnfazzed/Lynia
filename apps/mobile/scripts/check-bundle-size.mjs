#!/usr/bin/env node
//
// check-bundle-size.mjs — per-PR JS bundle-size guardrail (docs/APP-SIZE.md).
//
// Measures an `expo export` output directory and compares it against apps/mobile/size-budget.json,
// FAILING (exit 1) when a measured size exceeds its budget. It is the "prevention" half of the
// app-size program: the DoorDash discipline that bundle growth must be INTENTIONAL, not accidental —
// every extra byte is metered mobile data for our users in Zimbabwe (download + OTA update both cost).
//
// WHY a plain Node ESM script with ZERO dependencies: it runs in CI before/without the app's own deps
// necessarily being importable, and a size checker must not itself add install/supply-chain weight.
//
// Usage:  node scripts/check-bundle-size.mjs <expo-export-output-dir>
//   (run from apps/mobile; the dir is whatever was passed to `expo export --output-dir`.)
//
// What it measures:
//   - androidExportTotalBytes  — total bytes of every file in the export dir (the whole JS payload:
//                                the bundle + all bundled assets/fonts/images).
//   - androidHermesBundleBytes — the Hermes bytecode bundle(s). Expo SDK 52 / RN 0.76 ship Hermes, so
//                                a release export emits `.hbc` under `_expo/static/js/android/`. The
//                                exact filename is a content hash, so we GLOB rather than hardcode a
//                                brittle path, and fall back to the largest `.js`/`.hbc` file anywhere
//                                if the layout ever changes (e.g. a plain-JS export).
//
// Budget semantics (calibration-safe): a budget of 0 or an absent key is REPORT-ONLY — the script
// prints the size report and exits 0. This keeps the guardrail inert until the orchestrator fills in
// real numbers, so wiring it up can never turn CI red on its own.

import { appendFileSync, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
// Resolve the budget relative to THIS file (apps/mobile/scripts/ -> apps/mobile/), so it works no
// matter what cwd the script is launched from.
const BUDGET_PATH = join(scriptDir, "..", "size-budget.json");

// Matches the Android JS bundle location in an `expo export` tree, tolerant of the leading path.
const ANDROID_JS_DIR = /(^|\/)_expo\/static\/js\/android\//;

/** Recursively collect every regular file under `dir` as { rel, size } (rel = posix path from dir). */
function walk(dir, base = dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(abs, base));
    } else if (entry.isFile()) {
      out.push({ rel: relative(base, abs).split(sep).join("/"), size: statSync(abs).size });
    }
    // symlinks / sockets / etc. are ignored — an export tree has none.
  }
  return out;
}

/** Coerce a budget value to a finite, non-negative number; anything else (null, "", NaN) -> 0. */
function toBudget(v) {
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Human-readable byte size, e.g. "4.56 MiB (4,784,721 bytes)". */
function human(bytes) {
  const units = ["B", "KiB", "MiB", "GiB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  const size = i === 0 ? String(v) : v.toFixed(2);
  return `${size} ${units[i]} (${bytes.toLocaleString("en-US")} bytes)`;
}

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

// --- resolve the export dir ------------------------------------------------------------------------
const exportDir = process.argv[2];
if (!exportDir) {
  console.error("usage: node scripts/check-bundle-size.mjs <expo-export-output-dir>");
  process.exit(2);
}
if (!existsSync(exportDir) || !statSync(exportDir).isDirectory()) {
  // The `expo export` step runs before this one and is not continue-on-error, so a missing dir here
  // means the export genuinely produced nothing — surface it loudly rather than silently pass.
  fail(`error: export directory not found or not a directory: ${exportDir}`);
}

const files = walk(exportDir);
if (files.length === 0) {
  fail(`error: export directory is empty: ${exportDir} (did \`expo export\` succeed?)`);
}

// --- measure ---------------------------------------------------------------------------------------
const totalBytes = files.reduce((a, f) => a + f.size, 0);

// Hermes bundle: prefer .hbc under _expo/static/js/android/; then any .js there; else largest anywhere.
const androidBundles = files.filter(
  (f) => ANDROID_JS_DIR.test(f.rel) && (f.rel.endsWith(".hbc") || f.rel.endsWith(".js")),
);
const androidHbc = androidBundles.filter((f) => f.rel.endsWith(".hbc"));
let hermesBytes = 0;
let hermesSource;
if (androidHbc.length > 0) {
  hermesBytes = androidHbc.reduce((a, f) => a + f.size, 0);
  hermesSource = `${androidHbc.length} .hbc file(s) under _expo/static/js/android/`;
} else if (androidBundles.length > 0) {
  hermesBytes = androidBundles.reduce((a, f) => a + f.size, 0);
  hermesSource = `${androidBundles.length} .js file(s) under _expo/static/js/android/ (no Hermes bytecode emitted)`;
} else {
  const candidates = files
    .filter((f) => f.rel.endsWith(".hbc") || f.rel.endsWith(".js"))
    .sort((a, b) => b.size - a.size);
  if (candidates.length > 0) {
    hermesBytes = candidates[0].size;
    hermesSource = `largest .js/.hbc file (fallback): ${candidates[0].rel}`;
  } else {
    hermesSource = "no .js/.hbc bundle found in the export";
  }
}

// --- budget ----------------------------------------------------------------------------------------
let budget = {};
if (existsSync(BUDGET_PATH)) {
  try {
    budget = JSON.parse(readFileSync(BUDGET_PATH, "utf8"));
  } catch (e) {
    console.warn(`⚠ could not parse ${BUDGET_PATH} (${e.message}) — treating all budgets as report-only.`);
  }
}

const metrics = [
  {
    label: "Android export total",
    current: totalBytes,
    budget: toBudget(budget.androidExportTotalBytes),
  },
  {
    label: "Hermes JS bundle",
    current: hermesBytes,
    budget: toBudget(budget.androidHermesBundleBytes),
    note: hermesSource,
  },
];

// --- report --------------------------------------------------------------------------------------
const over = [];
const logLines = [];
const mdRows = [];
for (const m of metrics) {
  let status;
  let headroom;
  if (m.budget <= 0) {
    status = "report-only (no budget set)";
    headroom = "—";
  } else if (m.current > m.budget) {
    over.push(m);
    status = "OVER BUDGET";
    const excess = m.current - m.budget;
    headroom = `over by ${human(excess)} (+${((excess / m.budget) * 100).toFixed(1)}%)`;
  } else {
    status = "ok";
    const room = m.budget - m.current;
    headroom = `${human(room)} free (${((room / m.budget) * 100).toFixed(1)}%)`;
  }
  logLines.push(
    `  ${m.label.padEnd(22)}: ${human(m.current)}` +
      (m.budget > 0 ? `  | budget ${human(m.budget)}  | headroom ${headroom}  | ${status}` : `  | ${status}`),
  );
  if (m.note) logLines.push(`  ${" ".repeat(22)}    └ measured from: ${m.note}`);
  mdRows.push(
    `| ${m.label} | ${human(m.current)} | ${m.budget > 0 ? human(m.budget) : "—"} | ${headroom} | ${
      m.budget <= 0 ? "report-only" : m.current > m.budget ? "❌" : "✅"
    } |`,
  );
}

const report = [
  "Android JS bundle size (apps/mobile, `expo export --platform android`)",
  "──────────────────────────────────────────────────────────────────────",
  ...logLines,
].join("\n");
console.log(report);

// GitHub step summary (markdown) — only when running in Actions.
if (process.env.GITHUB_STEP_SUMMARY) {
  const md = [
    "### 📦 Android JS bundle size",
    "",
    "| Metric | Current | Budget | Headroom | Status |",
    "|---|---:|---:|---:|:--:|",
    ...mdRows,
    "",
    // Escape for the `_..._` italic span on GitHub: backslashes FIRST (so a `\` already in the path
    // can't turn a later `\_` into an ambiguous sequence — CodeQL js/incomplete-sanitization), then
    // underscores so a path like `_expo/...` can't close the span early.
    `_Hermes bundle measured from: ${hermesSource.replace(/\\/g, "\\\\").replace(/_/g, "\\_")}._`,
    over.length > 0
      ? "\n> ❌ **Over budget.** Bundle growth must be **intentional** (DoorDash app-size discipline). If this increase is legitimate, raise the relevant number in `apps/mobile/size-budget.json` **in this PR** with a one-sentence justification in the PR description; otherwise find what grew and trim it. See `docs/APP-SIZE.md`."
      : "",
    "",
  ].join("\n");
  try {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${md}\n`);
  } catch {
    /* summary is best-effort — never let it break the check */
  }
}

// --- verdict -------------------------------------------------------------------------------------
if (over.length > 0) {
  console.error(
    "\n::error title=Mobile JS bundle over budget::Android bundle exceeds apps/mobile/size-budget.json — see the job log and docs/APP-SIZE.md.",
  );
  console.error(
    [
      "",
      "The Android JS bundle is OVER budget:",
      ...over.map((m) => `  • ${m.label}: ${human(m.current)} > budget ${human(m.budget)}`),
      "",
      "DoorDash app-size principle: growth must be INTENTIONAL. App download size and OTA",
      "update size are a real cost to users on metered mobile data (our users are in Zimbabwe).",
      "This guardrail exists so a size increase is a deliberate, reviewed decision — not an accident.",
      "",
      "If this increase is LEGITIMATE, raise the relevant number in apps/mobile/size-budget.json",
      "IN THE SAME PR, with one sentence of justification in the PR description.",
      "If it is NOT expected, find what grew — a new dependency, a large bundled asset, or a barrel",
      "import that defeated tree-shaking — and trim it. See docs/APP-SIZE.md.",
    ].join("\n"),
  );
  process.exit(1);
}

console.log(
  over.length === 0 && metrics.every((m) => m.budget <= 0)
    ? "\nAll metrics report-only (size-budget.json not yet calibrated) — not failing."
    : "\nWithin budget.",
);
