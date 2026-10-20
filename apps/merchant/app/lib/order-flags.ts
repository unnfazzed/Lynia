"use client";

import { useEffect, useState } from "react";
import type { OrderFlagsResponse } from "@lynia/shared";
import { getOrderFlags } from "./orders-api";

/**
 * The server's switches on `/app/order-flags`, read once per page load:
 * - `rxEnabled` (Order flow v2, BRIEF §13, ledger D-59): prescriptions are behind a server flag, on by default
 *   since D-76 (its kill switch can turn it off). Every Rx control (the dish's "Prescription needed", the team's
 *   pharmacist switch) renders only once the server says it is on — fail-safe off, so a failed read hides them.
 */
let cached: Promise<OrderFlagsResponse | null> | null = null;

function orderFlags(): Promise<OrderFlagsResponse | null> {
  cached ??= getOrderFlags().catch(() => {
    cached = null;
    return null;
  });
  return cached;
}

function useOrderFlag(pick: (f: OrderFlagsResponse) => boolean, enabled: boolean): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void orderFlags().then((f) => {
      if (alive) setOn(f ? pick(f) : false);
    });
    return () => {
      alive = false;
    };
  }, [enabled, pick]);
  return on;
}

const rx = (f: OrderFlagsResponse) => f.rxEnabled === true;

export function useRxEnabled(enabled = true): boolean {
  return useOrderFlag(rx, enabled);
}

/** Tests: forget the page-load read. */
export function resetOrderFlagsCache(): void {
  cached = null;
}
