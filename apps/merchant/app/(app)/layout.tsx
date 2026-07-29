"use client";

import { useEffect, useRef } from "react";
import { KitchenConnectionProvider, useKitchenConnection } from "../components/KitchenConnectionProvider";

/** Client-side safety net: if the session is cleared while a page is mounted (an API call's
 *  refresh-then-fail path calls clearMerchantSession + signOut already, which redirects — this
 *  additionally covers a session that reads as absent right at mount, e.g. a stale tab open past the
 *  cookie's max-age). Middleware is the primary, server-side gate; this only prevents a flash of
 *  authenticated chrome with no data behind it. */
function SessionGuard({ children }: { children: React.ReactNode }) {
  const { session, signOut } = useKitchenConnection();
  const checkedOnce = useRef(false);

  useEffect(() => {
    if (!checkedOnce.current) {
      checkedOnce.current = true;
      return; // give the provider's mount-time cookie read a chance to resolve first
    }
    if (!session) signOut();
  }, [session, signOut]);

  return <>{children}</>;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <KitchenConnectionProvider>
      <SessionGuard>{children}</SessionGuard>
    </KitchenConnectionProvider>
  );
}
