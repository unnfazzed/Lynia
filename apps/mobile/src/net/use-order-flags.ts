import type { OrderFlagsResponse } from "@lynia/shared";
import { useEffect, useState } from "react";
import { API_URL } from "../config";
import { BACKGROUND_CHECK_TIMEOUT_MS } from "./network-policy";
import { fetchSignal } from "./fetch-signal";

/**
 * Order flow v2's switches (`GET /app/order-flags`, ledger D-59) — today only `rxEnabled`, the
 * prescription flow (BRIEF §13). Its own endpoint because the service-flags body is strict on installed
 * apps.
 *
 * FAILS CLOSED, unlike the section flags: Rx is off by default and launches dark, so the boot frame and
 * any network error / timeout / non-200 / shape mismatch keep every Rx part unrendered (and the server
 * hides "Prescription needed" items while it is off, so nothing can be ordered without the block).
 */
export const DEFAULT_ORDER_FLAGS: OrderFlagsResponse = { rxEnabled: false };

export async function fetchOrderFlags(fetchImpl: typeof fetch = fetch, timeoutMs = BACKGROUND_CHECK_TIMEOUT_MS): Promise<OrderFlagsResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${API_URL}/app/order-flags`, { signal: fetchSignal(controller) });
    if (!res.ok) return DEFAULT_ORDER_FLAGS;
    // Lazy, like use-service-flags: the contracts load on the first fetch, not on the launch path.
    const { OrderFlagsResponse: schema } = require("@lynia/shared") as typeof import("@lynia/shared");
    const parsed = schema.safeParse(await res.json());
    return parsed.success ? { rxEnabled: parsed.data.rxEnabled } : DEFAULT_ORDER_FLAGS;
  } catch {
    return DEFAULT_ORDER_FLAGS;
  } finally {
    clearTimeout(timer);
  }
}

/** Checked once per mount; a mid-session flip takes effect on the next visit. */
export function useOrderFlags(): OrderFlagsResponse {
  const [flags, setFlags] = useState<OrderFlagsResponse>(DEFAULT_ORDER_FLAGS);
  useEffect(() => {
    let cancelled = false;
    void fetchOrderFlags().then((value) => {
      if (!cancelled) setFlags(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return flags;
}
