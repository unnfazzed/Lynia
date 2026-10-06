// Web-only resolution for the customer web build (`EXPO_PUBLIC_LYNIA_WEB=1 expo export --platform web`,
// docs/plans/2026-10-06-customer-web-app-plan.md). Android and iOS never reach this file: metro.config.js
// only calls it when `platform === "web"`.
//
// 1. react-native-web lives in tools/web-runtime, OUTSIDE the pnpm workspace. Adding it to apps/mobile
//    gives expo-image, expo-router, expo-system-ui and react-native-maps a new peer, pnpm renames their
//    install folders, and the Android OTA fingerprint (which hashes those paths) moves. So resolve it from
//    there, and resolve its own `react` / `react-dom` back to apps/mobile's single copy.
// 2. expo-secure-store is an empty module on web, so sign-in could never be saved. Redirect it to a
//    browser-storage shim with the same API (./secure-store-web.js).
// 3. react-native-maps has no web version and imports native-only internals. Redirect it to
//    ./react-native-maps-web.js (a placeholder until phase 2's Google Maps JavaScript map).
const path = require("path");

const runtimeDir = path.resolve(__dirname, "../../../tools/web-runtime");
const runtimeAnchor = path.join(runtimeDir, "package.json");
const appAnchor = path.resolve(__dirname, "../package.json");
const secureStoreShim = path.join(__dirname, "secure-store-web.js");
const mapsShim = path.join(__dirname, "react-native-maps-web.js");

const isRnw = (name) => name === "react-native-web" || name.startsWith("react-native-web/");
const isReact = (name) => /^(react|react-dom)(\/|$)/.test(name);

/** A Metro resolution for `moduleName` on web, or null to fall through to the normal resolver. */
function resolve(context, moduleName, platform) {
  if (moduleName === "expo-secure-store") return { type: "sourceFile", filePath: secureStoreShim };
  if (moduleName === "react-native-maps") return { type: "sourceFile", filePath: mapsShim };
  // Expo's own web alias (react-native → react-native-web) only works when react-native-web resolves
  // from the project, so mirror it here.
  if (moduleName === "react-native" || moduleName === "react-native/index") {
    return context.resolveRequest({ ...context, originModulePath: runtimeAnchor }, "react-native-web", platform);
  }
  if (moduleName === "react-native/Libraries/Image/resolveAssetSource") {
    return context.resolveRequest({ ...context, originModulePath: appAnchor }, "expo-asset/build/resolveAssetSource", platform);
  }
  if (isRnw(moduleName)) return context.resolveRequest({ ...context, originModulePath: runtimeAnchor }, moduleName, platform);
  if (isReact(moduleName) && context.originModulePath.startsWith(runtimeDir + path.sep)) {
    return context.resolveRequest({ ...context, originModulePath: appAnchor }, moduleName, platform);
  }
  return null;
}

module.exports = { resolve, runtimeDir };
