"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Icon } from "../icons";

/**
 * The handoff's toast (merchant-mobile README "Interactions": an ink bubble 84px above the bottom,
 * 2.2s, after every committed action — "Accepted · customer told 15 min", "Cash confirmed · order
 * closed"). One per app, so a screen that navigates away right after an action still shows it.
 */
export interface ToastOptions {
  /** Shop front v1 (D-115): first-run-v2's saved toast — forest, a mint check, 96px up, 2.5 s. Own bikers v1
   *  (D-117): `offline` is the same toast with a wifi-off in the muted mint ("This list may be out of date"). */
  tone?: "saved" | "offline";
}

const ToastContext = createContext<(message: string, options?: ToastOptions) => void>(() => {});

export const TOAST_MS = 2200;
export const SAVED_TOAST_MS = 2500;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<{ message: string; tone?: ToastOptions["tone"] } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((next: string, options?: ToastOptions) => {
    setToast({ message: next, tone: options?.tone });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), options?.tone ? SAVED_TOAST_MS : TOAST_MS);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && (
        <div className="m-toast" data-tone={toast.tone} role="status" aria-live="polite">
          {toast.tone === "saved" && <Icon name="check" size={20} color="var(--accent)" />}
          {toast.tone === "offline" && <Icon name="wifi-off" size={20} color="var(--on-forest-muted)" />}
          {toast.message}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): (message: string, options?: ToastOptions) => void {
  return useContext(ToastContext);
}
