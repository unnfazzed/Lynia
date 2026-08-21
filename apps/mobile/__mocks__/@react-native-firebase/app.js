// Jest mock for @react-native-firebase/app. The real package resolves native modules jest-expo does
// not provide; every test that imports the app root (_layout) or src/telemetry/crashlytics loads this
// instead. Same treatment as @sentry/react-native and the Didit SDK (jest.config moduleNameMapper).
//
// `getApps` is the provisioning seam the crashlytics module gates on: an empty array is a build with
// no google-services.json baked in, which is what dev, jest and the QA APK lane actually ship. It
// defaults to "provisioned" so tests opt IN to the unprovisioned case, and it is a jest.fn so a test
// can flip it (mockReturnValue([])) without touching the module under test.
module.exports = {
  getApps: jest.fn(() => [{ name: "[DEFAULT]" }]),
};
