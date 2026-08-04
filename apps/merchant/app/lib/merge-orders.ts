import type { MerchantOrderResponse } from "@lynia/shared";

/**
 * B-O17: `useQueuePoll` fetches a fresh, independently-deserialized `MerchantOrderResponse[]`
 * every 5s poll tick — every order object is a brand-new reference even when its content is byte-
 * for-byte identical to the previous poll. That defeats a `React.memo` boundary on `OrderCard`
 * before it can help: a shallow-prop comparison sees a "changed" `order` prop every single tick
 * regardless of whether anything actually changed. TanStack Query's structural sharing solves this
 * automatically elsewhere in this codebase; this hand-rolled poll hook needs the same trick
 * hand-rolled: reuse the previous order's object reference whenever the new order's content is
 * unchanged, so an untouched order's `order` prop stays referentially stable across a poll and
 * `OrderCard`'s memo boundary can actually skip re-rendering it.
 */
export function mergeOrders(prev: MerchantOrderResponse[], next: MerchantOrderResponse[]): MerchantOrderResponse[] {
  const prevById = new Map(prev.map((o) => [o.id, o]));
  return next.map((order) => {
    const prevOrder = prevById.get(order.id);
    if (prevOrder && JSON.stringify(prevOrder) === JSON.stringify(order)) return prevOrder;
    return order;
  });
}
