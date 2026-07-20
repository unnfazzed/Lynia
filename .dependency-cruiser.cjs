/**
 * dependency-cruiser config (roadmap 3.2) — import-boundary + cycle enforcement in CI.
 *
 * Both rules are `error`, but CI runs with a **baseline** (.dependency-cruiser-known-violations.json)
 * and `--ignore-known`, so the build fails only on a NEW violation — the ratchet that prevents fresh
 * drift while the pre-existing knots are worked down. Regenerate the baseline (it shrinks) as they clear:
 *   pnpm depcruise:baseline
 *
 * Known at introduction:
 *  - `no-circular` (5): the mobile api/client.ts ↔ auth/session.ts ↔ api/orders.ts ↔ telemetry/rum.ts
 *    knot the client hooks-indirection works around at runtime; RF-10's session split untangles it.
 *  - `mobile-ui-no-api` (14): UI components (src/ui/*.tsx) that still fetch directly (→ src/api/*),
 *    the data-in-view coupling roadmap 3.5's screen decomposition removes.
 *
 * A blanket "no cross-feature import" rule is deliberately NOT added: legitimate seams exist (orders →
 * WalletService for the completion-tx commission debit, admin → wallet), and DOMA's "talk via the public
 * service" is a judgement a blunt path rule would false-positive on. Add narrower rules as real drift appears.
 */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      comment: "Circular imports make load order fragile and break tree-shaking. Introduce a seam/interface instead.",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "mobile-ui-no-api",
      comment:
        "The mobile design-system layer (src/ui) should not FETCH from the network layer (src/api) — UI takes props, data flows in via src/query. Only VALUE imports count (a type-only import of an API response shape to type a prop isn't fetching, so it's excluded — roadmap 3.5 refinement). Remaining baselined value-couplings ratchet to 0 as screens decompose; NEW ones fail CI.",
      severity: "error",
      from: { path: "^apps/mobile/src/ui/" },
      to: { path: "^apps/mobile/src/api/", dependencyTypesNot: ["type-only"] },
    },
    {
      name: "no-orphans",
      comment: "An unreferenced module is usually dead code or a missing wire-up. Info-level so it surfaces without blocking.",
      severity: "info",
      from: { orphan: true, pathNot: ["\\.d\\.ts$", "(^|/)index\\.[jt]sx?$", "\\.(spec|test)\\.[jt]sx?$", "\\.config\\.[jt]s$"] },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.base.json" },
    tsPreCompilationDeps: true,
    exclude: { path: "node_modules|\\.(spec|test)\\.[jt]sx?$|/dist/" },
  },
};
