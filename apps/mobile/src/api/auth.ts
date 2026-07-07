import type { KycDeclineReason } from "@lynia/shared";
import { apiFetch } from "./client";

export interface OtpRequestResult {
  sent: true;
  channel: string;
  devCode?: string;
}
export interface VerifyResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  profileId: string;
  role: string;
  needsProfile: boolean;
}

export function requestOtp(phone: string): Promise<OtpRequestResult> {
  return apiFetch<OtpRequestResult>("/auth/otp/request", { method: "POST", body: { phone }, auth: false });
}

/**
 * Revoke the current session server-side on sign-out. The refresh token is `${sessionId}.${secret}`,
 * so the sessionId is the substring before the first `.`. Without this call the Session row lives until
 * REFRESH_TTL (30 days) and any leaked refresh token keeps minting access tokens after the user signed
 * out. Best-effort at the call site — a failed revoke must never trap sign-out.
 */
export function logout(refreshToken: string): Promise<{ revoked: boolean }> {
  const sessionId = refreshToken.split(".")[0];
  return apiFetch<{ revoked: boolean }>("/auth/logout", { method: "POST", body: { sessionId } });
}

export function verifyOtp(phone: string, code: string): Promise<VerifyResult> {
  return apiFetch<VerifyResult>("/auth/otp/verify", { method: "POST", body: { phone, code }, auth: false });
}

export interface Me {
  profileId: string;
  role: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  photoUrl: string | null;
  ordersCount: number;
  rider: {
    bikeReg: string;
    kycStatus: "pending" | "verified" | "failed";
    // KYC decline detail (A-02), exposed on the rider/me path. `kycDeclineReason` is the canonical
    // reason for a `failed` check (null while pending/verified); `kycAttempts` is how many times the
    // rider has submitted — at/above KYC_LOCK_ATTEMPTS self-resubmit is locked and they contact support.
    kycDeclineReason?: KycDeclineReason | null;
    kycAttempts?: number;
    ratingAvg: number;
    ratingCount: number;
    tripsCount: number;
    isOnline: boolean;
  } | null;
}

export function getMe(): Promise<Me> {
  return apiFetch<Me>("/auth/me");
}

// Post-OTP profile setup ("Tell us who you are"): set the name on a freshly-verified account. The
// server (PATCH /auth/me) validates + trims the names and returns the refreshed profile.
export function updateProfile(body: { firstName: string; lastName: string; idNumber?: string }): Promise<Me> {
  return apiFetch<Me>("/auth/me", { method: "PATCH", body });
}
