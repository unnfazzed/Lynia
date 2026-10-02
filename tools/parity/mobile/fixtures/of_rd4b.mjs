import { stageFoodJob, wrap } from "./_order_flow_rider.mjs";

// RD4b — both cash confirms in: the six-box delivery code (ledger D-59).
const at = new Date().toISOString();
stageFoodJob({ status: "en_route_dropoff", at: "drop", cash: { customerCashConfirmedAt: at, riderCashConfirmedAt: at } });

export default { wrap };
