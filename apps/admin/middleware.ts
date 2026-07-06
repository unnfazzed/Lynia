import { type NextRequest, NextResponse } from "next/server";
import { evaluateConsoleAccess } from "./app/lib/console-auth";

/**
 * Fail-closed access gate for the admin console (docs/SECURITY.md P0-2).
 *
 * The console holds a privileged admin token; without this, anyone who can reach the deployed URL could
 * approve KYC, ban users, or record cash payments. This enforces that a request carries an operator
 * identity asserted by an upstream identity-aware proxy (GCP IAP / OAuth2 proxy) before any page or
 * server action runs, and refuses to serve at all in production when none is present.
 *
 * Config:
 *   - ADMIN_CONSOLE_REQUIRE_AUTH  — "true"/"false" to force the gate on/off (default: on in production).
 *   - ADMIN_CONSOLE_PROXY_HEADER  — header the proxy sets (default: x-goog-authenticated-user-email, IAP).
 *
 * When allowed, the resolved operator is forwarded to downstream pages/actions as `x-lynia-operator`
 * so admin mutations can be attributed to a real human in the audit log.
 */
export function middleware(req: NextRequest): NextResponse {
  const proxyHeaderName = process.env.ADMIN_CONSOLE_PROXY_HEADER ?? "x-goog-authenticated-user-email";
  const requireAuthOverride =
    process.env.ADMIN_CONSOLE_REQUIRE_AUTH === undefined
      ? undefined
      : process.env.ADMIN_CONSOLE_REQUIRE_AUTH === "true";

  const decision = evaluateConsoleAccess({
    nodeEnv: process.env.NODE_ENV,
    requireAuthOverride,
    proxyHeaderName,
    getHeader: (name) => req.headers.get(name),
    pathname: req.nextUrl.pathname,
  });

  if (!decision.allow) {
    return new NextResponse(decision.message ?? "Unauthorized", {
      status: decision.status ?? 401,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  // Attribute downstream work to the authenticated operator (if any).
  const requestHeaders = new Headers(req.headers);
  if (decision.operator) requestHeaders.set("x-lynia-operator", decision.operator);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

// Run on everything except Next's static asset pipeline (the matcher is a coarse first filter; the
// finer isPublicConsolePath check in the policy is the source of truth).
export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
