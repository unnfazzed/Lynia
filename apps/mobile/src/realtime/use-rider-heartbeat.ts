import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { ApiError } from "../api/client";
import { sendHeartbeat } from "../api/riders";
import { useAuth } from "../auth/auth-context";
// Top-level import, load-bearing for its side effect too: it defines the background task at module
// scope (see use-rider-location.ts's matching note) — the board imports this, so it runs at bundle load.
import {
  resumeRiderBackgroundUpdates,
  setOnlineFixForwarder,
  startRiderOnlineUpdates,
  stopRiderOnlineUpdates,
} from "./background-location-task";

type LatLng = { lat: number; lng: number };

/** The foreground beat: well inside the server's 60 s selection TTL (and the 120 s "riders nearby"). */
export const HEARTBEAT_MS = 20_000;
/** A fix-driven beat never goes out sooner than this after the last beat, from either source. */
export const MIN_BEAT_GAP_MS = 20_000;

/**
 * The online rider's liveness beat (`POST /riders/heartbeat`). Only a 403 takes the rider offline
 * (`onRefused` decides how); two failed beats in a row report `stale` ("Reconnecting…").
 *
 * Two clocks feed it. In the foreground a 20 s timer beats with the board's last position. That timer
 * stops when the phone locks, and the server drops a rider's bids ~60 s after the last beat — a rider
 * who bid and pocketed the phone lost the bid before the customer chose. So while online the hook
 * also runs the background location task at its low online rate (an Android foreground service under
 * while-in-use permission; see background-location-task.ts) and beats off its fixes, throttled so the
 * two clocks together never beat more often than every ~20 s. iOS can't start the service without
 * "always" permission, which we never ask for: it keeps the foreground timer only, as before.
 *
 * Privacy gate: the fix forwarder is registered only while `online` and signed in, and unregistered in
 * the cleanup that ends either, before the native stop — a fix that lands after goes nowhere. Gated on
 * having a session rather than the token itself, so a token refresh doesn't restart the service (a
 * restart from the background is refused by Android).
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
    // Going online just stamped the heartbeat server-side, so the first beat is a full gap away.
    let lastBeatAt = Date.now();
    const beat = (at: LatLng | undefined): void => {
      lastBeatAt = Date.now();
      sendHeartbeat(at)
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
    // Half a gap of slack: a fix-driven beat a moment ago makes this tick redundant, but timer jitter
    // must not push a foreground tick a whole period late.
    const t = setInterval(() => {
      if (Date.now() - lastBeatAt >= HEARTBEAT_MS / 2) beat(getLocRef.current() ?? undefined);
    }, HEARTBEAT_MS);
    // Register the bridge BEFORE starting, so no early fix lands unforwarded. The fix is the freshest
    // position there is, so the beat carries it.
    setOnlineFixForwarder((fix) => {
      if (Date.now() - lastBeatAt >= MIN_BEAT_GAP_MS) beat(fix);
    });
    // Started here, while the board is on screen: Android refuses to start a location foreground
    // service from the background, so a refused start is re-tried the moment the app is back.
    void startRiderOnlineUpdates();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void resumeRiderBackgroundUpdates();
    });
    return () => {
      clearInterval(t);
      sub.remove();
      // Unhook first (a straggler fix racing the async native stop is dropped), then stop — unless a
      // job holds the service, which then keeps its own rate.
      setOnlineFixForwarder(null);
      void stopRiderOnlineUpdates();
    };
  }, [online, signedIn]);

  return { stale };
}
