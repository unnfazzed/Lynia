// Order flow v2 customer shoot fixture (tools/parity/shoot-order-flow-customer.mjs, ledger D-59).
import { stage, T } from "./_order_flow.mjs";

export default stage({ status: "en_route_pickup", pos: "far", food: { prepStartedAt: T(-16 * 60000), prepMinutes: 20 } });
