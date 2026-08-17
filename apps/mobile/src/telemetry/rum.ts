import type { ClientMetricEvent, ClientMetricSample, ClientMetricsBatch } from "@lynia/shared";
import { AppState, type AppStateStatus, type NativeEventSubscription } from "react-native";
import { apiFetch } from "../api/client";

/**
 * Client RUM (real-user monitoring): a fire-and-forget latency buffer. Two kinds of signal land here:
 *
 *  - **glass-to-glass** samples (`position_glass` / `offer_glass` / `board_glass`) derived from a
 *    SERVER-stamped `at`/`createdAt` on a WS push vs. the moment the client renders it. Because the
 *    server clock and the device clock aren't synced, `Date.now() - Date.parse(at)` can be negative or
 *    absurd — `clampGlassSample` drops those (counted as `dropped`) so skew distorts nothing silently.
 *  - **`apifetch`** samples measured start+end on-client → skew-free, the PRIMARY signal.
 *
 * Everything that isn't React Native glue is a PURE, exported function (`clampGlassSample`,
 * `buildBatches`) so the logic is unit-tested directly (see `__tests__/rum.test.ts`) without a
 * device. The buffer never blocks the UI, never retries, and drops on any failure. If `start()`
 * was never called, `enqueue` is a cheap no-op (dormant-safe).
 */

/** Latency cap shared with the contract (samples above this are garbage → dropped). */
export const GLASS_CAP_MS = 60_000;

export type Role = ClientMetricsBatch["role"];

/**
 * Turn a server-stamped ISO timestamp + the current client clock into a latency in ms, or `null` when
 * the value is unusable (clock skew: negative, or beyond `capMs`, or an unparseable timestamp). Pure.
 */
export function clampGlassSample(nowMs: number, atIso: string, capMs: number = GLASS_CAP_MS): number | null {
  const at = Date.parse(atIso);
  if (Number.isNaN(at)) return null;
  const ms = nowMs - at;
  if (ms < 0 || ms > capMs) return null;
  return Math.round(ms);
}

/** A buffered sample, tagged with the role it should be reported under. */
export interface RoleSample {
  role: Role;
  event: ClientMetricEvent;
  ms: number;
}

/** Contract limits (mirror `ClientMetricsBatch.samples`: 1..20 per batch). */
const MAX_SAMPLES_PER_BATCH = 20;

/**
 * Group buffered samples by role into contract-shaped batches. Each role yields one-or-more batches of
 * at most 20 samples (the contract cap). The running `dropped` count is attributed once, to the first
 * batch emitted, so a single flush reports it exactly once rather than duplicating or losing it. Pure.
 */
export function buildBatches(samples: RoleSample[], dropped: number, appVersion?: string): ClientMetricsBatch[] {
  const byRole = new Map<Role, ClientMetricSample[]>();
  for (const s of samples) {
    const list = byRole.get(s.role) ?? [];
    list.push({ event: s.event, ms: s.ms });
    byRole.set(s.role, list);
  }

  const batches: ClientMetricsBatch[] = [];
  let droppedRemaining = dropped;
  for (const [role, list] of byRole) {
    for (let i = 0; i < list.length; i += MAX_SAMPLES_PER_BATCH) {
      const chunk = list.slice(i, i + MAX_SAMPLES_PER_BATCH);
      const batch: ClientMetricsBatch = { role, samples: chunk };
      if (appVersion) batch.appVersion = appVersion;
      // Attribute the whole dropped count to the first batch, once.
      if (droppedRemaining > 0) {
        batch.dropped = droppedRemaining;
        droppedRemaining = 0;
      }
      batches.push(batch);
    }
  }
  return batches;
}

// ---------------------------------------------------------------------------
// Singleton buffer (the impure, RN-glue half).
// ---------------------------------------------------------------------------

/** Hard ceiling on buffered samples; the oldest is dropped (and counted) when full. */
const MAX_BUFFER = 50;
/** Flush when the buffer reaches this many samples. */
const FLUSH_AT = 10;
/** Also flush on this cadence so a quiet buffer still ships. `AppState` background/inactive still
 *  flushes immediately (`onAppStateChange`), so this only bounds server-side data staleness for an
 *  app that stays foregrounded — RUM has no live consumer, so 30s costs nothing there. Widened from
 *  10s (A-O6, A-T4 evidence): at the old 10s cadence a metered-data session with a mostly-quiet
 *  buffer still paid one POST's fixed per-request overhead (headers, auth, TLS) every 10s for as
 *  little as 1-2 samples; 30s lets more samples accumulate per flush without materially delaying the
 *  data (RUM is fire-and-forget monitoring, not a live signal). */
