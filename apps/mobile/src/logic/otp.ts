/**
 * Pure helpers for the sign-in OTP screen's resend / expiry / lockout recovery (C3 / A0-1 / R0-1).
 * Extracted so the throttle window, the countdown format and the "this needs a fresh code" decision are
 * unit-testable without rendering the screen. The server is the authority on lockout; the client just
 * recognises the recoverable error so it can offer a fresh code instead of stranding the user on a raw
 * error string.
 */

/** Seconds to throttle a resend (design: a 60s window with a visible countdown). */
export const RESEND_COOLDOWN_S = 60;

/** Format a remaining-seconds count as `m:ss` for the resend countdown (e.g. 42 → "0:42", 65 → "1:05"). */
export function formatCountdown(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** The minimal shape of an ApiError these helpers inspect. */
export interface OtpError {
  status?: number;
  message?: string | null;
  /** The API's machine-readable reason (`otp_invalid` / `otp_expired` / `otp_locked`, …), if any. */
  code?: string | null;
  /** Seconds until a rate limit lifts (the API's `retryAfter` on a 429), if it said. */
  retryAfter?: number | null;
}

/** What a failed verify says about the code. */
export type OtpFailure = "invalid" | "expired" | "locked";

const OTP_REASONS: Record<string, OtpFailure> = { otp_invalid: "invalid", otp_expired: "expired", otp_locked: "locked" };

/**
 * Classify a verify failure as a DEFINITIVE answer about the code (wrong, expired or locked), or null
 * when the server never judged the code: network, timeout, 5xx, a rate limit, a malformed request. A
 * null is a non-answer, so the same code may be sent again.
 *
 * The API tags each OTP 401 with a reason code (apps/api/src/auth/auth.service.ts `otpError`), and that
 * is what this reads first. A server released before the codes answered a bare 401 whose message names
 * the case ("Code expired or never requested", "Too many attempts — request a new code", "Invalid
 * code"), so an untagged 401 still falls back to the words. Only a 401 is a verdict: a 400 is a
 * malformed request (no device id, a bad number), never "that code isn't right".
 */
export function otpFailure(err: OtpError | null | undefined): OtpFailure | null {
  if (!err) return null;
  const tagged = err.code ? OTP_REASONS[err.code] : undefined;
  if (tagged) return tagged;
  if (err.status !== 401) return null;
  const m = (err.message ?? "").toLowerCase();
  if (m.includes("too many") || m.includes("locked") || m.includes("request a new code")) return "locked";
  if (m.includes("expired") || m.includes("never requested")) return "expired";
  return "invalid";
}

/**
 * Whether a verify failure needs a fresh code (expired or locked) rather than a retype. On a match the
 * screen swaps its primary action to "Send a new code" (a resend mints a new code AND resets attempts
 * server-side), so the user is never dead-ended. A plain wrong code (still has attempts) returns false.
 */
export function isOtpExpiredOrLocked(err: OtpError | null | undefined): boolean {
  const f = otpFailure(err);
  return f === "expired" || f === "locked";
}

/** A rate-limit wait as the user reads it: whole minutes under an hour, whole hours above. */
export function formatWait(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  return `${Math.ceil(minutes / 60)} h`;
}

/**
 * The line a failed OTP send or verify shows (as a toast). A rate limit names the wait when the API says
 * how long (`retryAfter`). That line is undrawn copy: the handoff draws no rate-limit state (ledger
 * D-55 §4). Anything else shows the API's own message, or `fallback` for an error that isn't an
 * ApiError.
 */
export function otpErrorMessage(err: unknown, fallback: string): string {
  const e = err as OtpError | null | undefined;
  if (e && e.status === 429 && typeof e.retryAfter === "number" && e.retryAfter > 0) {
    return `Too many tries. Try again in ${formatWait(e.retryAfter)}.`;
  }
  if (e && typeof e.status === "number" && typeof e.message === "string" && e.message.length > 0) return e.message;
  return fallback;
}
