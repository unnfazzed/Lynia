import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { ApiError } from "../api/client";
import { sendHeartbeat } from "../api/riders";
import { useAuth } from "../auth/auth-context";

type LatLng = { lat: number; lng: number };

/** The foreground beat: well inside the server's 120 s "riders nearby" cutoff. */
export const HEARTBEAT_MS = 20_000;
/** Back in the app after at least this long since the last beat: beat at once instead of waiting. */
export const WAKE_BEAT_GAP_MS = HEARTBEAT_MS / 2;

/**
 * The online rider's liveness beat (`POST /riders/heartbeat`). Only a 403 takes the rider offline
 * (`onRefused` decides how); two failed beats in a row report `stale` ("Reconnecting…").
 *
 * A 20 s timer beats with the board's last position while the app is on screen. It stops when the phone
 * locks: the owner declined running a location service while idle (2026-10-12, it would need a new Play
 * foreground-service declaration), so the background task stays scoped to an active job
 * (use-rider-location.ts). Two things cover the locked phone instead:
 * - the server keeps a pending bid choosable for as long as a push still reaches the rider
 *   (common/rider-selectable.ts), so a pocketed phone no longer loses the bid;
 * - coming back to the app (unlocking it, or opening a job push) beats at once, so the rider is counted
 *   again without waiting out the timer.
 */
export function useRiderHeartbeat(online: boolean, getLoc: () => LatLng | null, onRefused: (e: ApiError) => void): { stale: boolean } {
  const { session } = useAuth();
  const signedIn = session != null;
  const [stale, setStale] = useState(false);
  const getLocRef = useRef(getLoc);
  getLocRef.current = getLoc;
  const onRefusedRef = useRef(onRefused);
  onRefusedRef.current = onRefused;

  useEffect(() => {
    if (!online || !signedIn) {
      setStale(false);
      return;
    }
    let failures = 0;
    // Going online just stamped the heartbeat server-side, so the first beat is a full period away.
    let lastBeatAt = Date.now();
    const beat = (): void => {
      lastBeatAt = Date.now();
      sendHeartbeat(getLocRef.current() ?? undefined)
        .then(() => {
          failures = 0;
          setStale(false);
        })
        .catch((e: unknown) => {
          if (e instanceof ApiError && e.status === 403) onRefusedRef.current(e);
          else {
            failures += 1;
            if (failures >= 2) setStale(true);
          }
        });
    };
    // Half a period of slack: a wake beat a moment ago makes this tick redundant, but timer jitter must
    // not push a tick a whole period late.
    const t = setInterval(() => {
      if (Date.now() - lastBeatAt >= WAKE_BEAT_GAP_MS) beat();
    }, HEARTBEAT_MS);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active" && Date.now() - lastBeatAt >= WAKE_BEAT_GAP_MS) beat();
    });
    return () => {
      clearInterval(t);
      sub.remove();
    };
  }, [online, signedIn]);

  return { stale };
}
