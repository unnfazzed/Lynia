"use client";

import { useCallback, useEffect, useRef } from "react";

/** Marks the history entry a step pushed, so a re-run of the effect (React StrictMode) doesn't push twice. */
const STEP_KEY = "lyniaStep";

export interface StepBack {
  /** The screen's own back arrow: pops the step's entry (Back and the arrow do the same thing). */
  back: () => void;
  /** Before leaving the page from inside the step with `router.replace` (a sign-in that lands): the
   *  replace overwrites the step's entry, so Back from the next page doesn't return to a finished step. */
  leave: () => Promise<void>;
}

/**
 * MJ-M9 (2026-10-07): a step inside one page (sign-in's code step, the sign-up's step 2) is its own
 * history entry, so the phone's Back goes to the step before instead of leaving the app and losing what
 * was typed. While `active`, one entry is pushed (same URL); Back pops it and `onBack` runs.
 */
export function useStepBack(active: boolean, onBack: () => void): StepBack {
  const pushed = useRef(false);
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
      onBackRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [active]);

  const back = useCallback(() => {
    if (pushed.current) window.history.back();
    else onBackRef.current();
  }, []);

  // The caller replaces the URL next (`router.replace`), which overwrites the step's own entry: no
  // `history.back()` and no wait for its popstate (a late one used to pop the next page back to the step's
  // page). The step just stops listening, so nothing that pops later runs `onBack`.
  const leave = useCallback(async () => {
    pushed.current = false;
  }, []);

  return { back, leave };
}
