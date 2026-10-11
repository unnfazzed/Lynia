import { useEffect, useState } from "react";

/** Search inputs wait this long after the last keystroke before they query (work order §3). */
export const SEARCH_DEBOUNCE_MS = 300;

/** `value`, but only once it has held still for `ms` — one search request per pause, not per keystroke. */
export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
