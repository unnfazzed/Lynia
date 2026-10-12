import { useEffect, useState } from "react";

/**
 * `true` only once `flag` has stayed true for `ms`; `false` the moment it drops. For "bad news" states that
 * are normal for a few seconds — a socket still handshaking at boot reads exactly like a dropped one — so
 * the UI only says "reconnecting" when the link has really stayed down, and clears it at once on recovery.
 */
export function useSettled(flag: boolean, ms: number): boolean {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!flag) {
      setSettled(false);
      return;
    }
    const t = setTimeout(() => setSettled(true), ms);
    return () => clearTimeout(t);
  }, [flag, ms]);
  return flag && settled;
}
