// Web shim for expo-status-bar. There is no device status bar in a 360×720 render, so StatusBar draws
// nothing and the imperative setters are no-ops.
import * as React from "react";
export const StatusBar = () => null;
export const setStatusBarStyle = () => {};
export const setStatusBarBackgroundColor = () => {};
export const setStatusBarHidden = () => {};
export default { StatusBar, setStatusBarStyle, setStatusBarBackgroundColor, setStatusBarHidden };
