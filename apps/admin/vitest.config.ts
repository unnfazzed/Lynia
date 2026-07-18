import { defineConfig } from "vitest/config";

// Unit tests for the admin console (the security-critical access gate above all). Node environment —
// these are pure-logic + injected-verifier tests with no DOM and no network.
export default defineConfig({
  test: {
    include: ["app/**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
    environment: "node",
  },
});
