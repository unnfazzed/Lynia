import { stageFoodJob, wrap } from "./_order_flow_rider.mjs";

// RD2b — at a shop's counter: the code typed, then the camera step with "Bag is sealed" (ledger D-59).
stageFoodJob({
  status: "en_route_pickup",
  at: "pickup",
  snap: { merchantName: "Avondale Fresh", pickup: { point: { lat: -17.8009, lng: 31.0389 }, landmark: "Avondale Fresh", contactPhone: "+263772000111" } },
  cash: { pickupProofRequired: true, venue: { name: "Avondale Fresh", businessType: "shop", shopKind: "grocery", kycVerified: true }, debtStatus: null, debtAmount: null },
});

export default { wrap };
