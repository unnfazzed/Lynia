import * as Location from "expo-location";
import { useEffect } from "react";
import { io, type Socket } from "socket.io-client";
import { useAuth } from "../auth/auth-context";
import { WS_URL } from "../config";

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
      socket = io(WS_URL, { auth: { token }, transports: ["websocket"] });
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 25, timeInterval: 10_000 },
        (loc) => {
          socket?.emit("rider:location", { orderId, lat: loc.coords.latitude, lng: loc.coords.longitude });
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
