import { useEffect, useState } from "react";
import { useBootPhase } from "./boot-phase";
import { getBootReadiness } from "./boot-readiness";
import { ENTRANCE_END_MS } from "./splash/BootEntrance";

/**
 * P10 (customer review 2026-10-07): whether the cold start is OVER — for Home's idle warm-ups (the route
 * graphs and the 1×1 Maps SDK map). Home mounts under the splash (ledger D-64), and its "idle" there
 * landed at about 1.9 s: inside Home's native rise and the section entrance, which the Maps SDK's init on
 * the Android UI thread visibly stuttered. So: false while booting, then true once the last section has
 * risen (`ENTRANCE_END_MS` after the exit started). A screen mounted after the boot is settled at once.
 *
 * The exit time is read when the boot ends rather than subscribed to, so the screen doesn't re-render on
 * every readiness change of the splash.
 */
export function useBootSettled(): boolean {
  const { booting } = useBootPhase();
  const [settled, setSettled] = useState(!booting);
  useEffect(() => {
    if (booting || settled) return;
    const exitAt = getBootReadiness().exitAt;
    const wait = exitAt == null ? 0 : Math.max(0, exitAt + ENTRANCE_END_MS - Date.now());
    const t = setTimeout(() => setSettled(true), wait);
    return () => clearTimeout(t);
  }, [booting, settled]);
  return settled;
}
