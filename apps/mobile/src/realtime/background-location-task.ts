import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { RP } from "../ui/firstrun/copy";

/**
 * Background GPS for the rider: the active-job stream (use-rider-location.ts) and, since 2026-10-12,
 * the idle-online heartbeat (use-rider-heartbeat.ts).
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
 * Idle-online (owner 2026-10-12, cold start with few riders): the board's 20 s heartbeat is a JS timer,
 * and it stops when the phone locks. The server drops a rider's bids from the customer's list ~60 s
 * after the last beat, so a rider who bid and pocketed the phone lost the bid before the customer
 * picked. While the rider is online, the same task now runs at a low rate and the heartbeat hook beats
 * off its fixes. ONE task, ONE foreground service: an active job switches it to the job rate, the
 * job's end switches it back, going offline stops it.
 *
 * TaskManager requires the task be DEFINED at module scope — outside any React lifecycle — so it
 * exists before the OS delivers a fix. This module is imported top-level by use-rider-location.ts and
 * use-rider-heartbeat.ts, which the board and the job screens import, so the definition runs at bundle
 * load, well before the rider goes online or a job goes active.
 *
 * The task callback runs headless: no React context, no hook closure, so it can't reach the socket,
 * the PendingFix buffer or the heartbeat directly. The hooks bridge that gap by registering a
 * forwarder here while (and only while) their window is open — the job forwarder while a job is
 * active, the online forwarder while the rider is online. A fix arriving with no forwarder registered
 * is dropped on the floor, which is exactly right — not online and no active job means nothing may be
 * sent.
 */

export const RIDER_LOCATION_TASK = "lynia-rider-location";

type BackgroundFixForwarder = (coords: { lat: number; lng: number }) => void;

let jobForwarder: BackgroundFixForwarder | null = null;
let onlineForwarder: BackgroundFixForwarder | null = null;

/**
 * The headless-task → job-stream bridge. The hook registers a closure (carrying the orderId, socket
 * and offline buffer) when the active-job stream opens, and MUST unregister (pass `null`) in the same
 * cleanup that tears the stream down — the bridge is the second half of the privacy gate: after
 * unregistering, even a straggler task invocation racing the async native stop goes nowhere.
 */
export function setBackgroundFixForwarder(fn: BackgroundFixForwarder | null): void {
  jobForwarder = fn;
}

/**
 * The headless-task → heartbeat bridge, with the same contract as the job one: registered while the
 * rider is online, unregistered in the cleanup that ends the online window (offline, sign-out, the
 * heartbeat 403).
 */
export function setOnlineFixForwarder(fn: BackgroundFixForwarder | null): void {
  onlineForwarder = fn;
}

/**
 * The task executor body, exported separately from the `defineTask` registration so the forwarding
 * rules are unit-testable without a device.
 */
export function handleBackgroundLocations(
  body: TaskManager.TaskManagerTaskBody<{ locations?: Location.LocationObject[] }>,
): void {
  if (body.error) return;
  // No forwarder means neither online nor on a job, so dropping is the correct (and privacy-required)
  // behaviour — never buffer fixes outside those windows.
  if (!jobForwarder && !onlineForwarder) {
    // …and when nothing wants the task either, it is an orphan: Android persists the registration and
    // the service can outlive the JS that started it (the process restarted headless for this very
    // wake-up, with fresh, empty state). Stop it rather than run a useless service and notification.
    // Intent is re-checked after the async check, so a board starting it meanwhile wins.
    if (wantedMode() == null) void safeStop();
    return;
  }
  const locations = body.data?.locations ?? [];
  // The OS may batch several fixes per wake-up. The customer's map only wants where the rider is
  // NOW (the same reasoning as PendingFix coalescing), so forward only the freshest fix in the
  // batch and drop the breadcrumb trail.
  const freshest = locations[locations.length - 1];
  if (!freshest) return;
  const fix = { lat: freshest.coords.latitude, lng: freshest.coords.longitude };
  // Both, during a job: the job stream for the customer's map, and the heartbeat (self-throttled) so
  // the rider stays fresh server-side even while the socket is down behind Google Maps.
  jobForwarder?.(fix);
  onlineForwarder?.(fix);
}

TaskManager.defineTask<{ locations?: Location.LocationObject[] }>(RIDER_LOCATION_TASK, async (body) =>
  handleBackgroundLocations(body),
);

type Mode = "job" | "online";

// First Run v2 (ledger D-82): the words P3 draws, from the handoff copy (`RP.fgsTitle/fgsBody`). A JS
// string, so an OTA carries a wording change; the service itself is native (manifest, store build).
// The handoff draws no idle-online notification, so the online mode shows the same one (no invented copy).
const FOREGROUND_SERVICE = {
  notificationTitle: RP.fgsTitle,
  notificationBody: RP.fgsBody,
  notificationColor: "#00B14F",
};

