// Order flow v2 round 3 fixture (tools/parity/shoot-order-flow-customer.mjs, ledger D-59).
import { AVP, rxItems, stage, T } from "./_order_flow.mjs";

export default stage({
  status: "requested",
  phase: "preparing",
  food: {
    ...AVP.food,
    items: rxItems(false),
    prepMinutes: 15,
    prepStartedAt: T(-4 * 60_000),
    prescription: { status: "declined", patientName: "Rudo Chikafu", pageCount: 1, declineReason: "expired", declineNote: "dated March 2026", checkedAt: T(-60_000) },
  },
  snap: AVP.snap,
});
