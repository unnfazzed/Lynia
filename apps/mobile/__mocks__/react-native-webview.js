/**
 * react-native-webview mock for jest — the real package registers a native view manager that
 * jest-expo cannot load (the same import-time hostility class as @sentry/react-native's mock above
 * it in jest.config.js). The mock is a component rendering nothing: component tests find it by
 * type/props and drive the sheet by invoking the navigation/load props directly
 * (src/kyc/__tests__/check-host.test.tsx). Its ref methods record into `__refCalls`, so a test can
 * see the sheet step back or stop a load.
 */
const React = require("react");

const refCalls = [];

const WebView = React.forwardRef(function WebView(_props, ref) {
  React.useImperativeHandle(ref, () => ({
    goBack: () => refCalls.push("goBack"),
    stopLoading: () => refCalls.push("stopLoading"),
    reload: () => refCalls.push("reload"),
  }));
  return null;
});

module.exports = { WebView, default: WebView, __esModule: true, __refCalls: refCalls };
