import { defineConfig } from "vitest/config";

// Unit tests for the pure money/geo/ranking logic. Co-located `*.test.ts` next to each source
// file; these are excluded from the tsc build emit (see tsconfig.json "exclude").
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["node_modules/**", "dist/**"],
    environment: "node",
  },
});
