// Web shim for @sentry/react-native — the app imports it at the root. No-op everything and pass the
// component wrapper through unchanged, mirroring apps/mobile/__mocks__/@sentry/react-native.js.
const noop = () => {};
export const init = noop;
export const captureException = noop;
export const captureMessage = noop;
export const addBreadcrumb = noop;
export const setUser = noop;
export const setTag = noop;
export const nativeCrash = noop;
export const isEnabled = () => false;
export const wrap = (Comp) => Comp;
export const ReactNativeTracing = class {};
export const ReactNavigationInstrumentation = class {};
export const Severity = {};
export default { init, captureException, captureMessage, wrap, nativeCrash, isEnabled };
