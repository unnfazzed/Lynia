import * as SecureStore from "expo-secure-store";
import { activeJob, stage, wrapAuth } from "./_rider_v2.mjs";

if (typeof window !== "undefined") window.__PARITY_SETTLE_MS = 1600;
const job = activeJob("en_route_dropoff");
void SecureStore.setItemAsync("lynia.riderJobArrival", JSON.stringify({ orderId: job.id, at: "drop" }));
stage({ active: job });

export default { wrap: wrapAuth };
