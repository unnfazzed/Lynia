// Web shim for expo-splash-screen. There is no native launch screen in a 360×720 render, so every call
// resolves at once and does nothing. The generic empty shim is not enough here: the app imports the
// module as a namespace (`import * as SplashScreen`), whose members come from NAMED exports, so under
// that shim `SplashScreen.hideAsync` was undefined. The force-update gate releases the splash in an
// effect (src/boot/boot-splash-hold.tsx), and the TypeError unmounted the whole screen.
export const preventAutoHideAsync = () => Promise.resolve(true);
export const hideAsync = () => Promise.resolve(true);
export const hide = () => {};
export const setOptions = () => {};
export default { preventAutoHideAsync, hideAsync, hide, setOptions };
