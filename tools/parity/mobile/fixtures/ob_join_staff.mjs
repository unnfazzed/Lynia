import { stageJoin } from "./_own_bikers.mjs";
import { wrapAuth } from "./_rider_v2.mjs";

if (typeof window !== "undefined") window.__PARITY_SETTLE_MS = 1600;
stageJoin({ refusal: { status: 409, reason: "works_at_shop", message: "You work at Chicken Inn Avondale. Ask them to add you as a biker from a different account." } });

export default { wrap: wrapAuth };
