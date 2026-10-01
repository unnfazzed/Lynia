import { useSyncExternalStore } from "react";
import { isReachable, subscribeReachability } from "./reachability";

/** Whether the API is reachable right now (the app-wide probe in `reachability.ts`), as React state. */
export function useReachable(): boolean {
  return useSyncExternalStore(subscribeReachability, isReachable, isReachable);
}
