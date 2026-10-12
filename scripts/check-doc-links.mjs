#!/usr/bin/env node
/**
 * Docs link guard — fails when anything in the repo points at a `docs/` file that does not exist.
 *
 * Two kinds of reference are checked:
 *   1. A repo-root path `docs/<…>.md` written anywhere (code comments, workflows, scripts, Markdown).
 *   2. A relative Markdown link `[text](./X.md)` / `(../docs/X.md#anchor)` inside a Markdown file,
 *      resolved from that file's folder (only when it resolves into `docs/` or to a root `*.md`).
 *
 * Paths holding a placeholder (`<date>`, `*`, `{…}`, `YYYY`) are templates, not links, and are skipped.
 *
 * The append-only ledgers in LEDGERS and everything under docs/archive/ are not checked: they are
 * historical records that cite reports as they existed when written, and git history recovers those
 * (`git log --all -- docs/<file>`). ROUTINE_OUTPUTS are files a routine writes on each run, so a
 * mention may come before the file. Everything else must point at a file that is on disk.
 *
 * Usage: node scripts/check-doc-links.mjs [repoRoot]
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const LEDGERS = new Set([
  "docs/KNOWN_BUGS.md",
  "docs/DESIGN-DEVIATIONS.md",
  "docs/REFACTOR-LEDGER.md",
  "docs/PLAY-STORE-SUBMISSION.md",
  "CHANGELOG.md",
]);

export const ROUTINE_OUTPUTS = new Set(["docs/doc-sync-report.md"]);

// Vendored trees carry their own links; docs/archive/ is frozen history like the ledgers; applied
// migrations cannot be edited without changing their checksum.
const SKIP_PREFIXES = [
  "packages/design/",
  "apps/website/site/",
  "node_modules/",
  "docs/archive/",
  "apps/api/prisma/migrations/",
  "scripts/check-doc-links.test.mjs", // its fixtures name missing docs on purpose
];
const SCANNED = /\.(md|mdx|ts|tsx|js|jsx|mjs|cjs|json|ya?ml|sh|tf)$/;
const PLACEHOLDER = /[<>*{}]|YYYY|\bdate\b/;

const ROOT_PATH = /(?<![\w./-])docs\/[\w./-]+?\.md\b/g;
const MD_LINK = /\]\(\s*<?([^)\s>]+?\.md)(?:#[^)\s]*)?>?\s*(?:"[^"]*")?\)/g;

function trackedFiles(root) {
  return execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
    .split("\0")
    .filter((f) => f && SCANNED.test(f) && !SKIP_PREFIXES.some((p) => f.startsWith(p)) && !LEDGERS.has(f));
}

/** @returns {{file: string, line: number, target: string}[]} */
export function findBrokenDocLinks(root = REPO_ROOT) {
  const broken = [];
  for (const file of trackedFiles(root)) {
    const abs = join(root, file);
    if (!existsSync(abs)) continue; // deleted in the working tree, not yet staged
    const lines = readFileSync(abs, "utf8").split("\n");
    lines.forEach((text, i) => {
      const targets = new Set();
      for (const m of text.matchAll(ROOT_PATH)) targets.add(m[0]);
      if (file.endsWith(".md")) {
        for (const m of text.matchAll(MD_LINK)) {
          const href = m[1];
          if (/^[a-z]+:/i.test(href) || href.startsWith("/")) continue;
          const rel = relative(root, resolve(dirname(abs), href)).split("\\").join("/");
          if (rel.startsWith("..")) continue;
          if (rel.startsWith("docs/") || !rel.includes("/")) {
            targets.add(normalize(rel).split("\\").join("/"));
          }
        }
      }
      for (const target of targets) {
        if (PLACEHOLDER.test(target) || ROUTINE_OUTPUTS.has(target)) continue;
        if (!existsSync(join(root, target))) broken.push({ file, line: i + 1, target });
      }
    });
  }
  return broken;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] ? resolve(process.argv[2]) : REPO_ROOT;
  const broken = findBrokenDocLinks(root);
  if (broken.length) {
    for (const b of broken) console.error(`${b.file}:${b.line} → ${b.target} (missing)`);
    console.error(`\n✖ ${broken.length} reference(s) to docs that do not exist.`);
    console.error("  Point them at the doc that replaced it, or drop the reference.");
    process.exit(1);
  }
  console.log("✓ every docs/ reference resolves");
}
