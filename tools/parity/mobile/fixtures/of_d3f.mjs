// Order flow v2 customer shoot fixture (tools/parity/shoot-order-flow-customer.mjs, ledger D-59).
import { stage, T } from "./_order_flow.mjs";

// Cancelled by the customer after the rider collected it: the full total is owed (Backend B `owedUsd`).
export default stage({ status: "cancelled", food: { owedUsd: 16.5 }, snap: { cancelledBy: "customer", riderCard: { firstName: "Tendai", lastName: "Moyo", photoUrl: null, ratingAvg: 4.8, ratingCount: 40, tripsCount: 132, plate: "ABH 4721", verified: true }, events: [{ status: "requested", createdAt: T(-40 * 60000) }, { status: "assigned", createdAt: T(-30 * 60000) }, { status: "picked_up", createdAt: T(-10 * 60000) }, { status: "cancelled", createdAt: T(-60000) }] } });
