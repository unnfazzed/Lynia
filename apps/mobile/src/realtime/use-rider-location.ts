import { WS_EVENTS } from "@lynia/shared";
import * as Location from "expo-location";
import { useEffect } from "react";
import type { Socket } from "socket.io-client";
import { useAuth } from "../auth/auth-context";
import { createSocket } from "./socket";

/**
 * While the rider has an active job, stream GPS to the order room (ET4) so the customer's tracker
 * updates live. Emitting `rider:location` also refreshes the rider's heartbeat server-side.
 */
export function useRiderLocationStream(orderId: string | null): void {
  const { session } = useAuth();
  const token = session?.accessToken;

  useEffect(() => {
    if (!orderId || !token) return;
    let socket: Socket | null = null;
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;

    void (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted" || cancelled) return;
      socket = createSocket(token);
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 25, timeInterval: 10_000 },
        (loc) => {
          socket?.emit(WS_EVENTS.riderLocation, { orderId, lat: loc.coords.latitude, lng: loc.coords.longitude });
        },
      );
    })();

    return () => {
      cancelled = true;
      sub?.remove();
      socket?.disconnect();
    };
  }, [orderId, token]);
}
