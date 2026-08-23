"use client";

import { useEffect } from "react";
import { KitchenConnectionProvider, useKitchenConnection } from "../components/KitchenConnectionProvider";

/** Client-side safety net: if the session is cleared while a page is mounted (an API call's
 *  refresh-then-fail path calls clearMerchantSession + signOut already, which redirects — this
 *  additionally covers a session that reads as absent right at mount, e.g. a stale tab open past the
 *  cookie's max-age). Middleware is the primary, server-side gate; this only prevents a flash of
 *  authenticated chrome with no data behind it.
 *
 *  CF-05 (crash-fuzz 2026-08-23): this used to gate on a `checkedOnce` ref instead of
 *  `sessionChecked` — "skip the check on this effect's first invocation, so the provider's own
 *  mount-time cookie read gets a chance to resolve first." That assumed the effect runs once per
 *  real mount. React 18 StrictMode (dev only) double-invokes mount effects synchronously, before
 *  any state update from the FIRST invocation has flowed through a render — so the ref was already
 *  flipped to `true` by the second invocation, which then read the still-stale `session === null`
 *  from the ORIGINAL render's closure and signed out a rider who had just signed in (100%
 *  reproducible in `next dev`, live-verified via a captured stack trace). `session === null` is
 *  ambiguous (not-yet-checked vs. genuinely signed out); `sessionChecked` disambiguates it, and
 *  because both are set together in one synchronous effect body, they always resolve into the SAME
 *  render — there is no interleaving left for a double-invoke to exploit. */
function SessionGuard({ children }: { children: React.ReactNode }) {
  const { session, sessionChecked, signOut } = useKitchenConnection();

  useEffect(() => {
    if (!sessionChecked) return; // the provider's mount-time cookie read hasn't resolved yet
    if (!session) signOut();
  }, [sessionChecked, session, signOut]);

  return <>{children}</>;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <KitchenConnectionProvider>
      <SessionGuard>{children}</SessionGuard>
    </KitchenConnectionProvider>
  );
}
