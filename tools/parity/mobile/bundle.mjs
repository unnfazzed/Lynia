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
const EMPTY_MODULES = [
  "expo-secure-store", "expo-notifications", "expo-linking", "expo-location", "expo-image-picker",
  "expo-image-manipulator", "expo-clipboard", "expo-web-browser", "expo-device", "expo-application",
  "expo-splash-screen", "expo-status-bar", "expo-task-manager", "expo-updates", "expo-font", "expo-asset",
  "expo-haptics", "posthog-react-native", "socket.io-client",
  "react-native-maps", "react-native-screens", "react-native-gesture-handler",
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
    "react-native": join(NM, "react-native-web"),
    react: join(NM, "react"),
    "react-dom": join(NM, "react-dom"),
    "react-native-safe-area-context": join(SHIMS, "safe-area-context.js"),
    "react-native-svg": join(SHIMS, "react-native-svg.js"),
    "expo-constants": join(SHIMS, "expo-constants.js"),
    "expo-router": join(SHIMS, "expo-router.js"),
    "@sentry/react-native": join(SHIMS, "sentry.js"),
    "@lynia/shared": join(SHARED_SRC, "index.ts"),
    "@lynia/shared/fixtures": join(SHARED_SRC, "fixtures.ts"),
  };
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
  const entry = `
    import * as React from "react";
    import { createRoot } from "react-dom/client";
    import Screen from ${JSON.stringify(o.component)};
    ${o.fixture ? `import * as Fixture from ${JSON.stringify(o.fixture)};` : `const Fixture = {};`}
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
