/**
 * Structural-snapshot guardrail engine (the 4th pixel-parity guardrail).
 *
 * For every codegen-ADOPTED screen it builds two normalized component trees and asserts they are
 * congruent:
 *   • EXPECTED — the MOCK component, parsed + normalized to shape (the design source of truth).
 *   • ACTUAL   — the committed `.view.tsx` the app renders, normalized the same way.
 * Both trees are produced by the TypeScript-API normalizer (normalize.mjs), so this runs in CI with
 * only `typescript` (a workspace dep) — no Babel, no downloaded vendor blob. Because the view is a
 * mechanical function of the mock (codegen), a green result is structural parity BY CONSTRUCTION; a
 * red one prints the exact divergent TREE-PATH — readable on a phone, no image required.
 *
 * Screens NOT in adopted.mjs are not visited — the guardrail no-ops for them (allowlist-driven, like
 * screen-inventory), so it only gates screens actually adopted via codegen.
 *
 * `ts` (the TypeScript module) is injected by the caller (the api spec `import ts from "typescript"`).
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { treeOfNamedComponent, treeOfViewFile, sexpr, diff } from "./normalize.mjs";
import { ADOPTED } from "./adopted.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");

/** Check one adopted spec → { key, ok, message, expected, actual, diff }. */
export function checkScreen(ts, spec) {
  const mockSrc = readFileSync(resolve(ROOT, spec.mockFile), "utf8");
  let expectedTree;
  try {
    expectedTree = treeOfNamedComponent(ts, mockSrc, spec.component);
  } catch (e) {
    return { key: spec.key, ok: false, message: `could not read mock ${spec.component} in ${spec.mockFile}: ${e.message}`, expected: null, actual: null, diff: String(e.message) };
  }

  let viewSrc;
  try {
    viewSrc = readFileSync(resolve(ROOT, spec.viewFile), "utf8");
  } catch {
    return { key: spec.key, ok: false, message: `generated view missing: ${spec.viewFile} (run: node tools/parity/codegen/cli.mjs gen ${spec.key})`, expected: sexpr(expectedTree), actual: null, diff: "view file not found" };
  }
  const actualTree = treeOfViewFile(ts, viewSrc);

  const d = diff(expectedTree, actualTree);
  return {
    key: spec.key,
    ok: !d,
    message: d
      ? `structural drift on ${spec.key} — the app view no longer matches the mock:\n  ${d}`
      : `structurally congruent (${sexpr(expectedTree)})`,
    expected: sexpr(expectedTree),
    actual: sexpr(actualTree),
    diff: d,
  };
}

export function checkAll(ts) {
  return ADOPTED.map((spec) => checkScreen(ts, spec));
}

export function formatResult(r) {
  return r.ok ? `✓ ${r.key} — ${r.message}` : `✗ ${r.key}\n${r.message}`;
}
