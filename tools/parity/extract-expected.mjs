#!/usr/bin/env node
/**
 * Extract the RENDERED expectation from the design mocks — the expected side of the rendered
 * conformance guardrail (apps/mobile/src/parity/__tests__/rendered-conformance.test.tsx).
 *
 *   node extract-expected.mjs                 # every wired mobile key in app-targets.mjs
 *   node extract-expected.mjs --keys RC.home,LJ.otp
 *   node extract-expected.mjs --check         # regenerate into memory and diff (determinism gate)
 *
 * WHY this is a separate, locally-run step whose output is COMMITTED:
 *   the mock side only renders in a real browser (the design registries compile through
 *   @babel/standalone at load), and browser rendering is environment-sensitive — which is exactly
 *   why the parity-render CI job is `continue-on-error`. A guardrail that needs a browser cannot be
 *   the blocking gate. So the browser half runs here, offline, and commits a reviewable JSON; the
 *   blocking half (jest, no browser) reads that JSON. The determinism gate below is what keeps the
 *   committed file trustworthy: re-run `--check` and it must reproduce byte-for-byte.
 *
 * Determinism: Date and Math.random are stubbed in the page before any design script runs, so a
 * registry that formats "now" or shuffles sample data cannot churn the committed expectation.
 *
 * Chrome: the mocks draw a phone SIMULATION — `AppScreen` (packages/design/components/shell/
 * AppScreen.jsx) always renders a faux `StatusBar` (09:41 · 3G · 84%) and, when `tab` is set, the
 * root `TabBar`. Neither is drawn by the app SCREEN component: the status bar belongs to the OS and
 * the tab bar to `app/(tabs)/_layout.tsx`. Both are detected by the exact signature of those two DS
 * components and dropped — and recorded in `chromeDropped` so the drop is reviewable, never silent.
 *
 * Hand-maintained fields (`dynamic`, `extra`, `undrawn`, `note`) in an existing expected file are
 * CARRIED OVER on regeneration — the extractor owns the mock's shape, a human owns the escapes.
 */
import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { APP_TARGETS } from "./app-targets.mjs";
import { startDesignServer } from "./lib/design-server.mjs";
import { launch, contextDefaults } from "./lib/browser.mjs";
import { stubExternals } from "./lib/mock.mjs";
import { parseArgs } from "./lib/args.mjs";
import { collapse, flattenTexts, textGroups, roleCounts } from "./lib/rendered-tree.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const EXPECTED_DIR = resolve(HERE, "expected");
const INDEX_FILE = join(EXPECTED_DIR, "index.json");

/** The frozen clock every mock render sees. Any date the design formats is therefore stable. */
const FROZEN_EPOCH = Date.UTC(2026, 7, 10, 9, 41, 0);

/* ────────────────────────────── the in-page DOM walk ────────────────────────────── */
/**
 * Serialized into the page. Produces the RAW tree (roles + text); pruning/collapsing happens in node
 * with lib/rendered-tree.mjs, so both sides of the lane share one normalizer.
 */
