import { ApiError, apiFetch } from "./client";

export interface BecomeResult {
  kycStatus: "pending" | "verified" | "failed" | "expired";
  mode: "auto" | "manual";
  verificationUrl?: string;
}

export function completeProfile(body: { firstName: string; lastName: string; idNumber: string }): Promise<{ ok: true }> {
  return apiFetch("/riders/profile", { method: "PATCH", body });
}

/** `photoUrl` carries the storage key returned by requestKycPhotoUpload (not a URL). */
export function becomeRider(body: { bikeReg: string; photoUrl: string }): Promise<BecomeResult> {
  return apiFetch("/riders/become", { method: "POST", body });
}

/** Re-run KYC for an existing rider whose check is pending/failed; returns a fresh verification URL. */
export function retryKyc(): Promise<{ kycStatus: BecomeResult["kycStatus"]; mode: BecomeResult["mode"]; verificationUrl?: string }> {
  return apiFetch("/riders/kyc/retry", { method: "POST", body: {} });
}

/** Going online sends the rider's position (when known) so the server can corridor-check it and refuse
 *  with an `out_of_area` reason if they're outside the launch area (Q1). Location is optional. */
export function setOnline(online: boolean, location?: { lat: number; lng: number }): Promise<{ online: boolean }> {
  return apiFetch("/riders/online", { method: "PATCH", body: { online, ...location } });
}

/**
 * The 20s liveness beat while online (wave-2 W3). Uses the dedicated lightweight endpoint — one
 * guarded UPDATE server-side instead of the full setOnline mutation — and falls back to the legacy
 * setOnline beat on a 404/405 (an older API during rollout), so liveness never lapses mid-deploy.
 * Every OTHER error (the 403 online-gate refusals, network status-0) propagates unchanged: the
 * caller's handling is identical across both transports.
 */
export async function sendHeartbeat(location?: { lat: number; lng: number }): Promise<{ online: boolean }> {
  try {
    return await apiFetch("/riders/heartbeat", { method: "POST", body: { ...location } });
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 405)) return setOnline(true, location);
    throw e;
  }
}
