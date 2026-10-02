// Order flow v2 round 3 fixture (tools/parity/shoot-order-flow-customer.mjs, ledger D-59).
import { AVP, rxItems, stage, T } from "./_order_flow.mjs";

export default stage({
  status: "cancelled",
  food: { ...AVP.food, items: rxItems(false), prescription: { status: "declined", patientName: "Rudo Chikafu", pageCount: 1, declineReason: "expired", declineNote: null, checkedAt: T(-120_000) } },
  snap: { ...AVP.snap, cancelledBy: "customer" },
});
