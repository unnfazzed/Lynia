// RC.track_prep (R6·2 pre-rider) — the kitchen has accepted and the order is in its prep countdown
// (merchantPhase "preparing"): FoodOrderPreparingView draws the prep ring + "accepted your order" +
// the finding-a-rider line. Driven by GET /restaurants/orders/:id alone (riderId null → no live
// tracker read yet). prepStartedAt is recent and prepMinutes 20 so the ring shows time remaining.
import { installRouter, setParams } from "./_harness.mjs";
import { MENU, OID, foodOrder, withOrder, orderSnapshot } from "./_food.mjs";

// D-59: the restaurant order renders on the one order screen, app/order/[id].tsx.
setParams({ id: OID });

installRouter([
  {
    match: /^\/restaurants\/orders\//,
    json: foodOrder({
      status: "confirmed",
      merchantPhase: "preparing",
      paymentMethod: "cash",
      riderId: null,
      prepMinutes: 20,
      prepStartedAt: new Date(Date.now() - 180_000).toISOString(),
      readyAt: null,
    }),
  },
  { match: /^\/restaurants\/[^/]+\/menu$/, json: MENU },
  { match: /^\/orders\/[^/]+$/, json: orderSnapshot({ status: "requested", rider: null, events: [], counterpartyPhone: null }) },
]);

export default { wrap: withOrder() };
