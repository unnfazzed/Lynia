import { BoardNewOrderEvent, WS_EVENTS } from "@lynia/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { Socket } from "socket.io-client";
import type { OpenOrder } from "../api/orders";
import { useAuth } from "../auth/auth-context";
import { createSocket } from "./socket";

/**
 * While the rider is online, hold a board socket so a newly-broadcast order appears the instant it
 * opens (WS push) instead of waiting on the poll. The pushed order is the redacted `BoardNewOrderEvent`
 * (point + landmark, no phone) and is merged straight into the ["openOrders"] cache — deduped by id —
 * so the list updates with no refetch. Joins the board on connect, leaves it on go-offline / unmount.
 * Returns connection state for the online chip.
 */
export function useRiderBoard(online: boolean): { connected: boolean } {
  const { session } = useAuth();
  const token = session?.accessToken;
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!online || !token) {
      setConnected(false);
      return;
    }
    const socket: Socket = createSocket(token);

    socket.on("connect", () => {
      setConnected(true);
      socket.emit(WS_EVENTS.boardSubscribe);
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", () => setConnected(false));

    socket.on(WS_EVENTS.boardNewOrder, (raw: unknown) => {
      const parsed = BoardNewOrderEvent.safeParse(raw);
      if (!parsed.success) return;
      const order = parsed.data as OpenOrder;
      // Merge into the same ["openOrders"] cache the REST fetch fills. Note: this live push is still
      // global (city-wide), whereas the REST fetch is now geo-scoped to nearby orders — the rider
      // screen's haversine sort reconciles the two visually (nearest first). No change needed here.
      qc.setQueryData<OpenOrder[]>(["openOrders"], (prev) => {
        if (!prev) return [order];
        if (prev.some((o) => o.id === order.id)) return prev; // dedupe: poll may have it already
        return [order, ...prev];
      });
    });

    return () => {
      socket.emit(WS_EVENTS.boardLeave);
      socket.disconnect();
    };
  }, [online, token, qc]);

  return { connected };
}
