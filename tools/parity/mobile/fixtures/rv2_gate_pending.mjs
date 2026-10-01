import { stage, wrapAuth } from "./_rider_v2.mjs";

if (typeof window !== "undefined") window.__PARITY_SETTLE_MS = 1200;
stage({ kycStatus: "pending", kycPendingState: "in_flight" });

export default { wrap: wrapAuth };
