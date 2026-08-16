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
  /**
   * The account record's national ID, in FULL — this is the caller's own record (owner instruction
   * 2026-08-16). `null` for an account that never supplied one; a customer can register name-only.
   *
   * Rendered ONLY on `/profile`, and deliberately excluded from the persisted query cache — see
   * `redactBeforePersist` in `src/query/persist.ts`. Anything new that reads this field should
   * assume it is absent after a cold start until `/auth/me` revalidates.
   */
  idNumber: string | null;
  /** S·2: customer account standing — true blocks new broadcasts (the app shows the on-hold screen). */
  onHold?: boolean;
  rider: {
    bikeReg: string;
    kycStatus: "pending" | "verified" | "failed" | "expired";
    // KYC decline detail (A-02), exposed on the rider/me path. `kycDeclineReason` is the canonical
    // reason for a `failed` check (null while pending/verified); `kycAttempts` is how many times the
    // rider has submitted — at/above KYC_LOCK_ATTEMPTS self-resubmit is locked and they contact support.
    kycDeclineReason?: KycDeclineReason | null;
    kycAttempts?: number;
    /** Pre-pickup cancel strikes toward RIDER_STRIKE_LIMIT — resets to 0 once a cooldown lands. */
    cancelStrikes?: number;
    ratingAvg: number;
    ratingCount: number;
    tripsCount: number;
    isOnline: boolean;
    /** Deploy-wide KYC review mode (not per-rider): "auto" resubmits open a vendor browser session;
     *  "manual" has no vendor step — pending means "waiting on ops review", not "waiting on you". */
    kycMode?: "auto" | "manual";
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

/**
 * Right to erasure — delete the signed-in account and its personal data (DELETE /auth/me, scoped to
 * the JWT subject; see apps/api/src/privacy/privacy.service.ts and docs/DATA-RETENTION.md).
 *
 * Google Play requires an in-app deletion path for any app that lets users create an account, so this
 * is a listing prerequisite as much as a CDPA one. The server refuses with 409 in two cases the caller
 * must surface honestly rather than retry: a live delivery in progress ("finish or cancel first" — so
 * erasure can't strand the other party), and an account under a standing restriction (hold, suspension,
 * ban, cooldown, KYC lock) where self-deletion would reset a sanction. Both arrive as an ApiError whose
 * `message` is already user-facing copy from the API.
 */
export function deleteAccount(): Promise<void> {
  return apiFetch<void>("/auth/me", { method: "DELETE" });
}
