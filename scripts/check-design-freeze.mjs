#!/usr/bin/env node
/**
 * Pixel-parity GUARDRAIL — reverse-drift freeze (CLAUDE.md "Pixel parity": *never edit
 * `packages/design/` to match the app*). The design package mirrors the design tool and is the
 * source of truth; when the app and the mock disagree, the app changes. The one sanctioned way to
 * record a difference is a user-approved entry in `docs/DESIGN-DEVIATIONS.md`.
 *
 * This FAILS a PR whose diff touches `packages/design/**` UNLESS the same PR also modifies
 * `docs/DESIGN-DEVIATIONS.md` (the ledger) — forcing any design-side change to be a deliberate,
 * logged decision rather than a quiet "fix the design to match the code" edit.
 *
 * Changed-file list, in priority order:
 *   1. CLI args (each arg is a path)                    — for local use / tests
 *   2. stdin (newline-separated)                        — the CI wiring: `git diff … | node this`
 *   3. `git diff --name-only "$BASE_REF...HEAD"`         — fallback (BASE_REF env, default origin/main)
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const DESIGN_PREFIX = "packages/design/";
const LEDGER = "docs/DESIGN-DEVIATIONS.md";

function fromStdin() {
  try {
    // fd 0; when nothing is piped this throws (EAGAIN/ENXIO) and we fall through.
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function changedFiles() {
  const args = process.argv.slice(2).filter(Boolean);
  if (args.length) return args;

  if (!process.stdin.isTTY) {
    const piped = fromStdin().trim();
    if (piped) return piped.split(/\r?\n/).filter(Boolean);
  }

  const base = process.env.BASE_REF || "origin/main";
  try {
    // execFileSync (no shell): `base` reaches git as a single literal argument, so shell
    // metacharacters in an attacker-controlled BASE_REF can't inject commands (CodeQL js/indirect-command-line).
    const out = execFileSync("git", ["diff", "--name-only", `${base}...HEAD`], { encoding: "utf8" });
    return out.trim().split(/\r?\n/).filter(Boolean);
  } catch (e) {
    console.error(`check-design-freeze: could not compute changed files (base=${base}): ${e.message}`);
    // Fail closed: if we cannot prove the diff is clean, do not green the gate.
    process.exit(2);
  }
}

const files = changedFiles();
const designEdits = files.filter((f) => f.startsWith(DESIGN_PREFIX));
const ledgerTouched = files.includes(LEDGER);

if (designEdits.length === 0) {
  console.log("check-design-freeze: no packages/design/** changes — OK.");
  process.exit(0);
}

if (ledgerTouched) {
  console.log(
    `check-design-freeze: ${designEdits.length} packages/design/** file(s) changed WITH a ${LEDGER} update — OK (logged deviation).`,
  );
  process.exit(0);
}

console.error(
  "::error::Reverse-drift freeze: this PR edits packages/design/** but does not update " +
    `${LEDGER}. The design package is the SOURCE OF TRUTH — never edit it to match the app. If a mock ` +
    "is genuinely wrong, log a user-approved entry in the deviations ledger IN THIS PR and report it " +
    "upstream. Otherwise change the app to match the mock, not the reverse.\nDesign files touched:\n" +
    designEdits.map((f) => `  - ${f}`).join("\n"),
);
process.exit(1);
