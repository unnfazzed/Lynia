// Order flow v2 RD1d — a prescription order: see the original at the door. (ledger D-59)
import { foodOffer, stage, wrapAuth } from "./_rider_v2.mjs";

function slot() {
  const d = new Date();
  d.setHours(12, 30, 0, 0);
  return d.toISOString();
}
if (typeof window !== "undefined") window.__PARITY_SETTLE_MS = 1200;
const offer = { ...foodOffer("collect_and_return"), pickup: { point: { lat: -17.8009, lng: 31.0389 }, landmark: "Avondale Pharmacy" }, deliveryFee: 2.6 };
stage({ extra: [{ match: "/merchant/orders/dispatch/offer", json: { offer, job: { businessType: "shop", shopKind: "pharmacy", scheduledFor: null, rx: true } } }] });
void slot;

export default { wrap: wrapAuth };
