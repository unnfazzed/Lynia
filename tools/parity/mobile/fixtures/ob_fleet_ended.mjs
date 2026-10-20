import { stageFleetEnded } from "./_own_bikers.mjs";
import { wrapAuth } from "./_rider_v2.mjs";

if (typeof window !== "undefined") window.__PARITY_SETTLE_MS = 1600;
stageFleetEnded();

export default { wrap: wrapAuth };
