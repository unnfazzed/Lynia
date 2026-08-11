// LJ.history — the Orders / trip-history list. useHistoryFeed reads GET /orders/history; a populated
// OrderHistoryRow[] paints the trip cards (route, date, fare, status pill, and a "Send again" button on
// the customer's own trips). No auth context — a plain QueryClient is enough.
import { installRouter, withQuery } from "./_harness.mjs";

const day = (iso) => iso;

const rows = [
  {
    id: "0a1b2c3d-0000-4000-8000-000000000001",
    orderType: "parcel",
    merchantName: null,
    role: "customer",
    pickup: { point: { lat: -17.8292, lng: 31.0522 }, landmark: "Eastgate Mall" },
    dropoff: { point: { lat: -17.8016, lng: 31.0431 }, landmark: "Avondale Shops" },
    itemDesc: "Documents envelope",
    note: null,
    proposedFare: "4.50",
    agreedFare: "4.50",
    status: "completed",
    createdAt: day("2026-08-10T15:20:00.000Z"),
    rating: { score: 5, comment: null },
    counterpartyName: "Tapiwa M.",
  },
  {
    id: "0a1b2c3d-0000-4000-8000-000000000006",
    orderType: "parcel",
    merchantName: null,
    role: "customer",
    pickup: { point: { lat: -17.8244, lng: 31.0533 }, landmark: "Joina City" },
    dropoff: { point: { lat: -17.7876, lng: 31.0534 }, landmark: "Borrowdale Village" },
    itemDesc: "Birthday gift box",
    note: null,
    proposedFare: "6.00",
    agreedFare: "6.50",
    status: "delivered",
    createdAt: day("2026-08-08T11:05:00.000Z"),
    rating: null,
    counterpartyName: "Rutendo K.",
  },
  {
    id: "0a1b2c3d-0000-4000-8000-000000000007",
    orderType: "parcel",
    merchantName: null,
    role: "customer",
    pickup: { point: { lat: -17.8607, lng: 31.0289 }, landmark: "Machipisa, Highfield" },
    dropoff: { point: { lat: -17.8292, lng: 31.0522 }, landmark: "Eastgate Mall" },
    itemDesc: "Spare phone charger",
    note: null,
    proposedFare: "3.50",
    agreedFare: null,
    status: "cancelled",
    createdAt: day("2026-08-05T08:40:00.000Z"),
    rating: null,
    counterpartyName: null,
  },
];

installRouter([{ match: "/orders/history", json: rows }]);

export default { wrap: withQuery() };
