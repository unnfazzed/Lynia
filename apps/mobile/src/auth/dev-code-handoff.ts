/**
 * The phone screen → code screen handoff for a server-issued test code (`requestOtp`'s `devCode`, sent
 * only on the console channel / allowlisted test numbers). It travels in process memory, never as a route
 * param: a param is part of the URL, so a `lynia://verify?phone=…&devCode=…` link from anywhere would be
 * able to prefill — and, since the sixth digit submits, sign in with — a code this device never asked for.
 *
 * One entry at a time, keyed by the number the code was sent to, and short-lived. `peekDevCode` is
 * side-effect free (safe in a state initializer that may run twice); `clearDevCode` consumes it.
 */
export const DEV_CODE_TTL_MS = 10 * 60 * 1000;

let pending: { phone: string; code: string; at: number } | null = null;

/** Keep the test code the server returned for `phone`. An empty/absent code clears any earlier one. */
export function stashDevCode(phone: string, code: string | null | undefined): void {
  pending = phone && code ? { phone, code, at: Date.now() } : null;
}

/** The test code kept for exactly `phone`, if it is still fresh. Does not consume it. */
export function peekDevCode(phone: string): string | null {
  if (!pending || !phone || pending.phone !== phone) return null;
  if (Date.now() - pending.at > DEV_CODE_TTL_MS) {
    pending = null;
    return null;
  }
  return pending.code;
}

/** Forget the kept code (it has been taken by the code screen). */
export function clearDevCode(): void {
  pending = null;
}
