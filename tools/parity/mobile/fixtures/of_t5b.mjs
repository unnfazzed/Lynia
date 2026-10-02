// Order flow v2 round 3 fixture (tools/parity/shoot-order-flow-customer.mjs, ledger D-59).
import { AVP, stage, T } from "./_order_flow.mjs";

export default stage({ status: "requested", phase: "preparing", food: { ...AVP.food, prepMinutes: 10, prepStartedAt: T(-5 * 60_000) }, snap: AVP.snap });
