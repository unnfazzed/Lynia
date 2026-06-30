import type { ExpoConfig } from "expo/config";

/**
 * Dynamic Expo config (replaces the static app.json) so the Android Google Maps key can come from the
 * environment at build time instead of being committed. Set `GOOGLE_MAPS_API_KEY` (an EAS secret /
 * `.env`) for the dev/release build — `react-native-maps` needs it on Android (iOS uses Apple Maps,
 * no key). When it's unset the rest of the app still builds; only the Android map renders blank.
 */
const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;

const config: ExpoConfig = {
  name: "Lynia",
  slug: "lynia",
  // EAS project owner + id (from `eas init`) — required here because the config is dynamic, so EAS
  // can't auto-write it. Links local builds to the @lyniago/lynia project on Expo.
  owner: "lyniago",
  scheme: "lynia",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "light",
  platforms: ["android", "ios"],
  plugins: [
    "expo-router",
    ["expo-location", { locationWhenInUsePermission: "Lynia uses your location to set the pickup point." }],
    [
      "expo-image-picker",
      {
        photosPermission: "Lynia needs access to your photos to add your ID/profile photo for verification.",
        cameraPermission: "Lynia uses the camera to take your ID/profile photo for verification.",
      },
    ],
    ["expo-notifications", { color: "#1E7A46" }],
    // expo-image-picker's native image-cropper (com.github.CanHub:Android-Image-Cropper) is published
    // on JitPack. Add it as a Gradle repo so the dependency resolves from its real home instead of a
    // flaky mirror (the build hit a 504 resolving it from oss.sonatype.org).
    // - extraMavenRepos: JitPack hosts expo-image-picker's native image-cropper.
    // - kotlinVersion 1.9.25: that cropper uses Jetpack Compose (Compose Compiler 1.5.15), which
    //   requires Kotlin 1.9.25; Expo SDK 52 defaults to 1.9.24, so bump it to match and unblock
    //   :expo-modules-core:compileReleaseKotlin.
    [
      "expo-build-properties",
      { android: { extraMavenRepos: ["https://www.jitpack.io"], kotlinVersion: "1.9.25" } },
    ],
    // Remove the sunset oss.sonatype.org repo, whose 504s break Gradle dependency resolution.
    "./plugins/withRemoveSonatype",
  ],
  android: {
    package: "zw.co.lynia",
    // Only attach the Maps block when a key is present, so an unkeyed build doesn't ship an empty key.
    ...(googleMapsApiKey ? { config: { googleMaps: { apiKey: googleMapsApiKey } } } : {}),
  },
  extra: {
    apiUrl: "https://lyniago.lyniafinance.com",
    eas: {
      projectId: "25b2785d-94e0-4ecc-9940-bd9f9d8eb27c",
    },
  },
};

export default config;
