// Order flow v2 customer shoot fixture (tools/parity/shoot-order-flow-customer.mjs, ledger D-59).
import { stage, T } from "./_order_flow.mjs";

export default stage({ status: "requested", phase: "awaiting_accept", food: { acceptDeadlineAt: T(161_000), prepStartedAt: null } });
