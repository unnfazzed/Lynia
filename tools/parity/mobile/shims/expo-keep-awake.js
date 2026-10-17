// Web shim for expo-keep-awake. A screenshot has no screen to keep awake, and the real module throws
// "Cannot find native module 'ExpoKeepAwake'" at import, which blanked every screen that mounts the
// ID-check sheet host (the rider board, become). Named exports: the app imports them by name
// (src/logic/use-keep-screen-on.ts), which the generic empty shim's default Proxy can't serve.
export const activateKeepAwakeAsync = () => Promise.resolve();
export const activateKeepAwake = () => {};
export const deactivateKeepAwake = () => Promise.resolve();
export const useKeepAwake = () => {};
export const isAvailableAsync = () => Promise.resolve(false);
export default { activateKeepAwakeAsync, activateKeepAwake, deactivateKeepAwake, useKeepAwake, isAvailableAsync };
