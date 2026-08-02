import path from "node:path";
import { defineConfig } from "vitest/config";

// Unit tests for the merchant tablet's auth/alarm/reconnect pure logic (E1) run under node —
// pure-logic + injected-transport tests with no DOM and no network, mirroring
// apps/admin/vitest.config.ts. `.test.tsx` files render components; they opt into jsdom
// individually with a `// @vitest-environment jsdom` docblock.
export default defineConfig({
  // tsconfig's "jsx": "preserve" is for Next's own SWC transform — esbuild needs telling
  // explicitly for `.tsx` test files, which Next never touches.
  esbuild: {
    jsx: "automatic",
  },
  resolve: {
    // Mirrors Next's `transpilePackages` — @lynia/shared has no built `dist/`, so resolve to
    // its TS source the same way the app itself does.
    alias: {
      "@lynia/shared": path.resolve(__dirname, "../../packages/shared/src"),
    },
  },
  test: {
    include: ["app/**/*.test.ts", "app/**/*.test.tsx"],
    exclude: ["node_modules/**", ".next/**"],
    environment: "node",
  },
});
