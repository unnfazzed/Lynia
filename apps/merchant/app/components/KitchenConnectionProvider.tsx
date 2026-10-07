"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { WS_EVENTS } from "@lynia/shared";
import { getAlarmController } from "./alarm-singleton";
import { useWakeLock } from "./use-wake-lock";
import { API_BASE_URL } from "../lib/config";
import { createMerchantQueueSocket } from "../lib/queue-socket";
import { getReachabilityStore, type ReachabilityState } from "../lib/reachability";
import { onMembershipLost, refreshMerchantSession } from "../lib/api-client";
import { alarmOrders } from "../lib/alarm";
import { useQueuePoll, type QueuePollState } from "../lib/use-queue-poll";
import { clearBusinessCache, hasKnownBusiness } from "../lib/business";
import { clearMerchantSession, loadMerchantSession, type MerchantSession } from "../lib/session";

export interface KitchenConnectionValue {
  session: MerchantSession | null;
  /** True once the mount-time cookie read has actually run at least once. `session === null` is
   *  ambiguous on its own (not-yet-checked vs. genuinely signed out); consumers that need to tell
   *  those apart — SessionGuard, below — gate on this instead of on `session` alone. */
  sessionChecked: boolean;
  signOut: () => void;
  alarm: {
    /** Whether this page load has had the user gesture browsers require before they will loop
     *  audio. Not a merchant-facing switch — the shell arms it from the first tap anywhere (see the
     *  gesture effect below), so there is nothing to turn on and nothing to turn off. */
    armed: boolean;
    ringing: boolean;
    arm: () => void;
    testRing: () => void;
    /** Unbounded ring — a real NEW ORDER. Idempotent (no-ops if already ringing); this provider
     *  calls it whenever an unanswered `awaiting_accept` order exists and `silence()` the instant it
     *  no longer does — D-05: "stops only on Accept/Can't-take-it." (C20: the provider is the alarm's
     *  one owner; no screen rings or silences it for orders any more.) */
    ring: () => void;
    silence: () => void;
  };
  reachability: ReachabilityState;
  /** True whenever the connection is down — every mutating action the queue/menu/shop screens add
   *  from E2 onward must consume this and disable themselves (§3: "all mutating actions disabled"). */
  actionsDisabled: boolean;
  wakeLock: { supported: boolean; active: boolean };
  /** Join the live queue again, for the branch the person now works in (after a branch switch the
   *  server has dropped this device from the old branch's room), and re-read it. */
  rejoinQueue: () => void;
  /**
   * C20 / MJ-B1 (2026-10-07): the live order queue, polled ONCE for the whole signed-in app. It used to be
   * polled only by the Orders board and the tab bar's live bar, so on every pushed screen (a cooking or
   * hand-over ticket, the Rx check, hours, team…) a new order neither showed nor rang, and was cancelled
   * `shop_closed` three minutes later. The provider owns it now, and with it the alarm: it starts with
   * the session — not after `/merchant/me` (MJ-RH4) — and the board, the live bar and the ringing screen
   * (`RingingHost`, over any screen: decision D4, ledger D-86) all read this one copy.
   */
  queue: QueuePollState;
  /** Orders a screen is answering in its own way (the Rx check for that order): the ringing screen does
   *  not cover that screen for them. */
  heldOrderIds: ReadonlySet<string>;
  /** Hold `orderId` off the ringing screen while the caller is mounted; returns the release. */
  holdTakeover: (orderId: string) => () => void;
}

const KitchenConnectionContext = createContext<KitchenConnectionValue | null>(null);

const TEST_RING_DURATION_MS = 3 * 1200 + 2 * 800; // three chime cycles, long enough to judge volume

/** MJ-M7: back-off for re-joining after the server dropped the presence socket (1s, 2s, 4s… 60s). The
 *  first retry is immediate; a kick more than `SOCKET_KICK_RESET_MS` after the last one starts over. */
const SOCKET_RETRY_BASE_MS = 1_000;
const SOCKET_RETRY_MAX_MS = 60_000;
const SOCKET_KICK_RESET_MS = 60_000;

