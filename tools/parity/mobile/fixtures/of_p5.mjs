// Order flow v2 customer shoot fixture (tools/parity/shoot-order-flow-customer.mjs, ledger D-59).
import { stage, T } from "./_order_flow.mjs";

// Delivered with a door photo: the code couldn't be used, left with Chipo at the gate.
export default stage({ status: "delivered", food: { deliveredAt: T(-60000), venueRating: { score: 5, tags: [], at: T(-30000) }, doorProof: { photoUrl: "https://example.invalid/door.jpg", takenAt: T(-60000), reason: "left_at_gate", handedTo: "Chipo" } }, snap: { rating: { score: 4, tags: [] }, events: [{ status: "requested", createdAt: T(-60000 - 40 * 60000) }, { status: "delivered", createdAt: T(-60000) }] } });
