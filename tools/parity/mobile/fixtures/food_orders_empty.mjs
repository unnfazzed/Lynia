// RC.orders_empty (R0·b1) — the Orders tab with no live order and no history: app/(tabs)/orders.tsx
// paints its "Nothing here yet" EmptyState inside a Card. Both feeds answer empty over a SUCCESSFUL
// fetch: GET /orders/mine/active-orders → [] (no pinned live card) and GET /orders/history → []
// (hasLiveData true with zero earlier rows → the true empty state, not the offline error). The Food
// flag is on (default route) so the "Find food near you" primary shows alongside "Send a parcel".
import { installRouter, withQuery } from "./_harness.mjs";

installRouter([
  { match: /^\/orders\/mine\/active-orders$/, json: [] },
  { match: "/orders/history", json: [] },
]);

export default { wrap: withQuery() };
