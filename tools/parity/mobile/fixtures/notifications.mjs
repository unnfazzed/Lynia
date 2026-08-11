// LJ.notifications — the in-app notifications centre. GET /notifications/feed returns a populated,
// newest-first NotificationRow[] (mint-wash icon tile, title, message, relative time, unread dot). No
// auth context here — a plain QueryClient is enough.
import { installRouter, withQuery } from "./_harness.mjs";

const ORDER_A = "0a1b2c3d-0000-4000-8000-000000000001";
const ORDER_B = "0a1b2c3d-0000-4000-8000-000000000006";
const now = Date.now();
const ago = (mins) => new Date(now - mins * 60_000).toISOString();

const feed = [
  { id: "0a1b2c3d-0000-4000-8000-0000000000f1", orderId: ORDER_A, to: "customer", status: "en_route_dropoff", icon: "bike", title: "Your rider is on the way", message: "Tapiwa is heading to the drop-off — track them live.", at: ago(2), unread: true },
  { id: "0a1b2c3d-0000-4000-8000-0000000000f2", orderId: ORDER_A, to: "customer", status: "assigned", icon: "check", title: "You're matched", message: "Tapiwa accepted your parcel for $4.50.", at: ago(35), unread: true },
  { id: "0a1b2c3d-0000-4000-8000-0000000000f3", orderId: ORDER_B, to: "customer", status: "delivered", icon: "package", title: "Parcel delivered", message: "Your parcel to Avondale Shops was delivered. Rate your rider.", at: ago(180), unread: false },
  { id: "0a1b2c3d-0000-4000-8000-0000000000f4", orderId: ORDER_B, to: "customer", status: "open_for_offers", icon: "banknote", title: "New offer on your request", message: "A rider offered $5.00 to send your parcel.", at: ago(1500), unread: false },
];

installRouter([{ match: "/notifications/feed", json: feed }]);

export default { wrap: withQuery() };
