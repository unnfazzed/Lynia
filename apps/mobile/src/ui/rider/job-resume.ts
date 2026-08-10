/**
 * `offline_resume` (kit `explorations/restaurants/r-rider.jsx` — `RR.offline_resume`, "R4·b1 — phone
 * died mid-delivery"): detect that the APP PROCESS restarted while this job was still live, so the
 * rider gets "Job restored" instead of silently landing back on a job screen with no acknowledgement
 * that anything happened.
 *
 * The signal is deliberately one we can actually prove, not one we'd like to have:
 *   - `PROCESS_START_MS` is stamped when this module is first evaluated — i.e. at JS bundle load, which
 *     is once per app process. A real kill (OOM on a 1–2GB handset, force-stop, reboot) resets it; a
 *     background/foreground cycle does NOT.
 *   - `saveLastActiveJob` (net/last-active-store) stamps `savedAt` every time the live job's status
 *     changes. If the stored summary points at the SAME order we're looking at now AND was written
 *     BEFORE this process started, then some EARLIER process saw this job live and this one didn't
 *     start it — the app went away mid-job.
 *
 * Everything about the comparison is false-negative-safe: a save from THIS process lands with
 * `savedAt >= PROCESS_START_MS` and suppresses the banner, and a device clock that jumped forward
 * also suppresses it. We would rather miss a restore than announce one that didn't happen.
 *
 * What we deliberately do NOT claim: the kit's "your phone was off for 6 minutes". `savedAt` is the
 * last STATUS CHANGE, not the moment the app died, so the gap between them is not the outage length —
 * a rider parked at `en_route_dropoff` for half an hour would be told they were offline for half an
 * hour. There is no on-device record of when the process actually stopped, so the duration is left out
 * rather than invented.
 */
const PROCESS_START_MS = Date.now();

/**
 * True when `saved` is a summary of `orderId` written by an EARLIER app process — i.e. the app was
 * killed and relaunched while this job was live. `processStart` is injected so this stays pure.
 */
export function wasJobRestored(
  saved: { id: string; savedAt: string } | null,
  orderId: string | null,
  processStart: number = PROCESS_START_MS,
): boolean {
  if (!saved || !orderId || saved.id !== orderId) return false;
  const savedAtMs = Date.parse(saved.savedAt);
  if (!Number.isFinite(savedAtMs)) return false;
  return savedAtMs < processStart;
}
