import Constants from "expo-constants";

/**
 * API base URL. Set `extra.apiUrl` in app.json (defaults to localhost), or override at runtime with
 * the EXPO_PUBLIC_API_URL env var (e.g. your LAN IP so a phone on Expo Go can reach the dev API).
 */
const fromExtra = (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl;
export const API_URL: string = process.env.EXPO_PUBLIC_API_URL ?? fromExtra ?? "http://localhost:3000";

/** Socket.IO connects to the same origin as the REST API. */
export const WS_URL: string = API_URL;
