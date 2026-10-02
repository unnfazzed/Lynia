// Order flow v2 round 3 fixture (tools/parity/shoot-order-flow-customer.mjs, ledger D-59).
import { AVF, stage, T } from "./_order_flow.mjs";

// Packing, about 6 min left of 13.
export default stage({ status: "requested", phase: "preparing", food: { ...AVF.food, prepMinutes: 13, prepStartedAt: T(-7 * 60_000) }, snap: AVF.snap });
