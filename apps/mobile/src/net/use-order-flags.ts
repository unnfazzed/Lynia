import type { OrderFlagsResponse } from "@lynia/shared";
import { API_URL } from "../config";
import { BACKGROUND_CHECK_TIMEOUT_MS } from "./network-policy";
import { fetchSignal } from "./fetch-signal";
import { createSharedFlags, isBooleanRecord } from "./shared-flags";

/**
 * Order flow v2's switches (`GET /app/order-flags`, ledger D-59) — today only `rxEnabled`, the
 * prescription flow (BRIEF §13). Its own endpoint because the service-flags body is strict on installed
 * apps.
 *
 * FAILS CLOSED, unlike the section flags: the server has Rx on by default (D-76), but the boot frame and
 * any network error / timeout / non-200 / shape mismatch keep every Rx part unrendered (and the server
 * hides "Prescription needed" items while it is off, so nothing can be ordered without the block).
 */
export const DEFAULT_ORDER_FLAGS: OrderFlagsResponse = { rxEnabled: false };

/** The server's answer, or null on any failure (the shared store keeps the last known answer then). */
async function tryFetchOrderFlags(fetchImpl: typeof fetch = fetch, timeoutMs = BACKGROUND_CHECK_TIMEOUT_MS): Promise<OrderFlagsResponse | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${API_URL}/app/order-flags`, { signal: fetchSignal(controller) });
    if (!res.ok) return null;
    // Lazy, like use-service-flags: the contracts load on the first fetch, not on the launch path.
    const { OrderFlagsResponse: schema } = require("@lynia/shared") as typeof import("@lynia/shared");
    const parsed = schema.safeParse(await res.json());
    return parsed.success ? { rxEnabled: parsed.data.rxEnabled } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchOrderFlags(fetchImpl: typeof fetch = fetch, timeoutMs = BACKGROUND_CHECK_TIMEOUT_MS): Promise<OrderFlagsResponse> {
  return (await tryFetchOrderFlags(fetchImpl, timeoutMs)) ?? DEFAULT_ORDER_FLAGS;
}

/** The server's max-age on `/app/order-flags`: re-asked at most this often, across every screen. */
export const ORDER_FLAGS_MAX_AGE_MS = 60_000;

/** Where the last good answer is persisted between launches (a storage name, not a secret). */
const ORDER_FLAGS_STORE = "lynia.order-flags.v1";

const orderFlags = createSharedFlags<OrderFlagsResponse>({
  storageKey: ORDER_FLAGS_STORE,
  defaults: DEFAULT_ORDER_FLAGS,
  fetch: () => tryFetchOrderFlags(),
  delayMs: 0,
  maxAgeMs: ORDER_FLAGS_MAX_AGE_MS,
  isValid: (v): v is OrderFlagsResponse => isBooleanRecord(v, ["rxEnabled"]),
});

/**
 * Shared across mounts (P17 / U09): every screen reads the one cached answer (the last one this process
 * got, else the last one persisted, else the fail-closed default), re-asked at most once a minute. So the
 * storefront and Review agree from their first frame instead of each starting "Rx off".
 */
export const useOrderFlags = (): OrderFlagsResponse => orderFlags.useValue();

/** Ask again now (e.g. the server refused a place for a missing prescription). */
export const refreshOrderFlags = (): Promise<OrderFlagsResponse> => orderFlags.refresh();

/** Test seam. */
export const resetOrderFlagsForTest = (): void => orderFlags.resetForTest();
