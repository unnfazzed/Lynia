// Orders v2 O2 — three running orders: food cooking, a parcel finding riders, a pharmacy packing (ledger D-63).
import { AVP, cooking, ordersFixture, parcel, SADZA } from "./_orders_v2.mjs";
export default ordersFixture({ active: [cooking(SADZA), parcel("finding"), cooking(AVP)] });
