/**
 * DS-composite resolver — the missing piece that let `RC.home` (and every screen whose mock renders
 * an opaque design-system composite like `<AppHome/>`) evade the structural guardrail. A mock file
 * often renders a component whose ENTIRE tree lives elsewhere: either a local helper in the same
 * mock file (`HomeBody`), or a design-system component under `packages/design/components/**`
 * (`AppHome`, registered in `_ds_manifest.json`). The raw-AST walkers (region locators, composition
 * reduce) previously stopped at such an element — an opaque leaf — so locators "could not anchor
 * sub-trees inside an opaque composite" and the screen was deferred with prose.
 *
 * `makeResolver(ts, opts)` returns `resolve(name, currentSourceFile) → renderExpressionNode | null`:
 *   1. a LOCAL component of that name in the current source file (function / const-arrow /
 *      member-assignment, same matching rules as normalize.mjs's findNamed);
 *   2. else, when `opts.designManifest` is on (mock side), the DS component registered under that
 *      name in `packages/design/_ds_manifest.json`, parsed from its `sourcePath` (cached).
 * The caller owns recursion guarding (a name stack) — the resolver is a pure lookup.
 *
 * READ-ONLY over packages/design (the design mirror is never edited — reverse-drift freeze).
 */
import { readFileSync } from "node:fs";
import { dirname, resolve as presolve } from "node:path";
import { fileURLToPath } from "node:url";
import { findNamedComponent, renderOfComponent } from "./normalize.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = presolve(HERE, "../../..");
const DESIGN = presolve(ROOT, "packages/design");

let manifestMap = null;
/** Map a DS component name → absolute source path, from the design package's own manifest. */
export function dsComponentPath(name) {
  if (!manifestMap) {
    const m = JSON.parse(readFileSync(presolve(DESIGN, "_ds_manifest.json"), "utf8"));
    manifestMap = new Map((m.components || []).map((c) => [c.name, presolve(DESIGN, c.sourcePath)]));
  }
  return manifestMap.get(name) ?? null;
}

/** Parse-cache for component source files (keyed by absolute path). */
const sfCache = new Map();
function parsedFile(ts, absPath) {
  let sf = sfCache.get(absPath);
  if (!sf) {
    const src = readFileSync(absPath, "utf8");
    sf = ts.createSourceFile(absPath, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    sfCache.set(absPath, sf);
  }
  return sf;
}

/**
 * Build a resolver for one walk.
 *   opts.designManifest  — also resolve names via the DS manifest (mock side; app side stays local).
 */
export function makeResolver(ts, opts = {}) {
  return function resolve(name, currentSf) {
    if (!/^[A-Z]/.test(name)) return null;
    // 1 — local component in the file the element appears in.
    if (currentSf) {
      const local = findNamedComponent(ts, currentSf, name);
      if (local) {
        const render = renderOfComponent(ts, local);
        if (render) return render;
      }
    }
    // 2 — design-system component from the manifest (mock side only).
    if (opts.designManifest) {
      const p = dsComponentPath(name);
      if (p) {
        const sf = parsedFile(ts, p);
        const fn = findNamedComponent(ts, sf, name);
        const render = fn ? renderOfComponent(ts, fn) : null;
        if (render) return render;
      }
    }
    return null;
  };
}
