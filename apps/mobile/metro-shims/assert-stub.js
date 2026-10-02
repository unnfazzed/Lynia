// Redirect target for `require("assert")` inside `@ide/backoff` (see ./bundle-trim-redirect.js).
// `@ide/backoff` only ever calls `assert(condition, message)`; this keeps that contract — a falsy
// condition throws — without the npm `assert` polyfill's `util`/`get-intrinsic` dependency tree.
// CommonJS with no `__esModule` flag, so TypeScript's `__importDefault` wraps it as `{ default: assert }`
// exactly as it wraps the real package.
function assert(value, message) {
  if (!value) {
    throw message instanceof Error ? message : new Error(message === undefined ? "Assertion failed" : String(message));
  }
}
assert.ok = assert;

module.exports = assert;
