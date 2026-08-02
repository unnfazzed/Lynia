import { defineConfig } from "vitest/config";

// Unit tests for the admin console (the security-critical access gate above all). Node environment —
// these are pure-logic + injected-verifier tests with no DOM and no network. Component render tests
// (*.test.tsx) opt into jsdom per-file via a `// @vitest-environment jsdom` docblock so the pure-logic
// suite stays DOM-free by default, mirroring apps/merchant/vitest.config.ts.
export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  test: {
    include: ["app/**/*.test.ts", "app/**/*.test.tsx"],
    exclude: ["node_modules/**", ".next/**"],
    environment: "node",
  },
});
