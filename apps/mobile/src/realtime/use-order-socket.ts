import type { OrderStatus } from "@lynia/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { io, type Socket } from "socket.io-client";
import type { OrderSnapshot } from "../api/orders";
import { useAuth } from "../auth/auth-context";
import { WS_URL } from "../config";
import { orderKey } from "../query/client";

/**
 * Live tracking (ET4). Joins the order room, applies "position"/"order:status" pushes to the React
 * Query cache, and refetches the REST snapshot on (re)connect — the snapshot stays the source of truth.
 */
export function useOrderSocket(orderId: string | null): void {
  const { session } = useAuth();
  const qc = useQueryClient();

  useEffect(() => {
    if (!orderId || !session) return;
    const socket: Socket = io(WS_URL, {
      auth: { token: session.accessToken },
      transports: ["websocket"],
    });

    socket.on("connect", () => {
      socket.emit("subscribe:order", { orderId });
      void qc.invalidateQueries({ queryKey: orderKey(orderId) });
    });

    socket.on("order:status", (p: { orderId: string; status: OrderStatus }) => {
      qc.setQueryData<OrderSnapshot>(orderKey(orderId), (prev) => (prev ? { ...prev, status: p.status } : prev));
      void qc.invalidateQueries({ queryKey: orderKey(orderId) });
    });

    socket.on("position", (p: { lat: number; lng: number; at: string }) => {
      qc.setQueryData<OrderSnapshot>(orderKey(orderId), (prev) =>
        prev && prev.rider ? { ...prev, rider: { ...prev.rider, currentLat: p.lat, currentLng: p.lng, updatedAt: p.at } } : prev,
      );
    });

    return () => {
      socket.disconnect();
    };
  }, [orderId, session, qc]);
}
