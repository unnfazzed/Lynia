// Order flow v2 G2 (ledger D-59): the Orders tab with the G2 frame's seven running merchant orders as Now cards.
import { installRouter, withQuery } from "./_harness.mjs";
import { gRoutes } from "./_order_flow_g.mjs";

installRouter(gRoutes());

export default { wrap: withQuery() };
