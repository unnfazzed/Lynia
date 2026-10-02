// Order flow v2 customer shoot fixture (tools/parity/shoot-order-flow-customer.mjs, ledger D-59).
import { stage, T } from "./_order_flow.mjs";

export default stage({ status: "delivered", food: { deliveredAt: T(-60000) }, snap: { events: [{ status: "requested", createdAt: T(-60000 - 40 * 60000) }, { status: "assigned", createdAt: T(-60000 - 30 * 60000) }, { status: "picked_up", createdAt: T(-60000 - 10 * 60000) }, { status: "delivered", createdAt: T(-60000) }] } });
