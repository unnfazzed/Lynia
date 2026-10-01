import { foodOffer, stage, wrapAuth } from "./_rider_v2.mjs";

if (typeof window !== "undefined") window.__PARITY_SETTLE_MS = 1200;
stage({ extra: [{ match: "/merchant/orders/dispatch/offer", json: { offer: foodOffer("collect_and_return") } }] });

export default { wrap: wrapAuth };
