import { WS_EVENTS, type OffersChangedEvent } from "@lynia/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { Socket } from "socket.io-client";
import type { OrderSnapshot } from "../api/orders";
import { useAuth } from "../auth/auth-context";
import { offersKey, orderKey } from "../query/client";
import { createSocket } from "./socket";

/**
 * Live tracking (ET4). Joins the order room, applies "position" pushes to the React Query cache, and
 * refetches the REST snapshot on connect / status change / connect error — the snapshot stays the
 * source of truth, and a dropped WS self-heals via that refetch (the screen also polls during active
 * statuses). Keyed on the access token, so it reconnects only when the token actually rotates.
 *
 * Exposes `connected` so the tracker can render a "reconnecting" affordance (the map fades a stale
 * rider position instead of dropping it). Refetches never blank the cache — React Query v5 keeps the
 * previous data while a refetch is in flight, so invalidating (not `setQueryData(undefined)`) means the
 * map doesn't flash when the socket reconnects.
 */
export function useOrderSocket(orderId: string | null): { connected: boolean } {
  const { session } = useAuth();
  const token = session?.accessToken;
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!orderId || !token) return;
    const socket: Socket = createSocket(token);
    // Background refetch — keeps previous data on screen (no flash) while the snapshot re-loads.
    const refetchOrder = (): void => void qc.invalidateQueries({ queryKey: orderKey(orderId) });
    const refetchOffers = (): void => void qc.invalidateQueries({ queryKey: offersKey(orderId) });

    socket.on("connect", () => {
      socket.emit(WS_EVENTS.subscribeOrder, { orderId });
      setConnected(true);
      refetchOrder();
    });

    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", () => {
      setConnected(false);
      refetchOrder(); // self-heal a missed push without clearing the cache
    });

    socket.on(WS_EVENTS.orderStatus, refetchOrder); // invalidate is authoritative — no optimistic write needed

    // New live-auction signal: the offer set changed. Payload is signal-only; refetch the offer list.
    socket.on(WS_EVENTS.offersChanged, (e: OffersChangedEvent) => {
      if (!e || e.orderId === orderId) refetchOffers();
    });

    socket.on(WS_EVENTS.position, (p: { lat: number; lng: number; at: string }) => {
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

  return { connected };
}
