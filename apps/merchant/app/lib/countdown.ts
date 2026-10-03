/** Pure clock-math for every deadline/countdown the queue renders (N-03 accept window, N-18 item-
 *  approval window, N-04 prep countdown, N-07 NO_RIDER search). The client never invents a deadline,
 *  only renders the server's own ISO timestamp against the current clock. */
export function msUntil(deadlineIso: string | null, nowMs: number): number {
  if (!deadlineIso) return 0;
  return Math.max(0, new Date(deadlineIso).getTime() - nowMs);
}

/** "2:41" mm:ss grammar, matching the gallery's countdown copy. */
export function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
