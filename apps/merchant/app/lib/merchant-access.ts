/**
 * Fail-closed access policy for the merchant tablet (Lane E, E1). Mirrors the shape of
 * apps/admin/app/lib/console-auth.ts: a pure, synchronous truth table over an already-resolved
 * signal, so `components/AccessGate.tsx` stays a thin adapter and the policy itself is unit-testable with no
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

/** Paths that must always load with no session: the login screen itself and Next's static asset
 *  pipeline. */
export function isPublicMerchantPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname.startsWith("/icon.") ||
    pathname.startsWith("/brand/") ||
    pathname.startsWith("/fonts/") ||
    // Merchant v2 (D-77): a rider's signed hand-over link — the token is the authority, no session.
    // `/h?t=<token>` now; `/h/<token>` is the old form, which the 404 page forwards (lib/routes.ts).
    pathname === "/h" ||
    pathname.startsWith("/h/")
  );
}

export function evaluateMerchantAccess(input: { pathname: string; search?: string; hasSession: boolean }): MerchantAccessDecision {
  if (isPublicMerchantPath(input.pathname)) return { allow: true };
  if (input.hasSession) return { allow: true };
  // Fail closed: no session cookie at all → straight to sign-in. `next` lets the login screen return
  // the merchant to what they were trying to open once they've signed in (best-effort, not required).
  // The query string comes along: an order's or a booking's id lives there (lib/routes.ts).
  const next = encodeURIComponent(input.pathname + (input.search ?? ""));
  return { allow: false, redirectTo: `/login?next=${next}` };
}

/** The inverse redirect: an already-signed-in merchant hitting /login (e.g. a stale bookmark, or the
 *  root page) should land on the dashboard, not re-see the sign-in screen. */
export function evaluateLoginPageAccess(input: { hasSession: boolean }): MerchantAccessDecision {
  if (input.hasSession) return { allow: false, redirectTo: "/queue" };
  return { allow: true };
}

/** The base a relative `next` is resolved against when no window is around (tests, SSR). Any
 *  origin works: only "does it stay on the SAME origin" is asked of it. */
const FALLBACK_ORIGIN = "https://merchant.lynia.invalid";

/**
 * Validate the `next` param the login page reads back after sign-in (CWE-601 guard).
 *
 * A prefix check is NOT enough (MJ-M5, 2026-10-07). `"//attacker.example/x"` is protocol-relative,
 * and the WHATWG URL parser strips tab / CR / LF anywhere in the input and treats `\` as `/`, so
 * `"/\t/attacker.example"` (`next=%2F%09%2Fattacker.example` once the query is decoded) passed the old
 * `next[1] !== "/"` test and still resolved to `//attacker.example` — an off-site redirect right after
 * a real OTP sign-in. So the guard now asks the parser itself:
 *   - no control characters (C0, DEL) and no backslash anywhere — no in-app path has one;
 *   - a path: starts with `/`, and not `//`;
 *   - `new URL(next, origin).origin === origin` — whatever the parser makes of it stays on this site.
 */
export function isSafeMerchantRedirectPath(next: string | null, origin?: string): next is string {
  if (!next) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(next)) return false;
  if (!next.startsWith("/") || next.startsWith("//")) return false;
  const base = origin ?? (typeof window !== "undefined" && window.location?.origin && window.location.origin !== "null" ? window.location.origin : FALLBACK_ORIGIN);
  try {
    return new URL(next, base).origin === new URL(base).origin;
  } catch {
    return false;
  }
}
