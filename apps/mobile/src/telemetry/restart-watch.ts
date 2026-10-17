import * as SecureStore from "expo-secure-store";
import { AppState, type AppStateStatus } from "react-native";
import { EVENTS, track } from "./events";

/**
 * Unexplained restarts. On 2026-10-17 two new bikers' apps cold-started seven times in an hour with no
 * crash report: Android killing the app (low memory), a native death Sentry didn't flush, or the rider
 * closing it, and nothing told those apart. The app now notes on the phone whether it left cleanly:
 * `clean` turns true when it goes to the background and false when it comes back. A cold start that
 * finds `clean: false` means the last run ended while the app was on screen, and reports
 * `app_unclean_restart` with the route pattern it was on (no ids, no PII).
 *
 * Known limit: an OS kill AFTER the app went to the background looks the same as the rider swiping it
 * away, so it is not reported. A first launch (no marker yet) reports nothing.
 */
export interface SessionMarker {
  /** The route PATTERN the app was last on (`/rider/offer/[jobId]`), as the screen tracker records it. */
  screen: string;
  /** True once the app went to the background; false while it is on screen. */
  clean: boolean;
}

export const SESSION_MARKER_KEY = "lynia.session-marker.v1";

/** A stored marker, or null for a missing or unreadable one (treated as a first launch). */
export function parseMarker(raw: string | null): SessionMarker | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<SessionMarker>;
    if (typeof v.screen !== "string" || typeof v.clean !== "boolean") return null;
    return { screen: v.screen.slice(0, 120), clean: v.clean };
  } catch {
    return null;
  }
}

/** What to report for the previous run, or null when it ended cleanly or there was none. */
export function restartReport(previous: SessionMarker | null): { last_screen: string } | null {
  return previous && !previous.clean ? { last_screen: previous.screen } : null;
}

let current: SessionMarker = { screen: "/", clean: false };
/** False until the previous run's marker has been read: nothing is written over it before then. */
let ready = false;
let started = false;

function save(): void {
  if (!ready) return;
  SecureStore.setItemAsync(SESSION_MARKER_KEY, JSON.stringify(current)).catch(() => undefined);
}

/** The screen tracker's route pattern changed. Saved while on screen, so a crash names where it happened. */
export function noteScreen(screen: string): void {
  if (current.screen === screen) return;
  current = { ...current, screen };
  if (!current.clean) save();
}

function onAppState(state: AppStateStatus): void {
  if (state === "background" && !current.clean) {
    current = { ...current, clean: true };
    save();
  } else if (state === "active" && current.clean) {
    current = { ...current, clean: false };
    save();
  }
}

/** Read the last run's marker, report it if it ended on screen, then start keeping this run's. Once per launch. */
export async function startRestartWatch(): Promise<void> {
  if (started) return;
  started = true;
  let previous: SessionMarker | null = null;
  try {
    previous = parseMarker(await SecureStore.getItemAsync(SESSION_MARKER_KEY));
  } catch {
    // Unreadable store: treat as a first launch.
  }
  const report = restartReport(previous);
  if (report) track(EVENTS.uncleanRestart, report);
  ready = true;
  current = { ...current, clean: AppState.currentState === "background" };
  save();
  AppState.addEventListener("change", onAppState);
}

/** Test seam. */
export function __resetRestartWatch(): void {
  current = { screen: "/", clean: false };
  ready = false;
  started = false;
}
