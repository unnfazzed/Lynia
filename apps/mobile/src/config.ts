import Constants from "expo-constants";

/**
 * API base URL. Set it for device/prod via EXPO_PUBLIC_API_URL (e.g. your LAN IP in dev, the HTTPS
 * API in prod), or `extra.apiUrl` in app.config.ts. There is NO localhost default in a release build —
 * "localhost" on a phone is the phone itself, so we fail loudly rather than ship a dead app.
 */
const isDev = typeof __DEV__ !== "undefined" && __DEV__;
const fromExtra = (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl;
const configured = process.env.EXPO_PUBLIC_API_URL ?? fromExtra;

export const API_URL: string = configured ?? "http://localhost:3000"; // dev-only fallback

/**
 * The host part of an http(s) URL, without brackets/port — or null when the URL doesn't parse as
 * one. Regex, not `new URL(...)`: React Native's built-in URL polyfill throws "not implemented"
 * from accessors like `hostname`, and this module must never throw (see API_CONFIG_ERROR below).
 */
function httpUrlHost(url: string): string | null {
  const ipv6 = /^https?:\/\/\[([^\]]+)\]/i.exec(url);
  if (ipv6) return ipv6[1] ?? null;
  const host = /^https?:\/\/([^/:?#]+)/i.exec(url);
  return host?.[1] ?? null;
}

/** Hosts that can only ever be the phone itself — a dead API for every real user. */
function isLoopbackHost(host: string): boolean {
  return host === "localhost" || host === "::1" || host === "0.0.0.0" || host.startsWith("127.");
}

/**
 * A release build with no real API URL is misconfigured and must say so loudly — but not by dying at
 * the splash. These conditions used to be module-scope `throw`s, and this module sits in the root
 * layout's eager import graph, where expo-router evaluates it BEFORE the error boundary it derives
 * from that same load exists — so a throw here was a cold-start process kill, not an error screen
 * (MOB-BOOT-04, docs/COLD-START-CRASH-RCA-2026-08-21.md §2 and §8.2 step 2). The check now lives
 * here as a value and fires at first use: `apiFetch` refuses every request with this message, so the
 * app boots, renders, and each screen's normal error path names the misconfiguration instead.
 *
 * Loopback covers every spelling of "the phone itself" — `localhost`, `127.x.x.x`, `[::1]`,
 * `0.0.0.0` — not just the literal "localhost" the old throw matched. A URL that doesn't parse as
 * http(s) is equally a config error: `fetch` could only fail on it, and it would fail as a
 * retryable-looking network error instead of naming the real problem.
 */
export const API_CONFIG_ERROR: string | null = (() => {
  if (isDev) return null;
  if (!configured) return "This build is misconfigured: EXPO_PUBLIC_API_URL (or extra.apiUrl in app.config.ts) is not set.";
  const host = httpUrlHost(API_URL);
  if (!host) return "This build is misconfigured: EXPO_PUBLIC_API_URL is not a valid http(s) URL.";
  if (isLoopbackHost(host)) return "This build is misconfigured: EXPO_PUBLIC_API_URL points at the device itself (loopback), not the real API.";
  return null;
})();

/** Socket.IO connects to the same origin as the REST API. */
export const WS_URL: string = API_URL;

/*
 * No PRIVACY_URL constant: the app never links the API-served `/legal/privacy` page. The Settings
 * row opens the DRAWN in-app notice (`/settings/privacy`, LJ.privacy), and Play Console's "Privacy
 * policy" field is a *listing* value entered by hand from `docs/PLAY-STORE-SUBMISSION.md` — exactly
 * like its `/legal/account-deletion` sibling, which likewise has no constant here. The API still
 * serves both pages (apps/api/src/legal/); only the unused client constant is gone (DC-01).
 */

/**
 * Google Places (browser/REST) API key for search-first addressing. OPTIONAL — the autocomplete path is
 * key-gated: when this is unset `AddressSearch` falls back to the device geocoder (src/logic/geocode.ts),
 * so the app builds and runs fully with no key and an address can still become a coordinate. Used for
 * direct REST calls to Google (Autocomplete + Details), NOT through the Lynia API. Never hard-require
 * it anywhere.
 *
 * Read ONLY from `EXPO_PUBLIC_GOOGLE_PLACES_KEY` — there is deliberately no `extra.googlePlacesKey`
 * mirror, because `extra` is hashed into the expo-updates fingerprint runtimeVersion and that would
 * make this key un-shippable by OTA to an installed binary. See the note in app.config.ts.
 */
export const GOOGLE_PLACES_KEY: string | null = process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY ?? null;

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
