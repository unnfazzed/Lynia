// Order flow v2 customer shoot fixture (tools/parity/shoot-order-flow-customer.mjs, ledger D-59).
import { stage, T } from "./_order_flow.mjs";

// Just collected: the rider's sealed-bag photo (no image bytes in the harness — the tile placeholder shows).
export default stage({ status: "picked_up", pos: "mid", food: { readyAt: T(-8 * 60000), pickupProof: { photoUrl: "https://example.invalid/bag.jpg", takenAt: T(-60_000), bagSealed: true } }, snap: { events: [{ status: "requested", createdAt: T(-30 * 60000) }, { status: "assigned", createdAt: T(-20 * 60000) }, { status: "picked_up", createdAt: T(-60_000) }] } });
