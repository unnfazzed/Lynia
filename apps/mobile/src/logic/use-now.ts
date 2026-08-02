import { useEffect, useState } from "react";

/**
 * A live clock for minute-granularity displays (open/closed badges, "closing in N min" countdowns)
 * — ticks on a fixed interval instead of freezing at first render. `useMemo(() => new Date(), deps)`
 * looks equivalent but isn't: it only recomputes when `deps` changes reference, and TanStack Query's
 * default structural sharing means a refetch that returns unchanged data keeps the same object
 * reference, so a `[feed.data]`-keyed memo can stay pinned indefinitely even while mounted and polling.
 * Not for anything needing sub-second precision — see AuctionClock for that per-screen pattern.
 */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
