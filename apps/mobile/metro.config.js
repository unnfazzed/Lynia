/**
 * Metro on Expo SDK 52 resolves without package `exports` support
 * (unstable_enablePackageExports is off by default), but posthog-react-native
 * imports `@posthog/core/surveys`, a subpath that only exists via the exports
 * map. Map @posthog/core subpaths to their dist targets explicitly — scoped to
 * that one package rather than enabling exports resolution globally, which
 * changes resolution for the whole dependency tree.
 *
 * Separately, zod v4's classic entry point (`zod/v4/classic/external.{js,cjs}` AND
 * `zod/v4/core/index.{js,cjs}` — both reached via `packages/shared/src/contracts.ts`'s
 * `import { z } from "zod"`) each do `export * as locales from "../locales/index.js"`
 * unconditionally — ~872 KB raw source of 50-language error-message tables that Metro's
 * non-package-exports resolution can't tree-shake, and that the app has zero production
 * consumers for (`z.locales` is never read anywhere; the default English messages come from a
 * separate direct `en.js` import, left untouched). Redirect just that one deep relative import to
 * an empty stub, scoped to zod's own `classic/external.{js,cjs}`/`core/index.{js,cjs}` as the
 * importer so no other package's identically-shaped relative import is affected.
 */
// getSentryExpoConfig is a drop-in for expo's getDefaultConfig that also wires the Sentry Metro
// serializer (debug-id → source-map upload during EAS build). It returns the same config object, so
// the posthog subpath resolver below applies unchanged. Sentry stays inert at runtime without a DSN.
const { getSentryExpoConfig } = require("@sentry/react-native/metro");
const path = require("path");

const config = getSentryExpoConfig(__dirname);

// Neither package exposes ./package.json through its exports map, so resolve
// each entry point and walk up to the package root (<root>/dist/index.js).
const posthogRNEntry = require.resolve("posthog-react-native", { paths: [__dirname] });
const posthogCoreEntry = require.resolve("@posthog/core", { paths: [path.dirname(posthogRNEntry)] });
const posthogCoreDir = path.dirname(path.dirname(posthogCoreEntry));

const zodLocalesRedirect = require("./metro-shims/zod-locales-redirect");

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
  if (zodLocalesRedirect.shouldRedirect(moduleName, context.originModulePath)) {
    return { type: "sourceFile", filePath: zodLocalesRedirect.stubPath };
  }
  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
