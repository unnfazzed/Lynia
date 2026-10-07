// Type-only from the barrel (erased at compile time); the zod VALUE twin is lazy-required inside
// fetchFeatureFlags so the contracts (~202 KB of schema construction, MOB-BOOT-03-SIB-2) load on
// the first fetch — which already runs behind a 250 ms boot-priority timer — not at module
// evaluation on the launch path. Same lazy-require seam as PostHog in src/telemetry/analytics.tsx.
import type { MerchantFeatureFlagsResponse } from "@lynia/shared";
import { API_URL } from "../config";
import { BACKGROUND_CHECK_TIMEOUT_MS } from "./network-policy";
import { fetchSignal } from "./fetch-signal";
import { createSharedFlags, isBooleanRecord } from "./shared-flags";

/**
 * Remote config for the merchant-vertical kill switches (`docs/plans/2026-07-28-restaurants-send-
 * joint-launch-plan.md` §1: "flags become kill switches, not reveal tools"). Fetches the public
 * `GET /app/feature-flags` at cold start so the Food tile/rail can hide instantly if the founder
 * flips `RESTAURANTS_ENABLED` off, without an app-store resubmission.
 *
 * Fail direction is PER FLAG, matching each vertical's launch state (owner decision 2026-08-12):
 *
 * - `restaurantsEnabled` FAILS OPEN. Restaurants is fully launched, so the pre-fetch boot frame and
 *   any network error / timeout / non-200 / wire-shape mismatch resolve to the live layout. Before
 *   this, the fail-safe-off default painted the flag-off UI ("Soon" tile, parcels-only onboarding,
 *   no rail) for ~250ms + one RTT on EVERY cold start before flipping — a visible flash of retired
 *   design on each launch. The flag is still a working kill switch: a server `false` hides the
 *   vertical as soon as the fetch resolves; only the default changed, not the mechanism.
 * - The unlaunched flags (`merchantDispatchAutoEnabled`, `merchantWalletEnabled`) keep the original
 *   FAIL-SAFE-OFF contract: a broken gate must never unlock something not ready to show.
 *
 * Plain fetch (not the api client): this can run pre-auth and must stay dependency-free of
 * session/RUM.
 */
export const DEFAULT_FEATURE_FLAGS: MerchantFeatureFlagsResponse = {
  restaurantsEnabled: true,
  merchantDispatchAutoEnabled: false,
  merchantWalletEnabled: false,
};

async function tryFetchFeatureFlags(fetchImpl: typeof fetch = fetch, timeoutMs = BACKGROUND_CHECK_TIMEOUT_MS): Promise<MerchantFeatureFlagsResponse | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${API_URL}/app/feature-flags`, { signal: fetchSignal(controller) });
    if (!res.ok) return null;
    const { MerchantFeatureFlagsResponse: schema } = require("@lynia/shared") as typeof import("@lynia/shared");
    const parsed = schema.safeParse(await res.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchFeatureFlags(
  fetchImpl: typeof fetch = fetch,
  timeoutMs = BACKGROUND_CHECK_TIMEOUT_MS,
): Promise<MerchantFeatureFlagsResponse> {
  // offline / timeout / bad JSON — per-flag defaults (see above)
  return (await tryFetchFeatureFlags(fetchImpl, timeoutMs)) ?? DEFAULT_FEATURE_FLAGS;
}

/** Cold-boot request prioritization (B-O7): deferred a beat behind mount so this fetch doesn't
 *  contend for the first available connection slot with the first-paint-critical `/app/bootstrap`
 *  aggregate — this hook is called from several screens that mount at or near cold-boot (home,
 *  orders), same rationale as `useServerMinVersion`. Harmless because the defaults already render
 *  the correct launched layout — the fetch only matters when a kill switch has been flipped. */
const BOOT_FEATURE_FLAGS_DELAY_MS = 250;

/** Re-asked at most this often, across every screen (P17). */
const FEATURE_FLAGS_MAX_AGE_MS = 60_000;

const featureFlags = createSharedFlags<MerchantFeatureFlagsResponse>({
  storageKey: "lynia.feature-flags.v1",
  defaults: DEFAULT_FEATURE_FLAGS,
  fetch: () => tryFetchFeatureFlags(),
  delayMs: BOOT_FEATURE_FLAGS_DELAY_MS,
  maxAgeMs: FEATURE_FLAGS_MAX_AGE_MS,
  isValid: (v): v is MerchantFeatureFlagsResponse => isBooleanRecord(v, ["restaurantsEnabled", "merchantDispatchAutoEnabled", "merchantWalletEnabled"]),
});

// P17: shared across mounts — one answer (last known, persisted across launches) that every screen
// reads; a remount no longer restarts from the default and re-asks (at most once a minute).
export function useFeatureFlags(): MerchantFeatureFlagsResponse {
  return featureFlags.useValue();
}

/** Test seam. */
export const resetFeatureFlagsForTest = (): void => featureFlags.resetForTest();
