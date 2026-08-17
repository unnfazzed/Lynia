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

function shouldRedirect(moduleName, originModulePath) {
  return STUBBED_PACKAGES.has(moduleName) && importerPattern.test(originModulePath);
}

module.exports = { stubPath, shouldRedirect, STUBBED_PACKAGES };
