import { stageFoodJob, wrap } from "./_order_flow_rider.mjs";

// RD4a — at the door, the customer has said they paid: ① done, ② collect $16.50 (ledger D-59).
stageFoodJob({ status: "en_route_dropoff", at: "drop", cash: { customerCashConfirmedAt: new Date().toISOString() } });

export default { wrap };
