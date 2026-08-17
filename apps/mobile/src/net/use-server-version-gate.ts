// The VersionGateResponse zod schema is lazy-required inside fetchServerMinVersion so the contracts
// (~202 KB of schema construction, MOB-BOOT-03-SIB-2) load on the first fetch — behind its 250 ms
// boot-priority timer — not at module evaluation. This module IS on the launch path (imported by
// app/_layout.tsx for the force-update gate). Same lazy-require seam as PostHog in analytics.tsx.
import { useEffect, useState } from "react";
import { API_URL } from "../config";
import { BACKGROUND_CHECK_TIMEOUT_MS } from "./network-policy";

/**
 * Server-driven force-update minimum (docs/LAUNCH-DEPLOYMENT-STRATEGY.md §1c). The build-time
 * MIN_SUPPORTED_VERSION can only gate builds that ship with it; this fetches the API's
 * `GET /app/version-gate` at cold start so an already-installed binary can be walked to the Play
 * Store when a breaking change strands it — the escape hatch that turns "old app crashes against
 * the new API" into a calm update screen.
 *
 * FAIL-OPEN by design: any network error, timeout, non-200, or wire-shape mismatch resolves to
 * null (no gate). Blocking the app because the gate endpoint was unreachable would invert the
 * feature into an outage amplifier — the honest failure mode for a *check* is to not block.
 * Plain fetch (not the api client): this runs pre-auth and must stay dependency-free of the
 * session/RUM hooks.
 */
export async function fetchServerMinVersion(
  fetchImpl: typeof fetch = fetch,
  timeoutMs = BACKGROUND_CHECK_TIMEOUT_MS,
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${API_URL}/app/version-gate`, { signal: controller.signal });
    if (!res.ok) return null;
    const { VersionGateResponse: schema } = require("@lynia/shared") as typeof import("@lynia/shared");
    const parsed = schema.safeParse(await res.json());
    return parsed.success ? parsed.data.minSupportedVersion : null;
  } catch {
    return null; // offline / timeout / bad JSON — fail open
  } finally {
    clearTimeout(timer);
  }
}

/** Cold-boot request prioritization (B-O7): deferred a beat behind mount so this background CHECK
 *  doesn't contend for the first available connection slot with the first-paint-critical
 *  `/app/bootstrap` aggregate (fired the same boot moment for a signed-in user) on a constrained
 *  2G/3G link — see the matching note in `usePushRegistration`. Harmless on a pre-auth boot with no
 *  bootstrap to contend with too: this is already a background check the app never blocks on. */
const BOOT_VERSION_GATE_DELAY_MS = 250;

/** The server minimum, or null while loading / when unavailable (both render as "no gate"). Checked
 *  once per cold start — a mid-session bump takes effect on next launch, which is deliberate: never
 *  yank the navigator out from under an in-flight delivery. */
export function useServerMinVersion(): string | null {
  const [min, setMin] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void fetchServerMinVersion().then((value) => {
        if (!cancelled && value) setMin(value);
      });
    }, BOOT_VERSION_GATE_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);
  return min;
}