const FLUSH_INTERVAL_MS = 30_000;
/** The endpoint we POST to — excluded from `apifetch` timing to avoid a feedback loop. */
export const CLIENT_METRICS_PATH = "/client-metrics";
/** Keep 1 of every N `apifetch` samples (A-O6, A-T4 evidence): during any active-tracking or
 *  food-polling window, an `apiFetch` sample enqueues on essentially every request, so the buffer is
 *  almost never empty and the app pays for a REST latency histogram with far more resolution than a
 *  p50/p95 dashboard needs. Glass samples (`position_glass`/`offer_glass`/`board_glass`) are NOT
 *  sampled — they're already bounded by real WS push frequency (much rarer than a REST call) and
 *  each one is independently informative rather than fungible with its neighbors. A deterministic
 *  modulo counter (not `Math.random()`) gives an exact 1-in-N cadence that's simple to reason about
 *  and unit-test, rather than a probabilistic rate that could streak. */
const APIFETCH_SAMPLE_RATE = 4;

let started = false;
let buffer: RoleSample[] = [];
let dropped = 0;
let apifetchCounter = 0;
let appVersion: string | undefined;
let intervalTimer: ReturnType<typeof setInterval> | null = null;
let appStateSub: NativeEventSubscription | null = null;
// The role the device is currently acting as, used to label role-agnostic signals (apifetch). Glass
// samples pass their own role explicitly. Defaults to "customer"; the realtime hooks set it on mount so
// a rider's REST timings aren't misfiled under "customer" (harden review P1).
let activeRole: Role = "customer";

/** Record which role the app is currently acting as (rider vs customer surface). */
export function setActiveRole(role: Role): void {
  activeRole = role;
}

// ---------------------------------------------------------------------------
// Cold start. Until these two events existed, launch was the ONE thing the fleet never measured
// (`ClientMetricEvent` was three glass latencies and `apifetch`), so an 8-second cold start reported
// by the owner could not be attributed to a phase, and no fix to it could be proven or defended
// against regression. See docs/PERFORMANCE.md → "Cold start".
// ---------------------------------------------------------------------------

/** Fallback clock origin: when THIS module was evaluated. Later than the true bundle start (rum.ts
 *  sits a few levels into the startup graph), so it under-reports — only used when the preferred
 *  `__BUNDLE_START_TIME__` origin below is unusable. */
const MODULE_LOADED_AT = Date.now();

/** Metro stamps `__BUNDLE_START_TIME__` at the very top of the bundle, before a single module factory
 *  runs — the only origin that includes the module-evaluation cost this instrumentation exists to
 *  watch. It uses `nativePerformanceNow()` when available and `Date.now()` otherwise, and the two are
 *  different clocks, so mixing them silently yields garbage. Rather than guess which one produced it,
 *  compute the `performance.now()` reading and accept it only if it lands in a plausible range;
 *  a `Date.now()`-based origin makes that difference wildly negative and falls through to the
 *  module-load origin instead. Exported for unit tests. */
export function bootElapsedMs(
  now = globalThis.performance?.now?.(),
  bundleStart = (globalThis as { __BUNDLE_START_TIME__?: number }).__BUNDLE_START_TIME__,
  wallNow = Date.now(),
  wallOrigin = MODULE_LOADED_AT,
): number {
  if (typeof now === "number" && typeof bundleStart === "number") {
    const elapsed = Math.round(now - bundleStart);
    if (elapsed >= 0 && elapsed <= GLASS_CAP_MS) return elapsed;
  }
  // Clamped to the contract's `ms` bounds (0..60s) — a device clock stepped mid-boot (NTP sync on a
  // fresh handset) must not produce a sample the server rejects for the whole batch.
  return Math.min(Math.max(Math.round(wallNow - wallOrigin), 0), GLASS_CAP_MS);
}

