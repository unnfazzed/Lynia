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

/** True only when a non-empty Places key is configured — the single gate for showing the search UI. */
export function placesEnabled(): boolean {
  return typeof GOOGLE_PLACES_KEY === "string" && GOOGLE_PLACES_KEY.length > 0;
}

/**
 * Support WhatsApp number in international digits (no "+"), e.g. "263771234567". OPTIONAL — the help
 * hub's "Chat on WhatsApp" row is gated on it (help routes to WhatsApp by product decision): with no
 * number the row hides rather than opening a dead link. Set via `EXPO_PUBLIC_SUPPORT_WHATSAPP` or
 * `extra.supportWhatsApp` in app.config.ts.
 */
const supportWaFromExtra = (Constants.expoConfig?.extra as { supportWhatsApp?: string } | undefined)?.supportWhatsApp;
export const SUPPORT_WHATSAPP: string | null =
  (process.env.EXPO_PUBLIC_SUPPORT_WHATSAPP ?? supportWaFromExtra ?? "").replace(/[^\d]/g, "") || null;

/** A wa.me deep link to support, or null when no number is configured (the row then hides). */
export function supportWhatsAppUrl(): string | null {
  return SUPPORT_WHATSAPP ? `https://wa.me/${SUPPORT_WHATSAPP}` : null;
}
