// Review-only fixture (orders-v2 brief): two live orders + a realistic mixed history —
// cancelled, undelivered, refunded-ish food, AND rider-carried jobs (the feed serves both roles).
import { installRouter, withQuery, UUID } from "./_harness.mjs";
const A = { lat: -17.8292, lng: 31.0522 },
  B = { lat: -17.8145, lng: 31.045 };
const day = 86_400_000,
  now = Date.now();
const live = (id, over) => ({
  id,
  status: "en_route_pickup",
  orderType: "parcel",
  viewerRole: "customer",
  agreedFare: "3.36",
  proposedFare: "3.36",
  pickup: { point: A, landmark: "Eastgate Mall, CBD" },
  dropoff: { point: B, landmark: "14 Lanark Rd, Belgravia" },
  items: null,
  note: null,
  rider: null,
  events: [],
  counterpartyPhone: null,
  expiresAt: null,
  ...over,
});
let n = 0;
const row = (over) => ({
  id: `0a1b2c3d-0000-4000-8000-0000000004${String(++n).padStart(2, "0")}`,
  orderType: "parcel",
  merchantName: null,
  role: "customer",
  pickup: { point: A, landmark: "Avondale Shops" },
  dropoff: { point: B, landmark: "Belgravia" },
  itemDesc: "Documents",
  note: null,
  proposedFare: "5.00",
  agreedFare: "5.00",
  status: "completed",
  createdAt: new Date(now - day).toISOString(),
  rating: null,
  counterpartyName: "Tendai M.",
  ...over,
});
installRouter([
  {
    match: /^\/orders\/mine\/active-orders$/,
    json: [
      live(UUID.order, {
        orderType: "merchant",
        merchantName: "Sadza Republic",
        status: "assigned",
        merchantPhase: "preparing",
        agreedFare: "15.50",
        proposedFare: "15.50",
      }),
      live("0a1b2c3d-0000-4000-8000-0000000004ff", {
        status: "open_for_offers",
        agreedFare: null,
      }),
    ],
  },
  {
    match: "/orders/history",
    json: [
      row({
        orderType: "merchant",
        merchantName: "Gava's Kitchen",
        status: "delivered",
        proposedFare: "12.50",
        agreedFare: "12.50",
        createdAt: new Date(now - 3 * 3600_000).toISOString(),
      }),
      row({
        status: "cancelled",
        agreedFare: null,
        proposedFare: "3.00",
        counterpartyName: null,
        dropoff: { point: B, landmark: "Mount Pleasant Business Park, Gate 2" },
      }),
      row({
        role: "rider",
        status: "delivered",
        proposedFare: "4.20",
        agreedFare: "4.20",
        counterpartyName: "Rudo K.",
        pickup: { point: A, landmark: "Borrowdale Village" },
        dropoff: { point: B, landmark: "Highlands" },
      }),
      row({
        status: "undelivered",
        createdAt: new Date(now - 2 * day).toISOString(),
      }),
      row({
        orderType: "merchant",
        merchantName: "Nando's Avondale",
        status: "cancelled",
        proposedFare: "18.00",
        agreedFare: "18.00",
        counterpartyName: null,
        createdAt: new Date(now - 4 * day).toISOString(),
      }),
      row({
        status: "expired",
        agreedFare: null,
        counterpartyName: null,
        createdAt: new Date(now - 6 * day).toISOString(),
      }),
      row({
        status: "completed",
        rating: { score: 5, comment: null },
        createdAt: new Date(now - 9 * day).toISOString(),
      }),
      row({
        role: "rider",
        status: "cancelled",
        counterpartyName: "Chipo D.",
        createdAt: new Date(now - 12 * day).toISOString(),
      }),
    ],
  },
]);
export default { wrap: withQuery() };
