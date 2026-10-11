import { useEffect, useRef, useState } from "react";

/**
 * A live clock for minute-granularity displays (open/closed badges, "closing in N min" countdowns)
 * — ticks on a fixed interval instead of freezing at first render. `useMemo(() => new Date(), deps)`
 * looks equivalent but isn't: it only recomputes when `deps` changes reference, and TanStack Query's
 * default structural sharing means a refetch that returns unchanged data keeps the same object
 * reference, so a `[feed.data]`-keyed memo can stay pinned indefinitely even while mounted and polling.
 * Not for anything needing sub-second precision — see AuctionClock for that per-screen pattern.
 *
 * `null` pauses the clock (P15: a tab that stays mounted while hidden stops re-rendering itself); the
 * clock jumps to the current time the moment it resumes, so nothing shows a stale minute after a pause.
 */
export function useNow(intervalMs: number | null = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  const paused = useRef(false);
  useEffect(() => {
    if (intervalMs == null) {
      paused.current = true;
      return;
    }
    if (paused.current) {
      paused.current = false;
      setNow(new Date());
    }
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
