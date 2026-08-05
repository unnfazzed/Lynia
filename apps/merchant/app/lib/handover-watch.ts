"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MerchantOrderResponse } from "@lynia/shared";
import { isRiderSecured } from "./order-groups";
import { getOrder } from "./orders-api";

/**
 * M3·3 `pickup_done` (r-merchant.jsx:722-735) — the hand-over confirmation.
 *
 * The kitchen tablet is never the actor here: the hand-over is the RIDER entering the pickup code
 * (`POST /merchant/orders/:id/confirm-pickup`, N-16, rider-authenticated), which flips the order to
 * `picked_up`. `listQueue` excludes every post-handoff status, so on the merchant's board the moment
 * arrives as a disappearance, not an event.
 *
 * A disappearance alone is NOT proof of a hand-over — an order can equally leave the queue by being
 * cancelled. So this never renders off the inference: when a rider-secured order drops out of the
 * queue it re-reads that one order (`GET /merchant/orders/:id`, which has no status filter) and only
 * shows the confirmation if the server says it really did reach a post-pickup status. A cancelled or
 * unreadable order shows nothing at all.
 */

/** Statuses that can only be reached by the rider having collected the food (enums.ts OrderStatus).
 *  `undelivered`/`delivered` are included because a slow tablet can miss the `picked_up` window
 *  entirely on a short hop. */
const HANDED_OVER_STATUSES = new Set(["picked_up", "en_route_dropoff", "delivered", "completed", "undelivered"]);

export const HANDOVER_CONFIRM_MS = 5_000;

export function useHandoverWatch(orders: readonly MerchantOrderResponse[], enabled: boolean) {
  const [handedOver, setHandedOver] = useState<MerchantOrderResponse | null>(null);
  // Snapshots of the orders that were sitting rider-secured on the last render — the only ones whose
  // disappearance is worth checking. Seeded on the first pass so a tablet that mounts mid-shift
  // doesn't announce hand-overs for orders it never actually watched leave.
  const watchedRef = useRef<Map<string, MerchantOrderResponse> | null>(null);
  const checkingRef = useRef<Set<string>>(new Set());

  const dismiss = useCallback(() => setHandedOver(null), []);

  useEffect(() => {
    // Drop the watch list while suppressed rather than freezing it: otherwise a hand-over that happens
    // behind a NEW ORDER takeover would surface minutes later, out of context, as a stale
    // confirmation. Re-seeds on the next pass once the takeover clears.
    if (!enabled) {
      watchedRef.current = null;
      return;
    }
    const current = new Map<string, MerchantOrderResponse>();
    for (const o of orders) if (isRiderSecured(o)) current.set(o.id, o);

    const previous = watchedRef.current;
    watchedRef.current = current;
    if (!previous) return;

    const present = new Set(orders.map((o) => o.id));
    for (const [id] of previous) {
      if (present.has(id) || checkingRef.current.has(id)) continue;
      checkingRef.current.add(id);
      getOrder(id)
        .then((fresh) => {
          if (HANDED_OVER_STATUSES.has(fresh.status)) setHandedOver(fresh);
        })
        .catch(() => {
          // Couldn't verify — say nothing. A missed confirmation costs the merchant a screen they
          // don't strictly need; a wrong one tells them food left that may in fact have been cancelled.
        })
        .finally(() => checkingRef.current.delete(id));
    }
  }, [orders, enabled]);

  // Auto-return to the board — the kit's own "Back to orders in 5s".
  useEffect(() => {
    if (!handedOver) return undefined;
    const timer = setTimeout(() => setHandedOver(null), HANDOVER_CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [handedOver]);

  return { handedOver, dismiss };
}
