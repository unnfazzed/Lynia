// Order flow v2 G1 (ledger D-59): Home's live bar led by a merchant order — the scheduled Gava’s Kitchen order.
import { installRouter, withQuery } from "./_harness.mjs";
import { G_ORDERS, gRoutes } from "./_order_flow_g.mjs";

const list = [G_ORDERS[6], ...G_ORDERS.filter((_, i) => i !== 6)];

installRouter([
  { match: /^\/auth\/me$/, json: { profileId: "0a1b2c3d-0000-4000-8000-0000000000c1", role: "customer", firstName: "Rudo", lastName: "Chikafu" } },
  { match: /^\/notifications\/unread-count$/, json: { count: 0 } },
  ...gRoutes(list),
  { match: "/restaurants", json: { restaurants: [] } },
]);

export default { wrap: withQuery() };
