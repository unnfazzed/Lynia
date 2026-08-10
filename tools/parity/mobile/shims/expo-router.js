// Web shim for expo-router. A static screenshot has no navigation, so router actions are no-ops and
// route params come from window.__PARITY_ROUTE_PARAMS (a fixture can set these before mount). Link/Stack
// render their children (or nothing), Redirect renders nothing. Enough for most screens to mount; a
// screen that truly needs routed data gets it via its fixture's params, not from here.
import * as React from "react";
import { View } from "react-native";

const noop = () => undefined;
const params = () => (typeof window !== "undefined" && window.__PARITY_ROUTE_PARAMS) || {};

export const useRouter = () => ({ push: noop, replace: noop, back: noop, navigate: noop, setParams: noop, dismiss: noop, dismissAll: noop, canGoBack: () => false });
export const useLocalSearchParams = () => params();
export const useGlobalSearchParams = () => params();
export const useSegments = () => [];
export const usePathname = () => "/";
export const useFocusEffect = (cb) => { React.useEffect(() => (typeof cb === "function" ? cb() : undefined), []); };
export const useNavigation = () => ({ setOptions: noop, navigate: noop, goBack: noop, addListener: () => noop });
export const router = { push: noop, replace: noop, back: noop, navigate: noop, setParams: noop };

export const Link = ({ children, asChild, ...rest }) => React.createElement(View, null, children);
export const Redirect = () => null;
export const Slot = ({ children }) => React.createElement(React.Fragment, null, children);
const passthrough = ({ children }) => React.createElement(React.Fragment, null, children);
export const Stack = Object.assign(passthrough, { Screen: () => null });
export const Tabs = Object.assign(passthrough, { Screen: () => null });
export const SplashScreen = { preventAutoHideAsync: noop, hideAsync: noop };

export default { useRouter, useLocalSearchParams, usePathname, useFocusEffect, useNavigation, router, Link, Redirect, Slot, Stack, Tabs };