export function KitchenConnectionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [session, setSession] = useState<MerchantSession | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [alarmTick, setAlarmTick] = useState(0); // bump to re-render on arm/ring changes
  const [reachState, setReachState] = useState<ReachabilityState>({
    reachable: true,
    attempt: 0,
    unreachableSinceMs: null,
  });

  useEffect(() => {
    setSession(loadMerchantSession());
    setSessionChecked(true);
  }, []);

  useEffect(() => {
    const store = getReachabilityStore(API_BASE_URL);
    setReachState(store.getState());
    const unsubscribe = store.subscribe(setReachState);
    store.start();
    return () => {
      unsubscribe();
      store.stop();
    };
  }, []);

  // Each of these only bumps `alarmTick` when the controller's state actually transitioned — NOT
  // unconditionally. B-D0: the queue screen's alarm-sync effect depends on `alarm` (KitchenBar and
  // friends read it too), so an unconditional bump here made `ring()` (called every render while an
  // order is unanswered, a no-op after the first) re-trigger that effect forever: bump → new `alarm`
  // identity → effect re-fires → `ring()` again → bump. Gating on a real transition breaks the cycle
  // at the source, independent of memoization below.
  const arm = useCallback(() => {
    const controller = getAlarmController();
    const wasArmed = controller.isArmed();
    controller.arm();
    if (!wasArmed) setAlarmTick((t) => t + 1);
  }, []);

  // Every gesture in the tab arms the alarm and resumes the AudioContext (§3: "AudioContext resumed
  // on every user gesture in case Chrome suspends it"). `arm()` rather than `resume()` is what makes
  // the alarm always-on (owner instruction 2026-08-19): browsers still require one gesture per page
  // load before they will loop audio, but the merchant no longer has to aim that gesture at a
  // control — the first tap on any screen, anywhere, satisfies it. Cheap no-op once already running,
  // and `arm` only re-renders on the false→true transition.
  useEffect(() => {
    const onGesture = () => arm();
    document.addEventListener("pointerdown", onGesture);
    document.addEventListener("keydown", onGesture);
    return () => {
      document.removeEventListener("pointerdown", onGesture);
      document.removeEventListener("keydown", onGesture);
    };
  }, [arm]);

  const wakeLock = useWakeLock(getAlarmController().isArmed());

  const testRing = useCallback(() => {
    const controller = getAlarmController();
    const wasRinging = controller.isRinging();
    controller.start(TEST_RING_DURATION_MS);
    if (controller.isRinging() !== wasRinging) setAlarmTick((t) => t + 1);
  }, []);

  const ring = useCallback(() => {
    const controller = getAlarmController();
    const wasRinging = controller.isRinging();
    controller.start();
    if (controller.isRinging() !== wasRinging) setAlarmTick((t) => t + 1);
  }, []);

  const silence = useCallback(() => {
    const controller = getAlarmController();
    const wasRinging = controller.isRinging();
    controller.stop();
    if (wasRinging) setAlarmTick((t) => t + 1);
  }, []);

  // MJ-M6 (2026-10-07): signing out while an order rang left the alarm looping on the sign-in screen.
  // The alarm stops with the session, whatever started it.
  const rangRef = useRef(false);
  const signOut = useCallback(() => {
    const controller = getAlarmController();
    const wasRinging = controller.isRinging();
    controller.stop();
    rangRef.current = false;
    if (wasRinging) setAlarmTick((t) => t + 1);
    clearMerchantSession();
    clearBusinessCache();
    setSession(null);
    router.replace("/login");
  }, [router]);

  // C5 kitchen queue presence: join the merchant's own queue room on every connect AND every
  // reconnect (Socket.IO doesn't persist room membership across a reconnect) so the server's
  // `isMerchantOnline` check reflects this tablet for as long as it's signed in — restoring N-03's
  // auto-cancel guarantee, which was previously unenforceable for any merchant (see queue-socket.ts).
  // Gated on `session` (not just mount) so a signed-out tablet leaves the room instead of reporting a
  // phantom "online" merchant nobody is actually watching.
  //
  // MJ-M7 (2026-10-07): a handshake with an expired access token is dropped by the server
  // (`TrackingGateway.handleConnection` → `client.disconnect(true)`), which reaches here as
  // `disconnect` with reason "io server disconnect" — the one reason Socket.IO never retries by itself.
  // The tablet then read as "dark" for the rest of the shift (feeding MJ-H2). So on that reason the
  // shell refreshes the session and reconnects; the socket's `auth` callback reads the live token
  // (queue-socket.ts, the same pattern as the mobile app's LC-C14). A dead refresh token signs out.
  const socketRef = useRef<ReturnType<typeof createMerchantQueueSocket> | null>(null);
  const signOutRef = useRef(signOut);
  signOutRef.current = signOut;
  useEffect(() => {
    if (!session) return undefined;
    const socket = createMerchantQueueSocket();
    socketRef.current = socket;
    let alive = true;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let kicks = 0;
    let lastKickAt = 0;
    socket.on("connect", () => {
      socket.emit(WS_EVENTS.merchantQueueSubscribe);
    });
    socket.on("disconnect", (reason: unknown) => {
      if (!alive || reason !== "io server disconnect" || retry) return;
      const at = Date.now();
      if (at - lastKickAt > SOCKET_KICK_RESET_MS) kicks = 0;
      lastKickAt = at;
      const delay = kicks === 0 ? 0 : Math.min(SOCKET_RETRY_MAX_MS, SOCKET_RETRY_BASE_MS * 2 ** (kicks - 1));
      kicks += 1;
      retry = setTimeout(() => {
        void refreshMerchantSession()
          .catch(() => "transient" as const)
          .then((outcome) => {
            retry = null;
            if (!alive) return;
            if (outcome === "dead") {
              signOutRef.current();
              return;
            }
            // A blip on /auth/refresh: try anyway — a refused handshake comes back here, a step slower.
            socket.connect();
          });
      }, delay);
    });
    return () => {
      alive = false;
      if (retry) clearTimeout(retry);
      socketRef.current = null;
      socket.disconnect();
    };
  }, [session]);

  // C20 (MJ-B1, MJ-RH4, MJ-M14): one queue poll for the whole signed-in app, from the session on.
  const poll = useQueuePoll(session !== null);
  const { orders: queueOrders, loading: queueLoading, loaded: queueLoaded, error: queueError, refetch: refetchQueue } = poll;
  const queue = useMemo<QueuePollState>(
    () => ({ orders: queueOrders, loading: queueLoading, loaded: queueLoaded, error: queueError, refetch: refetchQueue }),
    [queueOrders, queueLoading, queueLoaded, queueError, refetchQueue],
  );

  // A queue read the API refuses as signed out sends the tablet back to sign-in (it was the board's job).
  useEffect(() => {
    if (queueError?.status === 401) signOut();
  }, [queueError, signOut]);

  // D-05: the alarm rings the whole time any order is unanswered — or auto-accepted and not yet
  // confirmed by the kitchen — on WHATEVER screen is open, and stops the instant none are. Keyed on the
  // ids, not the count, so a different order (a branch switch, one answered as another arrives) re-rings
  // even if something stopped the controller in between.
  //  - MJ-M14: nothing is decided before the first queue read lands. An empty start used to silence the
  //    alarm the moment the Orders board mounted — seconds of quiet on 2G while an order was ringing.
  //  - Silence only what this rang: Account's "Test the alarm" rings with nothing waiting.
  const alarmIds = useMemo(
    () =>
      alarmOrders(queueOrders)
        .map((o) => o.id)
        .sort()
        .join(","),
    [queueOrders],
  );
  useEffect(() => {
    if (!session || !queueLoaded) return;
    if (alarmIds) {
      rangRef.current = true;
      ring();
    } else if (rangRef.current) {
      rangRef.current = false;
      silence();
    }
  }, [session, queueLoaded, alarmIds, ring, silence]);

  // MJ-M6: leaving the signed-in app (the shell unmounting) never leaves the alarm looping behind it.
  useEffect(
    () => () => {
      rangRef.current = false;
      getAlarmController().stop();
    },
    [],
  );

  const [heldOrderIds, setHeldOrderIds] = useState<ReadonlySet<string>>(() => new Set());
  const holdTakeover = useCallback((orderId: string) => {
    setHeldOrderIds((prev) => new Set(prev).add(orderId));
    return () =>
      setHeldOrderIds((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
  }, []);

  // The server picks the room from the person's current branch, so the same subscribe joins the new one.
  // Not yet connected: the `connect` handler above subscribes when it is. The queue is re-read for it.
  const rejoinQueue = useCallback(() => {
    const socket = socketRef.current;
    if (socket?.connected) socket.emit(WS_EVENTS.merchantQueueSubscribe);
    void refetchQueue();
  }, [refetchQueue]);

  // Merchant web upgrade L4 (Team): someone the owner removed signs out on their next tap and their
  // device's order alarm stops, so a shared counter tablet goes back to "Sign in" for the next person.
  // Only for a person this tab knew as a member: a number that never had a business is sent to "Set up
  // your business" by the screen that asked.
  useEffect(
    () =>
      onMembershipLost(() => {
        if (!hasKnownBusiness()) return;
        getAlarmController().stop();
        signOut();
      }),
    [signOut],
  );

  // Memoized so a re-render that doesn't touch alarm/session/reachability/wakeLock state (e.g. a
  // parent re-render) doesn't hand every context consumer — KitchenBar, ReconnectBanner, the queue
  // screen — a brand-new object identity, which would defeat their own memoization and any effect
  // keyed on this value (B-D0).
  const alarm = useMemo(() => {
    const controller = getAlarmController();
    return {
      armed: controller.isArmed(),
      ringing: controller.isRinging(),
      arm,
      testRing,
      ring,
      silence,
    };
    // alarmTick is the trigger for re-reading the controller's (otherwise untracked) mutable state;
    // the callbacks are stable across renders (useCallback, no deps).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alarmTick, arm, testRing, ring, silence]);

  const value = useMemo<KitchenConnectionValue>(
    () => ({
      session,
      sessionChecked,
      signOut,
      alarm,
      reachability: reachState,
      actionsDisabled: !reachState.reachable,
      wakeLock,
      rejoinQueue,
      queue,
      heldOrderIds,
      holdTakeover,
    }),
    [session, sessionChecked, signOut, alarm, reachState, wakeLock, rejoinQueue, queue, heldOrderIds, holdTakeover],
  );

  return <KitchenConnectionContext.Provider value={value}>{children}</KitchenConnectionContext.Provider>;
}

export function useKitchenConnection(): KitchenConnectionValue {
  const ctx = useContext(KitchenConnectionContext);
  if (!ctx) throw new Error("useKitchenConnection must be used within KitchenConnectionProvider");
  return ctx;
}
