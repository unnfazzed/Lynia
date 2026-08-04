"use client";

import { useEffect, useState } from "react";

/** A ticking clock for every countdown the queue renders — one shared interval per mounted consumer
 *  rather than each card scheduling its own. `enabled` (B-O16) lets a caller whose current render
 *  branch never reads `now` skip starting the interval entirely, instead of ticking (and
 *  re-rendering) once/sec for no visible benefit — mirrors the mobile app's B-O8 `needsClock`
 *  gating convention. */
export function useNow(intervalMs = 1000, enabled = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, enabled]);
  return now;
}
