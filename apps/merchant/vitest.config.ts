import path from "node:path";
import { defineConfig } from "vitest/config";

// Unit tests for the merchant tablet's auth/alarm/reconnect pure logic (E1). Node environment —
// these are pure-logic + injected-transport tests with no DOM and no network, mirroring
// apps/admin/vitest.config.ts. Component render tests (*.test.tsx) opt into jsdom per-file via a
// `// @vitest-environment jsdom` docblock so the pure-logic suite stays DOM-free by default.
// esbuild's automatic JSX runtime is needed because tsconfig's `"jsx": "preserve"` (Next's own SWC
// compiler injects the runtime at build time) leaves plain esbuild otherwise defaulting to the
// classic transform, which needs `React` in scope in every source file under test.
export default defineConfig({
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
