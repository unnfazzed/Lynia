import { stage, wrap } from "./_rider_v2.mjs";

if (typeof window !== "undefined") window.__PARITY_SETTLE_MS = 1000;
stage({});

export default { wrap };
