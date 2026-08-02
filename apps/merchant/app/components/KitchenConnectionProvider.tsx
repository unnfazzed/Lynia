"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getAlarmController } from "./alarm-singleton";
import { useWakeLock } from "./use-wake-lock";
import { API_BASE_URL } from "../lib/config";
import { getReachabilityStore, type ReachabilityState } from "../lib/reachability";
import { clearMerchantSession, loadMerchantSession, type MerchantSession } from "../lib/session";

export interface KitchenConnectionValue {
  session: MerchantSession | null;
  signOut: () => void;
  alarm: {
    armed: boolean;
    muted: boolean;
    ringing: boolean;
    arm: () => void;
    toggleMuted: () => void;
    testRing: () => void;
    /** Unbounded ring — a real NEW ORDER. Idempotent (no-ops if already ringing/muted); the caller
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
  const [alarmTick, setAlarmTick] = useState(0); // bump to re-render on mute/arm/ring changes
  const [reachState, setReachState] = useState<ReachabilityState>({
    reachable: true,
    attempt: 0,
    unreachableSinceMs: null,
  });

  useEffect(() => {
    setSession(loadMerchantSession());
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

  // Resume the AudioContext on every gesture in the tab (§3: "AudioContext resumed on every user
  // gesture in case Chrome suspends it") — cheap no-op once already running.
  useEffect(() => {
    const controller = getAlarmController();
    const onGesture = () => controller.resume();
    document.addEventListener("pointerdown", onGesture);
    document.addEventListener("keydown", onGesture);
    return () => {
      document.removeEventListener("pointerdown", onGesture);
      document.removeEventListener("keydown", onGesture);
    };
  }, []);

  const wakeLock = useWakeLock(getAlarmController().isArmed());

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

  const toggleMuted = useCallback(() => {
    const controller = getAlarmController();
    controller.setMuted(!controller.isMuted());
    setAlarmTick((t) => t + 1);
  }, []);

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
  // parent re-render) doesn't hand every context consumer — KitchenBar, RearmBanner,
  // ReconnectBanner, the queue screen — a brand-new object identity, which would defeat their own
  // memoization and any effect keyed on this value (B-D0).
  const alarm = useMemo(() => {
    const controller = getAlarmController();
    return {
      armed: controller.isArmed(),
      muted: controller.isMuted(),
      ringing: controller.isRinging(),
      arm,
      toggleMuted,
      testRing,
      ring,
      silence,
    };
    // alarmTick is the trigger for re-reading the controller's (otherwise untracked) mutable state;
    // the callbacks are stable across renders (useCallback, no deps).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alarmTick, arm, toggleMuted, testRing, ring, silence]);

  const value = useMemo<KitchenConnectionValue>(
    () => ({
      session,
      signOut,
      alarm,
      reachability: reachState,
      actionsDisabled: !reachState.reachable,
      wakeLock,
    }),
    [session, signOut, alarm, reachState, wakeLock],
  );

  return <KitchenConnectionContext.Provider value={value}>{children}</KitchenConnectionContext.Provider>;
}

export function useKitchenConnection(): KitchenConnectionValue {
  const ctx = useContext(KitchenConnectionContext);
  if (!ctx) throw new Error("useKitchenConnection must be used within KitchenConnectionProvider");
  return ctx;
}
