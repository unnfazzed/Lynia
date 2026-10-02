// Order flow v2 round 3 fixture (tools/parity/shoot-order-flow-customer.mjs, ledger D-59).
import { localAt, stage, T } from "./_order_flow.mjs";

// The slot is today; the kitchen started cooking 2 min ago.
export default stage({ status: "requested", phase: "preparing", food: { prepMinutes: 20, prepStartedAt: T(-2 * 60_000), scheduledFor: localAt(0, 23, 0), ringsAt: T(-2 * 60_000), scheduleStartedAt: T(-2 * 60_000), autoAccepted: true, kitchenConfirmedAt: T(-60_000) } });
