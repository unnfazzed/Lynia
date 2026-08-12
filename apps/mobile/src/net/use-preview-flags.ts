import { PreviewFlagsResponse } from "@lynia/shared";
import { useEffect, useState } from "react";
import { API_URL } from "../config";
import { BACKGROUND_CHECK_TIMEOUT_MS } from "./network-policy";

/**
 * Remote config for surfaces that ship DRAWN BUT UNBACKED — a screen the design kit specifies whose
 * integration does not exist yet, shipped so the journey is walkable ahead of the real rail.
 *
 * Sibling of `use-feature-flags.ts`, deliberately kept separate at the wire level: see
 * `PreviewFlagsResponse` in @lynia/shared for why a fourth field on the strict merchant-flags body
 * would break the binaries already on the internal track.
 *
 * ── FAIL DIRECTION: SAFE-OFF, AND IT IS NOT NEGOTIABLE ───────────────────────────────────────────
 * Every flag here reveals a screen that shows a *payment* that did not happen. A gate that breaks
 * open would put a fabricated money screen in front of a real user — the exact defect the whole
 * simulation programme exists to prevent. So a network error, a timeout, a non-200, a wire-shape
 * mismatch and the pre-fetch boot frame ALL resolve to `false`, and the app renders the honest
 * fallback (call-support for top-up, manual reference-entry for checkout).
 *
 * The cost is a visible frame of the fallback on cold start before the fetch lands — the opposite
 * trade from `restaurantsEnabled`, which fails OPEN precisely to avoid that flash. It is the right
 * trade here: a beat of the real screen is a cosmetic blemish, whereas a beat of a fake payment
 * screen is a lie. Do not "fix" the flash by flipping this default.
 *
 * Plain fetch (not the api client): runs pre-auth, stays free of session/RUM.
 */
export const DEFAULT_PREVIEW_FLAGS: PreviewFlagsResponse = {
  paymentSimulationEnabled: false,
};

export async function fetchPreviewFlags(
  fetchImpl: typeof fetch = fetch,
  timeoutMs = BACKGROUND_CHECK_TIMEOUT_MS,
): Promise<PreviewFlagsResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${API_URL}/app/preview-flags`, { signal: controller.signal });
    if (!res.ok) return DEFAULT_PREVIEW_FLAGS;
    const parsed = PreviewFlagsResponse.safeParse(await res.json());
    return parsed.success ? parsed.data : DEFAULT_PREVIEW_FLAGS;
  } catch {
    return DEFAULT_PREVIEW_FLAGS; // offline / timeout / bad JSON — safe-off (see above)
  } finally {
    clearTimeout(timer);
  }
}

/** Same cold-boot deferral as `useFeatureFlags` (B-O7): this must not contend with the
 *  first-paint-critical `/app/bootstrap` aggregate for the first connection slot. */
const BOOT_PREVIEW_FLAGS_DELAY_MS = 250;

/** The preview flags, safe-off until the fetch resolves. Read once per mount; a mid-session flip
 *  takes effect on the next navigation to a gated screen, which is soon enough for a kill switch
 *  whose worst case is a labelled walkthrough staying reachable a few minutes longer. */
export function usePreviewFlags(): PreviewFlagsResponse {
  const [flags, setFlags] = useState<PreviewFlagsResponse>(DEFAULT_PREVIEW_FLAGS);
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void fetchPreviewFlags().then((value) => {
        if (!cancelled) setFlags(value);
      });
    }, BOOT_PREVIEW_FLAGS_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);
  return flags;
}
