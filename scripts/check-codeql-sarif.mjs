#!/usr/bin/env node
/**
 * The CodeQL gate for a private repo without GitHub Code Security (owner 2026-10-16).
 *
 * The repo went private, and code scanning on a private repo needs the paid Code Security add-on, so the
 * analyze step can no longer upload its results ("Code scanning is not enabled for this repository") and
 * the Security tab's alert check is gone. CodeQL still runs on every PR with `upload: never`; this script
 * reads the SARIF it writes and is the gate instead:
 *
 *   - every finding is listed in the job summary (and the SARIF is kept as a run artifact);
 *   - the job FAILS on any error-level finding (CodeQL's `error` level: its high-precision security
 *     results), the bar the owner chose. Warnings and notes are listed, never blocking.
 *
 * Usage: node scripts/check-codeql-sarif.mjs <dir-or-file> [...]
 */
import { appendFileSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** Every .sarif file under the given paths. */
export function sarifFiles(paths) {
  const out = [];
  for (const p of paths) {
    if (statSync(p).isDirectory()) {
      for (const f of readdirSync(p)) out.push(...sarifFiles([join(p, f)]));
    } else if (p.endsWith(".sarif")) {
      out.push(p);
    }
  }
  return out;
}

/** The findings in one SARIF log: level (the result's, else its rule's default, else "warning"), rule, location. */
export function findings(sarif) {
  const out = [];
  for (const run of sarif.runs ?? []) {
    const rules = new Map();
    for (const r of run.tool?.driver?.rules ?? []) rules.set(r.id, r);
    for (const ext of run.tool?.extensions ?? []) for (const r of ext.rules ?? []) rules.set(r.id, r);
    for (const res of run.results ?? []) {
      const rule = rules.get(res.ruleId) ?? (res.rule?.id ? rules.get(res.rule.id) : undefined);
      const level = res.level ?? rule?.defaultConfiguration?.level ?? "warning";
      const loc = res.locations?.[0]?.physicalLocation;
      const where = loc?.artifactLocation?.uri ? `${loc.artifactLocation.uri}:${loc.region?.startLine ?? "?"}` : "(no location)";
      out.push({ level, ruleId: res.ruleId ?? rule?.id ?? "?", where, message: res.message?.text ?? "" });
    }
  }
  return out;
}

function main(argv) {
  const files = sarifFiles(argv.length ? argv : ["sarif-results"]);
  if (files.length === 0) {
    console.error("check-codeql-sarif: no .sarif file found — did the analyze step write one?");
    return 1;
  }
  const all = files.flatMap((f) => findings(JSON.parse(readFileSync(f, "utf8"))));
  const blocking = all.filter((f) => f.level === "error");
  const lines = [
    `### CodeQL: ${all.length} finding(s), ${blocking.length} blocking (error-level)`,
    "",
    ...(all.length ? ["| Level | Rule | Where | Message |", "|---|---|---|---|"] : ["No findings."]),
    ...all.map((f) => `| ${f.level} | \`${f.ruleId}\` | \`${f.where}\` | ${f.message.replace(/\s+/g, " ").replace(/\|/g, "\\|").slice(0, 200)} |`),
  ];
  console.log(lines.join("\n"));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`);
  return blocking.length > 0 ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main(process.argv.slice(2)));
