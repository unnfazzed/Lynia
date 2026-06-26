import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { io, type Socket } from "socket.io-client";
import type { OrderSnapshot } from "../api/orders";
import { useAuth } from "../auth/auth-context";
import { WS_URL } from "../config";
import { orderKey } from "../query/client";

/**
 * Live tracking (ET4). Joins the order room, applies "position" pushes to the React Query cache, and
 * refetches the REST snapshot on connect / status change / connect error — the snapshot stays the
 * source of truth, and a dropped WS self-heals via that refetch (the screen also polls during active
 * statuses). Keyed on the access token, so it reconnects only when the token actually rotates.
 */
export function useOrderSocket(orderId: string | null): void {
  const { session } = useAuth();
  const token = session?.accessToken;
  const qc = useQueryClient();

  useEffect(() => {
    if (!orderId || !token) return;
    const socket: Socket = io(WS_URL, { auth: { token }, transports: ["websocket"] });
    const refetch = (): void => void qc.invalidateQueries({ queryKey: orderKey(orderId) });

    socket.on("connect", () => {
      socket.emit("subscribe:order", { orderId });
      refetch();
    });
    socket.on("connect_error", refetch);
    socket.on("order:status", refetch); // invalidate is authoritative — no optimistic write needed

    socket.on("position", (p: { lat: number; lng: number; at: string }) => {
      qc.setQueryData<OrderSnapshot>(orderKey(orderId), (prev) => {
        if (!prev) return prev;
        // Don't drop the first fix when the snapshot's rider isn't populated yet.
        const rider = prev.rider ?? { profileId: "", currentLat: null, currentLng: null, updatedAt: null };
        return { ...prev, rider: { ...rider, currentLat: p.lat, currentLng: p.lng, updatedAt: p.at } };
      });
    });

    return () => {
      socket.disconnect();
    };
  }, [orderId, token, qc]);
}
