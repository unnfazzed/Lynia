// Jest mock for @react-native-firebase/crashlytics (modular API — the package root re-exports
// ./modular, so these are the very names src/telemetry/crashlytics.ts imports). The real SDK needs
// the native Firebase runtime, which jest-expo has no host for.
//
// `getCrashlytics` returns a stable sentinel so tests can assert it is the instance threaded into
// every other call — the modular API takes the instance as its first argument, and passing the wrong
// one is a mistake that would still "pass" against loose matchers.
const instance = { __sentinel: "crashlytics" };

module.exports = {
  getCrashlytics: jest.fn(() => instance),
  setCrashlyticsCollectionEnabled: jest.fn(),
  // Logs and attributes are context for a LATER crash — spied, never real.
  log: jest.fn(),
  setAttributes: jest.fn(),
  recordError: jest.fn(),
  didCrashOnPreviousExecution: jest.fn(async () => false),
  // Spied, never real: the actual SDK call hard-crashes the process, which would take jest with it.
  crash: jest.fn(),
};
