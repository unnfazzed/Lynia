"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MerchantOrderResponse } from "@lynia/shared";
import { ApiError } from "./api-client";
import { API_BASE_URL } from "./config";
import { InflightLatch } from "./inflight-latch";
import { listQueue } from "./orders-api";
import { getReachabilityStore } from "./reachability";

const POLL_INTERVAL_MS = 5_000;

// LC-C04: comfortably above api-client's own MERCHANT_FETCH_TIMEOUT_MS (10s) — a normally-timed-out
// request always clears the latch itself first via `finally`; this is only the backstop for a request
// that somehow doesn't (a hang the transport's own timeout didn't catch, or a bug).
const INFLIGHT_STALE_MS = 25_000;

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
  const latch = useRef(new InflightLatch(INFLIGHT_STALE_MS)).current;
  // LC-C05: the latest generation to have started a request. Only that generation's response is
  // applied to state — a response from an older, out-of-order round trip (only reachable via the
  // latch's stale-override backstop, since the latch otherwise serializes requests) is discarded
  // instead of clobbering fresher state with stale data.
  const generationRef = useRef(0);
  // LC-C05: a refetch requested while one is already in flight (e.g. a post-mutation refetch
  // landing mid-poll) must not be silently dropped — an answered NEW ORDER takeover would keep
  // showing the pre-mutation order until the next interval tick. Coalesce it into one more round
  // right after the in-flight request settles.
  const pendingRef = useRef(false);

  const fetchOnce = useCallback(async () => {
    if (!latch.tryAcquire()) {
      pendingRef.current = true;
      return;
    }
    const generation = ++generationRef.current;
    const reachability = getReachabilityStore(API_BASE_URL);
    try {
      const result = await listQueue();
      reachability.reportReachable();
      if (generation === generationRef.current) {
        setOrders(result);
        setError(null);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        // status 0 is api-client's own marker for a network-level failure (fetch threw); any real
        // HTTP response — even a 4xx/5xx domain rejection — is still proof the server is reachable.
        if (err.status === 0) reachability.reportUnreachable();
        else reachability.reportReachable();
        if (generation === generationRef.current) setError(err);
      } else if (generation === generationRef.current) {
        setError(new ApiError(0, "Something went wrong loading the queue."));
      }
    } finally {
      setLoading(false);
      latch.release();
      if (pendingRef.current) {
        pendingRef.current = false;
        void fetchOnce();
      }
    }
  }, [latch]);

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
