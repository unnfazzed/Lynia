"use client";

import { useEffect, useRef, useState } from "react";

/** How far the visual viewport has to shrink before it counts as the soft keyboard (README "Keyboard"). */
const KEYBOARD_PX = 150;

/**
 * Shop front v1 (D-115) "Keyboard": true while a text field is focused and the visual viewport has shrunk by
 * more than 150px, so the page can hide its Save bar. The focused field is then scrolled to sit just above
 * the keyboard (its `scroll-margin-bottom` is the 16px gap).
 */
export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return undefined;
    const textFocused = () => {
      const el = document.activeElement;
      return el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && !["button", "checkbox", "radio", "range", "file"].includes(el.type));
    };
    const update = () => {
      const next = textFocused() && window.innerHeight - vv.height > KEYBOARD_PX;
      setOpen(next);
      if (next) (document.activeElement as HTMLElement | null)?.scrollIntoView({ block: "nearest" });
    };
    vv.addEventListener("resize", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    return () => {
      vv.removeEventListener("resize", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
    };
  }, []);
  return open;
}

/**
 * While `active`, the browser's back (Android's back gesture) asks first instead of leaving: one history entry
 * is pushed for the screen, and a back that pops it calls `onAttempt` and puts it back. The entry carries
 * Next's own state, so the router still recognises it. When the guard ends (saved, or Leave chosen) the entry
 * it added is taken off again.
 */
export function useBackGuard(active: boolean, onAttempt: () => void): { release: () => void } {
  const onAttemptRef = useRef(onAttempt);
  onAttemptRef.current = onAttempt;
  // Leaving on purpose navigates away itself; unwinding the entry as well would undo that navigation.
  const released = useRef(false);
  useEffect(() => {
    if (!active || typeof window === "undefined") return undefined;
    released.current = false;
    const marker = { ...window.history.state, __sfGuard: true };
    window.history.pushState(marker, "");
    const onPop = () => {
      window.history.pushState(marker, "");
      onAttemptRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (!released.current && (window.history.state as { __sfGuard?: boolean } | null)?.__sfGuard) window.history.back();
    };
  }, [active]);
  return { release: () => (released.current = true) };
}
