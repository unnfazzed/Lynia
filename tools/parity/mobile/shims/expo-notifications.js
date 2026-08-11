// Web shim for expo-notifications. Screens/modules import it as a NAMESPACE (`import * as
// Notifications`) and call setNotificationHandler / channel setup at module top level, which the
// generic Proxy shim can't satisfy for namespace members. A static screenshot has no notifications,
// so every method is a no-op and the async queries resolve to empty/granted.
export function setNotificationHandler() {}
export async function setNotificationChannelAsync() {}
export async function getPermissionsAsync() { return { status: "granted", granted: true }; }
export async function requestPermissionsAsync() { return { status: "granted", granted: true }; }
export async function getExpoPushTokenAsync() { return { data: "" }; }
export async function getDevicePushTokenAsync() { return { data: "" }; }
export function addNotificationReceivedListener() { return { remove() {} }; }
export function addNotificationResponseReceivedListener() { return { remove() {} }; }
export function removeNotificationSubscription() {}
export async function getLastNotificationResponseAsync() { return null; }
export async function scheduleNotificationAsync() { return ""; }
export async function cancelAllScheduledNotificationsAsync() {}
export async function setBadgeCountAsync() { return true; }
export const AndroidImportance = { DEFAULT: 3, HIGH: 4, MAX: 5, LOW: 2, MIN: 1, NONE: 0 };
export const AndroidNotificationVisibility = { PUBLIC: 1, PRIVATE: 0, SECRET: -1 };
export default {
  setNotificationHandler, setNotificationChannelAsync, getPermissionsAsync, requestPermissionsAsync,
  getExpoPushTokenAsync, getDevicePushTokenAsync, addNotificationReceivedListener,
  addNotificationResponseReceivedListener, removeNotificationSubscription,
  getLastNotificationResponseAsync, scheduleNotificationAsync,
  cancelAllScheduledNotificationsAsync, setBadgeCountAsync, AndroidImportance, AndroidNotificationVisibility,
};
