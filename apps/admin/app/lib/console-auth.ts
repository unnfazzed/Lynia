/**
 * Console access policy (P0-2). The admin console wields a shared server-side admin token that can
 * approve KYC, ban riders, and record cash payments — so it MUST NOT be reachable by anyone who simply
 * knows the URL. The production-grade control is to run it behind an authenticating proxy (GCP IAP or
 * an OAuth2 proxy) that asserts the operator's identity; this policy enforces that such an identity is
 * present and FAILS CLOSED otherwise.
 *
 * Two trust modes (the middleware picks one, this module stays pure and sync):
 *   - IAP-JWT (recommended, prod): the operator is derived from the cryptographically-verified
 *     `X-Goog-IAP-JWT-Assertion` (see `iap-jwt.ts`). The plaintext email header is NOT trusted here —
 *     verification makes the identity unforgeable even if the Cloud Run ingress is ever misconfigured
 *     and the service is hit directly. Enabled by setting ADMIN_CONSOLE_IAP_AUDIENCE.
 *   - Proxy-header (OAuth2-proxy / legacy IAP without JWT verification, or dev): the operator is read
 *     from a trusted header the proxy sets. Used only when no IAP audience is configured.
 *
 * `evaluateConsoleAccess` is a pure, synchronous function over an ALREADY-RESOLVED operator (no
 * Next/Node imports, no crypto, no I/O) so the allow/deny truth table is unambiguous and independently
 * unit-testable; `middleware.ts` is the thin adapter that resolves the operator and applies it.
 */

export interface ConsoleAccessInput {
  /** NODE_ENV — drives the fail-closed default (auth required in production). */
  nodeEnv: string | undefined;
  /** Explicit override of whether auth is required. When undefined, defaults to (nodeEnv === "production"). */
  requireAuthOverride: boolean | undefined;
  /** Request path, to let framework internals and static assets through. */
  pathname: string;
  /**
   * The trusted operator identity the adapter resolved for this request (verified IAP JWT email, or a
   * proxy-header identity), or null when none could be established. This is the ONLY identity this
   * policy trusts — the adapter must never pass an unverified/client-supplied value here.
   */
  operator: string | null;
}

export interface ConsoleAccessDecision {
  allow: boolean;
  /** The authenticated operator identity to attribute audit actions to (null when unauthenticated/dev). */
  operator: string | null;
  /** HTTP status to return when blocked. */
  status?: number;
  message?: string;
}

/** Paths that must always load (framework internals, static assets, health) — never gated. */
export function isPublicConsolePath(pathname: string): boolean {
  return (
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname.startsWith("/icon") ||
    pathname.startsWith("/brand/") ||
    pathname.startsWith("/fonts/") ||
    pathname === "/robots.txt"
  );
}

/** IAP prefixes the identity with an issuer, e.g. "accounts.google.com:alice@corp.com" — strip it. */
export function normalizeOperator(raw: string): string {
  const trimmed = raw.trim();
  const colon = trimmed.lastIndexOf(":");
  return colon >= 0 ? trimmed.slice(colon + 1) : trimmed;
}

/**
 * Whether production requires an authenticated operator for this request. Pure so the middleware can
 * decide — before doing any async JWT work — whether an operator even needs resolving.
 */
export function consoleAuthRequired(input: {
  nodeEnv: string | undefined;
  requireAuthOverride: boolean | undefined;
  pathname: string;
}): boolean {
  if (isPublicConsolePath(input.pathname)) return false;
  return input.requireAuthOverride ?? input.nodeEnv === "production";
}

/**
 * Resolve the operator from a trusted proxy header (the non-JWT path: OAuth2-proxy, or dev). Pure.
 * Returns the normalized identity, or null when the header is absent/blank. Client-supplied values are
 * only trustworthy here because the proxy overwrites this header on every request — see middleware.ts.
 */
export function resolveProxyOperator(input: {
  proxyHeaderName: string;
  getHeader: (name: string) => string | null | undefined;
}): string | null {
  const identity = input.getHeader(input.proxyHeaderName);
  if (identity && identity.trim() !== "") return normalizeOperator(identity);
  return null;
}

export function evaluateConsoleAccess(input: ConsoleAccessInput): ConsoleAccessDecision {
  if (isPublicConsolePath(input.pathname)) return { allow: true, operator: null };

  const requireAuth = input.requireAuthOverride ?? input.nodeEnv === "production";
  // Dev / explicitly-disabled: allow through with no attributed operator so local work is frictionless.
  if (!requireAuth) return { allow: true, operator: null };

  if (input.operator && input.operator.trim() !== "") {
    return { allow: true, operator: input.operator };
  }

  // Fail closed: in production with auth required and no verified operator, refuse to serve the console
  // at all rather than expose privileged operations to an anonymous (or spoofed) visitor.
  return {
    allow: false,
    operator: null,
    status: 401,
    message:
      "Admin console requires an authenticated operator. Deploy it behind an identity-aware proxy " +
      "(GCP IAP / OAuth2 proxy) that asserts the operator identity, or set ADMIN_CONSOLE_REQUIRE_AUTH=false for local use.",
  };
}
