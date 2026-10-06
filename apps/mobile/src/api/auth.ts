import type { KycDeclineReason } from "@lynia/shared";
import { ApiError, apiFetch } from "./client";
import { unregisterDeviceToken } from "./notifications";

export interface OtpRequestResult {
  sent: true;
  channel: string;
  /** The real channel the code went out on (WhatsApp vs SMS) — for the OTP screens' copy. Distinct
   *  from `channel`, which is an internal/ops label and can be a dev-only value like "console". */
  deliveryChannel: "whatsapp" | "sms";
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
 * REFRESH_TTL (a year) and any leaked refresh token keeps minting access tokens after the user signed
 * out. Best-effort at the call site — a failed revoke must never trap sign-out.
 *
 * `pushToken` is this device's bound push token: the API unbinds it with the session, so a signed-out
 * phone stops getting this account's pushes (E2E 2026-10-05 FS-8). An API older than that field rejects
 * the unknown key with a 400; then the token is dropped the old way, while the session is still live,
 * and the session revoked without it.
 */
export async function logout(refreshToken: string, pushToken?: string | null): Promise<{ revoked: boolean }> {
  const sessionId = refreshToken.split(".")[0];
  if (!pushToken) return apiFetch<{ revoked: boolean }>("/auth/logout", { method: "POST", body: { sessionId } });
  try {
    return await apiFetch<{ revoked: boolean }>("/auth/logout", { method: "POST", body: { sessionId, pushToken } });
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 400) throw e;
    await unregisterDeviceToken(pushToken).catch(() => undefined);
    return apiFetch<{ revoked: boolean }>("/auth/logout", { method: "POST", body: { sessionId } });
  }
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
   * Never rendered (its display screen, `/profile`, went with D-60); become-a-rider reads it only to
   * decide whether to ask for it. Deliberately excluded from the persisted query cache — see
   * `redactBeforePersist` in `src/query/persist.ts`. Anything new that reads this field should
   * assume it is absent after a cold start until `/auth/me` revalidates.
   */
  idNumber: string | null;
  /**
   * D-70 "Didit ID prefill": the national ID number the rider's ID check VERIFIED (null until a
   * verified check carried one, and on older servers). Prefills the ID field instead of a retype.
   * Memory-only like `idNumber` — never persisted to the query cache (`redactBeforePersist`).
   */
  kycIdNumber?: string | null;
  /** S·2: customer account standing — true blocks new broadcasts (the app shows the on-hold screen). */
  onHold?: boolean;
  rider: {
    bikeReg: string | null;
    kycStatus: "pending" | "verified" | "failed" | "expired";
    // KYC decline detail (A-02), exposed on the rider/me path. `kycDeclineReason` is the canonical
    // reason for a `failed` check (null while pending/verified); `kycAttempts` is how many times the
    // rider has submitted — at/above KYC_LOCK_ATTEMPTS self-resubmit is locked and they contact support.
    kycDeclineReason?: KycDeclineReason | null;
    kycAttempts?: number;
    /** D-62: whether the rider has a photo on file (optional since 2026-10-02). Absent on older servers. */
    hasPhoto?: boolean;
    /** First Run v2 E4 (D-81): ops' check of `bikeReg` — "Checking" until `verified`. Absent on older servers. */
    plateStatus?: "none" | "checking" | "verified";
    /** Pre-pickup cancel strikes toward RIDER_STRIKE_LIMIT — resets to 0 once a cooldown lands. */
    cancelStrikes?: number;
    ratingAvg: number;
    ratingCount: number;
    tripsCount: number;
    /**
     * D-70: the commission-free first jobs (Calm Mint v2 R3 "Commission-free jobs · N of 5 left"),
     * derived server-side from completed jobs. Absent on older servers — then nothing is drawn.
     */
    freeJobs?: { left: number; total: number };
    isOnline: boolean;
    /** Deploy-wide KYC review mode (not per-rider): "auto" resubmits open a vendor browser session;
     *  "manual" has no vendor step — pending means "waiting on ops review", not "waiting on you". */
    kycMode?: "auto" | "manual";
    /**
     * P0-1 / D6 — which KIND of pending, derived server-side from the vendor's own session status:
     * `in_flight` (the check is with the vendor; nothing for the rider to do) vs `unfinished` (they
     * opened it and backed out, or never started — their move). Null when the question doesn't apply
     * (verified, manual mode, no live session) or an older API doesn't send it, and `resolveKycGate`
     * treats null as `unfinished` — see there for why that is the safe default.
     *
     * The SDK's third outcome, `failed` (the check never opened), is deliberately not here: the
     * session still reads "not started" vendor-side, so the server cannot see it. That one is
     * client-only, held for the current screen.
     */
    kycPendingState?: "in_flight" | "unfinished" | null;
    /**
     * R-3 (startup review 2026-10-06): the check is HELD for a human review — the vendor's In Review, or
     * a result the server holds (a review-band face match, an ID collision). `kycPendingState` reads
     * `in_flight` for it too (older apps keep R2); this app draws the Rider v2 "under review" wall and
     * polls slowly. Absent on an older server ⇒ not held.
     */
    kycHeld?: boolean;
    /**
     * First Run v2 F6 (ledger D-81 §4): the day the rider's ID expired, "YYYY-MM-DD", while `kycStatus` is
     * `expired` (null otherwise). Absent on an older server — F6 then drops the date.
     */
    kycExpiredOn?: string | null;
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
