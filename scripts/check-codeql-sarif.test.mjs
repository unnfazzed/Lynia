// Tests for scripts/check-codeql-sarif.mjs — run with: node --test scripts/check-codeql-sarif.test.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

function run(log) {
  const dir = mkdtempSync(join(tmpdir(), "codeql-sarif-"));
  temps.push(dir);
  writeFileSync(join(dir, "javascript.sarif"), JSON.stringify(log));
  try {
    return { code: 0, out: execFileSync("node", [SCRIPT, dir], { encoding: "utf8", env: { ...process.env, GITHUB_STEP_SUMMARY: "" } }) };
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
    execFileSync("node", [SCRIPT, dir], { stdio: "pipe" });
  } catch (e) {
    code = e.status;
  }
  assert.equal(code, 1);
});
