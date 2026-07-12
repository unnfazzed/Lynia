import { WS_EVENTS } from "@lynia/shared";
import * as Location from "expo-location";
import { useEffect, useState } from "react";
import type { Socket } from "socket.io-client";
import { useAuth } from "../auth/auth-context";
import { PendingFix } from "./location-buffer";
import { createSocket } from "./socket";

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

    void (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (status !== "granted") {
        setPermissionDenied(true);
        return;
      }
      socket = createSocket(token);
      socket.on("connect", () => {
        connected = true;
        // Push the last-known position immediately so the tracker (and the heartbeat) catch up the
        // moment we reconnect, instead of waiting for the next GPS fix up to timeInterval away.
        const pending = buffered.take();
        if (pending) socket?.emit(WS_EVENTS.riderLocation, pending);
      });
      socket.on("disconnect", () => {
        connected = false;
      });
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 25, timeInterval: 10_000 },
        (loc) => {
          const fix = { orderId, lat: loc.coords.latitude, lng: loc.coords.longitude };
          // Connected: emit live. Disconnected: hold only the freshest fix (don't emit, or Socket.IO
          // would queue the whole stale trail) and let the reconnect handler flush it.
          if (connected) socket?.emit(WS_EVENTS.riderLocation, fix);
          else buffered.hold(fix);
        },
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
      socket?.disconnect();
    };
  }, [orderId, token]);

  return { permissionDenied };
}
