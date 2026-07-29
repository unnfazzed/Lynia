/**
 * Fail-closed access policy for the merchant tablet (Lane E, E1). Mirrors the shape of
 * apps/admin/app/lib/console-auth.ts: a pure, synchronous truth table over an already-resolved
 * signal, so `middleware.ts` stays a thin adapter and the policy itself is unit-testable with no
 * Next/Node imports.
 *
 * Unlike the admin console (a shared operator token behind an identity-aware proxy), a merchant
 * signs in with their own phone+OTP session (the same `apps/api` auth used by riders/customers).
 * This gate only asserts "a session cookie is present" — it does NOT verify the JWT's signature or
 * role; that would require the API's signing secret to also live in this app, which is a needless
 * duplication of a security-sensitive value across two deployables. The real authorization boundary
 * is server-side: every merchant route sits behind `RestaurantsEnabledGuard` → `JwtAuthGuard` →
 * `MerchantGuard` (apps/api/src/merchant/merchant.controller.ts). This gate's job is only to keep an
 * unauthenticated tablet OFF the dashboard UI and on the sign-in screen — D-05's "sign-in unlocks
 * the alarm" only means something if there is no way to reach the queue without signing in first.
 */

export interface MerchantAccessDecision {
  allow: boolean;
  redirectTo?: string;
}

/** Paths that must always load with no session: the login screen itself, Next's static asset
 *  pipeline, and the unauthenticated health probe. */
export function isPublicMerchantPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname.startsWith("/icon.") ||
    pathname.startsWith("/brand/") ||
    pathname.startsWith("/fonts/") ||
    pathname === "/api/healthz"
  );
}

export function evaluateMerchantAccess(input: { pathname: string; hasSession: boolean }): MerchantAccessDecision {
  if (isPublicMerchantPath(input.pathname)) return { allow: true };
  if (input.hasSession) return { allow: true };
  // Fail closed: no session cookie at all → straight to sign-in. `next` lets the login screen return
  // the merchant to what they were trying to open once they've signed in (best-effort, not required).
  const next = encodeURIComponent(input.pathname);
  return { allow: false, redirectTo: `/login?next=${next}` };
}

/** The inverse redirect: an already-signed-in merchant hitting /login (e.g. a stale bookmark, or the
 *  root page) should land on the dashboard, not re-see the sign-in screen. */
export function evaluateLoginPageAccess(input: { hasSession: boolean }): MerchantAccessDecision {
  if (input.hasSession) return { allow: false, redirectTo: "/queue" };
  return { allow: true };
}
