import { stage, wrap } from "./_rider_v2.mjs";

if (typeof window !== "undefined") window.__PARITY_SETTLE_MS = 1200;
stage({ side: "rider" });

export default { wrap: wrap };
