import { setParams, withQuery } from "./_harness.mjs";
import { OPEN_ORDERS, stage } from "./_rider_v2.mjs";

if (typeof window !== "undefined") window.__PARITY_SETTLE_MS = 1000;
stage({ openOrders: OPEN_ORDERS });
setParams({ jobId: OPEN_ORDERS[0].id, toKm: "1.2" });

// The offer screen reads its job from the board's ["openOrders"] cache, as it does on a phone.
export default { wrap: withQuery((qc) => qc.setQueryData(["openOrders"], OPEN_ORDERS)) };
