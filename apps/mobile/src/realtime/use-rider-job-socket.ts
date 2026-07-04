import { JobCancelledEvent, WS_EVENTS } from "@lynia/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import type { Socket } from "socket.io-client";
import { useAuth } from "../auth/auth-context";
import { createSocket } from "./socket";

/**
 * The rider's inbound socket for their active job (INTERFACE-AUDIT C3). Joins the order room and
 * listens for `job:cancelled` — the customer cancelled — plus `order:status` for any other server
 * transition. `order:status` just invalidates the active-job query (self-heal, same discipline as the
 * customer's use-order-socket); `job:cancelled` is terminal, so it's surfaced through `onCancelled`
 * where the job screen can freeze a hand-back terminal from the last-known snapshot (the order drops
 * out of `/orders/mine/active` the moment it's cancelled, so we can't refetch it back).
 */
export function useRiderJobSocket(orderId: string | null, onCancelled: (e: JobCancelledEvent) => void): void {
  const { session } = useAuth();
  const token = session?.accessToken;
  const qc = useQueryClient();
  // Hold the latest callback in a ref so re-subscribing isn't tied to its identity.
  const cbRef = useRef(onCancelled);
  cbRef.current = onCancelled;

  useEffect(() => {
    if (!orderId || !token) return;
    const socket: Socket = createSocket(token);

    socket.on("connect", () => {
      socket.emit(WS_EVENTS.subscribeOrder, { orderId });
    });
    socket.on(WS_EVENTS.orderStatus, () => void qc.invalidateQueries({ queryKey: ["activeJob"] }));
    socket.on(WS_EVENTS.jobCancelled, (raw: unknown) => {
      const parsed = JobCancelledEvent.safeParse(raw);
      if (!parsed.success || parsed.data.orderId !== orderId) return;
      cbRef.current(parsed.data);
    });

    return () => {
      socket.disconnect();
    };
  }, [orderId, token, qc]);
}
