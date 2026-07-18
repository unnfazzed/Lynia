import * as Notifications from "expo-notifications";
import { router, usePathname } from "expo-router";
import { useEffect, useRef } from "react";
import { AppState, type NativeEventSubscription } from "react-native";
import type { Session } from "../auth/session";
import { subscribeReachability } from "../net/reachability";
import { subscribePushKick } from "./push-kick";
import {
  pushDestination,
  pushOnce,
  registerForPushNotificationsAsync,
  registerRotatedToken,
  unregisterForPushNotificationsAsync,
} from "./push";

/** Cap on register RETRIES after a transient failure — enough to ride out a dead zone, few enough to
 *  never hammer the server. Reachability-recovery and foreground transitions each count toward it. */
const MAX_REGISTER_RETRIES = 4;

/**
 * Keep this device's push token in sync with auth: register it once a profile is signed in, and drop
 * it again on sign-out (or when switching accounts). Keyed by `profileId`, so the effect re-runs only
 * on an actual identity change — not on every render.
 *
 * The cleanup unregisters the token registered for the *previous* profile, which fires when profileId
 * changes (sign-out → null, or account switch). It deliberately does NOT run on a hard app kill (the
 * process is gone, no cleanup runs) — so a backgrounded/closed app keeps its token and still receives
 * pushes, which is the whole point.
 *
 * Registration is best-effort and resilient: a transient failure (a cold start in a dead zone, a server
 * blip on the register POST) is retried when the API becomes reachable again OR on the next foreground,
 * with a small capped budget — so push isn't dead for the whole app lifetime after one early miss. A
 * terminal failure (permission denied, simulator, Expo Go) is NOT retried. A mid-process OS/FCM token
 * rotation re-registers the fresh token. None of this ever throws to the caller or blocks the user.
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
    // KB-PUSH-TOKEN-RACE: the most recently observed desired token from an OS/FCM rotation, set by the
    // rotation listener the instant it fires. Lets the in-flight INITIAL registration below notice that a
    // newer token has superseded it before its POST resolves, so it doesn't commit the now-stale token as
    // `registered` (which sign-out cleanup would then unregister, leaving the live rotated token bound).
    let rotatedTo: string | null = null;
    let cancelled = false;
    let attempts = 0;
    let reachUnsub: (() => void) | null = null;
    let appStateSub: NativeEventSubscription | null = null;

    // Tear down the retry triggers once we've either succeeded, exhausted the budget, or hit a terminal
    // failure — nothing left to react to.
    const stopRetryTriggers = (): void => {
      reachUnsub?.();
      reachUnsub = null;
      appStateSub?.remove();
      appStateSub = null;
    };

    const armRetryTriggers = (): void => {
      if (reachUnsub || appStateSub) return; // already armed
      // Recovery from a dead zone: the reachability store flips true the moment the API answers again.
      reachUnsub = subscribeReachability((reachable) => {
        if (reachable) attempt();
      });
      // A warm resume with connectivity already restored won't emit a reachability transition, so also
      // retry on the next foreground.
      appStateSub = AppState.addEventListener("change", (s) => {
        if (s === "active") attempt();
      });
    };

    const attempt = (): void => {
      if (cancelled || registered) return;
      void registerForPushNotificationsAsync().then((result) => {
        if (cancelled) {
          // Identity changed before registration finished — undo it so we don't leave a stray token.
          if (result.registered) void unregisterForPushNotificationsAsync(result.token);
          return;
        }
        if (result.registered) {
          // KB-PUSH-TOKEN-RACE: if an OS/FCM rotation superseded this token while the register POST was in
          // flight, the rotation listener has already bound (or is binding) the newer token — don't clobber
          // `registered` with the now-stale one. Drop the stale binding server-side so cleanup unregisters
          // the live token, not this dead one.
          if (rotatedTo != null && rotatedTo !== result.token) {
            void unregisterForPushNotificationsAsync(result.token);
          } else {
            registered = result.token;
          }
          stopRetryTriggers();
          return;
        }
        // A null token that isn't worth retrying (permission denied / simulator / Expo Go), or one that
        // is but whose retry budget is spent — either way, stop reacting.
        if (!result.retry || attempts >= MAX_REGISTER_RETRIES) {
          stopRetryTriggers();
          return;
        }
        // Transient register failure — arm the triggers and count this toward the budget so a flapping
        // link can't loop forever.
        attempts += 1;
        armRetryTriggers();
      });
    };

    attempt();

    // The primed permissions explainer (app/permissions.tsx) fires this the moment the user grants
    // notifications, so a just-granted permission binds a token right away rather than waiting for the
    // next foreground — registration is check-don't-request, so it needs an explicit re-attempt.
    const kickUnsub = subscribePushKick(() => attempt());

    // A mid-process OS/FCM token rotation hands us a fresh token; without re-registering it, push
    // silently dies until the next cold start. Re-bind it and swap what cleanup will unregister.
    const rotationSub = Notifications.addPushTokenListener((token) => {
      const rotated = typeof token.data === "string" ? token.data : null;
      if (!rotated || cancelled || rotated === registered) return;
      // Record the newest desired token synchronously (before the async register) so an initial
      // registration still in flight can detect it has been superseded and not clobber `registered`.
      rotatedTo = rotated;
      void registerRotatedToken(rotated).then((bound) => {
        if (!bound) return;
        if (cancelled) {
          void unregisterForPushNotificationsAsync(bound);
          return;
        }
        const superseded = registered;
        registered = bound;
        // The old token is now dead FCM-side; drop it server-side too rather than wait for a prune.
        if (superseded && superseded !== bound) void unregisterForPushNotificationsAsync(superseded);
      });
    });

    return () => {
      cancelled = true;
      stopRetryTriggers();
      kickUnsub();
      rotationSub.remove();
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
