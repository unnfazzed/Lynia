"use client";

import { useEffect, useState } from "react";

export interface WakeLockState {
  /** false on a browser with no Screen Wake Lock API at all — the caller falls back to the flashing
   *  header immediately rather than waiting on a doomed request. */
  supported: boolean;
  /** true once a lock is actually held. False while unsupported, refused, or the tab is hidden — the
   *  flashing-header fallback (§3: "If the wake lock is refused, the queue falls back to a
   *  full-brightness flashing header") should render whenever this is false but `enabled` is true. */
  active: boolean;
}

/**
 * Screen Wake Lock with a flashing-header fallback (RESTAURANTS-DECISIONS.md §3: "Screen Wake Lock
 * held while the tab is visible and any order is un-answered. If the wake lock is refused, the queue
 * falls back to a full-brightness flashing header."). `enabled` is the caller's own gate (E1: while
 * signed in and armed; E2 will narrow this to "and an order is unanswered" once real order state
 * exists) — this hook only handles acquiring/releasing the lock and tracking tab visibility.
 */
export function useWakeLock(enabled: boolean): WakeLockState {
  const [state, setState] = useState<WakeLockState>({ supported: false, active: false });

  useEffect(() => {
    const wakeLock = navigator.wakeLock;
    const supported = typeof wakeLock?.request === "function";
    setState((s) => ({ ...s, supported }));
    if (!enabled || !supported || !wakeLock) {
      setState((s) => ({ ...s, active: false }));
      return;
    }

    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    async function acquire() {
      if (document.visibilityState !== "visible") return;
      try {
        const lock = await wakeLock.request("screen");
        if (cancelled) {
          void lock.release();
          return;
        }
        sentinel = lock;
        setState({ supported: true, active: true });
        lock.addEventListener("release", () => {
          if (!cancelled) setState((s) => ({ ...s, active: false }));
        });
      } catch {
        // Refused (low battery, unsupported context, etc.) — the caller renders the flashing fallback.
        setState({ supported: true, active: false });
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") void acquire();
    }

    void acquire();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (sentinel && !sentinel.released) void sentinel.release();
    };
  }, [enabled]);

  return state;
}
