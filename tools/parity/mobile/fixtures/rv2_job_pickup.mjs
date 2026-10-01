import { activeJob, stage, wrapAuth } from "./_rider_v2.mjs";

if (typeof window !== "undefined") window.__PARITY_SETTLE_MS = 1600;
stage({ active: activeJob("en_route_pickup") });

export default { wrap: wrapAuth };
