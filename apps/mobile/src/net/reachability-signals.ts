import { AppState, type AppStateStatus, Platform } from "react-native";
import { isReachable, probeNow, reportUnreachable } from "./reachability";

/**
 * Hints that make reachability react at once instead of waiting out its backoff. Reachability itself
 * stays outcome-driven (only a real round-trip proves the API is up — see reachability.ts); these only
 * decide WHEN to look:
 *
 * - **Back in the foreground** (both platforms). After a long outage the `/health` probe has settled
 *   into its 30s heartbeat, and a phone that left the dead zone while backgrounded (a taxi ride, a
 *   basement) came back to up to 30s of "Offline" banner over a link that already worked. Returning to
 *   the app now probes immediately.
 * - **The browser says the network is back** (`online`, web only). Same reason; the event is
 *   optimistic (a captive portal fires it too), so it triggers a probe rather than being believed.
 * - **The browser says there is no network** (`offline`, web only). That one is reliable, so the strip
 *   shows and queries pause now, instead of each in-flight request burning its 15s timeout first.
 *
 * Call once at the app root; returns the unsubscribe.
 */
export function wireReachabilitySignals(): () => void {
  const onAppState = (status: AppStateStatus): void => {
    if (status === "active" && !isReachable()) probeNow();
  };
  const sub = AppState.addEventListener("change", onAppState);

  // The app's tsconfig has no DOM lib, so the browser's window events are typed by hand.
  type EventTarget = { addEventListener(type: string, fn: () => void): void; removeEventListener(type: string, fn: () => void): void };
  const g = globalThis as unknown as Partial<EventTarget>;
  const win = Platform.OS === "web" && typeof g.addEventListener === "function" ? (g as EventTarget) : null;
  const onOnline = (): void => probeNow();
  const onOffline = (): void => reportUnreachable();
  win?.addEventListener("online", onOnline);
  win?.addEventListener("offline", onOffline);
  return () => {
    sub.remove();
    win?.removeEventListener("online", onOnline);
    win?.removeEventListener("offline", onOffline);
  };
}
