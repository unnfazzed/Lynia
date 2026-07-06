/**
 * Console access policy (P0-2). The admin console wields a shared server-side admin token that can
 * approve KYC, ban riders, and record cash payments — so it MUST NOT be reachable by anyone who simply
 * knows the URL. The production-grade control is to run it behind an authenticating proxy (GCP IAP or
 * an OAuth2 proxy) that asserts the operator's identity in a trusted header; this policy enforces that
 * such an identity is present and FAILS CLOSED otherwise.
 *
 * `evaluateConsoleAccess` is a pure function (no Next/Node imports) so the gate's behaviour is
 * unambiguous and independently reviewable; `middleware.ts` is the thin adapter that applies it.
 */

export interface ConsoleAccessInput {
  /** NODE_ENV — drives the fail-closed default (auth required in production). */
  nodeEnv: string | undefined;
  /** Explicit override of whether auth is required. When undefined, defaults to (nodeEnv === "production"). */
  requireAuthOverride: boolean | undefined;
  /** Header the upstream proxy sets with the authenticated operator (default IAP's header). */
  proxyHeaderName: string;
  /** Case-insensitive header accessor (returns null when absent). */
  getHeader: (name: string) => string | null | undefined;
  /** Request path, to let framework internals and static assets through. */
  pathname: string;
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

export function evaluateConsoleAccess(input: ConsoleAccessInput): ConsoleAccessDecision {
  if (isPublicConsolePath(input.pathname)) return { allow: true, operator: null };

  const requireAuth = input.requireAuthOverride ?? input.nodeEnv === "production";
  // Dev / explicitly-disabled: allow through with no attributed operator so local work is frictionless.
  if (!requireAuth) return { allow: true, operator: null };

  const identity = input.getHeader(input.proxyHeaderName);
  if (identity && identity.trim() !== "") {
    return { allow: true, operator: normalizeOperator(identity) };
  }

  // Fail closed: in production with auth required and no proxy-asserted identity, refuse to serve the
  // console at all rather than expose privileged operations to an anonymous visitor.
  return {
    allow: false,
    operator: null,
    status: 401,
    message:
      "Admin console requires an authenticated operator. Deploy it behind an identity-aware proxy " +
      "(GCP IAP / OAuth2 proxy) that sets the operator identity header, or set ADMIN_CONSOLE_REQUIRE_AUTH=false for local use.",
  };
}
