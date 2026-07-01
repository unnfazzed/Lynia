import { BoardNewOrderEvent, WS_EVENTS } from "@lynia/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import type { OpenOrder } from "../api/orders";
import { useAuth } from "../auth/auth-context";
import { clampGlassSample, enqueue, noteDropped, setActiveRole } from "../telemetry/rum";
import { createSocket } from "./socket";

/**
 * While the rider is online, hold a board socket so a newly-broadcast order appears the instant it
 * opens (WS push) instead of waiting on the poll. The pushed order is the redacted `BoardNewOrderEvent`
 * (point + landmark, no phone) and is merged straight into the ["openOrders"] cache — deduped by id —
 * so the list updates with no refetch. Joins the board on connect, leaves it on go-offline / unmount.
 * Returns connection state for the online chip.
 */
export function useRiderBoard(online: boolean, loc: { lat: number; lng: number } | null): { connected: boolean } {
  const { session } = useAuth();
  const token = session?.accessToken;
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);
  // Hold the live socket + latest loc in refs so the loc-change effect can re-subscribe (re-scope the
  // geo rooms) without tearing down and rebuilding the connection.
  const socketRef = useRef<Socket | null>(null);
  const locRef = useRef(loc);
  locRef.current = loc;

  useEffect(() => {
    if (!online || !token) {
      setConnected(false);
      return;
    }
    setActiveRole("rider"); // rider board surface — label apifetch RUM as rider
    const socket: Socket = createSocket(token);
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      const l = locRef.current;
      socket.emit(WS_EVENTS.boardSubscribe, l ? { lat: l.lat, lng: l.lng } : {});
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", () => setConnected(false));

    socket.on(WS_EVENTS.boardNewOrder, (raw: unknown) => {
      const parsed = BoardNewOrderEvent.safeParse(raw);
      if (!parsed.success) return;
      const order = parsed.data as OpenOrder;
      // RUM: glass-to-glass from the order's server `createdAt` to now (skew-clamped, rider role).
      const ms = clampGlassSample(Date.now(), parsed.data.createdAt);
      if (ms == null) noteDropped();
      else enqueue("board_glass", ms, "rider");
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
      socketRef.current = null;
      socket.emit(WS_EVENTS.boardLeave);
      socket.disconnect();
    };
  }, [online, token, qc]);

  // When the rider's position changes while already connected, re-subscribe with the new loc so the
  // server re-scopes (leaves old geo rooms, joins the new neighbourhood). No socket teardown.
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    socket.emit(WS_EVENTS.boardSubscribe, loc ? { lat: loc.lat, lng: loc.lng } : {});
  }, [loc?.lat, loc?.lng]);

  return { connected };
}
