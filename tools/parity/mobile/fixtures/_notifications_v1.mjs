// Notifications v1 staging (ledger D-66; tools/parity/shoot-notifications-v1.mjs): the feed rows of the
// handoff's own sample (packages/design/handoff/notifications-v1/n-screens.jsx CF / RF), in the shape the
// API now sends (type / beat / service / places / names / steps / active), so the app column reads like the
// handoff column beside it.
import { installRouter, setParams, withQuery } from "./_harness.mjs";

const now = Date.now();
const ago = (min) => new Date(now - min * 60_000).toISOString();
const daysAgo = (d, h, m) => {
  const t = new Date();
  t.setDate(t.getDate() - d);
  t.setHours(h, m, 0, 0);
  return t.toISOString();
};
const steps = (list) => list.map(([beat, at]) => ({ beat, title: beat, at }));
const base = { icon: "bell", title: "", message: "", unread: false };
const o = (id) => `0a1b2c3d-0000-4000-8000-0000000009${id}`;

export const CF = {
  sadza: { ...base, id: "s-sadza", orderId: o("01"), to: "customer", type: "status", beat: "picked_up", status: "picked_up", service: "restaurants", venue: "Sadza Republic", riderName: "Tendai", at: ago(2), unread: true,
    steps: steps([["picked_up", ago(2)], ["preparing", ago(18)], ["accepted", ago(21)]]) },
  glen: { ...base, id: "s-glen", orderId: o("02"), to: "customer", type: "status", beat: "delivered", status: "delivered", service: "send", dropoffArea: "Glenara Ave", riderName: "Tendai", at: ago(61), unread: true,
    steps: steps([["delivered", ago(61)], ["en_route_dropoff", ago(80)], ["picked_up", ago(87)], ["en_route_pickup", ago(94)], ["confirmed", ago(100)]]) },
  pharmAcc: { ...base, id: "s-pharm", orderId: o("03"), to: "customer", type: "status", beat: "accepted", status: "requested", service: "pharmacy", venue: "Healthwise Pharmacy", at: ago(190) },
  pharmSwap: { ...base, id: "sw-pharm", orderId: o("03"), to: "customer", type: "swap", active: true, service: "pharmacy", venue: "Healthwise Pharmacy", at: ago(181), unread: true,
    swap: { item: "Panado 24s", sub: "Paracetamol 24s", diff: "same price" } },
  wallet: { ...base, id: "a-wallet", type: "account", action: "wallet.credit", to: "rider", message: "$3.36 refund added to your wallet.", at: daysAgo(1, 18, 2) },
  belg: { ...base, id: "s-belg", orderId: o("04"), to: "customer", type: "status", beat: "cancelled", status: "cancelled", service: "send", dropoffArea: "Belgravia", at: daysAgo(1, 17, 2),
    steps: steps([["cancelled", daysAgo(1, 17, 2)], ["expired", daysAgo(1, 16, 50)]]) },
  report: { ...base, id: "i-report", orderId: o("05"), type: "issue", message: "We refunded the late fee to your wallet.", at: daysAgo(1, 9, 10) },
  sos: { ...base, id: "sos-1", orderId: o("06"), to: "customer", type: "sos", active: true, service: "send", riderName: "Tendai", dropoffArea: "Mbare", at: ago(0), unread: true },
  mbareLive: { ...base, id: "s-mbare", orderId: o("06"), to: "customer", type: "status", beat: "en_route_dropoff", status: "en_route_dropoff", service: "send", dropoffArea: "Mbare", riderName: "Tendai", at: ago(40), unread: true,
    steps: steps([["en_route_dropoff", ago(40)], ["picked_up", ago(47)], ["confirmed", ago(55)]]) },
  offer: { ...base, id: "of-1", orderId: o("07"), to: "customer", type: "offer", active: true, service: "send", dropoffArea: "Avondale", riderName: "Farai", amount: "3.20", count: 1, at: ago(0), unread: true },
  offerExp: { ...base, id: "s-avon", orderId: o("07"), to: "customer", type: "status", beat: "expired", status: "expired", service: "send", dropoffArea: "Avondale", at: ago(9) },
  idc: { ...base, id: "a-idc", type: "account", action: "rider.kyc_decline", to: "rider", message: "Your ID photo was blurry. Take it again in good light.", at: ago(60), unread: true },
};
export const RF = {
  paused: { ...base, id: "a-paused", type: "account", action: "rider.suspend", active: true, to: "rider", message: "We're checking a customer report. You can't take jobs until it's cleared.", at: ago(60), unread: true },
  glen: { ...base, id: "r-glen", orderId: o("11"), to: "rider", type: "status", beat: "completed", status: "completed", service: "send", pickupArea: "Eastgate", dropoffArea: "Glenara Ave", amount: "3.20", at: ago(2), unread: true,
    steps: steps([["completed", ago(2)], ["assigned", ago(40)]]) },
  wallet: { ...base, id: "r-wallet", type: "account", action: "wallet.credit", to: "rider", message: "$5.00 top-up added. Your balance is $12.60.", at: ago(180), unread: true },
  avon: { ...base, id: "r-avon", orderId: o("12"), to: "rider", type: "status", beat: "cancelled", status: "cancelled", service: "restaurants", venue: "Mama's Kitchen", dropoffArea: "Avondale", message: "Nyasha cancelled the order. This doesn't count against you.", at: daysAgo(1, 18, 10),
    steps: steps([["cancelled", daysAgo(1, 18, 10)], ["assigned", daysAgo(1, 18, 1)]]) },
  belg: { ...base, id: "r-belg", orderId: o("13"), to: "rider", type: "status", beat: "completed", status: "completed", service: "send", pickupArea: "Fife Ave", dropoffArea: "Belgravia", amount: "2.50", at: daysAgo(1, 17, 40),
    steps: steps([["completed", daysAgo(1, 17, 40)], ["assigned", daysAgo(1, 17, 10)]]) },
};

/** Install the feed. `status` 500 stages N10; `side` "rider" the rider app's entry. */
export function notifFixture({ rows = [], status = 200, side } = {}) {
  if (side) setParams({ side });
  installRouter([
    { match: "/notifications/feed", json: status === 200 ? rows : { message: "down" }, status },
    { match: "/notifications/read", json: { readAt: new Date().toISOString() } },
    { match: "/auth/me", json: { id: "me", firstName: "Nyasha", lastName: "Moyo", rider: null } },
  ]);
  return { wrap: withQuery() };
}
