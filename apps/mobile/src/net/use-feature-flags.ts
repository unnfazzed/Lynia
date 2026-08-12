import { MerchantFeatureFlagsResponse } from "@lynia/shared";
import { useEffect, useState } from "react";
import { API_URL } from "../config";
import { BACKGROUND_CHECK_TIMEOUT_MS } from "./network-policy";

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

export async function fetchFeatureFlags(
  fetchImpl: typeof fetch = fetch,
  timeoutMs = BACKGROUND_CHECK_TIMEOUT_MS,
): Promise<MerchantFeatureFlagsResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${API_URL}/app/feature-flags`, { signal: controller.signal });
    if (!res.ok) return DEFAULT_FEATURE_FLAGS;
    const parsed = MerchantFeatureFlagsResponse.safeParse(await res.json());
    return parsed.success ? parsed.data : DEFAULT_FEATURE_FLAGS;
  } catch {
    return DEFAULT_FEATURE_FLAGS; // offline / timeout / bad JSON — per-flag defaults (see above)
  } finally {
    clearTimeout(timer);
  }
}

/** Cold-boot request prioritization (B-O7): deferred a beat behind mount so this fetch doesn't
 *  contend for the first available connection slot with the first-paint-critical `/app/bootstrap`
 *  aggregate — this hook is called from several screens that mount at or near cold-boot (home,
 *  orders), same rationale as `useServerMinVersion`. Harmless because the defaults already render
 *  the correct launched layout — the fetch only matters when a kill switch has been flipped. */
const BOOT_FEATURE_FLAGS_DELAY_MS = 250;

/** The feature flags, defaulting closed until the fetch resolves. Checked once per cold start —
 *  a mid-session flip takes effect on next launch, matching `useServerMinVersion`'s reasoning:
 *  never yank a tile out from under an in-progress session. */
export function useFeatureFlags(): MerchantFeatureFlagsResponse {
  const [flags, setFlags] = useState<MerchantFeatureFlagsResponse>(DEFAULT_FEATURE_FLAGS);
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void fetchFeatureFlags().then((value) => {
        if (!cancelled) setFlags(value);
      });
    }, BOOT_FEATURE_FLAGS_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);
  return flags;
}
