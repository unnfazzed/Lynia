import type { MerchantOrderResponse } from "@lynia/shared";
import { useQueries, useQuery, type QueryClient } from "@tanstack/react-query";
import { getFoodOrder } from "../api/food-orders";

export const foodOrderKey = (orderId: string): readonly ["food-order", string] => ["food-order", orderId];

// No WebSocket backs any pre-dispatch food-order phase (C2 ships poll-only — see D2's PR body open
// item), so every waiting/confirming/paying screen refetches on a plain interval. R-17 killed every
// payment clock, so there's no deadline to race once a merchant has accepted and is awaiting
// payment — poll gently there. The two phases with a real server deadline (N-03's 3:00 accept
// window, N-18's 60s item-approval window) poll tightly enough that the UI notices an auto-cancel
// within a few seconds of it happening, not a stale half-minute later.
const TIGHT_POLL_MS = 4_000;
const RELAXED_POLL_MS = 15_000;

function pollIntervalFor(order: MerchantOrderResponse | undefined): number | false {
  if (!order) return TIGHT_POLL_MS;
  if (order.status === "cancelled") return false; // terminal — nothing left to observe
  if (order.merchantPhase === "awaiting_accept" || order.merchantPhase === "awaiting_item_approval") return TIGHT_POLL_MS;
  // Order flow v2 (BRIEF §8): a mid-prep substitution round has a 3-minute answer window too.
  if (order.substitution?.status === "open") return TIGHT_POLL_MS;
  if (order.merchantPhase === "awaiting_payment") return RELAXED_POLL_MS;
  // preparing / ready_for_pickup / null (handed off to C3 dispatch): D3's job from here — stop
  // tightening the poll, a relaxed cadence is enough to notice the hand-off.
  return RELAXED_POLL_MS;
}

export interface FoodOrderFeed {
  order: MerchantOrderResponse | undefined;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  refetch: () => void;
}

/** D2 (checkout + kitchen-confirms): the customer's live view of a placed food order, polling at a
 *  cadence that tightens around the two server-enforced deadlines (N-03/N-18) and relaxes once
 *  there's nothing left to race (R-17 — no payment clock). */
export function useFoodOrder(orderId: string | undefined, enabled: boolean): FoodOrderFeed {
  const q = useQuery({
    queryKey: foodOrderKey(orderId ?? ""),
    queryFn: () => getFoodOrder(orderId as string),
    enabled: enabled && !!orderId,
    refetchInterval: (query) => pollIntervalFor(query.state.data),
  });
  return { order: q.data, isLoading: q.isLoading, isFetching: q.isFetching, isError: q.isError, refetch: () => void q.refetch() };
}

const PEEK_POLL_MS = 30_000;

/**
 * Order flow v2 G1/G2 (ledger D-59): the food reads behind Home's live bar and the Orders tab's Now cards
 * — the venue's service, the schedule, the prescription and an open substitution round live on the food
 * order, not on the generic active-orders snapshot. Same cache entry as the order screen; polled gently,
 * and only while the list is on screen.
 */
export function useFoodOrdersPeek(orderIds: readonly string[], focused: boolean): Record<string, MerchantOrderResponse | undefined> {
  const qs = useQueries({
    queries: orderIds.map((id) => ({
      queryKey: foodOrderKey(id),
      queryFn: () => getFoodOrder(id),
      refetchInterval: focused ? PEEK_POLL_MS : (false as const),
    })),
  });
  const out: Record<string, MerchantOrderResponse | undefined> = {};
  orderIds.forEach((id, i) => {
    out[id] = qs[i]?.data;
  });
  return out;
}

/** Seed the query cache with a just-created order (from `placeOrder`'s response) so the order
 *  screen paints instantly instead of a loading skeleton on first mount. */
export function seedFoodOrder(queryClient: QueryClient, order: MerchantOrderResponse): void {
  queryClient.setQueryData(foodOrderKey(order.id), order);
}