/** Boot events are once-per-process by definition; a remount (Fast Refresh, an ErrorBoundary retry)
 *  must not enqueue a second, meaningless sample against the same origin. */
const bootEventsSent = new Set<ClientMetricEvent>();

/**
 * Record a cold-start milestone, measured from bundle start. No-op before `start()` (dormant-safe,
 * like every other enqueue here) and no-op on a repeat of the same milestone. Filed under the app's
 * current role so a rider's launch isn't misattributed to "customer".
 */
export function enqueueBoot(event: "boot_paint" | "boot_home" | "boot_home_paint"): void {
  if (bootEventsSent.has(event)) return;
  bootEventsSent.add(event);
  enqueue(event, bootElapsedMs(), activeRole);
}

/** Enqueue a skew-free `apifetch` round-trip under whatever role the app is currently acting as.
 *  Sampled 1-in-`APIFETCH_SAMPLE_RATE` (a no-op before `start()`, matching `enqueue`'s dormant-safe
 *  contract — the counter only advances once armed, so cadence is stable app-launch to app-launch). */
export function enqueueApiFetch(ms: number): void {
  if (!started) return;
  apifetchCounter += 1;
  if (apifetchCounter % APIFETCH_SAMPLE_RATE !== 0) return;
  enqueue("apifetch", ms, activeRole);
}

/**
 * Push a latency sample. No-op until `start()` runs (dormant-safe). When the buffer is full the oldest
 * sample is discarded and counted in `dropped`. Reaching `FLUSH_AT` triggers a flush.
 */
export function enqueue(event: ClientMetricEvent, ms: number, role: Role): void {
  if (!started) return;
  buffer.push({ role, event, ms });
  if (buffer.length > MAX_BUFFER) {
    buffer.shift();
    dropped += 1;
  }
  if (buffer.length >= FLUSH_AT) void flush();
}

/**
 * Count a sample the caller had to discard before it ever reached the buffer — e.g. a `clampGlassSample`
 * that returned `null` because of clock skew. Rolls into the batch's `dropped` field so tail distortion
 * is measurable rather than silent. No-op until `start()` runs (dormant-safe).
 */
export function noteDropped(n = 1): void {
  if (!started) return;
  dropped += n;
}

/**
 * Drain the buffer, group by role, and POST each batch. Fire-and-forget: any failure is swallowed and
 * the batch is dropped (no retry, no retry-storm). The buffer + dropped counter are reset up front so a
 * slow POST can't double-send samples an interleaved `enqueue` appended.
 */
export async function flush(): Promise<void> {
  if (!started || buffer.length === 0) return;
  const pending = buffer;
  const pendingDropped = dropped;
  buffer = [];
  dropped = 0;

  const batches = buildBatches(pending, pendingDropped, appVersion);
  await Promise.all(
    batches.map((batch) =>
      apiFetch<void>(CLIENT_METRICS_PATH, { method: "POST", body: batch, auth: true }).catch(() => {
        // Fire-and-forget: drop the batch's samples, never retry. But re-credit its `dropped` count so a
        // persistent flush failure (e.g. expired token) stays measurable instead of silently vanishing.
        if (batch.dropped) dropped += batch.dropped;
      }),
    ),
  );
}

function onAppStateChange(next: AppStateStatus): void {
  // Ship what we have before the OS suspends the app.
  if (next === "background" || next === "inactive") void flush();
}

/** Arm the buffer: start the interval + AppState flush triggers. Idempotent. */
export function start(version?: string): void {
  if (started) return;
  started = true;
  appVersion = version;
  apifetchCounter = 0;
  intervalTimer = setInterval(() => void flush(), FLUSH_INTERVAL_MS);
  appStateSub = AppState.addEventListener("change", onAppStateChange);
}

/** Tear down timers/listeners and clear the buffer. Mainly for tests / hot-reload cleanliness. */
export function stop(): void {
  if (!started) return;
  started = false;
  if (intervalTimer) clearInterval(intervalTimer);
  intervalTimer = null;
  appStateSub?.remove();
  appStateSub = null;
  buffer = [];
  dropped = 0;
  apifetchCounter = 0;
  // The boot milestones are once-per-PROCESS, but a test that stops and restarts the buffer is
  // simulating a fresh process — leaving them latched would silently no-op the next case.
  bootEventsSent.clear();
}
