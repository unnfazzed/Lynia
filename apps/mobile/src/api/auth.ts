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
    ratingAvg: number;
    ratingCount: number;
    tripsCount: number;
    isOnline: boolean;
  } | null;
}

export function getMe(): Promise<Me> {
  return apiFetch<Me>("/auth/me");
}
