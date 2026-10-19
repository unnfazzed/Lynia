import { stageJoin } from "./_own_bikers.mjs";
import { wrapAuth } from "./_rider_v2.mjs";

if (typeof window !== "undefined") window.__PARITY_SETTLE_MS = 1600;
stageJoin({ refusal: { status: 410, reason: "invite_ended", message: "This invite has ended. Ask Chicken Inn Avondale for a new one." } });

export default { wrap: wrapAuth };
