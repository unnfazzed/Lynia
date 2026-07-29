import { type NextRequest, NextResponse } from "next/server";
import { evaluateLoginPageAccess, evaluateMerchantAccess } from "./app/lib/merchant-access";
import { SESSION_COOKIE } from "./app/lib/session";

/**
 * Fail-closed access gate for the merchant kitchen tablet (E1, docs/plans/2026-07-28-restaurants-
 * send-joint-launch-plan.md Lane E). Before this middleware, `apps/merchant/app/page.tsx` was a
 * static placeholder with NO auth "by design, until the first authenticated surface arrives" — this
 * is that surface. See `app/lib/merchant-access.ts` for the (pure, unit-tested) policy this adapts.
 *
 * The cookie is only checked for PRESENCE here, never verified — see merchant-access.ts's doc
 * comment for why. A forged/expired cookie still gets past this gate, but every real API call it
 * makes is rejected by the API's own JwtAuthGuard/MerchantGuard, so nothing privileged is exposed.
 */
export function middleware(req: NextRequest): NextResponse {
  const pathname = req.nextUrl.pathname;
  const hasSession = req.cookies.has(SESSION_COOKIE);

  if (pathname === "/login") {
    const decision = evaluateLoginPageAccess({ hasSession });
    if (!decision.allow && decision.redirectTo) {
      return NextResponse.redirect(new URL(decision.redirectTo, req.url));
    }
    return NextResponse.next();
  }

  const decision = evaluateMerchantAccess({ pathname, hasSession });
  if (!decision.allow) {
    return NextResponse.redirect(new URL(decision.redirectTo ?? "/login", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
