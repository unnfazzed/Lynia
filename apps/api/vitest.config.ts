import { defineConfig } from "vitest/config";

// Default (unit) test run — excludes DB integration specs (those need a live PostGIS).
export default defineConfig({
  test: {
    include: ["src/**/*.spec.ts"],
    exclude: ["src/**/*.int.spec.ts", "node_modules/**"],
    environment: "node",
    // Penalties are SUSPENDED by default in the app (common/penalties.ts); the suite pins them ON so every
    // existing penalty spec keeps exercising the real logic. penalties-suspended.spec.ts covers the off state.
    // Commission is 10% by default (owner 2026-10-12). The job-flow specs (offers, matching, dispatch) mock
    // only the reads their own logic makes, so the suite pins the rate OFF and the per-job wallet check is
    // covered where it's under test: commission-cover.spec.ts and the specs that stub the rate back on.
    env: { PENALTIES_SUSPENDED: "false", COMMISSION_RATE_PCT: "0" },
  },
});
