import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";

/**
 * Background GPS continuation for the rider's active-job stream (use-rider-location.ts).
 *
 * Why this exists: the job screen's "Follow route in Google Maps" hand-off backgrounds the app for
 * most of the trip, and the foreground-only `watchPositionAsync` stream silently pauses the moment
 * that happens — so the customer's live map froze for exactly the navigation window. On Android (the
 * launch market) `startLocationUpdatesAsync` runs a **foreground service** with a persistent
 * notification, which keeps fixes flowing while backgrounded using plain while-in-use permission —
 * deliberately NOT `ACCESS_BACKGROUND_LOCATION`, which would put the app through Play's
 * background-location policy review for no gain here. On iOS the start call rejects without "always"
 * permission, which we don't request; iOS simply keeps today's foreground-only behaviour (degrade,
 * never block the job flow).
 *
 * TaskManager requires the task be DEFINED at module scope — outside any React lifecycle — so it
 * exists before the OS delivers a fix. This module is imported top-level by use-rider-location.ts,
 * which the job screen imports, so the definition runs at bundle load, well before a job goes active.
 *
 * The task callback runs headless: no React context, no hook closure, so it can't reach the socket or
 * the PendingFix buffer directly. The hook bridges that gap by registering a forwarder here while
 * (and only while) a job is active; a fix arriving with no forwarder registered is dropped on the
 * floor, which is exactly right — no active job means nothing may be streamed.
 */

export const RIDER_LOCATION_TASK = "lynia-rider-location";

type BackgroundFixForwarder = (coords: { lat: number; lng: number }) => void;

let forwarder: BackgroundFixForwarder | null = null;

/**
 * The headless-task → hook bridge. The hook registers a closure (carrying the orderId, socket and
 * offline buffer) when the active-job stream opens, and MUST unregister (pass `null`) in the same
 * cleanup that tears the stream down — the bridge is the second half of the privacy gate: after
 * unregistering, even a straggler task invocation racing the async native stop goes nowhere.
 */
export function setBackgroundFixForwarder(fn: BackgroundFixForwarder | null): void {
  forwarder = fn;
}

/**
 * The task executor body, exported separately from the `defineTask` registration so the forwarding
 * rules are unit-testable without a device.
 */
export function handleBackgroundLocations(
  body: TaskManager.TaskManagerTaskBody<{ locations?: Location.LocationObject[] }>,
): void {
  // An errored invocation carries no usable fix; no forwarder means no active job, so dropping is
  // the correct (and privacy-required) behaviour — never buffer fixes outside the active-job window.
  if (body.error || !forwarder) return;
  const locations = body.data?.locations ?? [];
  // The OS may batch several fixes per wake-up. The customer's map only wants where the rider is
  // NOW (the same reasoning as PendingFix coalescing), so forward only the freshest fix in the
  // batch and drop the breadcrumb trail.
  const freshest = locations[locations.length - 1];
  if (!freshest) return;
  forwarder({ lat: freshest.coords.latitude, lng: freshest.coords.longitude });
}

TaskManager.defineTask<{ locations?: Location.LocationObject[] }>(RIDER_LOCATION_TASK, async (body) =>
  handleBackgroundLocations(body),
);

/**
 * Last-write-wins intent flag that makes start/stop safe to fire-and-forget from React effect
 * cleanup. Both native calls are async, so a stop can land while a start is still in flight (job
 * cancelled right as it went active) and a start can land while a stop's `hasStarted` check is
 * awaiting (new job accepted immediately after the old one closed). Each side re-checks the flag
 * after every await, so whichever intent was expressed LAST wins — and the tie-break failure mode
 * is always "stopped", the privacy-safe direction.
 */
let wantRunning = false;

/**
 * Best-effort attempt to keep GPS streaming through the "Follow route in Google Maps" background
 * window. Never throws: any failure (iOS without background permission, Expo Go, an OEM quirk)
 * degrades silently to the existing foreground-only stream — a frozen-while-navigating map is a
 * quality regression, but blocking or crashing the job flow would be far worse.
 */
export async function startRiderBackgroundUpdates(): Promise<void> {
  wantRunning = true;
  try {
    await Location.startLocationUpdatesAsync(RIDER_LOCATION_TASK, {
      // Same throttling as the foreground watchPositionAsync stream (use-rider-location.ts). The
      // two run in parallel while the app is foregrounded; matching intervals keeps that overlap
      // free — the customer's tracker only ever keeps the latest position anyway.
      accuracy: Location.Accuracy.Balanced,
      distanceInterval: 25,
      timeInterval: 10_000,
      // iOS-only knobs, inert on Android: never auto-pause mid-delivery, and show the status-bar
      // indicator if iOS ever does run this (it won't without "always" permission — see above).
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      // Android: the foreground service is what keeps fixes flowing while the rider navigates.
      // Plain rider language — this is a persistent notification they will see the whole trip.
      foregroundService: {
        notificationTitle: "LyniaGo — delivery in progress",
        notificationBody: "Sharing your location with the customer for this delivery.",
        notificationColor: "#00B14F",
      },
    });
  } catch {
    // Degrade silently (see the function doc). wantRunning stays true, but with nothing started
    // there is nothing to stop — the eventual stopRiderBackgroundUpdates() no-ops via hasStarted.
    return;
  }
  // A stop was requested while the start call was in flight — honour it now (last write wins).
  if (!wantRunning) await safeStop();
}

/**
 * Fully stop background streaming. Called from the same effect cleanup that closes the foreground
 * stream, so the background task is scoped to EXACTLY the active-job window (assigned→delivered) —
 * outside it, streaming must be provably off (battery, data, and above all the rider's privacy).
 */
export async function stopRiderBackgroundUpdates(): Promise<void> {
  wantRunning = false;
  await safeStop();
}

async function safeStop(): Promise<void> {
  try {
    // hasStarted guard: stopLocationUpdatesAsync rejects when the task was never started (e.g. the
    // start call failed and we degraded to foreground-only) — a no-op stop must stay silent.
    if (!(await Location.hasStartedLocationUpdatesAsync(RIDER_LOCATION_TASK))) return;
    // Re-check the intent after the await: a new job may have restarted updates while we checked,
    // and killing the NEW job's stream from the OLD job's cleanup would silently freeze its map.
    if (wantRunning) return;
    await Location.stopLocationUpdatesAsync(RIDER_LOCATION_TASK);
  } catch {
    // Best-effort: nothing actionable if the native stop throws; the service dies with the process.
  }
}
