/**
 * Jest config for the mobile app — extracted from package.json's `jest` key so the
 * lucide-react-native resolver workarounds below can carry a WHY comment (JSON can't).
 * Everything here is the jest-expo preset unchanged except the two moduleNameMapper entries.
 *
 * lucide-react-native ships a package `exports` map, and jest-resolve ENFORCES it — unlike Metro,
 * which runs with package `exports` resolution OFF in this app (see metro.config.js). That mismatch
 * breaks two paths jest must resolve:
 *
 *  1. The bare "lucide-react-native" barrel resolves through `exports` to the ESM `.mjs` build,
 *     which the jest transform pipeline chokes on. Map it to the CJS barrel build instead. (After
 *     the deep-import refactor, only the type-only `import type { LucideIcon }` in Icon.tsx still
 *     names the barrel — types are erased before resolution — but transitive code could import it
 *     at runtime, so this safety net stays.)
 *  2. Icon.tsx imports each glyph by its real file path (dist/cjs/icons/<name>.js) so Metro bundles
 *     only the 25 used icons instead of the whole set (Metro has no tree-shaking; a barrel import
 *     pulls every glyph). Those deep paths are NOT declared in `exports`, so jest refuses them
 *     ("Cannot find module"). Map the deep-icon subpath straight to the on-disk .js file, which
 *     bypasses exports enforcement (the mapped target is a path, not a bare specifier).
 *
 * transformIgnorePatterns keeps lucide-react-native (and the RN/Expo set) inside the babel transform
 * rather than treated as pre-built node_modules — carried over verbatim from the old package.json.
 *
 * The `.mjs` transform + `modulePaths` entries exist for ONE reason: the rendered-conformance
 * guardrail (src/parity/__tests__/rendered-conformance.test.tsx) mounts screens with the SAME
 * fixtures the screenshot lane uses (tools/parity/mobile/fixtures/*.mjs) instead of duplicating
 * their route tables in jest. Those fixtures live outside rootDir and are ESM:
 *   - jest-expo's transform key is `\.[jt]sx?$`, which does not match `.mjs`, so without an entry
 *     the fixture is executed untransformed and throws "Cannot use import statement outside a
 *     module". Same babel-jest/metro caller as the preset uses, so they compile identically.
 *   - a fixture importing `react` / `@tanstack/react-query` / `expo-secure-store` resolves from its
 *     own directory (tools/parity/…), which has no node_modules; `modulePaths` points that lookup
 *     at the mobile app's copy so the fixture and the screen share ONE React/QueryClient instance
 *     (two copies = "invalid hook call" / an invisible seeded cache), and so `jest.mock()` calls in
 *     the test resolve to the very module the fixture imports.
 * Both are additive: every path already inside rootDir resolves exactly as before.
 */
module.exports = {
  preset: "jest-expo",
  testMatch: ["**/__tests__/**/*.test.{ts,tsx}"],
  transformIgnorePatterns: [
    "node_modules/(?!.*(?:react-native|@react-native|expo|@expo|@unimodules|unimodules|native-base|react-navigation|@react-navigation|lucide-react-native|react-native-svg))",
  ],
  transform: {
    "^.+\\.mjs$": ["babel-jest", { caller: { name: "metro", bundler: "metro", platform: "ios" } }],
  },
  modulePaths: ["<rootDir>/node_modules"],
  moduleNameMapper: {
    // @sentry/react-native pulls in native modules jest-expo can't load; route it to a light mock
    // (init/captureException spies, identity wrap) so any test importing the app root stays green.
    "^@sentry/react-native$": "<rootDir>/__mocks__/@sentry/react-native.js",
    // react-native-webview registers a native view manager — same import-time hostility class as
    // Sentry's. The mock renders nothing; the KYC sheet tests drive its props directly.
    "^react-native-webview$": "<rootDir>/__mocks__/react-native-webview.js",
    "^lucide-react-native$": "<rootDir>/node_modules/lucide-react-native/dist/cjs/lucide-react-native.js",
    // Deep per-icon imports (see Icon.tsx) — map <name> straight to its CJS file, past exports gating.
    "^lucide-react-native/dist/cjs/icons/(.*)$":
      "<rootDir>/node_modules/lucide-react-native/dist/cjs/icons/$1.js",
  },
};
