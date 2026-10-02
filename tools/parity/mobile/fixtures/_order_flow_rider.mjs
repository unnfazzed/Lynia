// Order flow v2 rider fixtures (ledger D-59; packages/design/handoff/order-flow-v2/): the food job at
// the handoff's own sample — Gava's Kitchen → 12 Lanark Rd, Belgravia, Rudo at the door, $15.00 food +
// $1.50 delivery = $16.50 cash. Shot by tools/parity/shoot-order-flow-merchant.mjs --set rider.
import * as SecureStore from "expo-secure-store";
import { installRouter } from "./_harness.mjs";
import { withAuthQuery } from "./_auth.mjs";

const ORDER_ID = "0a1b2c3d-0000-4000-8000-00000000a1b2";
const RIDER_ID = "0a1b2c3d-0000-4000-8000-00000000me01";
const now = () => new Date().toISOString();

export function stageFoodJob({ status, at, cash = {}, snap = {} }) {
  if (typeof window !== "undefined") window.__PARITY_SETTLE_MS = 1600;
  void SecureStore.setItemAsync("lynia.riderJobArrival", JSON.stringify({ orderId: ORDER_ID, at }));
  const order = {
    id: ORDER_ID,
    status,
    orderType: "merchant",
    viewerRole: "rider",
    merchantName: "Gava's Kitchen",
    customerFirstName: "Rudo",
    agreedFare: "1.50",
    proposedFare: "1.50",
    pickup: { point: { lat: -17.8009, lng: 31.0389 }, landmark: "Gava's Kitchen", contactPhone: "+263772000111" },
    dropoff: { point: { lat: -17.812, lng: 31.044 }, landmark: "12 Lanark Rd, Belgravia" },
    items: [{ description: "Sadza & beef stew", quantity: 2 }, { description: "Roast chicken (half)", quantity: 1 }],
    rider: { profileId: RIDER_ID, currentLat: -17.811, currentLng: 31.043, updatedAt: now() },
    events: [],
    counterpartyPhone: "+263771234567",
    expiresAt: null,
    deliveryOtpAttempts: 0,
    ...snap,
  };
  const foodOrder = {
    id: ORDER_ID,
    merchantId: "0a1b2c3d-0000-4000-8000-00000000mr01",
    status,
    merchantPhase: null,
    items: [
      { dishId: "0a1b2c3d-0000-4000-8000-00000000d101", name: "Sadza & beef stew", priceUsd: 4.5, quantity: 2, note: "Extra gravy", available: true },
      { dishId: "0a1b2c3d-0000-4000-8000-00000000d102", name: "Roast chicken (half)", priceUsd: 6, quantity: 1, note: null, available: true },
    ],
    note: null,
    paymentMethod: "cash",
    merchantPaymentPhone: null,
    merchantGoodsTotal: 15,
    deliveryFee: 1.5,
    total: 16.5,
    acceptDeadlineAt: null,
    itemApprovalDeadlineAt: null,
    prepMinutes: 20,
    prepStartedAt: new Date(Date.now() - 22 * 60_000).toISOString(),
    readyAt: now(),
    rejectionReason: null,
    paymentCallLoggedAt: null,
    paymentRequestedAt: null,
    merchantPaymentReference: null,
    merchantPaymentConfirmedAt: null,
    riderId: RIDER_ID,
    dispatchAttempt: 1,
    dispatchOfferExpiresAt: null,
    noRiderHoldAt: null,
    pickupCodeAttempts: 0,
    cashHandshakeAmount: 16.5,
    customerCashConfirmedAt: null,
    riderCashConfirmedAt: null,
    cashHandshakeDeadlineAt: null,
    cashHandshakeFrozenAt: null,
    noShowCallTimestamps: [],
    merchantCashRule: "collect_and_return",
    debtStatus: status === "en_route_pickup" ? null : "open",
    debtAmount: status === "en_route_pickup" ? null : 15,
    autoAccepted: false,
    ...cash,
  };
  installRouter([
    { match: "/orders/mine/active", json: order },
    { match: /\/merchant\/orders\/[^/]+\/mine$/, json: foodOrder },
    { match: /\/(pickup-proof|saw-original)$/, json: {} },
  ]);
}

export const wrap = withAuthQuery();
