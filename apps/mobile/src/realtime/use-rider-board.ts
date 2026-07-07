import { BidExpiredEvent, BoardNewOrderEvent, OrderTakenEvent, WS_EVENTS } from "@lynia/shared";
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
export function useRiderBoard(
  online: boolean,
  loc: { lat: number; lng: number } | null,
): { connected: boolean; expiredOrderIds: Set<string>; takenOrderIds: Set<string> } {
  const { session } = useAuth();
  const token = session?.accessToken;
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);
  // Orders whose 90s auction closed with NObody picked (INTERFACE-AUDIT C2) — pushed to every bidder.
  // The rider screen uses this to show a distinct "that window closed" state on a sent offer (vs.
  // "not chosen", which means someone else was picked).
  const [expiredOrderIds, setExpiredOrderIds] = useState<Set<string>>(() => new Set());
  // Orders a customer assigned to SOMEONE (rider-journey 2·b1 / 3·b1) — the card leaves the board;
  // a rider who bid on one shows the "not chosen" state (distinct from `expiredOrderIds` above).
  const [takenOrderIds, setTakenOrderIds] = useState<Set<string>>(() => new Set());
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

    // Auction closed with no pick: drop the order from the board cache (it's no longer biddable) and
    // record its id so a rider who bid on it sees the "nobody picked" state, not a silent removal.
    socket.on(WS_EVENTS.bidExpired, (raw: unknown) => {
      const parsed = BidExpiredEvent.safeParse(raw);
      if (!parsed.success) return;
      const { orderId } = parsed.data;
      setExpiredOrderIds((prev) => (prev.has(orderId) ? prev : new Set(prev).add(orderId)));
      qc.setQueryData<OpenOrder[]>(["openOrders"], (prev) => prev?.filter((o) => o.id !== orderId));
    });

    // A customer picked a rider: the card is no longer biddable — drop it from the board, and (for a
    // rider who bid on it) surface "not chosen" instead of a countdown that dead-ends at 0:00 (3·b1).
    // The winning rider ALSO receives this event, so we must NOT flip their sent-offer card to "not
    // chosen": resolve who was picked first by refetching the active job, and only mark the order taken
    // if it did not become OUR active job — otherwise the winner briefly reads "the customer picked
    // another rider" on the very order they just won. Until then the card keeps its neutral countdown.
    socket.on(WS_EVENTS.orderTaken, (raw: unknown) => {
      const parsed = OrderTakenEvent.safeParse(raw);
      if (!parsed.success) return;
      const { orderId } = parsed.data;
      qc.setQueryData<OpenOrder[]>(["openOrders"], (prev) => prev?.filter((o) => o.id !== orderId));
      void qc.invalidateQueries({ queryKey: ["activeJob"] }).then(() => {
        const active = qc.getQueryData<{ id: string } | null>(["activeJob"]);
        if (active?.id === orderId) return; // we won — never mark our own order "not chosen"
        setTakenOrderIds((prev) => (prev.has(orderId) ? prev : new Set(prev).add(orderId)));
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

  return { connected, expiredOrderIds, takenOrderIds };
}
