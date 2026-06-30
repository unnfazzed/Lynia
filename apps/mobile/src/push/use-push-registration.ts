import { useEffect } from "react";
import type { Session } from "../auth/session";
import { registerForPushNotificationsAsync, unregisterForPushNotificationsAsync } from "./push";

/**
 * Keep this device's push token in sync with auth: register it once a profile is signed in, and drop
 * it again on sign-out (or when switching accounts). Keyed by `profileId`, so the effect re-runs only
 * on an actual identity change — not on every render.
 *
 * The cleanup unregisters the token registered for the *previous* profile, which fires when profileId
 * changes (sign-out → null, or account switch). It deliberately does NOT run on a hard app kill (the
 * process is gone, no cleanup runs) — so a backgrounded/closed app keeps its token and still receives
 * pushes, which is the whole point.
 */
export function usePushRegistration(session: Session | null): void {
  const profileId = session?.profileId ?? null;

  useEffect(() => {
    if (!profileId) return;
    let registered: string | null = null;
    let cancelled = false;

    void registerForPushNotificationsAsync().then((token) => {
      if (cancelled) {
        // Identity changed before registration finished — undo it so we don't leave a stray token.
        if (token) void unregisterForPushNotificationsAsync(token);
      } else {
        registered = token;
      }
    });

    return () => {
      cancelled = true;
      if (registered) void unregisterForPushNotificationsAsync(registered);
    };
  }, [profileId]);
}
