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

export function verifyOtp(phone: string, code: string): Promise<VerifyResult> {
  return apiFetch<VerifyResult>("/auth/otp/verify", { method: "POST", body: { phone, code }, auth: false });
}
