"use client";

import { useCallback, useEffect, useRef } from "react";

/** Marks the history entry a step pushed, so a re-run of the effect (React StrictMode) doesn't push twice. */
const STEP_KEY = "lyniaStep";
/** How long `leave` waits for the browser to pop the step's entry before going on anyway. */
const LEAVE_WAIT_MS = 300;

export interface StepBack {
  /** The screen's own back arrow: pops the step's entry (Back and the arrow do the same thing). */
  back: () => void;
  /** Before leaving the page from inside the step (a sign-in that lands): drop the step's entry first, so
   *  Back from the next page doesn't return to a finished step. */
  leave: () => Promise<void>;
}

/**
 * MJ-M9 (2026-10-07): a step inside one page (sign-in's code step, the sign-up's step 2) is its own
 * history entry, so the phone's Back goes to the step before instead of leaving the app and losing what
 * was typed. While `active`, one entry is pushed (same URL); Back pops it and `onBack` runs.
 */
export function useStepBack(active: boolean, onBack: () => void): StepBack {
  const pushed = useRef(false);
  const leaving = useRef<(() => void) | null>(null);
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    if (!active) return undefined;
    const state = (window.history.state ?? {}) as Record<string, unknown>;
    if (!state[STEP_KEY]) window.history.pushState({ ...state, [STEP_KEY]: true }, "");
    pushed.current = true;
    const onPop = () => {
      if (!pushed.current) return;
      pushed.current = false;
      if (leaving.current) leaving.current();
      else onBackRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [active]);

  const back = useCallback(() => {
    if (pushed.current) window.history.back();
    else onBackRef.current();
  }, []);

  const leave = useCallback(
    () =>
      new Promise<void>((resolve) => {
        if (!pushed.current) {
          resolve();
          return;
        }
        let timer: ReturnType<typeof setTimeout> | null = null;
        const done = () => {
          if (timer) clearTimeout(timer);
          pushed.current = false;
          leaving.current = null;
          resolve();
        };
        timer = setTimeout(done, LEAVE_WAIT_MS);
        leaving.current = done;
        window.history.back();
      }),
    [],
  );

  return { back, leave };
}
