// RC.delivered_rate — the terminal delivered state with the rating card: hand-off complete, the
// customer is asked to rate. Reads: GET /restaurants/orders/:id (status "delivered", a rider was
// secured so riderId is set) and GET /orders/:id (the generic snapshot whose `delivered` event stamps
// the "Delivered at HH:MM" line). CASH payment so the summary reads "paid in cash"; status is
// "delivered" (not "completed") so the RatingCard shows rather than the post-rating summary.
import { installRouter, setParams } from "./_harness.mjs";
import { MENU, OID, foodOrder, orderSnapshot , withOrder } from "./_food.mjs";

setParams({ orderId: OID });

const deliveredAt = new Date(Date.now() - 90_000).toISOString();

installRouter([
  {
    match: /^\/restaurants\/orders\//,
    json: foodOrder({ status: "delivered", merchantPhase: null, paymentMethod: "cash" }),
  },
  { match: /^\/restaurants\/[^/]+\/menu$/, json: MENU },
  {
    match: /^\/orders\/[^/]+$/,
    json: orderSnapshot({
      status: "delivered",
      events: [
        { status: "assigned", createdAt: new Date(Date.now() - 1_500_000).toISOString() },
        { status: "picked_up", createdAt: new Date(Date.now() - 420_000).toISOString() },
        { status: "en_route_dropoff", createdAt: new Date(Date.now() - 180_000).toISOString() },
        { status: "delivered", createdAt: deliveredAt },
      ],
    }),
  },
]);

export default { wrap: withOrder() };
