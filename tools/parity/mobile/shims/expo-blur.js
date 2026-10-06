// expo-blur's REAL web implementation, not a stand-in. The package entry resolves to the native view
// manager (`requireNativeViewManager("ExpoBlurView")`), which throws in a browser, and this bundler
// doesn't pick `.web.js` files, so the tab bar's glass (ledger D-56 §6) is re-exported from the web
// build: the same `backdrop-filter` + tint colour Expo ships for web, over the screen behind it.
export { default as BlurView } from "../../../../apps/mobile/node_modules/expo-blur/build/BlurView.web.js";
