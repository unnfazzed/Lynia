// Order flow v2 round 3 fixture (tools/parity/shoot-order-flow-customer.mjs, ledger D-59).
import { localAt, stage } from "./_order_flow.mjs";

// Scheduled for tomorrow 12:30–13:00; Gava’s Kitchen rings at 12:05.
export default stage({ status: "requested", phase: "awaiting_accept", food: { prepStartedAt: null, scheduledFor: localAt(1, 12, 30), ringsAt: localAt(1, 12, 5), scheduleStartedAt: null } });
