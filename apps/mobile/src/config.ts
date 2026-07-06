import Constants from "expo-constants";

/**
 * API base URL. Set it for device/prod via EXPO_PUBLIC_API_URL (e.g. your LAN IP in dev, the HTTPS
 * API in prod), or `extra.apiUrl` in app.config.ts. There is NO localhost default in a release build —
 * "localhost" on a phone is the phone itself, so we fail loudly rather than ship a dead app.
 */
const isDev = typeof __DEV__ !== "undefined" && __DEV__;
const fromExtra = (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl;
const configured = process.env.EXPO_PUBLIC_API_URL ?? fromExtra;

if (!configured && !isDev) {
  throw new Error("Set EXPO_PUBLIC_API_URL (or extra.apiUrl in app.config.ts) to the production API URL.");
}

export const API_URL: string = configured ?? "http://localhost:3000"; // dev-only fallback

if (!isDev && API_URL.includes("localhost")) {
  throw new Error("EXPO_PUBLIC_API_URL must point at the real API, not localhost, in a release build.");
}

/** Socket.IO connects to the same origin as the REST API. */
export const WS_URL: string = API_URL;

/**
 * Google Places (browser/REST) API key for search-first addressing. OPTIONAL — the whole address-search
 * path is key-gated: when this is unset the search UI hides and the app falls back to the pin-on-map
 * picker (the default primary path), so the app builds and runs fully with no key. Set it via
 * `EXPO_PUBLIC_GOOGLE_PLACES_KEY` (inlined at build) or `extra.googlePlacesKey` in app.config.ts. It is
 * used for direct REST calls to Google (Autocomplete + Details), NOT through the Lynia API. Never
 * hard-require it anywhere.
 */
const placesKeyFromExtra = (Constants.expoConfig?.extra as { googlePlacesKey?: string } | undefined)?.googlePlacesKey;
export const GOOGLE_PLACES_KEY: string | null = process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY ?? placesKeyFromExtra ?? null;

/**
 * Support contact for the rider dead-end states (KYC attempt-lock, suspended, on hold, banned) where the
 * only honest instruction is "contact support". A `tel:` / `mailto:` / `https://wa.me/...` URL, opened
 * with Linking. Override per deploy with EXPO_PUBLIC_SUPPORT_URL (or extra.supportUrl); the default is the
 * pilot support inbox so the button is never dead.
 */
const supportFromExtra = (Constants.expoConfig?.extra as { supportUrl?: string } | undefined)?.supportUrl;
export const SUPPORT_URL: string =
  process.env.EXPO_PUBLIC_SUPPORT_URL ?? supportFromExtra ?? "mailto:support@lyniafinance.com";

/** True only when a non-empty Places key is configured — the single gate for showing the search UI. */
export function placesEnabled(): boolean {
  return typeof GOOGLE_PLACES_KEY === "string" && GOOGLE_PLACES_KEY.length > 0;
}
