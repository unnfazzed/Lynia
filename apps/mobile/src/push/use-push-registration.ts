import * as Notifications from "expo-notifications";
import { router, usePathname } from "expo-router";
import { useEffect, useRef } from "react";
import type { Session } from "../auth/session";
import { pushDestination, pushOnce, registerForPushNotificationsAsync, unregisterForPushNotificationsAsync } from "./push";

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
  // Read via a ref inside the handlers below (rather than closing over `pathname` directly) so the
  // notification listener isn't torn down and re-subscribed on every navigation — only on an actual
  // `isRider` change, same as before this fix.
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

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

  // R6: tapping ANY status-driven push should open the order it's about — not just the rider's "You
  // got the job" — since the copy on most of them ("tap to rate your rider", "tap for details")
  // promises exactly that. Independent of the token effect above — the listener lives for the app's
  // lifetime and is a no-op for any notification that carries no navigable orderId (pushDestination
  // returns null).
  const isRider = session?.role === "rider";
  // JOURNEY-BUGS: getLastNotificationResponseAsync() returns the SAME cached response every time it's
  // called until explicitly cleared — it isn't consumed on read. This effect re-runs on every isRider
  // change (session hydrating, or a sign-out → different-account sign-in on this device, since this
  // hook is mounted once for the app's lifetime at the root layout), so without a clear it replayed the
  // same stale cold-start deep link on every one of those transitions — including navigating a freshly
  // signed-in DIFFERENT account straight to an order from the previous session's push. Consume it (and
  // clear it) at most once per app lifetime; the ref is set synchronously so a rapid second isRider
  // change before the read resolves can't fire a second read.
  const coldStartConsumed = useRef(false);
  useEffect(() => {
    if (!coldStartConsumed.current) {
      coldStartConsumed.current = true;
      // Cold start: the response that LAUNCHED the app (fully killed, not just backgrounded) never
      // fires addNotificationResponseReceivedListener — it has to be read back explicitly on mount.
      void Notifications.getLastNotificationResponseAsync().then((response) => {
        void Notifications.clearLastNotificationResponseAsync();
        if (!response) return;
        const to = pushDestination(response.notification.request.content.data, isRider);
        if (to) pushOnce(router, pathnameRef.current, to);
      });
    }

    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const to = pushDestination(response.notification.request.content.data, isRider);
      if (to) pushOnce(router, pathnameRef.current, to);
    });
    return () => sub.remove();
  }, [isRider]);
}
