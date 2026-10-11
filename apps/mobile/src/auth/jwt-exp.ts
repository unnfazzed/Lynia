/**
 * P09: read an access token's `exp` / `iat` claims (seconds since the epoch) WITHOUT verifying it —
 * the client only uses them to decide whether to refresh before sending, never to trust the token.
 * Anything that isn't a well-formed JWT (a test stub, a truncated value, a runtime without `atob`)
 * yields null, which callers treat as "unknown — don't refresh proactively", i.e. today's reactive
 * 401 → refresh → retry path.
 */
export interface JwtTimes {
  /** Expiry, seconds since the epoch. */
  exp: number;
  /** Issued-at, seconds since the epoch, when the token carries it. */
  iat: number | null;
}

export function jwtTimes(token: string | null | undefined): JwtTimes | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const decode = (globalThis as { atob?: (s: string) => string }).atob;
    if (typeof decode !== "function") return null;
    const claims = JSON.parse(decode(padded)) as { exp?: unknown; iat?: unknown } | null;
    if (!claims || typeof claims.exp !== "number" || !Number.isFinite(claims.exp)) return null;
    return { exp: claims.exp, iat: typeof claims.iat === "number" && Number.isFinite(claims.iat) ? claims.iat : null };
  } catch {
    return null;
  }
}
