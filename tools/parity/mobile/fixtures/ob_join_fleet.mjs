import { stageJoin } from "./_own_bikers.mjs";
import { wrapAuth } from "./_rider_v2.mjs";

if (typeof window !== "undefined") window.__PARITY_SETTLE_MS = 1600;
stageJoin({ refusal: { status: 409, reason: "in_another_fleet", message: "Leave Pizza Inn first." } });

export default { wrap: wrapAuth };
