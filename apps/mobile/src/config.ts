import Constants from "expo-constants";

/**
 * API base URL. Set it for device/prod via EXPO_PUBLIC_API_URL (e.g. your LAN IP in dev, the HTTPS
 * API in prod), or app.json `extra.apiUrl`. There is NO localhost default in a release build —
 * "localhost" on a phone is the phone itself, so we fail loudly rather than ship a dead app.
 */
const isDev = typeof __DEV__ !== "undefined" && __DEV__;
const fromExtra = (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl;
const configured = process.env.EXPO_PUBLIC_API_URL ?? fromExtra;

if (!configured && !isDev) {
  throw new Error("Set EXPO_PUBLIC_API_URL (or app.json extra.apiUrl) to the production API URL.");
}

export const API_URL: string = configured ?? "http://localhost:3000"; // dev-only fallback

if (!isDev && API_URL.includes("localhost")) {
  throw new Error("EXPO_PUBLIC_API_URL must point at the real API, not localhost, in a release build.");
}

/** Socket.IO connects to the same origin as the REST API. */
export const WS_URL: string = API_URL;