const OPTIONS: Record<Mode, Location.LocationTaskOptions> = {
  job: {
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
    foregroundService: FOREGROUND_SERVICE,
  },
  online: {
    // Only a heartbeat clock: each fix is a beat, and the server's selection TTL is 60 s. 25 s keeps
    // the rider fresh through one lost beat. Distance MUST stay 0 — Android filters fixes by minimum
    // displacement, and a rider parked waiting for a job (the common case) would never beat.
    accuracy: Location.Accuracy.Balanced,
    distanceInterval: 0,
    timeInterval: 25_000,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: FOREGROUND_SERVICE,
  },
};

/**
 * Last-write-wins intent flags that make start/stop safe to fire-and-forget from React effect
 * cleanup. The native calls are async, so a stop can land while a start is still in flight (job
 * cancelled right as it went active) and a start can land while a stop's `hasStarted` check is
 * awaiting (new job accepted immediately after the old one closed). Every path re-reads the wanted
 * mode after each await, so whichever intent was expressed LAST wins — and the tie-break failure mode
 * is always "stopped", the privacy-safe direction. A job outranks online: same service, job rate.
 */
let wantJob = false;
let wantOnline = false;
/** The options the task last started with — null when stopped (or never started). */
let runningMode: Mode | null = null;

function wantedMode(): Mode | null {
  return wantJob ? "job" : wantOnline ? "online" : null;
}

/**
 * Best-effort attempt to keep GPS streaming through the "Follow route in Google Maps" background
 * window. Never throws: any failure (iOS without background permission, Expo Go, an OEM quirk)
 * degrades silently to the existing foreground-only stream — a frozen-while-navigating map is a
 * quality regression, but blocking or crashing the job flow would be far worse.
 */
export async function startRiderBackgroundUpdates(): Promise<void> {
  wantJob = true;
  await apply();
}

/**
 * End the job window. Called from the same effect cleanup that closes the foreground stream, so the
 * job rate is scoped to EXACTLY assigned→delivered. A rider still online drops back to the online
 * rate; otherwise streaming stops — outside both windows it must be provably off (battery, data, and
 * above all the rider's privacy).
 */
export async function stopRiderBackgroundUpdates(): Promise<void> {
  wantJob = false;
  await apply();
}

/**
 * Keep the heartbeat flowing while an online rider's phone is locked. Same best-effort contract as
 * the job start. Android only lets a location foreground service START from the foreground, so the
 * caller fires this the moment the rider goes online (the board is on screen) and re-tries it on
 * resume via `resumeRiderBackgroundUpdates`.
 */
export async function startRiderOnlineUpdates(): Promise<void> {
  wantOnline = true;
  await apply();
}

/** The rider is no longer online (offline, sign-out, a heartbeat 403): stop, unless a job holds it. */
export async function stopRiderOnlineUpdates(): Promise<void> {
  wantOnline = false;
  await apply();
}

/**
 * Called when the app returns to the foreground. A start or a mode switch attempted while backgrounded
 * is refused by Android (a job that ended behind Google Maps, a go-online retry that landed in the
 * background), so re-apply whatever is wanted now — but leave a service already in the right mode
 * untouched (a re-start would restart its location request for nothing).
 */
export async function resumeRiderBackgroundUpdates(): Promise<void> {
  const mode = wantedMode();
  if (mode == null) return;
  if (mode === runningMode) {
    if (await isStarted()) return;
    // Wanted and believed running, yet nothing is registered: forget the belief so apply() starts it.
    runningMode = null;
  }
  await apply();
}

async function apply(): Promise<void> {
  const mode = wantedMode();
  if (mode == null) {
    await safeStop();
    return;
  }
  // Already running these options (e.g. the rider went offline mid-job): leave the stream alone.
  if (mode === runningMode) return;
  try {
    // An already-running task just takes the new options (TaskManager re-registers it in place), so
    // switching job ⇄ online never runs a second service.
    await Location.startLocationUpdatesAsync(RIDER_LOCATION_TASK, OPTIONS[mode]);
  } catch {
    // Degrade silently (see startRiderBackgroundUpdates). runningMode keeps what is actually running,
    // so a resume re-tries; a later stop no-ops via hasStarted when nothing ever started.
    return;
  }
  runningMode = mode;
  // An intent changed while the start was in flight — honour the latest (last write wins).
  const now = wantedMode();
  if (now == null) await safeStop();
  else if (now !== mode) await apply();
}

async function isStarted(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(RIDER_LOCATION_TASK);
  } catch {
    return false;
  }
}

async function safeStop(): Promise<void> {
  try {
    // hasStarted guard: stopLocationUpdatesAsync rejects when the task was never started (e.g. the
    // start call failed and we degraded to foreground-only) — a no-op stop must stay silent.
    if (!(await Location.hasStartedLocationUpdatesAsync(RIDER_LOCATION_TASK))) {
      if (wantedMode() == null) runningMode = null;
      return;
    }
    // Re-check the intent after the await: a new job (or going online) may have restarted updates
    // while we checked, and killing that fresh stream from the old cleanup would silently freeze it.
    if (wantedMode() != null) return;
    await Location.stopLocationUpdatesAsync(RIDER_LOCATION_TASK);
    runningMode = null;
  } catch {
    // Best-effort: nothing actionable if the native stop throws; the service dies with the process.
  }
}
