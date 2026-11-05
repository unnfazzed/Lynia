import * as Device from "expo-device";
import { AppState, type AppStateStatus } from "react-native";
import { getBootReadiness } from "../boot/boot-readiness";
import { EVENTS, track } from "./events";

/**
 * JS-thread stalls (KNOWN_BUGS MOB-WHITE-01). Android users report that the screen "turns white"
 * mid-use and recovers if they wait. Nothing in the fleet saw it: no Sentry error, no Play crash, no
 * ANR. An ANR needs the native MAIN thread blocked; a blocked JS thread leaves the main thread free, so
 * Android keeps drawing the empty scene native-stack has already pushed while React can't commit into it.
 * That shape fits every symptom, and nothing measured it.
 *
 * So the app watches its own JS clock: a timer ticks every {@link TICK_MS}; when a tick arrives more than
 * {@link STALL_MS} late, the JS thread was blocked for that long, and `js_stall` reports how long, on which
 * route pattern, during boot or not, and the phone's RAM class. PostHog adds the device model and app
 * version itself. No ids, no PII.
 *
 * Only while the app is ACTIVE: Android pauses JS timers in the background, and a resume would read as a
 * huge false stall, so the clock stops on background and restarts fresh on active. Capped per launch so
 * a phone that stalls constantly cannot flood the queue.
 *
 * Known limit: a native-only blank (a map/GPU surface going white with JS running fine) is invisible
 * here. Session replay covers that half.
 */

export const TICK_MS = 500;
/** A tick this much later than due counts as a stall: long enough to read as "the screen went white". */
export const STALL_MS = 2_000;
/** At most this many reports per launch. */
export const MAX_REPORTS = 20;

let screen = "/";
let lastTick = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let reports = 0;
let started = false;

/** The route pattern the app is on, as the screen tracker records it. */
export function noteStallScreen(next: string): void {
  screen = next;
}

/** Device RAM rounded to whole GB (null when the platform doesn't say). Coarse, non-identifying. */
function ramGb(): number | null {
  const bytes = Device.totalMemory;
  return typeof bytes === "number" && bytes > 0 ? Math.round(bytes / 1024 ** 3) : null;
}

/** One tick: report the gap if the JS thread was blocked for longer than {@link STALL_MS}. Exported for tests. */
export function tick(now: number = Date.now()): void {
  const late = now - lastTick - TICK_MS;
  lastTick = now;
  if (late < STALL_MS || reports >= MAX_REPORTS) return;
  reports += 1;
  track(EVENTS.jsStall, {
    stall_ms: Math.round(late),
    screen,
    during_boot: getBootReadiness().endedAt == null,
    ram_gb: ramGb(),
    nth: reports,
  });
}

function run(): void {
  if (timer != null) return;
  lastTick = Date.now();
  timer = setInterval(() => tick(), TICK_MS);
}

function stop(): void {
  if (timer == null) return;
  clearInterval(timer);
  timer = null;
}

function onAppState(state: AppStateStatus): void {
  if (state === "active") run();
  else stop();
}

/** Start watching for the rest of the process. Idempotent; never throws. */
export function startStallWatch(): void {
  if (started) return;
  started = true;
  try {
    if (AppState.currentState === "active" || AppState.currentState == null) run();
    AppState.addEventListener("change", onAppState);
  } catch {
    // Telemetry is never a dependency.
  }
}

/** Test seam. */
export function __resetStallWatch(): void {
  stop();
  screen = "/";
  lastTick = 0;
  reports = 0;
  started = false;
}
