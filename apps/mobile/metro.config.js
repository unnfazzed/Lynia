/**
 * Metro on Expo SDK 52 resolves without package `exports` support
 * (unstable_enablePackageExports is off by default), but posthog-react-native
 * imports `@posthog/core/surveys`, a subpath that only exists via the exports
 * map. Map @posthog/core subpaths to their dist targets explicitly — scoped to
 * that one package rather than enabling exports resolution globally, which
 * changes resolution for the whole dependency tree.
 */
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Neither package exposes ./package.json through its exports map, so resolve
// each entry point and walk up to the package root (<root>/dist/index.js).
const posthogRNEntry = require.resolve("posthog-react-native", { paths: [__dirname] });
const posthogCoreEntry = require.resolve("@posthog/core", { paths: [path.dirname(posthogRNEntry)] });
const posthogCoreDir = path.dirname(path.dirname(posthogCoreEntry));

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const subpath = moduleName.match(/^@posthog\/core\/(.+)$/)?.[1];
  if (subpath) {
    // exports map shape: "./vendor/*" -> dist/vendor/*.js; others -> dist/<name>/index.js
    const target = subpath.startsWith("vendor/")
      ? path.join(posthogCoreDir, "dist", `${subpath}.js`)
      : path.join(posthogCoreDir, "dist", subpath, "index.js");
    return { type: "sourceFile", filePath: target };
  }
  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
