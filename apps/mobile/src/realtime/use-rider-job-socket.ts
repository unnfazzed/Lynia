import { JobCancelledEvent, PresenceRecoveredEvent, PresenceStaleEvent, WS_EVENTS } from "@lynia/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { useAuth } from "../auth/auth-context";
import { invalidateRiderJobQueries } from "../query/use-history-feed";
import { acquireSocket, releaseSocket } from "./socket";

/**
 * The rider's inbound socket for their active job (INTERFACE-AUDIT C3 / C5). Joins the order room and
 * listens for `job:cancelled` — the customer cancelled — plus `order:status` for any other server
 * transition, and `presence:stale` role:"customer" — the customer's app went dark (C5 mirror).
 * `order:status` just invalidates the active-job query (self-heal, same discipline as the customer's
 * use-order-socket); `job:cancelled` is terminal, so it's surfaced through `onCancelled` where the job
 * screen can freeze a hand-back terminal from the last-known snapshot (the order drops out of
 * `/orders/mine/active` the moment it's cancelled, so we can't refetch it back). `onCustomerStale`
 * fires when the customer's socket has been dark past the escalation threshold, so the rider UI can
 * warn that the customer may not be seeing live updates. BH-08: `onCustomerRecovered` fires on the
 * matching `presence:recovered` role:"customer" — the customer resubscribed after being escalated —
 * so the rider UI can clear that warning immediately instead of waiting for the order's next status
 * change (which, mid-delivery, can be a long time coming).
 */
export function useRiderJobSocket(
  orderId: string | null,
  onCancelled: (e: JobCancelledEvent) => void,
  onCustomerStale?: () => void,
  onCustomerRecovered?: () => void,
): { connected: boolean } {
  const { session } = useAuth();
  const token = session?.accessToken;
  const qc = useQueryClient();
  // Expose connection state so the job screen can show the "live paused" banner (4·b4) when the
  // socket drops mid-job — the job stays saved locally and syncs on reconnect.
  const [connected, setConnected] = useState(false);
  // Hold the latest callbacks in refs so re-subscribing isn't tied to their identity.
  const cbRef = useRef(onCancelled);
  cbRef.current = onCancelled;
  const staleRef = useRef(onCustomerStale);
  staleRef.current = onCustomerStale;
  const recoveredRef = useRef(onCustomerRecovered);
  recoveredRef.current = onCustomerRecovered;

  useEffect(() => {
    if (!orderId || !token) {
      setConnected(false);
      return;
    }
    // A-O17: shared with the board/location sockets during an active job — see use-rider-board.ts's
    // matching comment. Every listener is a named handler explicitly `.off()`'d in cleanup, and the
    // shared connection is released (not disconnected outright), since board/location may still be
    // holding it.
    const socket: Socket = acquireSocket(token);
    // Background refetch — self-heals a push missed while the socket was down (same discipline as
    // use-order-socket's refetchOrder on connect/connect_error). WD-022: a delivered/cancelled/
    // undelivered transition self-healed here (rather than through the mutation's own onSuccess) must
    // also refresh Trip History/Earnings, which read the same terminal statuses.
    const refetchJob = (): void => invalidateRiderJobQueries(qc);

    const onConnect = () => {
      setConnected(true);
      socket.emit(WS_EVENTS.subscribeOrder, { orderId });
      refetchJob();
    };
    const onDisconnect = () => setConnected(false);
    const onConnectError = () => {
      setConnected(false);
      refetchJob();
    };
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);
    socket.on(WS_EVENTS.orderStatus, refetchJob);
    const onJobCancelled = (raw: unknown) => {
      const parsed = JobCancelledEvent.safeParse(raw);
      if (!parsed.success || parsed.data.orderId !== orderId) return;
      cbRef.current(parsed.data);
    };
    socket.on(WS_EVENTS.jobCancelled, onJobCancelled);
    // C5: the rider is the RECEIVER of role:"customer" (the customer went dark). Ignore role:"rider"
    // here — that's the rider's OWN staleness, meant for the customer's app, not a self-escalation.
    const onPresenceStale = (raw: unknown) => {
      const parsed = PresenceStaleEvent.safeParse(raw);
      if (!parsed.success || parsed.data.orderId !== orderId || parsed.data.role !== "customer") return;
      staleRef.current?.();
    };
    socket.on(WS_EVENTS.presenceStale, onPresenceStale);
    const onPresenceRecovered = (raw: unknown) => {
      const parsed = PresenceRecoveredEvent.safeParse(raw);
      if (!parsed.success || parsed.data.orderId !== orderId || parsed.data.role !== "customer") return;
      recoveredRef.current?.();
    };
    socket.on(WS_EVENTS.presenceRecovered, onPresenceRecovered);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      socket.off(WS_EVENTS.orderStatus, refetchJob);
      socket.off(WS_EVENTS.jobCancelled, onJobCancelled);
      socket.off(WS_EVENTS.presenceStale, onPresenceStale);
      socket.off(WS_EVENTS.presenceRecovered, onPresenceRecovered);
      releaseSocket(token, socket);
    };
  }, [orderId, token, qc]);

  return { connected };
}
