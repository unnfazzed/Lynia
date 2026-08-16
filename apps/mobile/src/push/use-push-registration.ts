import { useQueryClient } from "@tanstack/react-query";
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

/** Cold-boot request prioritization (B-O7): the INITIAL register attempt is deferred a beat behind
 *  mount so it doesn't contend for the first available connection slot with the first-paint-critical
 *  `/app/bootstrap` aggregate — `PushSync` and `BootstrapSync` mount together in `app/_layout.tsx`,
 *  so without this the register POST and the boot aggregate fire concurrently on a link where every
 *  simultaneous request costs the more important one bandwidth (300-600ms RTT corridors). Retries
 *  (reachability recovery, foreground, permission-just-granted, token rotation) stay immediate —
 *  they're reactive to a real event, not part of the initial boot burst. */
const BOOT_REGISTER_DELAY_MS = 250;

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

    const bootTimer = setTimeout(attempt, BOOT_REGISTER_DELAY_MS);

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
      clearTimeout(bootTimer);
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
  //
  // This covers only a WARM tap (app already running, foreground or background) via
  // addNotificationResponseReceivedListener. A COLD-START tap (app fully killed, launched by the tap)
  // is deliberately NOT handled here — it used to be, via a `getLastNotificationResponseAsync()` read
  // on mount, but that raced app/index.tsx's own cold-boot `<Redirect>`: both fire a navigation
  // independently on first mount, and whichever resolved second silently won, so a slow-resolving boot
  // redirect could clobber a tap that had already opened the order. app/index.tsx now consumes the
  // cold-start response itself (via `consumeColdStartResponse` in push.ts) as ONE input to its single
  // boot-navigation decision, closing that race by construction (LC-D-T3).
  const isRider = session?.role === "rider";
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const to = pushDestination(response.notification.request.content.data, isRider);
      if (to) pushOnce(router, pathnameRef.current, to);
    });
    return () => sub.remove();
  }, [isRider]);

  // Owner instruction (2026-08-16): no screen asks the user to refresh by hand any more, so an
  // account-standing decision has to reach the UI on its own. `kind: "account"` is what the API tags a
  // KYC decision with (rider.service.ts `notifyKycDecision`, fired from BOTH the vendor-webhook and the
  // admin-console paths) — the exact event the "Refresh status" button on the rider board existed to
  // catch. Invalidating ["me"] on arrival flips the wall to the verified board while the rider is
  // looking at it, without waiting for the screen's own poll to come round.
  //
  // Scope, honestly stated: `addNotificationReceivedListener` fires for a notification delivered while
  // the app is FOREGROUNDED. One arriving while the app is backgrounded or killed is handled by the
  // foreground refetch on the screens themselves (useForegroundRefetch) — no JS runs in this process
  // until then. Tapping such a notification also lands here, via the response listener above, whose
  // `pushDestination` routes an account push to `/rider`; the destination screen invalidates on focus.
  // `useQueryClient()` rather than importing the `queryClient` singleton: this hook only ever mounts in
  // `PushSync`, which sits inside the provider (app/_layout.tsx), so the hook resolves to the same cache
  // — and it keeps this module off the singleton's import chain (query/client → api/client →
  // auth/session → expo-secure-store), which a hook this low in the tree has no reason to drag in.
  const qc = useQueryClient();
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener((notification) => {
      if (notification.request.content.data?.kind !== "account") return;
      void qc.invalidateQueries({ queryKey: ["me"] });
    });
    return () => sub.remove();
  }, [qc]);
}
