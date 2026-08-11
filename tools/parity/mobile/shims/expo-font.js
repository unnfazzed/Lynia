// Web shim for expo-font. Fonts are inlined into the harness page's CSS, so useFonts reports ready
// immediately and the async loaders are no-ops — the screen never gates its first paint on font load.
export const useFonts = () => [true, null];
export const loadAsync = async () => {};
export const isLoaded = () => true;
export const isLoading = () => false;
export default { useFonts, loadAsync, isLoaded, isLoading };
