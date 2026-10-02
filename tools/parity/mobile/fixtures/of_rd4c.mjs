import { stageFoodJob, wrap } from "./_order_flow_rider.mjs";

// RD4c — both cash confirms in, the code can't be used: why (ledger D-59).
const at = new Date().toISOString();
stageFoodJob({ status: "en_route_dropoff", at: "drop", cash: { customerCashConfirmedAt: at, riderCashConfirmedAt: at } });

export default { wrap };
