import type { Me } from "./auth";
import { ApiError, apiFetch } from "./client";
import type { OrderSnapshot } from "./orders";

/**
 * Wave-2 W1 — the one-round-trip cold-start aggregate (`GET /app/bootstrap`). Carries exactly what
 * the signed-in boot path used to assemble from separate metered round-trips: the profile and the
 * role-appropriate active order/job (in the same shapes /auth/me and /orders/mine/* serve), plus
 * the server version-gate minimum for a future client that drops the separate probe.
 */
export interface BootstrapResponse {
  minSupportedVersion: string;
  me: Me;
  activeOrder: OrderSnapshot | null;
}

/**
 * Fetch the boot aggregate, or null when the API doesn't serve it yet (404/405 from an older
 * deploy mid-rollout) — null means "seed nothing": every screen then fetches individually exactly
 * as before, so the aggregate can never be a new failure mode. Real errors (network, 401→refresh,
 * 5xx) propagate to the caller's catch, which also treats them as "boot cold, screens self-serve".
 */
export async function fetchBootstrap(): Promise<BootstrapResponse | null> {
  try {
    return await apiFetch<BootstrapResponse>("/app/bootstrap");
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 405)) return null;
    throw e;
  }
}
