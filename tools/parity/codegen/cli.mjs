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
import { ADOPTED, findAdopted } from "./adopted.mjs";
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
  if (!spec) { console.error(`no adopted screen "${arg}". Known: ${ADOPTED.map((s) => s.key).join(", ")}`); process.exit(1); }
  gen(spec, process.argv.includes("--stdout"));
} else if (cmd === "gen-all") {
  for (const spec of ADOPTED) gen(spec, false);
} else if (cmd === "check") {
  const results = checkAll(ts);
  let bad = 0;
  for (const r of results) {
    console.log(formatResult(r));
    if (!r.ok) bad++;
  }
  console.log(`\n${results.length - bad}/${results.length} adopted screens structurally congruent.`);
  process.exit(bad ? 1 : 0);
} else {
  console.log("usage: cli.mjs gen <key> [--stdout] | gen-all | check");
  process.exit(1);
}
