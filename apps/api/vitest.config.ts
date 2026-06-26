import { defineConfig } from "vitest/config";

// Default (unit) test run — excludes DB integration specs (those need a live PostGIS).
export default defineConfig({
  test: {
    include: ["src/**/*.spec.ts"],
    exclude: ["src/**/*.int.spec.ts", "node_modules/**"],
    environment: "node",
  },
});
