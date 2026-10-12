/**
 * The rider board's REST polls (open jobs, food offers) are the fallback for its socket, not a second feed:
 * while the board socket is up it pushes every change (`board:new-order`, `food:offer` …) and the poll is
 * off; it runs only while the socket is down or the last read failed (BD-H4), and never while offline.
 * One rule for both, so they can't drift apart again (the food-offer poll used to run every 15 s regardless).
 */
export function boardPollMs(active: boolean, socketUp: boolean, lastReadFailed: boolean, everyMs: number): number | false {
  if (!active) return false;
  return socketUp && !lastReadFailed ? false : everyMs;
}
