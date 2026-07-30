"use client";

import { useEffect, useState } from "react";

/** A ticking clock for every countdown the queue renders — one shared interval per mounted consumer
 *  rather than each card scheduling its own. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
