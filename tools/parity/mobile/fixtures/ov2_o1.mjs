// Orders v2 O1 — one running parcel + history (ledger D-63).
import { ordersFixture, parcel } from "./_orders_v2.mjs";
export default ordersFixture({ active: [parcel("on_the_way")] });
