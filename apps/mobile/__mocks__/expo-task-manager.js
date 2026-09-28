/**
 * expo-task-manager mock for jest. Since Expo SDK 54 (expo-task-manager 14) the package calls
 * requireNativeModule("ExpoTaskManager") at import time and jest-expo ships no mock for it, so merely
 * importing a rider screen threw "Cannot find native module 'ExpoTaskManager'":
 * src/realtime/background-location-task.ts defines its task at module scope. Same import-time
 * hostility class as the Sentry and WebView mocks. Tests that assert on task registration still
 * jest.mock("expo-task-manager") with their own factory, which takes precedence.
 */
module.exports = {
  __esModule: true,
  defineTask: jest.fn(),
  isTaskDefined: jest.fn(() => false),
  isTaskRegisteredAsync: jest.fn(async () => false),
  getRegisteredTasksAsync: jest.fn(async () => []),
  unregisterTaskAsync: jest.fn(async () => undefined),
  unregisterAllTasksAsync: jest.fn(async () => undefined),
};
