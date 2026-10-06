import { ApiError, apiFetch } from "./client";

export interface BecomeResult {
  kycStatus: "pending" | "verified" | "failed" | "expired";
  mode: "auto" | "manual";
  /**
   * The vendor-hosted web flow. Back in active use: with the Didit native SDK reverted (MOB-BOOT-04)
   * this is the field `runKycVerification` actually opens — the in-app browser tab is the ONLY lane
   * on this build that can run a check, so removing its launch again would silently wall every
   * pending rider behind `cant_start` (see src/kyc/verify.ts). When the SDK re-lands, the token
   * below becomes the primary path and this URL stays as the launch fallback.
   */
  verificationUrl?: string;
  /**
   * SECRET — the short-lived Didit session credential the native SDK opens. This is the field the app
   * actually acts on. Present only while a check is pending and only for the rider it belongs to;
   * never log it, never persist it beyond the launch.
   */
  sessionToken?: string;
}

/** The photo is optional since 2026-10-02 (D-62): sign-up sends none. `photoUrl`, when sent, is the
 *  storage key minted by `POST /uploads/kyc-photo` (not a URL). */
export function becomeRider(body: { bikeReg?: string; photoUrl?: string }): Promise<BecomeResult> {
  return apiFetch("/riders/become", { method: "POST", body });
}

/**
 * Ledger D-79 (owner 2026-10-06): the rider adds or changes their photo (the key `POST /uploads/kyc-photo`
 * minted) and bike plate from Bike & documents. The server validates the plate like sign-up did (3–20
 * characters) and stores it upper-case; it answers with what `/auth/me` would now say.
 */
export function updateRiderProfile(body: { photoUrl?: string; bikeReg?: string }): Promise<{ hasPhoto: boolean; bikeReg: string | null }> {
  return apiFetch("/riders/me", { method: "PATCH", body });
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

/**
 * R-4: tell the server a launch of the ID check just completed, so it drops its cached pending state and
 * the next `/auth/me` reads the vendor afresh. Changes nothing server-side; best-effort and never throws
 * (an older server answers 404, which is fine — the board's own completed hint covers the gap).
 */
export async function noteKycLaunched(): Promise<void> {
  try {
    await apiFetch("/riders/kyc/launched", { method: "POST", body: {} });
  } catch {
    /* best-effort */
  }
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
