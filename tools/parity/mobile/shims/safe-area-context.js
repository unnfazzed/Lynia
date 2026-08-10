// Web shim for react-native-safe-area-context. On a 360×720 render there are no device insets, so
// SafeAreaView is a plain View and insets are zero. Matches how the app looks inside the frame.
import * as React from "react";
import { View } from "react-native"; // aliased to react-native-web

const ZERO = { top: 0, right: 0, bottom: 0, left: 0 };

export const SafeAreaProvider = ({ children }) => React.createElement(React.Fragment, null, children);
export const SafeAreaView = React.forwardRef((props, ref) => React.createElement(View, { ref, ...props }));
export const useSafeAreaInsets = () => ZERO;
export const useSafeAreaFrame = () => ({ x: 0, y: 0, width: 360, height: 720 });
export const SafeAreaInsetsContext = React.createContext(ZERO);
export const SafeAreaFrameContext = React.createContext({ x: 0, y: 0, width: 360, height: 720 });
export const initialWindowMetrics = { insets: ZERO, frame: { x: 0, y: 0, width: 360, height: 720 } };
export const withSafeAreaInsets = (Comp) =>
  React.forwardRef((props, ref) => React.createElement(Comp, { ref, insets: ZERO, ...props }));
export default { SafeAreaProvider, SafeAreaView, useSafeAreaInsets, SafeAreaInsetsContext, initialWindowMetrics };
