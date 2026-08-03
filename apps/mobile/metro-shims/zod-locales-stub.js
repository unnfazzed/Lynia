// Redirect target for zod's `export * as locales from "../locales/index.js"` (see metro.config.js).
// Deliberately empty: the app never reads `z.locales` (grep-confirmed), so the real target — 50
// language error-message tables, ~872 KB raw source — has zero production consumers and would
// otherwise ride into the Hermes bundle unconditionally via `contracts.ts`'s `import { z } from
// "zod"`. An empty ES module keeps `z.locales` a valid (empty) namespace object instead of a
// resolution error.
export {};
