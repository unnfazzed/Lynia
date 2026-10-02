import { stageFoodJob, wrap } from "./_order_flow_rider.mjs";

// RD3 — a prescription order's door: see the original before handing over (ledger D-59).
stageFoodJob({
  status: "en_route_dropoff",
  at: "drop",
  snap: { merchantName: "Avondale Pharmacy" },
  cash: {
    venue: { name: "Avondale Pharmacy", businessType: "shop", shopKind: "pharmacy", kycVerified: true },
    pickupProofRequired: true,
    prescription: { status: "approved", patientName: "Rudo Moyo", pageCount: 1, riderSawOriginalAt: null },
  },
});

export default { wrap };
