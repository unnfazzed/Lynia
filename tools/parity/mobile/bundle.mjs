/**
 * Bundle one mobile screen for the browser with esbuild + react-native-web.
 *
 * The alias map is the whole trick:
 *   - react-native            → react-native-web (the RN primitives become DOM)
 *   - react / react-dom       → tools/parity's single copy, so the app's screen and rn-web share ONE
 *                               React instance (two copies = "invalid hook call")
 *   - safe-area / svg / expo* / sentry → the shims in ./shims
 *   - @lynia/shared           → its TS source (no prebuilt dist needed; esbuild compiles it)
 * lucide-react-native is left real — it draws through react-native-svg, which the svg shim maps to DOM.
 *
 * The generated entry mounts <Screen/>, optionally wrapped by a fixture's providers, and flips
 * window.__PARITY_READY after paint. A fixture that throws sets window.__PARITY_ERROR.
 */
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { createRequire } from "node:module";

const HERE = dirname(fileURLToPath(import.meta.url));
const PARITY = resolve(HERE, "..");
const REPO = resolve(PARITY, "../..");
const MOBILE_APP = join(REPO, "apps/mobile");
const SHARED_SRC = join(REPO, "packages/shared/src");
const NM = join(PARITY, "node_modules");
const SHIMS = join(HERE, "shims");

// Native-only modules with no bearing on a static screenshot → the generic empty shim.
// (expo-secure-store gets a real in-memory shim instead — fixtures seed device state through it.)
const EMPTY_MODULES = [
  "expo-linking", "expo-image-picker",
  "expo-clipboard", "expo-web-browser", "expo-device", "expo-application",
  "expo-splash-screen", "expo-updates", "expo-asset", "expo-file-system",
  "expo-haptics", "posthog-react-native",
  "react-native-screens", "react-native-gesture-handler",
  "@react-native-async-storage/async-storage",
];

/**
 * esbuild plugin: resolve lucide-react-native's per-icon deep imports
 * (`lucide-react-native/dist/cjs/icons/<name>`) straight to their .js files. The package `exports`
 * map doesn't expose that subpath, so esbuild (which honours exports) otherwise can't find them —
 * the same reason jest needs a moduleNameMapper for these (see apps/mobile/jest.config.js).
 */
function lucideDeepIconsPlugin() {
  const require = createRequire(join(MOBILE_APP, "noop.js"));
  let iconsDir;
  try {
    // Resolve the barrel (it IS in `exports`), then derive dist/cjs/icons alongside it — the deep
    // icon paths themselves aren't resolvable through exports, which is the whole point of this plugin.
    iconsDir = join(dirname(require.resolve("lucide-react-native")), "icons");
  } catch {
    iconsDir = null;
  }
  return {
    name: "lucide-deep-icons",
    setup(b) {
      b.onResolve({ filter: /^lucide-react-native\/dist\/cjs\/icons\// }, (args) => {
        if (!iconsDir) return null;
        const name = args.path.split("/dist/cjs/icons/")[1].replace(/\.js$/, "");
        return { path: join(iconsDir, `${name}.js`) };
      });
    },
  };
}

