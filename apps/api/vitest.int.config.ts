import { defineConfig } from "vitest/config";

// Integration tests — require DATABASE_URL pointing at a live PostGIS instance.
export default defineConfig({
  test: {
    include: ["src/**/*.int.spec.ts"],
    environment: "node",
    testTimeout: 20000,
    hookTimeout: 20000,
    fileParallelism: false,
  },
});
