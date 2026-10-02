// Pure matching logic for metro.config.js's Sentry browser-only redirect (MOB-BOOT-03-SIB-1),
// split out so it can be unit tested without instantiating the full Sentry/Expo Metro config —
// same seam as ./zod-locales-redirect.
//
// `@sentry/react-native` → `@sentry/react` → `@sentry/browser`, whose index eagerly requires
// `@sentry-internal/replay` (133 KB), `@sentry-internal/feedback` (48 KB) and
// `@sentry-internal/replay-canvas` (14 KB) — browser session-replay and feedback-widget code that
// cannot execute on a phone, evaluated at module load on EVERY launch because `initSentry()` must
// arm crash handlers before any app code runs. Redirect those three packages to a stub that
// exports integration-shaped no-ops (see ./sentry-browser-stub.js).
//
// `@sentry-internal/browser-utils` is deliberately NOT redirected: the RN SDK's default
// `breadcrumbsIntegration` (and the fetch transport fallback) call its instrumentation handlers at
// runtime on-device — it is live code, not browser-only dead weight.
const path = require("path");

const stubPath = path.join(__dirname, "sentry-browser-stub.js");

const STUBBED_PACKAGES = new Set([
  "@sentry-internal/replay",
  "@sentry-internal/replay-canvas",
  "@sentry-internal/feedback",
]);

// Scoped to Sentry's own packages as the importer, so a future direct app import (or another
// package's) of these names still resolves the real module and fails loudly in review instead of
// silently getting a stub.
const importerPattern = new RegExp(`\\${path.sep}(@sentry|@sentry-internal)\\${path.sep}`);

// Bundle trim (owner decision 2026-10-02, docs/APP-SIZE.md "Levers applied" item 4): the package
// INDEXES of `@sentry/browser` and `@sentry/react` also re-export web-only modules that
// `@sentry/react-native` never imports (checked against every name its dist/js imports from
// `@sentry/browser`/`@sentry/react`): browser page-load tracing, JS self-profiling, the offline
// IndexedDB transport, the user-report dialog, web-worker / ReportingObserver / context-lines /
// GraphQL / Spotlight integrations, the LaunchDarkly / OpenFeature / Unleash / Statsig flag adapters,
// and the React-Router / TanStack-Router instrumentation. Those relative imports are redirected to the
// same callable-by-construction stub, but ONLY when the package index itself is the importer — a module
// that the RN SDK's live code reaches some other way still resolves the real file.
const STUBBED_BROWSER_INDEX_IMPORTS = new Set([
  "./tracing/browserTracingIntegration.js",
  "./transports/offline.js",
  "./profiling/integration.js",
  "./report-dialog.js",
  "./diagnose-sdk.js",
  "./utils/lazyLoadIntegration.js",
  "./integrations/reportingobserver.js",
  "./integrations/contextlines.js",
  "./integrations/graphqlClient.js",
  "./integrations/spotlight.js",
  "./integrations/webWorker.js",
  "./integrations/featureFlags/launchdarkly/integration.js",
  "./integrations/featureFlags/openfeature/integration.js",
  "./integrations/featureFlags/unleash/integration.js",
  "./integrations/featureFlags/statsig/integration.js",
]);
const STUBBED_REACT_INDEX_IMPORTS = new Set([
  "./reactrouterv3.js",
  "./tanstackrouter.js",
  "./reactrouter.js",
  "./reactrouterv6.js",
  "./reactrouterv7.js",
]);
// `@sentry-internal/browser-utils` itself stays real (see above), but its index also re-exports the
// web-vitals / long-task / element-timing / INP trackers, whose only consumer is the browser page-load
// tracing stubbed above. The instrumentation handlers that the RN SDK's breadcrumbs, httpClient and
// outgoing-request tracing call live in other files and still resolve for real.
const STUBBED_BROWSER_UTILS_INDEX_IMPORTS = new Set([
  "./metrics/browserMetrics.js",
  "./metrics/elementTiming.js",
  "./metrics/inp.js",
]);
const browserIndexPattern = new RegExp(
  `\\${path.sep}@sentry\\${path.sep}browser\\${path.sep}build\\${path.sep}npm\\${path.sep}(esm|cjs)\\${path.sep}index\\.js$`,
);
const reactIndexPattern = new RegExp(
  `\\${path.sep}@sentry\\${path.sep}react\\${path.sep}build\\${path.sep}(esm|cjs)\\${path.sep}index\\.js$`,
);
const browserUtilsIndexPattern = new RegExp(
  `\\${path.sep}@sentry-internal\\${path.sep}browser-utils\\${path.sep}build\\${path.sep}(esm|cjs)\\${path.sep}index\\.js$`,
);

function shouldRedirect(moduleName, originModulePath) {
  if (STUBBED_PACKAGES.has(moduleName) && importerPattern.test(originModulePath)) return true;
  if (STUBBED_BROWSER_INDEX_IMPORTS.has(moduleName) && browserIndexPattern.test(originModulePath)) return true;
  if (STUBBED_BROWSER_UTILS_INDEX_IMPORTS.has(moduleName) && browserUtilsIndexPattern.test(originModulePath)) return true;
  return STUBBED_REACT_INDEX_IMPORTS.has(moduleName) && reactIndexPattern.test(originModulePath);
}

module.exports = {
  stubPath,
  shouldRedirect,
  STUBBED_PACKAGES,
  STUBBED_BROWSER_INDEX_IMPORTS,
  STUBBED_REACT_INDEX_IMPORTS,
  STUBBED_BROWSER_UTILS_INDEX_IMPORTS,
};
