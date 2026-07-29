"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
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

  const arm = useCallback(() => {
    getAlarmController().arm();
    setAlarmTick((t) => t + 1);
  }, []);

  const toggleMuted = useCallback(() => {
    const controller = getAlarmController();
    controller.setMuted(!controller.isMuted());
    setAlarmTick((t) => t + 1);
  }, []);

  const testRing = useCallback(() => {
    const controller = getAlarmController();
    controller.start(TEST_RING_DURATION_MS);
    setAlarmTick((t) => t + 1);
  }, []);

  const signOut = useCallback(() => {
    clearMerchantSession();
    setSession(null);
    router.replace("/login");
  }, [router]);

  const controller = getAlarmController();
  const value: KitchenConnectionValue = {
    session,
    signOut,
    alarm: {
      armed: controller.isArmed(),
      muted: controller.isMuted(),
      ringing: controller.isRinging(),
      arm,
      toggleMuted,
      testRing,
    },
    reachability: reachState,
    actionsDisabled: !reachState.reachable,
    wakeLock,
  };
  // alarmTick is read only to satisfy the linter's "unused" check on the setter dependency — the
  // controller itself is the source of truth, this state exists purely to force a re-render.
  void alarmTick;

  return <KitchenConnectionContext.Provider value={value}>{children}</KitchenConnectionContext.Provider>;
}

export function useKitchenConnection(): KitchenConnectionValue {
  const ctx = useContext(KitchenConnectionContext);
  if (!ctx) throw new Error("useKitchenConnection must be used within KitchenConnectionProvider");
  return ctx;
}
