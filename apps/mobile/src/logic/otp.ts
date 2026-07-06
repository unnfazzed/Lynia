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

/** The minimal shape of an ApiError this helper inspects. */
export interface OtpError {
  status?: number;
  message?: string | null;
}

/**
 * Whether a verify failure is a recoverable expired/locked state — i.e. the stored code is gone (TTL
 * lapsed or never requested) or the attempt counter is spent — rather than a plain wrong code. The
 * server answers all of these with 401; the message discriminates. On a match the screen swaps its
 * primary action to "Send a fresh code" (a resend mints a new code AND resets attempts server-side), so
 * the user is never dead-ended. A plain "Invalid code" (still has attempts) returns false — they just
 * retype.
 *
 * Matches the API's exact messages (apps/api/src/auth/auth.service.ts): "Code expired or never
 * requested" and "Too many attempts — request a new code"; the extra tokens are defensive.
 */
export function isOtpExpiredOrLocked(err: OtpError | null | undefined): boolean {
  if (!err || err.status !== 401) return false;
  const m = (err.message ?? "").toLowerCase();
  return (
    m.includes("expired") ||
    m.includes("never requested") ||
    m.includes("too many") ||
    m.includes("request a new code") ||
    m.includes("locked")
  );
}
