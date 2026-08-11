// RJM.active_food — the rider's active FOOD job, populated. The active order (GET /orders/mine/active)
// is a merchant order at `confirmed` (a clean working state, before the map-first en-route legs), so
// the screen renders its working layout: the cash-held strip, the JobDetailsCard, the order line-items,
// and the "Navigate to the restaurant" advance button. The food detail (GET /merchant/orders/:id/mine)
// carries a collect-and-return CASH order's fields. Snapshot fares are STRINGS; food money is NUMBERS.
import { installRouter } from "./_harness.mjs";
import { withAuthQuery } from "./_auth.mjs";

if (typeof window !== "undefined") window.__PARITY_SETTLE_MS = 1200;

const ORDER_ID = "0a1b2c3d-0000-4000-8000-00000000fj01";

const order = {
  id: ORDER_ID,
  status: "confirmed",
  orderType: "merchant",
  viewerRole: "rider",
  agreedFare: "2.50",
  proposedFare: "2.50",
  pickup: { point: { lat: -17.8009, lng: 31.0389 }, landmark: "Nando's Avondale" },
  dropoff: { point: { lat: -17.7333, lng: 31.0889 }, landmark: "Borrowdale, Ashbrittle Rd" },
  items: [
    { description: "Full chicken", quantity: 1 },
    { description: "Peri chips", quantity: 2 },
  ],
  rider: { profileId: "0a1b2c3d-0000-4000-8000-00000000me01", currentLat: -17.805, currentLng: 31.041, updatedAt: new Date().toISOString() },
  events: [{ status: "assigned", createdAt: new Date(Date.now() - 300_000).toISOString() }],
  counterpartyPhone: null,
  expiresAt: null,
};

const foodOrder = {
  id: ORDER_ID,
  merchantId: "0a1b2c3d-0000-4000-8000-00000000mr01",
  status: "confirmed",
  merchantPhase: null,
  items: [
    { dishId: "0a1b2c3d-0000-4000-8000-00000000d101", name: "Full chicken", priceUsd: 9.0, quantity: 1, note: null, available: true },
    { dishId: "0a1b2c3d-0000-4000-8000-00000000d102", name: "Peri chips", priceUsd: 2.0, quantity: 2, note: null, available: true },
  ],
  note: null,
  paymentMethod: "cash",
  merchantPaymentPhone: null,
  merchantGoodsTotal: 13.0,
  deliveryFee: 2.5,
  total: 15.5,
  acceptDeadlineAt: null,
  itemApprovalDeadlineAt: null,
  prepMinutes: 15,
  prepStartedAt: new Date(Date.now() - 200_000).toISOString(),
  readyAt: null,
  rejectionReason: null,
  paymentCallLoggedAt: null,
  paymentRequestedAt: null,
  merchantPaymentReference: null,
  merchantPaymentConfirmedAt: null,
  riderId: "0a1b2c3d-0000-4000-8000-00000000me01",
  dispatchAttempt: 1,
  dispatchOfferExpiresAt: null,
  noRiderHoldAt: null,
  pickupCodeAttempts: 0,
  cashHandshakeAmount: 15.5,
  customerCashConfirmedAt: null,
  riderCashConfirmedAt: null,
  cashHandshakeDeadlineAt: null,
  cashHandshakeFrozenAt: null,
  noShowCallTimestamps: [],
  merchantCashRule: "collect_and_return",
  debtStatus: null,
  debtAmount: null,
  debtOpenedAt: null,
  debtSettledAt: null,
};

installRouter([
  { match: "/orders/mine/active", json: order },
  { match: /\/merchant\/orders\/[^/]+\/mine$/, json: foodOrder },
]);

export default { wrap: withAuthQuery() };
