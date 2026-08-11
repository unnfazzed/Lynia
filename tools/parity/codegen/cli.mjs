#!/usr/bin/env node
/**
 * mock→RN codegen CLI.
 *
 *   node tools/parity/codegen/cli.mjs gen <key> [--stdout]   generate one adopted screen's view
 *   node tools/parity/codegen/cli.mjs gen-all                (re)generate every adopted screen
 *   node tools/parity/codegen/cli.mjs check                  run the structural-snapshot check (CLI mirror of the CI spec)
 *
 * `gen`/`gen-all` write the `.view.tsx` files; the committed file IS the machine output, so a drift
 * between mock and app reddens the structural-snapshot guardrail until the view is regenerated.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { emitView } from "./emit.mjs";
import { expandAdopted, deferredStates, findAdopted } from "./adopted.mjs";
import { checkAll, formatResult } from "./snapshot.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");

function gen(spec, toStdout) {
  const { code, report } = emitView(spec);
  if (toStdout) { process.stdout.write(code); return report; }
  const outPath = resolve(ROOT, spec.viewFile);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, code);
  const resid = report.residualVar?.length || 0;
  console.log(`✓ ${spec.key} → ${spec.viewFile}  (clean ${report.clean}, transform ${report.transform}, dropped ${report.dropped}, unresolved ${report.unresolved.length}, residual ${resid})`);
  return report;
}

const [cmd, arg] = process.argv.slice(2);

if (cmd === "gen") {
  const spec = findAdopted(arg);
  if (!spec) { console.error(`no adopted view "${arg}". Known: ${expandAdopted().map((s) => s.key).join(", ")}`); process.exit(1); }
  gen(spec, process.argv.includes("--stdout"));
} else if (cmd === "gen-all") {
  for (const spec of expandAdopted()) gen(spec, false);
} else if (cmd === "check") {
  const results = checkAll(ts);
  // Group per SCREEN so a multi-state screen reports each state's congruence under one heading.
  const byScreen = new Map();
  for (const r of results) {
    if (!byScreen.has(r.screen)) byScreen.set(r.screen, []);
    byScreen.get(r.screen).push(r);
  }
  const deferred = deferredStates();
  let bad = 0;
  for (const [screen, rs] of byScreen) {
    const multi = rs.length > 1 || rs.some((r) => r.state) || deferred.some((d) => d.screen === screen);
    if (multi) {
      console.log(`\n${screen} — multi-state screen (${rs.length} adopted state${rs.length === 1 ? "" : "s"}):`);
      for (const r of rs) {
        console.log("  " + formatResult({ ...r, key: r.state ? `${r.state}` : r.key }).replace(/\n/g, "\n  "));
        if (!r.ok) bad++;
      }
      for (const d of deferred.filter((x) => x.screen === screen)) {
        console.log(`  ⊘ ${d.state} (${d.key}) — DEFERRED: ${d.reason}`);
      }
    } else {
      for (const r of rs) {
        console.log(formatResult(r));
        if (!r.ok) bad++;
      }
    }
  }
  console.log(`\n${results.length - bad}/${results.length} adopted state-views structurally congruent; ${deferred.length} state(s) deferred.`);
  process.exit(bad ? 1 : 0);
} else {
  console.log("usage: cli.mjs gen <key> [--stdout] | gen-all | check");
  process.exit(1);
}
