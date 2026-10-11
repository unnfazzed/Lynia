/** The parts of an `ApiError` a refused code send or sign-in is read by (duck-typed, so it stays pure). */
interface OtpError {
  status?: unknown;
  message?: unknown;
  retryAfter?: unknown;
}

/**
 * MJ-L10 (2026-10-07): what a refused code send or sign-in says. A rate limit names the wait when the API
 * says how long (`retryAfter` on its 429, AuthService.enforceRate) — the customer app's own wording
 * (`apps/mobile/src/logic/otp.ts`, ledger D-55 §4; on the merchant web, ledger D-90). Anything else is the
 * API's own sentence, or `fallback` for an error that isn't an API one.
 */
export function otpErrorMessage(err: unknown, fallback: string): string {
  const e = (err ?? null) as OtpError | null;
  if (e && e.status === 429 && typeof e.retryAfter === "number" && Number.isFinite(e.retryAfter) && e.retryAfter > 0) {
    return `Too many tries. Try again in ${formatWait(e.retryAfter)}.`;
  }
  if (e && typeof e.status === "number" && typeof e.message === "string" && e.message.length > 0) return e.message;
  return fallback;
}

/** Whole minutes under an hour, whole hours above (the customer app's `formatWait`). */
function formatWait(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  return `${Math.ceil(minutes / 60)} h`;
}
