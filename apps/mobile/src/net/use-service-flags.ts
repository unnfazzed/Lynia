import type { ServiceFlagsResponse } from "@lynia/shared";
import { API_URL } from "../config";
import { BACKGROUND_CHECK_TIMEOUT_MS } from "./network-policy";
import { fetchSignal } from "./fetch-signal";
import { createSharedFlags, isBooleanRecord } from "./shared-flags";

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

async function tryFetchServiceFlags(fetchImpl: typeof fetch = fetch, timeoutMs = BACKGROUND_CHECK_TIMEOUT_MS): Promise<ServiceFlagsResponse | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${API_URL}/app/service-flags`, { signal: fetchSignal(controller) });
    if (!res.ok) return null;
    // Lazy, like use-feature-flags: the contracts load on the first fetch, not on the launch path.
    const { ServiceFlagsResponse: schema } = require("@lynia/shared") as typeof import("@lynia/shared");
    const parsed = schema.safeParse(await res.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchServiceFlags(fetchImpl: typeof fetch = fetch, timeoutMs = BACKGROUND_CHECK_TIMEOUT_MS): Promise<ServiceFlagsResponse> {
  return (await tryFetchServiceFlags(fetchImpl, timeoutMs)) ?? DEFAULT_SERVICE_FLAGS;
}

/** Deferred a beat behind mount for the same reason as useFeatureFlags (B-O7). */
const BOOT_SERVICE_FLAGS_DELAY_MS = 250;

/** Re-asked at most this often, across every screen (P17). */
const SERVICE_FLAGS_MAX_AGE_MS = 60_000;

const serviceFlags = createSharedFlags<ServiceFlagsResponse>({
  storageKey: "lynia.service-flags.v1",
  defaults: DEFAULT_SERVICE_FLAGS,
  fetch: () => tryFetchServiceFlags(),
  delayMs: BOOT_SERVICE_FLAGS_DELAY_MS,
  maxAgeMs: SERVICE_FLAGS_MAX_AGE_MS,
  isValid: (v): v is ServiceFlagsResponse => isBooleanRecord(v, ["shopsEnabled", "pharmacyEnabled"]),
});

/** Shared across mounts (P17): one cached answer (last known, persisted), re-asked at most once a minute. */
export const useServiceFlags = (): ServiceFlagsResponse => serviceFlags.useValue();

/** Test seam. */
export const resetServiceFlagsForTest = (): void => serviceFlags.resetForTest();
