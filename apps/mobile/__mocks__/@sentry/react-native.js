// Jest mock for @sentry/react-native (roadmap 1.1). The real SDK pulls in native modules jest-expo
// doesn't provide; every test that imports the app root (_layout) or src/telemetry/sentry loads this
// instead. `wrap` is identity so wrapped components render normally; init/captureException are spies.
module.exports = {
  init: jest.fn(),
  captureException: jest.fn(),
  // Spied, never real: the actual SDK call hard-crashes the process, which would take jest with it.
  nativeCrash: jest.fn(),
  wrap: (component) => component,
};
