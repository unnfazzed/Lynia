// Web shim for @react-native-firebase/app. src/telemetry/crashlytics.ts calls getApps() FIRST as its
// provisioning gate, so returning an empty array here is what makes the whole Crashlytics seam inert
// in the screenshot lane — the same state a build with no google-services.json is in.
export const getApps = () => [];
export const getApp = () => {
  throw new Error("No Firebase App '[DEFAULT]' has been created (parity shim).");
};
export default { getApps, getApp };