export function aliasMap() {
  const a = {
    // Exact-subpath FIRST: the bare "react-native" alias below would otherwise rewrite this onto
    // react-native-web/Libraries/…, a path RNW does not ship (see the shim's own note).
    "react-native/Libraries/Image/resolveAssetSource": join(SHIMS, "resolve-asset-source.js"),
    "react-native": join(NM, "react-native-web"),
    react: join(NM, "react"),
    "react-dom": join(NM, "react-dom"),
    "react-native-safe-area-context": join(SHIMS, "safe-area-context.js"),
    "react-native-svg": join(SHIMS, "react-native-svg.js"),
    "expo-constants": join(SHIMS, "expo-constants.js"),
    "expo-router": join(SHIMS, "expo-router.js"),
    "expo-font": join(SHIMS, "expo-font.js"),
    "expo-status-bar": join(SHIMS, "expo-status-bar.js"),
    "expo-notifications": join(SHIMS, "expo-notifications.js"),
    "expo-task-manager": join(SHIMS, "expo-task-manager.js"),
    "expo-location": join(SHIMS, "expo-location.js"),
    "react-native-maps": join(SHIMS, "react-native-maps.js"),
    "expo-image": join(SHIMS, "expo-image.js"),
    "expo-image-manipulator": join(SHIMS, "expo-image-manipulator.js"),
    "socket.io-client": join(SHIMS, "socket-io.js"),
    "@sentry/react-native": join(SHIMS, "sentry.js"),
    "expo-secure-store": join(SHIMS, "expo-secure-store.js"),
    "@lynia/shared": join(SHARED_SRC, "index.ts"),
    "@lynia/shared/fixtures": join(SHARED_SRC, "fixtures.ts"),
    // Boot-graph entries (MOB-BOOT-03-SIB-2): without these exact-subpath aliases, esbuild appends
    // the subpath to the "@lynia/shared" FILE alias above ("…/index.ts/tokens") and dies "not a dir".
    "@lynia/shared/tokens": join(SHARED_SRC, "tokens-entry.ts"),
    "@lynia/shared/restaurants-order": join(SHARED_SRC, "restaurants-order.ts"),
  };
  // react-query is pinned to the mobile app's copy so a fixture harness (tools/parity/mobile/fixtures)
  // and the screen share ONE QueryClient/context — otherwise the fixture's Provider and the screen's
  // useQuery resolve to different module instances and the seeded cache is invisible to the screen.
  try {
    const reqM = createRequire(join(MOBILE_APP, "noop.js"));
    a["@tanstack/react-query"] = dirname(reqM.resolve("@tanstack/react-query/package.json"));
  } catch {
    /* leave unaliased — esbuild will resolve it by walking up if present */
  }
  for (const m of EMPTY_MODULES) if (!a[m]) a[m] = join(SHIMS, "empty.js");
  return a;
}

/**
 * @param {object} o
 * @param {string} o.component absolute path to the screen's default-exported component (.tsx)
 * @param {string} [o.fixture] absolute path to a fixture module ({ wrap?, props? })
 * @returns {Promise<string>} the IIFE bundle source
 */
export async function bundleScreen(o) {
  // The FIXTURE is imported before the screen on purpose: ESM evaluates imports in source order, and
  // some app modules read their configuration at module-init time (src/config.ts reads
  // process.env.EXPO_PUBLIC_STORE_URL once). A fixture that stages such config must therefore run
  // before the screen's module graph initializes — which is also what _harness.mjs already promises
  // ("run at import, before the entry mounts the screen"). The jest rendered-conformance guardrail
  // requires its fixture first for the same reason; keeping the two lanes in the same order is what
  // stops them staging a screen differently.
  const entry = `
    import * as React from "react";
    import { createRoot } from "react-dom/client";
    import ${JSON.stringify(join(MOBILE_APP, "src/ui/fonts.ts"))}; // UIP-01: same applyInterToTextComponents() patch app/_layout.tsx installs before any screen mounts
    ${o.fixture ? `import * as Fixture from ${JSON.stringify(o.fixture)};` : `const Fixture = {};`}
    import Screen from ${JSON.stringify(o.component)};
    function Root() {
      const props = (Fixture.default && Fixture.default.props) || Fixture.props || {};
      const el = React.createElement(Screen, props);
      const wrap = (Fixture.default && Fixture.default.wrap) || Fixture.wrap;
      return wrap ? wrap(el) : el;
    }
    try {
      createRoot(document.getElementById("root")).render(React.createElement(Root));
      requestAnimationFrame(() => requestAnimationFrame(() => { window.__PARITY_READY = true; }));
    } catch (e) { window.__PARITY_ERROR = String((e && e.stack) || e); }
  `;

  const result = await build({
    stdin: { contents: entry, resolveDir: MOBILE_APP, loader: "tsx", sourcefile: "parity-entry.tsx" },
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    jsx: "automatic",
    absWorkingDir: MOBILE_APP,
    alias: aliasMap(),
    plugins: [lucideDeepIconsPlugin()],
    loader: { ".js": "jsx", ".ttf": "empty", ".png": "empty", ".woff2": "empty", ".woff": "empty" },
    define: {
      __DEV__: "true",
      "process.env.NODE_ENV": '"development"',
      "process.env.EXPO_OS": '"web"',
    },
    banner: {
      js: "var global=globalThis;var process=globalThis.process||{env:{NODE_ENV:'development'}};",
    },
    logLevel: "silent",
    logOverride: { "unsupported-dynamic-import": "silent" },
  });
  return result.outputFiles[0].text;
}
