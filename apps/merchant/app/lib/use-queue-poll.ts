"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MerchantOrderResponse } from "@lynia/shared";
import { ApiError } from "./api-client";
import { createCoalescedFetch } from "./coalesced-fetch";
import { API_BASE_URL } from "./config";
import { mergeOrders } from "./merge-orders";
import { listQueue } from "./orders-api";
import { getReachabilityStore } from "./reachability";

/** The poll while the kitchen socket is down: the queue's only news, so as often as before. */
export const POLL_INTERVAL_MS = 5_000;
/**
 * MJ-P1 (2026-10-07): the poll while the server has confirmed this tablet is in its queue room. The server
 * pushes `food:queue-changed` the moment an order changes and the shell refetches on it
 * (KitchenConnectionProvider), so the poll is only the backstop for a push that never came — it used to
 * run every 5 s all day regardless: 19 requests and ~24 KB per idle minute with three orders. 15 s, not
 * more: a room membership can be lost without the client hearing of it (review of MJ-P1).
 */
export const SOCKET_POLL_INTERVAL_MS = 15_000;

export interface QueuePollState {
  orders: MerchantOrderResponse[];
  loading: boolean;
  /** At least one round trip has succeeded — `orders` is the real queue, not the empty start. */
  loaded: boolean;
  error: ApiError | null;
  refetch: () => Promise<void>;
}

/**
 * The live order queue: an interval poll, plus a `visibilitychange` refetch (the tablet's screen coming
 * back on/foreground, the web equivalent of apps/mobile's `useForegroundRefetch`) so the queue never sits
 * stale for a full interval after the tablet wakes up. `pushBacked` (MJ-P1: the server answered the
 * queue-room join) slows the interval to {@link SOCKET_POLL_INTERVAL_MS}; `beforeTick` runs before each
 * interval read (the shell re-joins the room there, so a lost membership is noticed and repaired). Every completed round trip also
 * feeds the shared reachability store, so a live queue poll counts as proof of life exactly like the
 * dedicated `/healthz` probe does.
 *
 * The round trips are coalesced (`createCoalescedFetch`): one at a time behind a self-healing latch
 * (LC-C04), only the latest generation applies its answer (LC-C05), and a refetch asked for mid-flight is
 * folded into one more round that an awaiting caller waits for (LC-C05 / LC-D##: the post-accept refetch
 * must show the accept before its buttons come back).
 */
export function useQueuePoll(enabled: boolean, opts: { pushBacked?: boolean; beforeTick?: () => Promise<void> } = {}): QueuePollState {
  const [orders, setOrders] = useState<MerchantOrderResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const fetchOnce = useMemo(
    () =>
      createCoalescedFetch(async (isLatest) => {
        const reachability = getReachabilityStore(API_BASE_URL);
        try {
          const result = await listQueue();
          reachability.reportReachable();
          if (isLatest()) {
            // B-O17: reuse an unchanged order's previous object reference so a memoized row can
            // actually skip re-rendering it (see mergeOrders' own doc comment).
            setOrders((prevOrders) => mergeOrders(prevOrders, result));
            setLoaded(true);
            setError(null);
          }
        } catch (err) {
          if (err instanceof ApiError) {
            // status 0 is api-client's own marker for a network-level failure (fetch threw); any real
            // HTTP response — even a 4xx/5xx domain rejection — is still proof the server is reachable.
            if (err.status === 0) reachability.reportUnreachable();
            else reachability.reportReachable();
            if (isLatest()) setError(err);
          } else if (isLatest()) {
            setError(new ApiError(0, "Something went wrong loading the queue."));
          }
        } finally {
          setLoading(false);
        }
      }),
    [],
  );

  // The first read and the foreground refetch belong to the session, not to the interval: a socket
  // coming up or dropping changes the cadence without a read of its own.
  useEffect(() => {
    if (!enabled) return;
    void fetchOnce();
    const onVisible = () => {
      if (document.visibilityState === "visible") void fetchOnce();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [enabled, fetchOnce]);

  const beforeTickRef = useRef(opts.beforeTick);
  beforeTickRef.current = opts.beforeTick;
  const intervalMs = opts.pushBacked ? SOCKET_POLL_INTERVAL_MS : POLL_INTERVAL_MS;
  useEffect(() => {
    if (!enabled) return;
    const tick = async () => {
      try {
        await beforeTickRef.current?.();
      } catch {
        // The read below is the point of the tick.
      }
      await fetchOnce();
    };
    const interval = setInterval(() => void tick(), intervalMs);
    return () => clearInterval(interval);
  }, [enabled, fetchOnce, intervalMs]);

  return { orders, loading, loaded, error, refetch: fetchOnce };
}
