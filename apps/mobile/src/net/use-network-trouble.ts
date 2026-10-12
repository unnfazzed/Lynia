import { useSyncExternalStore } from "react";
import { isNetworkTroubled, subscribeNetworkTrouble } from "./reachability";

/**
 * `true` while a request has failed and nothing has answered since (see reachability.ts). Real evidence
 * of a bad link — so a screen only says "slow network" when the network actually misbehaved, never
 * because a clock ran out on good Wi-Fi.
 */
export function useNetworkTrouble(): boolean {
  return useSyncExternalStore(subscribeNetworkTrouble, isNetworkTroubled, isNetworkTroubled);
}
