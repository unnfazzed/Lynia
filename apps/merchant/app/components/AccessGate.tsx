"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { evaluateLoginPageAccess, evaluateMerchantAccess } from "../lib/merchant-access";
import { loadMerchantSession } from "../lib/session";

/**
 * The fail-closed sign-in gate (E1), run in the browser. The merchant web is a static export served
 * from Cloudflare (docs/MERCHANT-WEB.md), so there is no server middleware any more: this applies the
 * same policy (lib/merchant-access.ts) before a page under it renders. A dashboard page shows nothing
 * until a session is found, and with none the tab goes to sign-in. The real boundary is unchanged and
 * server-side: every merchant API route checks the token.
 */
export function AccessGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  // The two public pages (sign-in, a rider's hand-over link) render straight away, so their HTML paints
  // before the JS runs. Only these exact paths: any other address is served the 404 page's HTML, which
  // was built with nothing in it, and rendering before the check there would not match it.
  const paintsBeforeCheck = pathname === "/login" || pathname === "/h";
  // Once a check passes, the shell stays up while the next page's check runs: unmounting it would tear
  // down the order alarm and the live queue connection on every tap.
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const hasSession = loadMerchantSession() !== null;
    const decision =
      pathname === "/login"
        ? evaluateLoginPageAccess({ hasSession })
        : evaluateMerchantAccess({ pathname, search: window.location.search, hasSession });
    if (!decision.allow) {
      setAllowed(false);
      router.replace(decision.redirectTo ?? "/login");
      return;
    }
    setAllowed(true);
  }, [pathname, router]);

  if (paintsBeforeCheck || allowed) return <>{children}</>;
  return null;
}
