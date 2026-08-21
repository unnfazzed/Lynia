// Web shim for @react-native-firebase/crashlytics — app/_layout.tsx reaches it through
// src/telemetry/crashlytics.ts, which the parity bundle pulls in with the rest of the boot graph.
// No-op everything, mirroring apps/mobile/__mocks__/@react-native-firebase/crashlytics.js.
//
// `crash` is a no-op here and NOT the real thing for the obvious reason: this bundle runs inside the
// screenshot lane's headless browser, and a reporter that could take that process down would break
// the very evidence the lane exists to produce.
const noop = () => {};
const instance = {};
export const getCrashlytics = () => instance;
export const setCrashlyticsCollectionEnabled = noop;
export const isCrashlyticsCollectionEnabled = () => false;
export const log = noop;
export const recordError = noop;
export const setAttribute = noop;
export const setAttributes = noop;
export const setUserId = noop;
export const didCrashOnPreviousExecution = async () => false;
export const crash = noop;
export default { getCrashlytics, log, recordError, setAttributes, crash };
