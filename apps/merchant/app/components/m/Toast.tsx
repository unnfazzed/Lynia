"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

/**
 * The handoff's toast (merchant-mobile README "Interactions": an ink bubble 84px above the bottom,
 * 2.2s, after every committed action — "Accepted · customer told 15 min", "Cash confirmed · order
 * closed"). One per app, so a screen that navigates away right after an action still shows it.
 */
const ToastContext = createContext<(message: string) => void>(() => {});

export const TOAST_MS = 2200;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((next: string) => {
    setMessage(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), TOAST_MS);
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
      {message && (
        <div className="m-toast" role="status" aria-live="polite">
          {message}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): (message: string) => void {
  return useContext(ToastContext);
}
