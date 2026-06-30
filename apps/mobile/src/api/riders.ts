import { apiFetch } from "./client";

export interface BecomeResult {
  kycStatus: "pending" | "verified" | "failed";
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
export function retryKyc(): Promise<{ kycStatus: BecomeResult["kycStatus"]; verificationUrl?: string }> {
  return apiFetch("/riders/kyc/retry", { method: "POST", body: {} });
}

export function setOnline(online: boolean): Promise<{ online: boolean }> {
  return apiFetch("/riders/online", { method: "PATCH", body: { online } });
}
