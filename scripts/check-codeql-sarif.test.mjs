// Tests for scripts/check-codeql-sarif.mjs — run with: node --test scripts/check-codeql-sarif.test.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import { findings } from "./check-codeql-sarif.mjs";

const SCRIPT = new URL("./check-codeql-sarif.mjs", import.meta.url).pathname;
const temps = [];
afterEach(() => {
  for (const t of temps.splice(0)) rmSync(t, { recursive: true, force: true });
});

const sarif = (results, rules = []) => ({ runs: [{ tool: { driver: { rules } }, results }] });
const result = (ruleId, level) => ({
  ruleId,
  ...(level ? { level } : {}),
  message: { text: `${ruleId} found` },
  locations: [{ physicalLocation: { artifactLocation: { uri: "apps/api/src/x.ts" }, region: { startLine: 7 } } }],
});

// Runs the gate from a scratch repo root, so only an accepted list written here applies.
function run(log, accepted) {
  const dir = mkdtempSync(join(tmpdir(), "codeql-sarif-"));
  temps.push(dir);
  writeFileSync(join(dir, "javascript.sarif"), JSON.stringify(log));
  if (accepted) {
    mkdirSync(join(dir, ".github/codeql"), { recursive: true });
    writeFileSync(join(dir, ".github/codeql/accepted-findings.json"), JSON.stringify(accepted));
  }
  try {
    return { code: 0, out: execFileSync("node", [SCRIPT, dir], { cwd: dir, encoding: "utf8", env: { ...process.env, GITHUB_STEP_SUMMARY: "" } }) };
  } catch (e) {
    return { code: e.status, out: String(e.stdout) };
  }
}

test("no findings passes", () => {
  const r = run(sarif([]));
  assert.equal(r.code, 0);
  assert.match(r.out, /0 finding\(s\), 0 blocking/);
});

test("an error-level finding fails the job and is listed with its location", () => {
  const r = run(sarif([result("js/sql-injection", "error")]));
  assert.equal(r.code, 1);
  assert.match(r.out, /js\/sql-injection/);
  assert.match(r.out, /apps\/api\/src\/x\.ts:7/);
});

test("warnings and notes are listed, never blocking", () => {
  const r = run(sarif([result("js/a", "warning"), result("js/b", "note")]));
  assert.equal(r.code, 0);
  assert.match(r.out, /2 finding\(s\), 0 blocking/);
});

test("a result without a level takes its rule's default level", () => {
  const rules = [{ id: "js/xss", defaultConfiguration: { level: "error" } }];
  assert.deepEqual(
    findings(sarif([result("js/xss")], rules)).map((f) => f.level),
    ["error"],
  );
  assert.equal(run(sarif([result("js/xss")], rules)).code, 1);
});

test("no SARIF file at all fails rather than passing silently", () => {
  const dir = mkdtempSync(join(tmpdir(), "codeql-sarif-"));
  temps.push(dir);
  let code = 0;
  try {
    execFileSync("node", [SCRIPT, dir], { cwd: dir, stdio: "pipe" });
  } catch (e) {
    code = e.status;
  }
  assert.equal(code, 1);
});

test("an accepted finding (same rule, same file, any line) is listed but never blocks", () => {
  const accepted = [{ ruleId: "js/sql-injection", path: "apps/api/src/x.ts", reason: "reviewed: not reachable" }];
  const r = run(sarif([result("js/sql-injection", "error")]), accepted);
  assert.equal(r.code, 0);
  assert.match(r.out, /accepted \(error\)/);
});

test("acceptance is per rule and per file: a new rule in the same file still blocks", () => {
  const accepted = [{ ruleId: "js/sql-injection", path: "apps/api/src/x.ts", reason: "reviewed" }];
  assert.equal(run(sarif([result("js/xss", "error")]), accepted).code, 1);
});

test("an accepted entry nothing matches any more is reported for removal", () => {
  const accepted = [{ ruleId: "js/gone", path: "apps/api/src/old.ts", reason: "reviewed" }];
  const r = run(sarif([]), accepted);
  assert.equal(r.code, 0);
  assert.match(r.out, /no longer matched.*js\/gone/);
});

test("an accepted entry without a reason is refused", () => {
  const r = run(sarif([]), [{ ruleId: "js/x", path: "a.ts" }]);
  assert.notEqual(r.code, 0);
});
