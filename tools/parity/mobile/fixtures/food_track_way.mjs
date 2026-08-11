// RC.track_way — a food order en route to the door: a rider is secured and the order rides the generic
// assigned→…→en_route_dropoff edges (D3), so the live tracker view renders. Three reads feed it:
//   GET /restaurants/orders/:id  → the MerchantOrderResponse (status en_route_dropoff, riderId set)
//   GET /orders/:id              → the generic OrderSnapshot the LiveTrackingCard draws (map + events)
//   GET /restaurants/:id/menu    → resolves the restaurant name in the header
// WALLET payment (already paid) so there's no cash doorstep handshake; at the door the plain delivery
// code card appears, so POST …/delivery-code/rotate is routed to hand back a code.
import { installRouter, setParams } from "./_harness.mjs";
import { MENU, OID, foodOrder, orderSnapshot , withOrder } from "./_food.mjs";

setParams({ orderId: OID });

installRouter([
  { match: /\/delivery-code\/rotate$/, method: "POST", json: { deliveryCode: "4821" } },
  { match: /^\/restaurants\/orders\//, json: foodOrder({ status: "en_route_dropoff", paymentMethod: "wallet", merchantPhase: null }) },
  { match: /^\/restaurants\/[^/]+\/menu$/, json: MENU },
  { match: /^\/orders\/[^/]+$/, json: orderSnapshot({ status: "en_route_dropoff" }) },
]);

export default { wrap: withOrder() };
