// Tests for scripts/check-doc-links.mjs — run with: node --test scripts/check-doc-links.test.mjs
// Each case builds a tiny git repo, writes references into it, and asserts what the guard reports.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, test } from "node:test";
import { REPO_ROOT, findBrokenDocLinks } from "./check-doc-links.mjs";

const temps = [];

function repo(files) {
  const root = mkdtempSync(join(tmpdir(), "check-doc-links-"));
  temps.push(root);
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), body);
  }
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["add", "-A"], { cwd: root });
  return root;
}

const targets = (root) => findBrokenDocLinks(root).map((b) => `${b.file} → ${b.target}`);

afterEach(() => {
  while (temps.length) rmSync(temps.pop(), { recursive: true, force: true });
});

test("the repo itself has no broken docs references", () => {
  assert.deepEqual(findBrokenDocLinks(REPO_ROOT), []);
});

test("a code comment pointing at a missing doc is reported", () => {
  const root = repo({ "docs/A.md": "# A\n", "src/x.ts": "// see docs/A.md and docs/GONE.md §2\n" });
  assert.deepEqual(targets(root), ["src/x.ts → docs/GONE.md"]);
});

test("relative Markdown links resolve from the file's folder", () => {
  const root = repo({
    "docs/A.md": "[ok](./B.md) [anchor](./B.md#x) [bad](./C.md)\n",
    "docs/B.md": "[up](../docs/A.md) [plan](plans/P.md)\n",
    "docs/plans/P.md": "[back](../A.md) [bad](../Z.md)\n",
  });
  assert.deepEqual(targets(root), ["docs/A.md → docs/C.md", "docs/plans/P.md → docs/Z.md"]);
});

test("templates, ledgers, the archive and nested docs/ folders are not reported", () => {
  const root = repo({
    "docs/KNOWN_BUGS.md": "see docs/OLD-REPORT.md\n",
    "docs/archive/R.md": "[gone](../GONE.md) docs/GONE.md\n",
    "docs/ROUTINES.md": "write docs/BUG-HUNT-<date>.md and docs/X-YYYY-MM-DD.md\n",
    "apps/mobile/docs/local.md": "# local\n",
    "src/y.ts": "// apps/mobile/docs/missing.md is not a repo-root docs/ path\n",
    "README.md": "[web](https://example.com/docs/GONE.md)\n",
  });
  assert.deepEqual(targets(root), []);
});
