import { type NextRequest, NextResponse } from "next/server";
import {
  consoleAuthRequired,
  evaluateConsoleAccess,
  resolveProxyOperator,
} from "./app/lib/console-auth";
import { verifyIapAssertion } from "./app/lib/iap-jwt";

/** One-shot guard so the unverified-proxy-mode warning logs once per isolate, not per request. */
let warnedProxyFallback = false;

/**
 * Fail-closed access gate for the admin console (docs/SECURITY.md P0-2).
 *
 * The console holds a privileged admin token; without this, anyone who can reach the deployed URL could
 * approve KYC, ban users, or record cash payments. This enforces that a request carries an operator
 * identity asserted by an upstream identity-aware proxy (GCP IAP / OAuth2 proxy) before any page or
 * server action runs, and refuses to serve at all in production when none is present.
 *
 * Two trust modes (see app/lib/console-auth.ts + app/lib/iap-jwt.ts):
 *   - IAP-JWT (recommended): when ADMIN_CONSOLE_IAP_AUDIENCE is set, the operator is derived from the
 *     cryptographically-verified `x-goog-iap-jwt-assertion` (signature + issuer + audience). The
 *     plaintext email header is NOT trusted, so a request that reaches the service without a valid IAP
 *     signature — e.g. if ingress is ever misconfigured — cannot forge an operator.
 *   - Proxy-header: when no IAP audience is configured (OAuth2-proxy, or legacy IAP), the operator is
 *     read from ADMIN_CONSOLE_PROXY_HEADER (default IAP's x-goog-authenticated-user-email).
 *
 * Config:
 *   - ADMIN_CONSOLE_REQUIRE_AUTH  — "true"/"false" to force the gate on/off (default: on in production).
 *   - ADMIN_CONSOLE_IAP_AUDIENCE  — enables IAP-JWT mode; the LB backend-service audience string.
 *   - ADMIN_CONSOLE_PROXY_HEADER  — header the proxy sets in proxy-header mode (default IAP's header).
 *
 * When allowed, the resolved operator is forwarded to downstream pages/actions as `x-lynia-operator`
 * so admin mutations can be attributed to a real human in the audit log.
 */
export async function middleware(req: NextRequest): Promise<NextResponse> {
  const nodeEnv = process.env.NODE_ENV;
  // Fail CLOSED on a fat-fingered value: when the var is set, ONLY an explicit falsey token disables the
  // gate — every other value (including a typo like "1"/"yes"/"TRUE") keeps auth ON. The old `=== "true"`
  // parse silently disabled the gate for any non-"true" value, an easy foot-gun for a security control.
  const rawRequireAuth = process.env.ADMIN_CONSOLE_REQUIRE_AUTH;
  const requireAuthOverride =
    rawRequireAuth === undefined ? undefined : !["false", "0", "no", "off"].includes(rawRequireAuth.trim().toLowerCase());
  const pathname = req.nextUrl.pathname;

  // Resolve the trusted operator only when auth is actually required (skips async JWT work for public
  // assets and dev). IAP-JWT mode wins when an audience is configured; otherwise fall back to the
  // proxy header. A failed/absent JWT resolves to null → the policy fails closed below.
  let operator: string | null = null;
  if (consoleAuthRequired({ nodeEnv, requireAuthOverride, pathname })) {
    const iapAudience = process.env.ADMIN_CONSOLE_IAP_AUDIENCE;
    if (iapAudience && iapAudience.trim() !== "") {
      operator = await verifyIapAssertion({
        assertion: req.headers.get("x-goog-iap-jwt-assertion"),
        audience: iapAudience,
      });
    } else {
      // Proxy-header mode trusts a PLAINTEXT header (no signature) — only safe when an upstream proxy
      // overwrites it on every request. Warn ONCE per isolate in production so an accidentally-unset
      // ADMIN_CONSOLE_IAP_AUDIENCE (which silently drops the stronger IAP-JWT verification) is visible in
      // the logs rather than running unverified in the dark.
      if (nodeEnv === "production" && !warnedProxyFallback) {
        warnedProxyFallback = true;
        console.warn(
          "[admin-console] ADMIN_CONSOLE_IAP_AUDIENCE is unset — running in UNVERIFIED proxy-header mode. " +
            "Operator identity is trusted from a plaintext header; set the IAP audience to enable signed-JWT verification.",
        );
      }
      const proxyHeaderName = process.env.ADMIN_CONSOLE_PROXY_HEADER ?? "x-goog-authenticated-user-email";
      operator = resolveProxyOperator({ proxyHeaderName, getHeader: (name) => req.headers.get(name) });
    }
  }

  const decision = evaluateConsoleAccess({ nodeEnv, requireAuthOverride, pathname, operator });

  if (!decision.allow) {
    return new NextResponse(decision.message ?? "Unauthorized", {
      status: decision.status ?? 401,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  // Attribute downstream work to the authenticated operator (if any).
  const requestHeaders = new Headers(req.headers);
  // Strip any inbound x-lynia-operator BEFORE (re)asserting it: this header is the trusted audit actor
  // forwarded to the API as X-Operator, so a client-supplied value must never survive. The strip is
  // unconditional — even when decision.operator is falsy (auth-disabled-but-connected mode, or an
  // identity that normalizes to "") no client value may leak through as the operator.
  requestHeaders.delete("x-lynia-operator");
  if (decision.operator) requestHeaders.set("x-lynia-operator", decision.operator);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

// Run on everything except Next's static asset pipeline (the matcher is a coarse first filter; the
// finer isPublicConsolePath check in the policy is the source of truth).
export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