function domWalkSource() {
  return `(() => {
    const IMAGE_TAGS = new Set(["img", "svg", "canvas", "picture", "video", "image-slot"]);
    const INPUT_TAGS = new Set(["input", "textarea", "select"]);
    const dropped = [];

    const norm = (s) => String(s || "").replace(/[\\u00a0\\u2007\\u202f]/g, " ").replace(/\\s+/g, " ").trim();

    function visible(el) {
      const cs = getComputedStyle(el);
      return cs.display !== "none" && cs.visibility !== "hidden";
    }

    /** Faux phone status bar (DS shell/StatusBar.jsx): 26px row of time · network · battery. */
    function isStatusBar(el, cs) {
      if (el.tagName.toLowerCase() !== "div") return false;
      if (cs.height !== "26px") return false;
      // Its three pieces are adjacent nodes with no separator, so textContent alone reads
      // "09:413G84%" — tokenize by child node instead.
      const parts = Array.from(el.childNodes).map((n) => norm(n.textContent)).filter(Boolean);
      if (parts.length < 2 || parts.length > 4) return false;
      const hasTime = parts.some((p) => /^\\d{1,2}:\\d{2}$/.test(p));
      const hasBattery = parts.some((p) => /^\\d{1,3}%$/.test(p));
      return hasTime && hasBattery;
    }

    /** Root tab bar (DS shell/TabBar.jsx): absolute, pinned to bottom, 1px top rule, z-index 20. */
    function isTabBar(el, cs) {
      return (
        el.tagName.toLowerCase() === "div" &&
        cs.position === "absolute" &&
        cs.bottom === "0px" &&
        cs.left === "0px" &&
        cs.right === "0px" &&
        cs.zIndex === "20" &&
        cs.display === "flex" &&
        cs.borderTopWidth === "1px"
      );
    }

    /** A text leaf: carries copy and contains no block-level or replaced descendant. */
    function isTextLeaf(el) {
      if (!norm(el.textContent)) return false;
      const kids = el.querySelectorAll("*");
      for (const k of kids) {
        const tag = k.tagName.toLowerCase();
        if (IMAGE_TAGS.has(tag) || INPUT_TAGS.has(tag)) return false;
        const d = getComputedStyle(k).display;
        if (d !== "inline" && d !== "contents") return false;
      }
      return true;
    }

    function walk(el) {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") return null;
      const tag = el.tagName.toLowerCase();

      if (isStatusBar(el, cs)) { dropped.push("status-bar: " + norm(el.textContent)); return null; }
      if (isTabBar(el, cs)) { dropped.push("tab-bar: " + norm(el.textContent)); return null; }

      if (INPUT_TAGS.has(tag)) {
        const t = norm(el.getAttribute("placeholder") || el.value || "");
        return t ? { role: "input", text: t } : { role: "input" };
      }
      if (IMAGE_TAGS.has(tag)) {
        // image-slot carries the design's own placeholder caption; keep it as the image's label so a
        // photo slot is distinguishable from an icon, but never as a text string to match copy on.
        const t = norm(el.getAttribute("placeholder") || el.getAttribute("alt") || "");
        return t ? { role: "image", text: t } : { role: "image" };
      }
      if (isTextLeaf(el)) return { role: "text", text: norm(el.textContent) };

      const children = [];
      for (const node of el.childNodes) {
        if (node.nodeType === 3) {
          const t = norm(node.nodeValue);
          if (t) children.push({ role: "text", text: t });
        } else if (node.nodeType === 1) {
          const c = walk(node);
          if (c) children.push(c);
        }
      }
      if (children.length === 0 && cs.backgroundImage !== "none") return { role: "image" };
      return { role: "container", children };
    }

    const root = document.getElementById("screen");
    const kids = [];
    for (const node of root.childNodes) {
      if (node.nodeType === 3) { const t = norm(node.nodeValue); if (t) kids.push({ role: "text", text: t }); }
      else if (node.nodeType === 1) { const c = walk(node); if (c) kids.push(c); }
    }
    return { tree: { role: "container", children: kids }, dropped };
  })()`;
}

/* ────────────────────────────── rendering ────────────────────────────── */

async function extractOne(page, origin, { src, id, mode }) {
  const u = new URL(origin + "/explorations/journey/__parity_harness.html");
  u.searchParams.set("src", src);
  u.searchParams.set("id", id);
  u.searchParams.set("mode", mode);
  await page.goto(u.toString(), { waitUntil: "load", timeout: 45000 });
  await page.waitForFunction(
    () => window.__PARITY_READY === true || typeof window.__PARITY_ERROR === "string",
    { timeout: 45000 },
  );
  const err = await page.evaluate(() => window.__PARITY_ERROR || null);
  if (err) throw new Error(err);
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(250);
  return page.evaluate(domWalkSource());
}

/** Build the committed record for one key, carrying over any hand-maintained escapes. */
function buildRecord(key, target, raw, previous) {
  const [src, ...rest] = key.split(".");
  const tree = collapse(raw.tree) || { role: "container", children: [] };
  const texts = flattenTexts(tree);
  return {
    key,
    src,
    id: rest.join("."),
    mode: target.mode || "phone",
    component: target.component,
    fixture: target.fixture,
    generator: "tools/parity/extract-expected.mjs",
    chromeDropped: raw.dropped,
    roleCounts: roleCounts(tree),
    texts: texts.map((t) => t.text),
    textPaths: texts.map((t) => t.path),
    groups: textGroups(tree),
    // Hand-maintained, preserved across regeneration (see the header).
    note: previous?.note ?? "",
    dynamic: previous?.dynamic ?? [],
    extra: previous?.extra ?? [],
    undrawn: previous?.undrawn ?? [],
    tree,
  };
}

