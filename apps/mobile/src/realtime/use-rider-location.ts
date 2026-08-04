import { WS_EVENTS } from "@lynia/shared";
import * as Location from "expo-location";
import { useEffect, useState } from "react";
import type { Socket } from "socket.io-client";
import { useAuth } from "../auth/auth-context";
// This top-level import is ALSO load-bearing for its side effect: background-location-task.ts calls
// TaskManager.defineTask at module scope (Expo requires the definition outside any React lifecycle),
// and importing it here — from a module the job screen pulls in — guarantees the task is defined at
// bundle load, before Android could ever deliver a background fix to it.
import {
  setBackgroundFixForwarder,
  startRiderBackgroundUpdates,
  stopRiderBackgroundUpdates,
} from "./background-location-task";
import { type Fix, PendingFix } from "./location-buffer";
import { acquireSocket, releaseSocket } from "./socket";

/**
 * While the rider has an active job, stream GPS to the order room (ET4) so the customer's tracker
 * updates live. Emitting `rider:location` also refreshes the rider's heartbeat server-side.
 *
 * On a flaky link the socket drops in and out. Rather than let Socket.IO's default buffer flood every
 * stale fix collected during a dead-zone the moment it reconnects, we coalesce: while disconnected we
 * hold only the FRESHEST fix (PendingFix) and flush that one on reconnect — the customer's map wants
 * where the rider is now, not the breadcrumb trail. This also refreshes the server heartbeat the instant
 * the link returns, so the rider doesn't read as "gone dark" a beat longer than the outage itself.
 *
 * The foreground `watchPositionAsync` stream is the primary path, but it silently pauses whenever the
 * app is backgrounded — and the job screen's "Follow route in Google Maps" hand-off backgrounds the app
 * for most of the trip. So alongside it we start the background location task (an Android foreground
 * service; see background-location-task.ts), strictly scoped to the same active-job window: it starts
 * when this effect opens the stream and is stopped in the same cleanup that closes it, so streaming is
 * provably off outside assigned→delivered. Best-effort by design — if it can't start (iOS without
 * "always" permission, which we deliberately never request; Expo Go; OEM quirks) we degrade silently to
 * today's foreground-only behaviour, never crash or block the job flow.
 *
 * Returns `permissionDenied` — this is a DIFFERENT check from the "go online" gate's location
 * permission check (rider/index.tsx): permission can be granted when a rider goes online and then
 * revoked (Android "only this time", or toggled off in Settings) before/during a job, which this
 * effect used to swallow with a bare `return` — no GPS streamed for the rest of the delivery, no
 * error, no signal to the job screen. The caller decides how to surface it (JOURNEY-BUGS).
 */
export function useRiderLocationStream(orderId: string | null): { permissionDenied: boolean } {
  const { session } = useAuth();
  const token = session?.accessToken;
  const [permissionDenied, setPermissionDenied] = useState(false);

  useEffect(() => {
    setPermissionDenied(false);
    if (!orderId || !token) return;
    let socket: Socket | null = null;
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    let connected = false;
    const buffered = new PendingFix();
    // A-O17: shared with the board/job sockets during an active job (see use-rider-board.ts's
    // matching comment) — acquired/released, not created/disconnected outright. Named so cleanup
    // can `.off()` precisely instead of a blind `disconnect()`, which would kill the connection out
    // from under whichever of the other two hooks is still using it.
    const onConnect = () => {
      connected = true;
      // Push the last-known position immediately so the tracker (and the heartbeat) catch up the
      // moment we reconnect, instead of waiting for the next GPS fix up to timeInterval away.
      const pending = buffered.take();
      if (pending) socket?.emit(WS_EVENTS.riderLocation, pending);
    };
    const onDisconnect = () => {
      connected = false;
    };

    void (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (status !== "granted") {
        setPermissionDenied(true);
        return;
      }
      socket = acquireSocket(token);
      socket.on("connect", onConnect);
      socket.on("disconnect", onDisconnect);
      const send = (fix: Fix): void => {
        // Connected: emit live. Disconnected: hold only the freshest fix (don't emit, or Socket.IO
        // would queue the whole stale trail) and let the reconnect handler flush it.
        if (connected) socket?.emit(WS_EVENTS.riderLocation, fix);
        else buffered.hold(fix);
      };
      // The background task's callback runs headless (no React context), so it can't reach this
      // effect's socket/buffer on its own — hand it the same `send` path through the module-level
      // bridge. Register the bridge BEFORE starting updates so no early fix lands unforwarded, and
      // note the process stays alive under the Android foreground service, so this closure (and the
      // socket in it) survives backgrounding.
      setBackgroundFixForwarder(({ lat, lng }) => send({ orderId, lat, lng }));
      void startRiderBackgroundUpdates();
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 25, timeInterval: 10_000 },
        (loc) => send({ orderId, lat: loc.coords.latitude, lng: loc.coords.longitude }),
      );
      // Unmounted / orderId cleared during the first-fix await — cleanup already ran and won't see this
      // subscription, so remove it here or it leaks and keeps emitting after teardown.
      if (cancelled) {
        sub.remove();
        return;
      }
    })();

    return () => {
      cancelled = true;
      sub?.remove();
      // The caller nulls orderId the moment the job leaves the active window, so this cleanup IS the
      // privacy gate for the background task too. Unhook the bridge first — the native stop is async,
      // and a straggler task invocation racing it must be dropped, not misdelivered — then stop the
      // updates (internally guarded by hasStartedLocationUpdatesAsync and safe against a concurrent
      // restart for a new job; see background-location-task.ts).
      setBackgroundFixForwarder(null);
      void stopRiderBackgroundUpdates();
      if (socket) {
        socket.off("connect", onConnect);
        socket.off("disconnect", onDisconnect);
        releaseSocket(token, socket);
      }
    };
  }, [orderId, token]);

  return { permissionDenied };
}
