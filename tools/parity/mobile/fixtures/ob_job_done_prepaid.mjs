import { stageFleetDelivered } from "./_own_bikers.mjs";
import { wrapAuth } from "./_rider_v2.mjs";

if (typeof window !== "undefined") window.__PARITY_SETTLE_MS = 1600;
stageFleetDelivered({ debt: null, prepaid: true });

export default { wrap: wrapAuth };
