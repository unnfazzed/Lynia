import { apiFetch } from "./client";

export interface BecomeResult {
  kycStatus: "pending" | "verified" | "failed";
  mode: "auto" | "manual";
  verificationUrl?: string;
}

export function completeProfile(body: { firstName: string; lastName: string; idNumber: string }): Promise<{ ok: true }> {
  return apiFetch("/riders/profile", { method: "PATCH", body });
}

export function becomeRider(body: { bikeReg: string; photoUrl: string }): Promise<BecomeResult> {
  return apiFetch("/riders/become", { method: "POST", body });
}

export function setOnline(online: boolean): Promise<{ online: boolean }> {
  return apiFetch("/riders/online", { method: "PATCH", body: { online } });
}