function stable(obj) {
  return JSON.stringify(obj, null, 2) + "\n";
}

async function readPrevious(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return null;
  }
}

/** Load a committed expectation by key (used by the jest guardrail through a tiny CJS adapter). */
export async function loadExpected(key) {
  return JSON.parse(await readFile(join(EXPECTED_DIR, `${key}.json`), "utf8"));
}

export async function listExpectedKeys() {
  try {
    const files = await readdir(EXPECTED_DIR);
    return files.filter((f) => f.endsWith(".json") && f !== "index.json").map((f) => f.slice(0, -5)).sort();
  } catch {
    return [];
  }
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  const only = a.keys ? String(a.keys).split(",").map((s) => s.trim()).filter(Boolean) : null;
  const check = !!a.check;

  const targets = Object.entries(APP_TARGETS)
    .filter(([k, t]) => t.kind === "mobile" && (!only || only.includes(k)))
    .sort(([a1], [b1]) => (a1 < b1 ? -1 : a1 > b1 ? 1 : 0));

  if (targets.length === 0) {
    console.error("extract-expected: no matching wired mobile targets");
    process.exit(2);
  }

  await mkdir(EXPECTED_DIR, { recursive: true });
  const server = await startDesignServer();
  const browser = await launch();
  const ctx = await browser.newContext(
    contextDefaults({ viewport: { width: 1024, height: 900 }, deviceScaleFactor: 1 }),
  );
  await stubExternals(ctx);
  // Freeze the clock + randomness BEFORE any design script runs, so the extraction is reproducible.
  await ctx.addInitScript(`(() => {
    const FIXED = ${FROZEN_EPOCH};
    const RealDate = Date;
    function FrozenDate(...args) {
      if (args.length === 0) return new RealDate(FIXED);
      return new RealDate(...args);
    }
    FrozenDate.prototype = RealDate.prototype;
    FrozenDate.now = () => FIXED;
    FrozenDate.parse = RealDate.parse;
    FrozenDate.UTC = RealDate.UTC;
    globalThis.Date = FrozenDate;
    let seed = 0x2f6e2b1;
    Math.random = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
  })()`);
  const page = await ctx.newPage();

  const written = [];
  const drift = [];
  const failed = [];
  for (const [key, target] of targets) {
    const [src, ...rest] = key.split(".");
    const id = rest.join(".");
    const file = join(EXPECTED_DIR, `${key}.json`);
    const previous = await readPrevious(file);
    try {
      const raw = await extractOne(page, server.origin, { src, id, mode: target.mode || "phone" });
      const record = buildRecord(key, target, raw, previous);
      const body = stable(record);
      if (check) {
        const before = previous ? stable(previous) : null;
        if (before !== body) drift.push(key);
        console.log(`  ${before === body ? "=" : "≠"} ${key} (${record.texts.length} texts)`);
      } else {
        await writeFile(file, body);
        written.push(key);
        console.log(`  ✓ ${key} → ${record.texts.length} texts, ${record.groups.length} groups`);
      }
    } catch (e) {
      failed.push(`${key}: ${String(e?.message || e).slice(0, 200)}`);
      console.log(`  ✗ ${key}: ${String(e?.message || e).slice(0, 200)}`);
    }
  }

  await browser.close();
  await server.close();

  if (!check) {
    const keys = await listExpectedKeys();
    const index = {
      generator: "tools/parity/extract-expected.mjs",
      note: "Committed mock-side expectations for the rendered-conformance guardrail. Regenerate with `node tools/parity/extract-expected.mjs`; verify with `--check`.",
      keys,
    };
    await writeFile(INDEX_FILE, stable(index));
  }

  if (failed.length) {
    console.error(`extract-expected: ${failed.length} screen(s) failed to render:\n  ${failed.join("\n  ")}`);
    process.exit(1);
  }
  if (check && drift.length) {
    console.error(`extract-expected --check: ${drift.length} key(s) drifted: ${drift.join(", ")}`);
    process.exit(1);
  }
  console.log(check ? `extract-expected --check: ${targets.length} key(s) reproduce exactly.` : `extract-expected: wrote ${written.length} expectation(s).`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await main();
}
