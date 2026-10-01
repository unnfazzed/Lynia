import { stage, wrapAuth } from "./_rider_v2.mjs";

if (typeof window !== "undefined") window.__PARITY_SETTLE_MS = 1200;
stage({ rider: false });

export default { wrap: wrapAuth };
