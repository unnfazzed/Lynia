// Order flow v2 customer shoot fixture (tools/parity/shoot-order-flow-customer.mjs, ledger D-59).
import { stage, T } from "./_order_flow.mjs";

export default stage({ status: "en_route_dropoff", pos: "mid", fixAgoMs: 2 * 60000, snap: { events: [{ status: "requested", createdAt: T(-30 * 60000) }, { status: "assigned", createdAt: T(-20 * 60000) }, { status: "picked_up", createdAt: T(-5 * 60000) }, { status: "en_route_dropoff", createdAt: T(-4 * 60000) }] } });
