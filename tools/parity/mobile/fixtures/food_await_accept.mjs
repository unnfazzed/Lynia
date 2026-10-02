// RC.await_accept — the order is placed and the kitchen hasn't accepted yet (merchantPhase
// "awaiting_accept"): FoodOrderAwaitingAcceptView renders the "waiting on the kitchen" tracker with
// the accept-countdown. riderId null → no live tracker read; a single GET /restaurants/orders/:id
// feeds it and GET /restaurants/:id/menu resolves the header name. acceptDeadlineAt is a fresh future
// stamp so the countdown shows time remaining, not an elapsed/expired state.
import { installRouter, setParams } from "./_harness.mjs";
import { MENU, OID, foodOrder, withOrder, orderSnapshot } from "./_food.mjs";

// D-59: the restaurant order renders on the one order screen, app/order/[id].tsx.
setParams({ id: OID });

installRouter([
  {
    match: /^\/restaurants\/orders\//,
    json: foodOrder({
      status: "pending",
      merchantPhase: "awaiting_accept",
      paymentMethod: "cash",
      riderId: null,
      acceptDeadlineAt: new Date(Date.now() + 90_000).toISOString(),
      prepStartedAt: null,
      readyAt: null,
    }),
  },
  { match: /^\/restaurants\/[^/]+\/menu$/, json: MENU },
  { match: /^\/orders\/[^/]+$/, json: orderSnapshot({ status: "requested", rider: null, events: [], counterpartyPhone: null }) },
]);

export default { wrap: withOrder() };
