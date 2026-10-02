// Order flow v2 round 3 fixture (tools/parity/shoot-order-flow-customer.mjs, ledger D-59).
import { AVP, rxItems, stage, T } from "./_order_flow.mjs";

export default stage({
  status: "requested",
  phase: "preparing",
  food: { ...AVP.food, items: rxItems(), merchantGoodsTotal: 9.5, total: 11, prepMinutes: 15, prepStartedAt: T(-2 * 60_000), prescription: { status: "pending", patientName: "Rudo Chikafu", pageCount: 1 } },
  snap: AVP.snap,
});
