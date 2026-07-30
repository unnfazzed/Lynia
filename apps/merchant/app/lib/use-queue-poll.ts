"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MerchantOrderResponse } from "@lynia/shared";
import { ApiError } from "./api-client";
import { API_BASE_URL } from "./config";
import { listQueue } from "./orders-api";
import { getReachabilityStore } from "./reachability";

const POLL_INTERVAL_MS = 5_000;

export interface QueuePollState {
  orders: MerchantOrderResponse[];
  loading: boolean;
  error: ApiError | null;
  refetch: () => void;
}

/**
 * Lane C5 (kitchen realtime socket) hasn't merged yet — E2 builds against a polling fallback per the
 * plan's own gate note. Interval poll + a `visibilitychange` refetch (the tablet's screen coming back
 * on/foreground, the web equivalent of apps/mobile's `useForegroundRefetch`) so the queue never sits
 * stale for a full interval after the tablet wakes up. Every completed round trip also feeds the
 * shared reachability store, so a live queue poll counts as proof of life exactly like the dedicated
 * `/healthz` probe does.
 */
export function useQueuePoll(enabled: boolean): QueuePollState {
  const [orders, setOrders] = useState<MerchantOrderResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const inflight = useRef(false);

  const fetchOnce = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    const reachability = getReachabilityStore(API_BASE_URL);
    try {
      const result = await listQueue();
      setOrders(result);
      setError(null);
      reachability.reportReachable();
    } catch (err) {
      if (err instanceof ApiError) {
        // status 0 is api-client's own marker for a network-level failure (fetch threw); any real
        // HTTP response — even a 4xx/5xx domain rejection — is still proof the server is reachable.
        if (err.status === 0) reachability.reportUnreachable();
        else reachability.reportReachable();
        setError(err);
      } else {
        setError(new ApiError(0, "Something went wrong loading the queue."));
      }
    } finally {
      setLoading(false);
      inflight.current = false;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void fetchOnce();
    const interval = setInterval(() => void fetchOnce(), POLL_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void fetchOnce();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, fetchOnce]);

  return { orders, loading, error, refetch: () => void fetchOnce() };
}
