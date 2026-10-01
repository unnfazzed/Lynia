import type { ServiceFlagsResponse } from "@lynia/shared";
import { useEffect, useState } from "react";
import { API_URL } from "../config";
import { BACKGROUND_CHECK_TIMEOUT_MS } from "./network-policy";
import { fetchSignal } from "./fetch-signal";

/**
 * The Shops and Pharmacy kill switches (`GET /app/service-flags`, ledger D-58) — the twin of
 * `useFeatureFlags` for the two sections that launched after it. A separate endpoint because the
 * feature-flags body is strict: two more keys there would fail every installed client's parse.
 *
 * FAILS OPEN, like `restaurantsEnabled`: both sections are launched, so the pre-fetch boot frame and any
 * network error / timeout / non-200 / wire-shape mismatch resolve to the live layout. A server `false`
 * still hides a section as soon as the fetch resolves; the default only decides the boot frame.
 */
export const DEFAULT_SERVICE_FLAGS: ServiceFlagsResponse = { shopsEnabled: true, pharmacyEnabled: true };

export async function fetchServiceFlags(fetchImpl: typeof fetch = fetch, timeoutMs = BACKGROUND_CHECK_TIMEOUT_MS): Promise<ServiceFlagsResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${API_URL}/app/service-flags`, { signal: fetchSignal(controller) });
    if (!res.ok) return DEFAULT_SERVICE_FLAGS;
    // Lazy, like use-feature-flags: the contracts load on the first fetch, not on the launch path.
    const { ServiceFlagsResponse: schema } = require("@lynia/shared") as typeof import("@lynia/shared");
    const parsed = schema.safeParse(await res.json());
    return parsed.success ? parsed.data : DEFAULT_SERVICE_FLAGS;
  } catch {
    return DEFAULT_SERVICE_FLAGS;
  } finally {
    clearTimeout(timer);
  }
}

/** Deferred a beat behind mount for the same reason as useFeatureFlags (B-O7). */
const BOOT_SERVICE_FLAGS_DELAY_MS = 250;

/** Checked once per mount; a mid-session flip takes effect on the next visit. */
export function useServiceFlags(): ServiceFlagsResponse {
  const [flags, setFlags] = useState<ServiceFlagsResponse>(DEFAULT_SERVICE_FLAGS);
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void fetchServiceFlags().then((value) => {
        if (!cancelled) setFlags(value);
      });
    }, BOOT_SERVICE_FLAGS_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);
  return flags;
}
