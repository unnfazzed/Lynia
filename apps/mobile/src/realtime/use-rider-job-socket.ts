import { JobCancelledEvent, PresenceRecoveredEvent, PresenceStaleEvent, WS_EVENTS } from "@lynia/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { useAuth } from "../auth/auth-context";
import { createSocket } from "./socket";

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
    const socket: Socket = createSocket(token);
    // Background refetch — self-heals a push missed while the socket was down (same discipline as
    // use-order-socket's refetchOrder on connect/connect_error).
    const refetchJob = (): void => void qc.invalidateQueries({ queryKey: ["activeJob"] });

    socket.on("connect", () => {
      setConnected(true);
      socket.emit(WS_EVENTS.subscribeOrder, { orderId });
      refetchJob();
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", () => {
      setConnected(false);
      refetchJob();
    });
    socket.on(WS_EVENTS.orderStatus, refetchJob);
    socket.on(WS_EVENTS.jobCancelled, (raw: unknown) => {
      const parsed = JobCancelledEvent.safeParse(raw);
      if (!parsed.success || parsed.data.orderId !== orderId) return;
      cbRef.current(parsed.data);
    });
    // C5: the rider is the RECEIVER of role:"customer" (the customer went dark). Ignore role:"rider"
    // here — that's the rider's OWN staleness, meant for the customer's app, not a self-escalation.
    socket.on(WS_EVENTS.presenceStale, (raw: unknown) => {
      const parsed = PresenceStaleEvent.safeParse(raw);
      if (!parsed.success || parsed.data.orderId !== orderId || parsed.data.role !== "customer") return;
      staleRef.current?.();
    });
    socket.on(WS_EVENTS.presenceRecovered, (raw: unknown) => {
      const parsed = PresenceRecoveredEvent.safeParse(raw);
      if (!parsed.success || parsed.data.orderId !== orderId || parsed.data.role !== "customer") return;
      recoveredRef.current?.();
    });

    return () => {
      socket.disconnect();
    };
  }, [orderId, token, qc]);

  return { connected };
}
