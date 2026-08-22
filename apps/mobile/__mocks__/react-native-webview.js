/**
 * react-native-webview mock for jest — the real package registers a native view manager that
 * jest-expo cannot load (the same import-time hostility class as @sentry/react-native's mock above
 * it in jest.config.js). The mock is a plain function component rendering nothing: component tests
 * find it by type/props and drive the sheet by invoking the navigation/load props directly
 * (src/kyc/__tests__/check-host.test.tsx).
 */
function WebView() {
  return null;
}

module.exports = { WebView, default: WebView, __esModule: true };
