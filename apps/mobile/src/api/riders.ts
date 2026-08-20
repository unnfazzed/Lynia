import { ApiError, apiFetch } from "./client";

export interface BecomeResult {
  kycStatus: "pending" | "verified" | "failed" | "expired";
  mode: "auto" | "manual";
  /**
   * The vendor-hosted web flow. Still returned by the server, and deliberately UNUSED by this app
   * since the native SDK landed — a rider verifies inside LyniaGo and never opens Didit's site. Kept
   * on the type because the server still sends it (older builds in the field still open it) and
   * because deleting a field the API returns is how a client silently stops noticing a contract
   * change. Do not reintroduce a browser launch from it.
   */
  verificationUrl?: string;
  /**
   * SECRET — the short-lived Didit session credential the native SDK opens. This is the field the app
   * actually acts on. Present only while a check is pending and only for the rider it belongs to;
   * never log it, never persist it beyond the launch.
   */
  sessionToken?: string;
}

export function completeProfile(body: { firstName: string; lastName: string; idNumber: string }): Promise<{ ok: true }> {
  return apiFetch("/riders/profile", { method: "PATCH", body });
}

/** `photoUrl` carries the storage key returned by requestKycPhotoUpload (not a URL). */
export function becomeRider(body: { bikeReg: string; photoUrl: string }): Promise<BecomeResult> {
  return apiFetch("/riders/become", { method: "POST", body });
}

/**
 * Re-run KYC for an existing rider whose check is pending/failed; returns session credentials for the
 * native SDK.
 *
 * `force` tells the server not to hand back the session it already holds. Pass it ONLY after the SDK
 * rejected that session as expired: expiry fires no webhook, so the server cannot see it, and without
 * the flag the free resume path returns the same dead token on every tap. Never pass it for a denied
 * camera or a dropped network — a fresh session costs a Didit credit and would not fix either.
 */
export function retryKyc(force = false): Promise<Pick<BecomeResult, "kycStatus" | "mode" | "verificationUrl" | "sessionToken">> {
  return apiFetch("/riders/kyc/retry", { method: "POST", body: { force } });
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
