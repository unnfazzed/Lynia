/**
 * Penalty suspension (owner instruction 2026-10-12: "suspend penalties until further instructions").
 *
 * While `PENALTIES_SUSPENDED` is anything but the literal "false" (so UNSET means suspended), the
 * system applies no automatic behaviour penalty:
 *  - Reliability score keeps moving (deductions + recovery are still recorded) but never TRIPS a hold,
 *    and the 50%-abandonment (velocity) hold never trips.
 *  - Cancel strikes and dispute strikes are still counted, but reaching the limit starts no cooldown and
 *    forces nobody offline.
 *  - The merchant cash-debt / handshake job lock (C4 soft-lock) blocks nothing.
 *  - A refusal at the door no longer cash-bans the customer.
 *  - Holds, cooldowns and cash bans already on record are IGNORED (not cleared), so they come back if
 *    penalties are switched back on with `PENALTIES_SUSPENDED=false`.
 *
 * Deliberately NOT covered (owner decisions, same date): admin suspend/ban/customer hold, the late-cancel
 * charge, ID expiry, the commission low-balance gate and every security limit (OTP, codes, rate limits).
 *
 * Read from `process.env` at the point of use (the broadcast-policy pattern) because the reliability
 * engine and the online gate are pure functions with no DI. Boot validation lives in config/env.ts.
 */
export const PENALTIES_SUSPENDED_ENV = "PENALTIES_SUSPENDED";

export function penaltiesSuspended(): boolean {
  return process.env[PENALTIES_SUSPENDED_ENV] !== "false";
}
