// Order flow v2 round 3 fixture (tools/parity/shoot-order-flow-customer.mjs, ledger D-59).
import { AVP, stage, T } from "./_order_flow.mjs";

export default stage({
  status: "en_route_dropoff",
  pos: "door",
  food: { ...AVP.food, pickupProof: { photoUrl: null, takenAt: T(-6 * 60000), bagSealed: true } },
  snap: { ...AVP.snap, events: [{ status: "requested", createdAt: T(-30 * 60000) }, { status: "assigned", createdAt: T(-20 * 60000) }, { status: "picked_up", createdAt: T(-5 * 60000) }, { status: "en_route_dropoff", createdAt: T(-4 * 60000) }] },
});
