import { existsSync } from "node:fs";
import type { ExpoConfig } from "expo/config";

/**
 * Dynamic Expo config (replaces the static app.json) so the Android Google Maps key can come from the
 * environment at build time instead of being committed. Set `GOOGLE_MAPS_API_KEY` (an EAS secret /
 * `.env`) for the dev/release build — `react-native-maps` needs it on Android (iOS uses Apple Maps,
 * no key). When it's unset the rest of the app still builds; only the Android map renders blank.
 */
const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;

/**
 * Android FCM credentials file (`google-services.json`) from the Firebase project. Android needs this
 * baked into the build for `expo-notifications` to mint a native FCM device token — without it,
 * `getDevicePushTokenAsync()` returns nothing and live push never delivers, even with the server on
 * `PUSH_PROVIDER=fcm`. It's founder-supplied: register an Android app for `zw.co.lynia` in the Firebase
 * console, download the file, and provide it either as an EAS **file** secret (`GOOGLE_SERVICES_JSON`
 * → a materialised path at build time) or by dropping it at `apps/mobile/google-services.json` for a
 * local dev build. The file is gitignored (project identifiers — kept out of the repo).
 *
 * Attached only when present, so an unprovisioned build still succeeds — push just stays inert (the
 * whole client path is best-effort). iOS FCM would use `ios.googleServicesFile` + APNs, added later.
 */
const googleServicesFile =
  process.env.GOOGLE_SERVICES_JSON ??
  (existsSync(`${__dirname}/google-services.json`) ? "./google-services.json" : undefined);

/**
 * EAS project id — links the app to its EAS Build/Update project and derives the OTA updates URL
 * (docs/LAUNCH-DEPLOYMENT-STRATEGY.md §1). Founder-supplied: `eas init` prints it; commit it here as
 * the literal fallback (it is NOT a secret) and set the `EAS_PROJECT_ID` repo Variable for CI. Until
 * it exists, updates stay explicitly disabled and every build (QA APK included) succeeds unchanged.
 */
const easProjectId = process.env.EAS_PROJECT_ID ?? "25b2785d-94e0-4ecc-9940-bd9f9d8eb27c";

