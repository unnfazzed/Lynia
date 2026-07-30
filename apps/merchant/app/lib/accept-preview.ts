import { roundToCents, type MerchantOrderItemView } from "@lynia/shared";

export interface AcceptPreview {
  /** The recomputed total with every item in `unavailableDishIds` excluded. */
  total: number;
  /** The order's full total, every item kept — used for the "down from $X" recap copy. */
  fullTotal: number;
  hasUnavailable: boolean;
}

/** D-23: a live, client-side recap while the merchant toggles "don't have it" on lines in the NEW
 *  ORDER takeover — mirrors the gallery's "Down from $13.00 — you marked the muriwo unavailable."
 *  This is a preview only; the server recomputes authoritatively at accept time (D-35, price never
 *  set by the client). */
export function computeAcceptPreview(
  items: readonly MerchantOrderItemView[],
  unavailableDishIds: ReadonlySet<string>,
): AcceptPreview {
  let total = 0;
  let fullTotal = 0;
  for (const item of items) {
    const lineTotal = roundToCents(item.priceUsd * item.quantity);
    fullTotal = roundToCents(fullTotal + lineTotal);
    if (!item.dishId || !unavailableDishIds.has(item.dishId)) {
      total = roundToCents(total + lineTotal);
    }
  }
  return { total, fullTotal, hasUnavailable: unavailableDishIds.size > 0 };
}
