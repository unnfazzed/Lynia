import { OPEN_ORDERS, stage, wrapAuth } from "./_rider_v2.mjs";

if (typeof window !== "undefined") window.__PARITY_SETTLE_MS = 1600;
stage({ openOrders: OPEN_ORDERS });

export default { wrap: wrapAuth };
