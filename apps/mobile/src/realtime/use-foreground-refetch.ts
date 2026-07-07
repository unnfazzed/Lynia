import { useEffect, useRef } from "react";
import { AppState } from "react-native";

/**
 * Warm-resume: run `onForeground` the moment the app returns to foreground (e.g. to invalidate a
 * query), so a status/board change that arrived while backgrounded doesn't serve a stale cache
 * until the next poll interval or socket event. Pass `enabled=false` to skip subscribing (e.g. the
 * rider board only cares while online).
 */
export function useForegroundRefetch(onForeground: () => void, enabled = true): void {
  const cbRef = useRef(onForeground);
  cbRef.current = onForeground;

  useEffect(() => {
    if (!enabled) return;
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") cbRef.current();
    });
    return () => sub.remove();
  }, [enabled]);
}
