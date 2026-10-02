// RC.item_removed (R5·b3) — the kitchen is out of ONE line item and asks the customer to approve the
// shorter order or cancel within the item-approval window (merchantPhase "awaiting_item_approval").
// FoodOrderItemApprovalView struck-lists the unavailable line (available:false), keeps the rest, and
// re-totals — driven by GET /restaurants/orders/:id alone (riderId null). itemApprovalDeadlineAt is a
// fresh future stamp so the "answer within m:ss" countdown shows time remaining.
import { installRouter, setParams } from "./_harness.mjs";
import { MENU, OID, DISHES, foodOrder, withOrder, orderSnapshot } from "./_food.mjs";

// D-59: the restaurant order renders on the one order screen, app/order/[id].tsx.
setParams({ id: OID });

installRouter([
  {
    match: /^\/restaurants\/orders\//,
    json: foodOrder({
      status: "confirmed",
      merchantPhase: "awaiting_item_approval",
      paymentMethod: "wallet",
      riderId: null,
      itemApprovalDeadlineAt: new Date(Date.now() + 52_000).toISOString(),
      items: [
        { dishId: DISHES.sadza.id, name: DISHES.sadza.name, priceUsd: DISHES.sadza.priceUsd, quantity: 2, note: null, available: true },
        { dishId: DISHES.chicken.id, name: DISHES.chicken.name, priceUsd: DISHES.chicken.priceUsd, quantity: 1, note: null, available: true },
        { dishId: DISHES.greens.id, name: DISHES.greens.name, priceUsd: DISHES.greens.priceUsd, quantity: 1, note: null, available: false },
      ],
    }),
  },
  { match: /^\/restaurants\/[^/]+\/menu$/, json: MENU },
  { match: /^\/orders\/[^/]+$/, json: orderSnapshot({ status: "requested", rider: null, events: [], counterpartyPhone: null }) },
]);

export default { wrap: withOrder() };
