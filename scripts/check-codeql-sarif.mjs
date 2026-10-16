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
 *     results), the bar the owner chose. Warnings and notes are listed, never blocking;
 *   - a finding the owner reviewed and accepted is listed as `accepted`, never blocking. The list is
 *     `.github/codeql/accepted-findings.json` — rule + file + the reason it is safe — and stands in for
 *     "Dismiss" on the Security tab. An entry nothing matches any more is reported, so it can be removed.
 *
 * Usage: node scripts/check-codeql-sarif.mjs <dir-or-file> [...]
 */
import { appendFileSync, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
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

export const ACCEPTED_FILE = ".github/codeql/accepted-findings.json";

/** Whether an accepted-findings entry covers a finding: same rule, same file (any line — lines move). */
export function isAccepted(finding, accepted) {
  const file = finding.where.replace(/:[^:]*$/, "");
  return accepted.some((a) => a.ruleId === finding.ruleId && a.path === file);
}

/** The reviewed list, or [] when there is none. Each entry needs a rule, a path and a reason. */
export function readAccepted(path = ACCEPTED_FILE) {
  if (!existsSync(path)) return [];
  const list = JSON.parse(readFileSync(path, "utf8"));
  for (const a of list) {
    if (!a.ruleId || !a.path || !a.reason) throw new Error(`${path}: every entry needs ruleId, path and reason`);
  }
  return list;
}

function main(argv) {
  const files = sarifFiles(argv.length ? argv : ["sarif-results"]);
  if (files.length === 0) {
    console.error("check-codeql-sarif: no .sarif file found — did the analyze step write one?");
    return 1;
  }
  const accepted = readAccepted();
  const all = files
    .flatMap((f) => findings(JSON.parse(readFileSync(f, "utf8"))))
    .map((f) => (isAccepted(f, accepted) ? { ...f, level: `accepted (${f.level})` } : f));
  const blocking = all.filter((f) => f.level === "error");
  const unused = accepted.filter((a) => !all.some((f) => f.ruleId === a.ruleId && f.where.startsWith(`${a.path}:`)));
  const lines = [
    `### CodeQL: ${all.length} finding(s), ${blocking.length} blocking (error-level)`,
    "",
    ...(all.length ? ["| Level | Rule | Where | Message |", "|---|---|---|---|"] : ["No findings."]),
    ...all.map((f) => `| ${f.level} | \`${f.ruleId}\` | \`${f.where}\` | ${f.message.replace(/\s+/g, " ").replace(/\\/g, "\\\\").replace(/\|/g, "\\|").slice(0, 200)} |`),
    ...unused.map((a) => `\nAccepted entry no longer matched (remove it from ${ACCEPTED_FILE}): \`${a.ruleId}\` in \`${a.path}\``),
  ];
  console.log(lines.join("\n"));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`);
  return blocking.length > 0 ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main(process.argv.slice(2)));
