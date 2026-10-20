import { stageFleetFoodJob } from "./_own_bikers.mjs";
import { wrapAuth } from "./_rider_v2.mjs";

if (typeof window !== "undefined") window.__PARITY_SETTLE_MS = 1600;
stageFleetFoodJob("en_route_dropoff");

export default { wrap: wrapAuth };
