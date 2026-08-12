// Web shim for expo-location. The app imports it as a namespace and calls it from effects (safety,
// ComposeMap, rider location). No device GPS in a render — permissions read as granted and positions
// resolve to a fixed Harare-corridor point so a screen that awaits location paints instead of hanging.
const HARARE = { coords: { latitude: -17.8292, longitude: 31.0522, accuracy: 5, altitude: 0, heading: 0, speed: 0, altitudeAccuracy: 0 }, timestamp: 0 };
export const Accuracy = { Lowest: 1, Low: 2, Balanced: 3, High: 4, Highest: 5, BestForNavigation: 6 };
export const ActivityType = { Other: 1, AutomotiveNavigation: 2, Fitness: 3, OtherNavigation: 4 };
export async function requestForegroundPermissionsAsync() { return { status: "granted", granted: true, canAskAgain: true }; }
// Overridable per fixture for the screens that DRAW a non-granted location state (LJ.settings_perms
// draws "Ask every time", LJ.loc_off draws the composer with location off): set
// `window.__PARITY_PERMISSIONS = { location: "denied" | "never" }` at fixture top level.
function locationPermission() {
  const p = (typeof window !== "undefined" && window.__PARITY_PERMISSIONS) || {};
  const status = p.location || "granted";
  return { status, granted: status === "granted", canAskAgain: status !== "never" };
}
export async function getForegroundPermissionsAsync() { return locationPermission(); }
export async function requestBackgroundPermissionsAsync() { return { status: "granted", granted: true, canAskAgain: true }; }
export async function getBackgroundPermissionsAsync() { return { status: "granted", granted: true, canAskAgain: true }; }
export async function getCurrentPositionAsync() { return HARARE; }
export async function getLastKnownPositionAsync() { return HARARE; }
export async function watchPositionAsync() { return { remove() {} }; }
export async function startLocationUpdatesAsync() {}
export async function stopLocationUpdatesAsync() {}
export async function hasStartedLocationUpdatesAsync() { return false; }
export async function hasServicesEnabledAsync() { return true; }
export async function enableNetworkProviderAsync() {}
export async function geocodeAsync() { return []; }
export async function reverseGeocodeAsync() { return []; }
export default {
  Accuracy, ActivityType, requestForegroundPermissionsAsync, getForegroundPermissionsAsync,
  requestBackgroundPermissionsAsync, getBackgroundPermissionsAsync, getCurrentPositionAsync,
  getLastKnownPositionAsync, watchPositionAsync, startLocationUpdatesAsync, stopLocationUpdatesAsync,
  hasStartedLocationUpdatesAsync, hasServicesEnabledAsync, enableNetworkProviderAsync, geocodeAsync, reverseGeocodeAsync,
};
