"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { WS_EVENTS } from "@lynia/shared";
import { getAlarmController } from "./alarm-singleton";
import { useWakeLock } from "./use-wake-lock";
import { API_BASE_URL } from "../lib/config";
import { createMerchantQueueSocket } from "../lib/queue-socket";
import { getReachabilityStore, type ReachabilityState } from "../lib/reachability";
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
    /** Unbounded ring — a real NEW ORDER. Idempotent (no-ops if already ringing); the caller
     *  (the queue screen) calls this whenever an unanswered `awaiting_accept` order exists and
     *  `silence()` the instant it no longer does — D-05: "stops only on Accept/Can't-take-it." */
    ring: () => void;
    silence: () => void;
  };
  reachability: ReachabilityState;
  /** True whenever the connection is down — every mutating action the queue/menu/shop screens add
   *  from E2 onward must consume this and disable themselves (§3: "all mutating actions disabled"). */
  actionsDisabled: boolean;
  wakeLock: { supported: boolean; active: boolean };
}

const KitchenConnectionContext = createContext<KitchenConnectionValue | null>(null);

const TEST_RING_DURATION_MS = 3 * 1200 + 2 * 800; // three chime cycles, long enough to judge volume

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

  // C5 kitchen queue presence: join the merchant's own queue room on every connect AND every
  // reconnect (Socket.IO doesn't persist room membership across a reconnect) so the server's
  // `isMerchantOnline` check reflects this tablet for as long as it's signed in — restoring N-03's
  // auto-cancel guarantee, which was previously unenforceable for any merchant (see queue-socket.ts).
  // Gated on `session` (not just mount) so a signed-out tablet leaves the room instead of reporting a
  // phantom "online" merchant nobody is actually watching.
  useEffect(() => {
    if (!session) return undefined;
    const socket = createMerchantQueueSocket();
    socket.on("connect", () => {
      socket.emit(WS_EVENTS.merchantQueueSubscribe);
    });
    return () => {
      socket.disconnect();
    };
  }, [session]);

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

  const signOut = useCallback(() => {
    clearMerchantSession();
    setSession(null);
    router.replace("/login");
  }, [router]);

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
    }),
    [session, sessionChecked, signOut, alarm, reachState, wakeLock],
  );

  return <KitchenConnectionContext.Provider value={value}>{children}</KitchenConnectionContext.Provider>;
}

export function useKitchenConnection(): KitchenConnectionValue {
  const ctx = useContext(KitchenConnectionContext);
  if (!ctx) throw new Error("useKitchenConnection must be used within KitchenConnectionProvider");
  return ctx;
}
