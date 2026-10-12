import { defineConfig } from "vitest/config";

// Default (unit) test run — excludes DB integration specs (those need a live PostGIS).
export default defineConfig({
  test: {
    include: ["src/**/*.spec.ts"],
    exclude: ["src/**/*.int.spec.ts", "node_modules/**"],
    environment: "node",
    // Penalties are SUSPENDED by default in the app (common/penalties.ts); the suite pins them ON so every
    // existing penalty spec keeps exercising the real logic. penalties-suspended.spec.ts covers the off state.
    env: { PENALTIES_SUSPENDED: "false" },
  },
});