const config: ExpoConfig = {
  name: "LyniaGo",
  slug: "lynia",
  scheme: "lynia",
  version: "0.1.0", // x-release-please-version
  // OTA compatibility key (expo-updates): `fingerprint` hashes the native layer (deps + native
  // config), so an OTA bundle can only ever land on a binary it was actually built against —
  // a JS update can't brick an older native install. Native changes shift the fingerprint and
  // simply require a store release (mobile-release.yml) instead.
  runtimeVersion: { policy: "fingerprint" },
  // OTA update endpoint — attached only once the EAS project exists; otherwise updates are
  // explicitly disabled so the sideload QA APK and unprovisioned builds behave exactly as before.
  updates: easProjectId
    ? { url: `https://u.expo.dev/${easProjectId}`, fallbackToCacheTimeout: 0 }
    : { enabled: false },
  orientation: "portrait",
  userInterfaceStyle: "light",
  platforms: ["android", "ios"],
  // Launcher icon + splash source, copied from packages/design/assets/brand/icon/ (the design
  // system owns the artwork). Light background only — the design defers dark mode.
  icon: "./assets/icon.png",
  plugins: [
    "expo-router",
    [
      "expo-splash-screen",
      { image: "./assets/splash-icon.png", imageWidth: 120, resizeMode: "contain", backgroundColor: "#FFFFFF" },
    ],
    [
      "expo-location",
      {
        locationWhenInUsePermission: "LyniaGo uses your location to set the pickup point.",
        // Rider GPS must keep streaming while the app is backgrounded behind "Follow route in Google
        // Maps" (src/realtime/background-location-task.ts). This flag makes the plugin add the
        // FOREGROUND_SERVICE + FOREGROUND_SERVICE_LOCATION manifest permissions (verified against the
        // installed expo-location@18 plugin source) so startLocationUpdatesAsync can run its Android
        // foreground service. Deliberately NOT setting isAndroidBackgroundLocationEnabled — that adds
        // ACCESS_BACKGROUND_LOCATION and drags the listing through Play's background-location policy
        // review, and the foreground service works with plain while-in-use permission, which is all we
        // ever request. Native manifest change → new binary required (fingerprint runtimeVersion
        // shifts); this is NOT OTA-able.
        isAndroidForegroundServiceEnabled: true,
      },
    ],
    [
      "expo-image-picker",
      {
        photosPermission: "LyniaGo needs access to your photos to add your ID/profile photo for verification.",
        cameraPermission: "LyniaGo uses the camera to take your ID/profile photo for verification.",
      },
    ],
    ["expo-notifications", { color: "#00B14F" }],
    // PostHog analytics needs NO config plugin — the SDK autolinks and src/telemetry/analytics.tsx
    // key-gates it. Deliberately NOT adding "posthog-react-native/expo" (the plugin the connect
    // command suggests): it exists only for error-tracking source-map upload and injects a gradle
    // task that runs posthog-cli unconditionally on every release bundle — without `@posthog/cli`
    // installed and POSTHOG_CLI_API_KEY set it FAILS the build. Add the plugin + `@posthog/cli`
    // dep together if error tracking is ever provisioned.
    // Pin Kotlin to 1.9.25: expo-modules-core's Compose Compiler (1.5.15) requires it, and the SDK-52
    // default (1.9.24) fails :expo-modules-core:compileReleaseKotlin. prebuild regenerates android/,
    // so this must live in config, not a hand-edit of build.gradle.
    ["expo-build-properties", { android: { kotlinVersion: "1.9.25" } }],
    // TLS certificate pinning for the API/WS host (SECURITY §P3-1). GATED on LYNIA_TLS_PINS: attached
    // ONLY when pins are supplied, so an unpinned build never even loads the plugin (mirrors the Maps/
    // FCM/EAS "attach only when provisioned" pattern). Arming needs real Google-Trust-Services SPKI pins
    // + a backup + a native build — see docs/MOBILE-CERT-PINNING.md (a wrong pin bricks the app on the
    // managed cert's rotation). Single gate = the env var.
    ...(process.env.LYNIA_TLS_PINS?.trim() ? ["./plugins/with-certificate-pinning"] : []),
  ],
  android: {
    package: "zw.co.lynia",
    adaptiveIcon: { foregroundImage: "./assets/adaptive-icon.png", backgroundColor: "#FFFFFF" },
    // Only attach the Maps block when a key is present, so an unkeyed build doesn't ship an empty key.
    ...(googleMapsApiKey ? { config: { googleMaps: { apiKey: googleMapsApiKey } } } : {}),
    // Only reference the FCM credentials file when it's actually available, so an unprovisioned build
    // doesn't fail prebuild pointing at a missing path.
    ...(googleServicesFile ? { googleServicesFile } : {}),
  },
  extra: {
    apiUrl: "https://lyniago.lyniafinance.com",
    // Google Places key for search-first addressing (OPTIONAL). Prefer the EXPO_PUBLIC_ env var, which
    // is inlined into the JS bundle at build; this `extra` entry is the parity fallback (mirrors apiUrl).
    // When unset the address-search UI hides and the pin-on-map picker stays the primary path — an
    // unkeyed build runs fully. See src/config.ts (placesEnabled).
    googlePlacesKey: process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY,
    // Test-build marker: only the QA APK workflow (.github/workflows/android-test-apk.yml) sets
    // LYNIA_TEST_BUILD=1, so a normal EAS release build leaves this false and the TEST BUILD banner
    // (src/ui Screen) never renders. Testers get a visible signal they're on a bypass build hitting
    // the live API; real releases show nothing.
    testBuild: process.env.LYNIA_TEST_BUILD === "1",
    // Play listing the force-update screen's "Update now" button opens (src/config.ts STORE_URL).
    // Defaulted so the button is never dead once the app is listed; override per-build with
    // EXPO_PUBLIC_STORE_URL if the listing URL ever changes.
    storeUrl: process.env.EXPO_PUBLIC_STORE_URL ?? "https://play.google.com/store/apps/details?id=zw.co.lynia",
    // PostHog analytics (OPTIONAL — key-gated, see src/config.ts). Founder-provisioned by running
    // `npx eas-cli integrations:posthog:connect` once: it syncs EXPO_PUBLIC_POSTHOG_API_KEY/_HOST
    // into the EAS environments (and .env.local for dev), which the EXPO_PUBLIC_ path picks up at
    // build. These `extra` entries are the parity fallback (mirrors googlePlacesKey). Unset →
    // analytics never initializes and the app runs unchanged.
    posthogApiKey: process.env.EXPO_PUBLIC_POSTHOG_API_KEY,
    posthogHost: process.env.EXPO_PUBLIC_POSTHOG_HOST,
    // EAS project link (eas-cli reads extra.eas.projectId). Attached only when provisioned.
    ...(easProjectId ? { eas: { projectId: easProjectId } } : {}),
  },
};

export default config;
