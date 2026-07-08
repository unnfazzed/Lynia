import LogRocket from "@logrocket/react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";

/** LogRocket project for LyniaGo session replay (app.logrocket.com → 8bwxvq/lyniago). */
const LOGROCKET_APP_ID = "8bwxvq/lyniago";

/**
 * Session replay (LogRocket): armed once at app root, next to the RUM buffer. Complements RUM —
 * RUM answers "how slow", replay answers "what did the user actually see" when triaging a report.
 *
 * Best-effort by design, same contract as the RUM buffer: recording must never take the app down,
 * so init failures are swallowed. The SDK is custom native code, which means:
 *
 *  - **Expo Go has no module to bind** (custom native code can't load there), so we skip init
 *    entirely — `expo start` against Expo Go keeps working. Dev-client and EAS builds record.
 *  - The native side only exists once a build includes the `@logrocket/react-native` config
 *    plugin (app.config.ts) — an older binary getting this JS via OTA just no-ops in the catch.
 */
export function startLogRocket(): void {
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return; // Expo Go
  try {
    LogRocket.init(LOGROCKET_APP_ID, {
      network: {
        // Replays are viewable by anyone with dashboard access — never let a bearer token into
        // one. Blank the auth header on every captured request (case-insensitive to be safe).
        requestSanitizer: (request) => {
          for (const header of Object.keys(request.headers)) {
            if (header.toLowerCase() === "authorization") request.headers[header] = null;
          }
          return request;
        },
      },
    });
  } catch {
    // Replay stays inert on any failure — telemetry is never load-bearing.
  }
}
