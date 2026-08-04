import { MerchantFeatureFlagsResponse } from "@lynia/shared";
import { useEffect, useState } from "react";
import { API_URL } from "../config";

/**
 * Remote config for the merchant-vertical kill switches (`docs/plans/2026-07-28-restaurants-send-
 * joint-launch-plan.md` §1: "flags become kill switches, not reveal tools"). Fetches the public
 * `GET /app/feature-flags` at cold start so the Food tile/rail can hide instantly if the founder
 * flips `RESTAURANTS_ENABLED` off, without an app-store resubmission.
 *
 * FAIL-SAFE-OFF by design (mirrors the server's own fail-safe-OFF philosophy): any network error,
 * timeout, non-200, or wire-shape mismatch resolves to every flag `false` — an unreachable flags
 * endpoint must degrade to Express-only, never accidentally reveal a half-built vertical. This is
 * the opposite failure direction from `use-server-version-gate`'s fail-OPEN (a broken gate must
 * never block the app); here a broken gate must never unlock something not ready to show. Plain
 * fetch (not the api client): this can run pre-auth and must stay dependency-free of session/RUM.
 */
export const DEFAULT_FEATURE_FLAGS: MerchantFeatureFlagsResponse = {
  restaurantsEnabled: false,
  merchantDispatchAutoEnabled: false,
  merchantWalletEnabled: false,
};

export async function fetchFeatureFlags(
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 10_000,
): Promise<MerchantFeatureFlagsResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${API_URL}/app/feature-flags`, { signal: controller.signal });
    if (!res.ok) return DEFAULT_FEATURE_FLAGS;
    const parsed = MerchantFeatureFlagsResponse.safeParse(await res.json());
    return parsed.success ? parsed.data : DEFAULT_FEATURE_FLAGS;
  } catch {
    return DEFAULT_FEATURE_FLAGS; // offline / timeout / bad JSON — fail safe-off
  } finally {
    clearTimeout(timer);
  }
}

/** Cold-boot request prioritization (B-O7): deferred a beat behind mount so this fetch doesn't
 *  contend for the first available connection slot with the first-paint-critical `/app/bootstrap`
 *  aggregate — this hook is called from several screens that mount at or near cold-boot (home,
 *  orders), same rationale as `useServerMinVersion`. Harmless where the default (fail-safe-off)
 *  already governs the render for a quarter second regardless of network speed. */
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
