// RJM.offer_food / RR.offer_cash — the rider's incoming food-dispatch offer, populated with a
// collect-and-return CASH order (the offer_cash variant): "YOU EARN $2.50" + a "COLLECT AT THE DOOR"
// card. GET /merchant/orders/dispatch/offer answers the live FoodOfferEvent; the flag route (default)
// keeps restaurantsEnabled on. expiresAt is ~55s out so the countdown ring reads a live window.
// FoodOfferEvent money fields (merchantGoodsTotal/deliveryFee) are plain NUMBERS.
import { installRouter, withQuery } from "./_harness.mjs";

if (typeof window !== "undefined") window.__PARITY_SETTLE_MS = 900;

const offer = {
  orderId: "0a1b2c3d-0000-4000-8000-00000000fo01",
  merchantId: "0a1b2c3d-0000-4000-8000-00000000mr01",
  pickup: { point: { lat: -17.8009, lng: 31.0389 }, landmark: "Nando's Avondale" },
  dropoff: { point: { lat: -17.7333, lng: 31.0889 }, landmark: "Borrowdale, Ashbrittle Rd" },
  itemDesc: "1× Full chicken, 2× sides",
  merchantGoodsTotal: 13.0,
  deliveryFee: 2.5,
  distanceKm: 6.4,
  expiresAt: new Date(Date.now() + 55_000).toISOString(),
  merchantPaymentMethod: "cash",
  merchantCashRule: "collect_and_return",
};

installRouter([{ match: "/merchant/orders/dispatch/offer", json: { offer } }]);

export default { wrap: withQuery() };
