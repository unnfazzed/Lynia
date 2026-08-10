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
 * The public privacy notice, served by the API itself (apps/api/src/legal/) because Lynia ships no
 * marketing site. It is a Google Play listing requirement — the "Privacy policy" URL in Play Console →
 * App content — and the Settings screen links it in-app. Derived from API_URL rather than hardcoded so
 * a staging/dev build links at its OWN backend's copy instead of silently opening production's — the
 * same reasoning as WS_URL above.
 *
 * The sibling `/legal/account-deletion` page (the "Data deletion" URL on the Data safety form) is a
 * Play Console *listing* field, entered by hand from `docs/PLAY-STORE-SUBMISSION.md` — the app never
 * links it, because Settings deletes the account in-app via `DELETE /auth/me`. It therefore has no
 * constant here.
 *
 * `replace(/\/+$/, "")` guards the one realistic mis-configuration: a trailing slash on
 * EXPO_PUBLIC_API_URL would otherwise produce `…//legal/privacy`.
 */
const apiOrigin = API_URL.replace(/\/+$/, "");
export const PRIVACY_URL = `${apiOrigin}/legal/privacy`;

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
 * PostHog product analytics. OPTIONAL and key-gated exactly like Places: with no key the provider
 * mounts nothing and the app builds/runs fully — no SDK init, no network. Provisioning is founder-run:
 * `npx eas-cli integrations:posthog:connect` links the EAS project to PostHog and syncs
 * `EXPO_PUBLIC_POSTHOG_API_KEY` + `EXPO_PUBLIC_POSTHOG_HOST` into the EAS production/preview/development
 * environments (and `.env.local` for dev), so the very next EAS build lights analytics up with no code
 * change. The `extra.*` entries in app.config.ts are the parity fallback (mirrors googlePlacesKey).
 * The project API key is a public write-only token, not a secret.
 */
const posthogKeyFromExtra = (Constants.expoConfig?.extra as { posthogApiKey?: string } | undefined)?.posthogApiKey;
export const POSTHOG_API_KEY: string | null = process.env.EXPO_PUBLIC_POSTHOG_API_KEY ?? posthogKeyFromExtra ?? null;

/** PostHog ingestion host — the connect command syncs the region's host; US cloud is the default. */
const posthogHostFromExtra = (Constants.expoConfig?.extra as { posthogHost?: string } | undefined)?.posthogHost;
export const POSTHOG_HOST: string =
  process.env.EXPO_PUBLIC_POSTHOG_HOST ?? posthogHostFromExtra ?? "https://us.i.posthog.com";

/** True only when a non-empty PostHog key is configured — the single gate for mounting analytics. */
export function analyticsEnabled(): boolean {
  return typeof POSTHOG_API_KEY === "string" && POSTHOG_API_KEY.length > 0;
}

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

/**
 * Minimum app version the API still supports — the hard force-update gate (customer/rider S·3). OPTIONAL
 * and OFF by default: unset (or "0.0.0") makes the gate inert, so the app builds and runs with no config.
 * Set it, above the shipped build's version, only when you must force everyone onto a newer binary. Read
 * from `EXPO_PUBLIC_MIN_APP_VERSION` (inlined at build) or `extra.minAppVersion` in app.config.ts.
 */
const minVersionFromExtra = (Constants.expoConfig?.extra as { minAppVersion?: string } | undefined)?.minAppVersion;
export const MIN_SUPPORTED_VERSION: string = process.env.EXPO_PUBLIC_MIN_APP_VERSION ?? minVersionFromExtra ?? "0.0.0";

/**
 * App/Play Store URL the force-update screen's "Update now" opens. OPTIONAL — when null the button hides
 * rather than opening a dead link. Set via `EXPO_PUBLIC_STORE_URL` or `extra.storeUrl` in app.config.ts.
 */
const storeUrlFromExtra = (Constants.expoConfig?.extra as { storeUrl?: string } | undefined)?.storeUrl;
export const STORE_URL: string | null = process.env.EXPO_PUBLIC_STORE_URL ?? storeUrlFromExtra ?? null;

/**
 * True when `current` is older than `min` — the shared comparator behind BOTH force-update gates
 * (the build-time MIN_SUPPORTED_VERSION below and the server-driven /app/version-gate minimum).
 * Compares semver-ish dotted versions numerically, field by field. Returns false when the minimum is
 * unset/"0.0.0", so a gate is a no-op unless a minimum is explicitly configured above the current build.
 */
export function isVersionBelow(current: string, min: string | null | undefined): boolean {
  if (!min || min === "0.0.0") return false;
  const minParts = min.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const cur = current.split(".").map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(minParts.length, cur.length); i++) {
    const a = cur[i] ?? 0;
    const b = minParts[i] ?? 0;
    if (a < b) return true;
    if (a > b) return false;
  }
  return false; // equal — no update needed
}

/** The build-time gate: `current` vs the inlined MIN_SUPPORTED_VERSION. Kept for builds that ship with
 *  a minimum baked in; the server-driven gate (src/net/use-server-version-gate.ts) covers already-
 *  installed binaries that a build-time constant can never reach retroactively. */
export function isUpdateRequired(current: string): boolean {
  return isVersionBelow(current, MIN_SUPPORTED_VERSION);
}
