// Pure matching logic for metro.config.js's bundle-trim redirects (owner decision 2026-10-02: trim
// the JS bundle before resetting the size budget — docs/APP-SIZE.md, "Levers applied" item 4). Split
// out so it can be unit tested without instantiating the full Sentry/Expo Metro config — same seam as
// ./zod-locales-redirect and ./sentry-browser-redirect.
//
// Each rule swaps ONE dependency-internal import for a tiny stub. Every rule is scoped to the exact
// importing file inside the package that drags the weight in, so the same specifier imported from
// anywhere else (our code, another package) still resolves the real module.
//
//  1. `assert` from `@ide/backoff` (expo-notifications' push-token retry). The npm `assert` polyfill
//     drags in `util`, `inherits`, `get-intrinsic`, `call-bind`… (~45 KB of minified JS) to back five
//     `assert(condition, message)` argument checks. The stub keeps that exact contract: a falsy
//     condition throws an Error carrying the message.
//  2. `./surveys` from `posthog-react-native`'s package index. The index re-exports the in-app survey
//     UI (PostHogSurveyProvider, SurveyModal, the question widgets — ~49 KB). This app never mounts
//     the survey provider (src/telemetry/analytics.tsx uses PostHogProvider + usePostHog only), so the
//     survey UI can never render. The stub keeps the three names, inert.
//  3. `./from-json-schema.js` from zod's classic entry. `z.fromJSONSchema` (~12 KB) builds zod
//     schemas from JSON Schema documents at runtime; nothing in the app or @lynia/shared calls it.
//     The stub keeps the name and throws if a future caller ever reaches it, so the gap is loud.
const path = require("path");

const sep = `\\${path.sep}`;

const RULES = [
  {
    key: "assert",
    stubPath: path.join(__dirname, "assert-stub.js"),
    modules: new Set(["assert"]),
    importer: new RegExp(`${sep}@ide${sep}backoff${sep}build${sep}backoff\\.js$`),
  },
  {
    key: "posthog-surveys",
    stubPath: path.join(__dirname, "posthog-surveys-stub.js"),
    modules: new Set(["./surveys", "./surveys/index", "./surveys/index.js"]),
    importer: new RegExp(`${sep}posthog-react-native${sep}dist${sep}index\\.js$`),
  },
  {
    key: "zod-from-json-schema",
    stubPath: path.join(__dirname, "zod-from-json-schema-stub.js"),
    modules: new Set(["./from-json-schema.js", "./from-json-schema.cjs"]),
    importer: new RegExp(`${sep}zod${sep}v4${sep}classic${sep}external\\.c?js$`),
  },
];

/** The stub to resolve `moduleName` to when `originModulePath` imports it, or null for "resolve normally". */
function redirectFor(moduleName, originModulePath) {
  for (const rule of RULES) {
    if (rule.modules.has(moduleName) && rule.importer.test(originModulePath)) return rule.stubPath;
  }
  return null;
}

module.exports = { redirectFor, RULES };
