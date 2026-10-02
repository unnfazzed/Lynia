// Order flow v2 customer shoot fixture (tools/parity/shoot-order-flow-customer.mjs, ledger D-59).
import { stage, T } from "./_order_flow.mjs";

export default stage({ status: "requested", phase: "ready_for_pickup", sawRider: true, food: { readyAt: T(-4 * 60000), dispatchAttempt: 2 } });
