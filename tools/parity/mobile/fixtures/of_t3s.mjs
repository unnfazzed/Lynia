// Order flow v2 round 3 fixture (tools/parity/shoot-order-flow-customer.mjs, ledger D-59).
import { AVF, stage, T } from "./_order_flow.mjs";

export default stage({ status: "requested", phase: "awaiting_accept", food: { ...AVF.food, acceptDeadlineAt: T(161_000), prepStartedAt: null }, snap: AVF.snap });
