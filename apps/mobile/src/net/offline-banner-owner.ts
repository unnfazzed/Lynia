import { useEffect, useSyncExternalStore } from "react";

/**
 * Lets one screen draw its own offline banner in place of the app-wide strip. The order screen's
 * handoff (After Send, ledger D-53 state 19) draws an ink "Reconnecting… Showing the last update from
 * 09:24." banner directly under its header; with the root strip also showing, the customer would read
 * two offline bars. While a claim is held the root `ConnectivityBanner` stands down.
 */
let claims = 0;
const listeners = new Set<() => void>();
const emit = (): void => listeners.forEach((l) => l());

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
const snapshot = (): boolean => claims > 0;

/** True while some screen draws its own offline banner. */
export function useOfflineBannerClaimed(): boolean {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** Hold the offline banner for as long as the calling component is mounted (and `active`). */
export function useClaimOfflineBanner(active = true): void {
  useEffect(() => {
    if (!active) return;
    claims += 1;
    emit();
    return () => {
      claims -= 1;
      emit();
    };
  }, [active]);
}
