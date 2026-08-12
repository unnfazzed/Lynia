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
import { treeOfNamedComponent, treeOfViewFile, treeOfMockFragment, mockCompositionTree, containerCompositionTree, sexpr, diff } from "./normalize.mjs";
import { expandAdopted, regionScreens } from "./adopted.mjs";
import { makeResolver } from "./composites.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");

/** Check one adopted spec → { key, ok, message, expected, actual, diff }. Handles both a whole-screen
 *  view (`≡ named mock component`) and a REGION fragment (`≡ the mock's located sub-tree`). */
export function checkScreen(ts, spec) {
  const mockSrc = readFileSync(resolve(ROOT, spec.mockFile), "utf8");
  let expectedTree;
  try {
    expectedTree = spec.isFragment
      ? treeOfMockFragment(ts, mockSrc, spec.mockComponent, spec.locator)
      : treeOfNamedComponent(ts, mockSrc, spec.component);
  } catch (e) {
    const what = spec.isFragment ? `mock fragment ${spec.mockComponent}#${spec.region}` : `mock ${spec.component}`;
    return { key: spec.key, screen: spec.screen ?? spec.key, state: spec.state ?? null, region: spec.region ?? null, ok: false, message: `could not read ${what} in ${spec.mockFile}: ${e.message}`, expected: null, actual: null, diff: String(e.message) };
  }

  let viewSrc;
  try {
    viewSrc = readFileSync(resolve(ROOT, spec.viewFile), "utf8");
  } catch {
    return { key: spec.key, screen: spec.screen ?? spec.key, state: spec.state ?? null, region: spec.region ?? null, ok: false, message: `generated view missing: ${spec.viewFile} (run: node tools/parity/codegen/cli.mjs gen ${spec.key})`, expected: sexpr(expectedTree), actual: null, diff: "view file not found" };
  }
  const actualTree = treeOfViewFile(ts, viewSrc);

  const d = diff(expectedTree, actualTree);
  const label = spec.region ? `${spec.key} (${spec.screen} · region ${spec.region})` : spec.state ? `${spec.key} (${spec.screen} · ${spec.state})` : spec.key;
  return {
    key: spec.key,
    screen: spec.screen ?? spec.key,
    state: spec.state ?? null,
    region: spec.region ?? null,
    ok: !d,
    message: d
      ? `structural drift on ${label} — the app view no longer matches the mock:\n  ${d}`
      : `structurally congruent (${sexpr(expectedTree)})`,
    expected: sexpr(expectedTree),
    actual: sexpr(actualTree),
    diff: d,
  };
}

/**
 * Composition check for a region-adopted screen: the container must MOUNT the region fragment
 * components in the mock's region composition order/nesting. Both the mock and the container reduce to
 * a region-anchor tree (scaffold + REGION leaves); a mismatch (missing / reordered / re-nested region)
 * prints a readable tree-path diff. This verifies ASSEMBLY, complementing the per-region congruence.
 */
export function checkComposition(ts, entry) {
  const key = `${entry.key} · composition`;
  let expectedTree, actualTree;
  try {
    const mockSrc = readFileSync(resolve(ROOT, entry.mockFile), "utf8");
    // Mock-side resolver: local helpers + DS-manifest composites, so regions can anchor inside an
    // `<AppHome/>`-style composite (the wall that kept RC.home's class deferred).
    expectedTree = mockCompositionTree(ts, mockSrc, entry.mockComponent, entry.regions, makeResolver(ts, { designManifest: true }));
  } catch (e) {
    return { key, screen: entry.key, state: null, region: "∴composition", ok: false, message: `could not build mock composition for ${entry.key}: ${e.message}`, expected: null, actual: null, diff: String(e.message), composition: true };
  }
  try {
    const containerSrc = readFileSync(resolve(ROOT, entry.container), "utf8");
    // Container-side resolver: LOCAL helpers only (an app screen's own sub-components, e.g. home.tsx's
    // RestaurantsRail) — imported RN components stay opaque and match regions by componentName.
    actualTree = containerCompositionTree(ts, containerSrc, entry.regions, makeResolver(ts, { designManifest: false }));
  } catch (e) {
    return { key, screen: entry.key, state: null, region: "∴composition", ok: false, message: `could not build container composition for ${entry.container}: ${e.message}`, expected: sexpr(expectedTree), actual: null, diff: String(e.message), composition: true };
  }
  const d = diff(expectedTree, actualTree);
  return {
    key,
    screen: entry.key,
    state: null,
    region: "∴composition",
    ok: !d,
    composition: true,
    message: d
      ? `composition drift on ${entry.key} — the container no longer mounts the region fragments in the mock's order/nesting:\n  ${d}\n    mock:      ${sexpr(expectedTree)}\n    container: ${sexpr(actualTree)}`
      : `composition congruent (${sexpr(expectedTree)})`,
    expected: sexpr(expectedTree),
    actual: sexpr(actualTree),
    diff: d,
  };
}

/**
 * Check every ADOPTED view — one per single-view screen, one per adopted STATE of a multi-state screen,
 * one per REGION of a region-adopted screen — plus one COMPOSITION check per region-adopted screen.
 */
export function checkAll(ts) {
  const perView = expandAdopted().map((spec) => checkScreen(ts, spec));
  const perComposition = regionScreens().map((entry) => checkComposition(ts, entry));
  return [...perView, ...perComposition];
}

export function formatResult(r) {
  return r.ok ? `✓ ${r.key} — ${r.message}` : `✗ ${r.key}\n${r.message}`;
}
