import { defineConfig } from "vitest/config";

// Unit tests for the merchant tablet's auth/alarm/reconnect pure logic (E1). Node environment —
// these are pure-logic + injected-transport tests with no DOM and no network, mirroring
// apps/admin/vitest.config.ts.
export default defineConfig({
  test: {
    include: ["app/**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
    environment: "node",
  },
});
