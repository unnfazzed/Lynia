import { useSyncExternalStore } from "react";
import { isReachable, subscribeReachability } from "./reachability";

/**
 * Subscribe a component to app-wide reachability. `true` when the API is reachable, `false` during a
 * network outage. Backed by `useSyncExternalStore` so every subscriber flips on the same render as the
 * store — the global offline banner and any screen-level affordance stay in sync.
 */
export function useReachability(): boolean {
  return useSyncExternalStore(subscribeReachability, isReachable, isReachable);
}
