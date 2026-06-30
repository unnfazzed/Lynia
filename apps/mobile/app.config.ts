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
  ],
  android: {
    package: "zw.co.lynia",
    // Only attach the Maps block when a key is present, so an unkeyed build doesn't ship an empty key.
    ...(googleMapsApiKey ? { config: { googleMaps: { apiKey: googleMapsApiKey } } } : {}),
  },
  extra: {
    apiUrl: "https://lyniago.lyniafinance.com",
  },
};

export default config;
