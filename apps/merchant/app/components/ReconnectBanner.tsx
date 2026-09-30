"use client";

import { useEffect, useRef } from "react";
import { getReachabilityStore } from "../lib/reachability";
import { API_BASE_URL } from "../lib/config";
import { useKitchenConnection } from "./KitchenConnectionProvider";
import { Icon } from "./icons";
import { useToast } from "./m/Toast";

/**
 * The connection, shown only when it is lost (merchant-mobile README global change 5): a red bar,
 * "No connection, retrying…". Mutations fail on their own while it shows (the API client refuses them
 * offline). Coming back is a toast, naming how many orders the queue backfilled when the screen with a
 * live queue knows (`backfillCount`).
 */
export function ReconnectBanner({ backfillCount }: { backfillCount?: number } = {}) {
  const { reachability } = useKitchenConnection();
  const toast = useToast();
  const backfillRef = useRef(backfillCount);
  backfillRef.current = backfillCount;

  useEffect(() => {
    // Watch the store directly so we see the transition (prev state) rather than only the settled one.
    const store = getReachabilityStore(API_BASE_URL);
    let prev = store.getState();
    return store.subscribe((next) => {
      if (!prev.reachable && next.reachable && prev.unreachableSinceMs !== null) {
        // Back online: the handoff draws no banner for it, so it is the one-line toast every committed
        // change gets. The queue's own poll backfills whatever came in while the phone was offline.
        const count = backfillRef.current ?? 0;
        toast(count > 0 ? `Back online · ${count} order${count === 1 ? "" : "s"} came in` : "Back online");
      }
      prev = next;
    });
  }, [toast]);

  if (!reachability.reachable) {
    // merchant-mobile README global change 5 + "Offline": the connection shows only when it is lost —
    // one red bar with the wifi-off glyph, within 3s of the drop.
    return (
      <div className="m-offline" role="alert">
        <Icon name="wifi-off" size={18} />
        <span>No connection, retrying…</span>
      </div>
    );
  }

  return null;
}
