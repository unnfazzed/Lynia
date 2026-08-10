// Generic inert shim for native-only Expo/RN modules that a screen imports but that have no visual
// effect on a static screenshot (secure-store, notifications, haptics, clipboard, etc.). Every named
// import resolves to a no-op via the Proxy; the default export is the same Proxy so `X.foo()` is safe.
const noop = () => undefined;
const handler = {
  get(_t, prop) {
    if (prop === "__esModule") return true;
    if (prop === "default") return proxy;
    return noop;
  },
};
const proxy = new Proxy(noop, handler);
export default proxy;
export const __esModule = true;
