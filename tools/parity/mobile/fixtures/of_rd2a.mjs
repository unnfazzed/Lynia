import { stageFoodJob, wrap } from "./_order_flow_rider.mjs";

// RD2a — at the kitchen, the six-box pickup code (ledger D-59).
stageFoodJob({ status: "en_route_pickup", at: "pickup" });

export default { wrap };
