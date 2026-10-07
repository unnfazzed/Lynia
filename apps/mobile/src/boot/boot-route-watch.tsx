import { usePathname, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/auth-context";
import type { Session } from "../auth/session";
import { bootDestination, isSignedOutRoute } from "../logic/boot-route";
import { replaceClearingStack } from "../logic/nav";
import { useBootPhase } from "./boot-phase";
import { reportBootDestination, reportBootRoute } from "./boot-readiness";
import { prewarmBootReads } from "./prewarm";

/** How often, and how many times, a redirect retries while the navigator is still mounting under the splash. */
export const NAV_RETRY_MS = 100;
export const NAV_RETRIES = 50;

/**
 * Keeps the boot honest about where the app actually is. Renders nothing; mounted in app/_layout.tsx
 * under AuthProvider and BootPhaseProvider.
 *
 * 1. `reportBootRoute` (S-2): a boot bound for Home that is redirected before Home is ready — a session
 *    the server rejects (the SessionGate replaces Home with /phone), a route gate — would otherwise hold
 *    the splash, waiting on Home's tasks, until its 20s give-up.
 *
 * 2. A page load (web) or deep link (native) that lands anywhere but "/" never mounts app/index.tsx, so
 *    nothing made the boot decision. One effect, once auth has loaded, covers both halves of that:
 *    - U01: with no session, on a route that needs one, the customer was stranded on a dead signed-in
 *      screen (every request "Missing bearer token", no way to sign in). They go where a signed-out
 *      boot goes (`bootDestination`: onboarding or the phone screen), with the stack cleared. A logout
 *      transition is the SessionGate's (src/auth/session-gate.tsx), so it is left alone here.
 *    - U03: nobody called `reportBootDestination`, so the splash held for its 20s give-up ("Slow
 *      network") online and forever offline, hiding the order screen's saved copy. The landing path (or
 *      the U01 redirect target) is now the boot's destination, so the splash waits only for that
 *      destination's own tasks (src/boot/boot-readiness.ts), as a boot through "/" does.
 */
export function BootRouteWatch(): null {
  const pathname = usePathname();
  const router = useRouter();
  const { session, loading } = useAuth();
  const { booting } = useBootPhase();
  // Where the process landed. "/" is app/index.tsx's to decide (and to report).
  const [landing] = useState(pathname);
  const reported = useRef(false);
  const prevSession = useRef<Session | null>(null);

  useEffect(() => {
    if (booting) reportBootRoute(pathname);
  }, [booting, pathname]);

  useEffect(() => {
    if (loading) return;
    const wasSignedIn = prevSession.current != null;
    prevSession.current = session;
    const reportLanding = booting && landing !== "/" && !reported.current;
    const report = (destination: string): void => {
      if (!reportLanding) return;
      reported.current = true;
      reportBootDestination(destination);
    };
    const stranded = !session && !wasSignedIn && !isSignedOutRoute(pathname);
    if (!stranded) {
      report(pathname);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void prewarmBootReads()
      .onboardingSeen.catch(() => true)
      .then((onboardingSeen) => {
        if (cancelled) return;
        const target = bootDestination({ session: null, onboardingSeen, rolePref: null });
        report(target);
        // The navigator mounts a frame after the splash draws (BootPhase `appMountable`); expo-router
        // throws on a navigation before it is ready, so retry briefly rather than strand the customer.
        const go = (left: number): void => {
          if (cancelled) return;
          try {
            replaceClearingStack(router, target);
          } catch {
            if (left > 0) timer = setTimeout(() => go(left - 1), NAV_RETRY_MS);
          }
        };
        go(NAV_RETRIES);
      });
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [loading, session, pathname, booting, landing, router]);

  return null;
}
