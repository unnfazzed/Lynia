// After Send shoot fixture (tools/parity/shoot-after-send.mjs, ledger D-53). A rider cancel AFTER pickup
// is the cancelled terminal (18b); before pickup it is the retry (13).
import { stage } from "./_after_send.mjs";

export default stage({
  status: "cancelled",
  extra: {
    cancelledBy: "rider",
    cancelReason: "Bike broke down",
    rider: { profileId: "0a1b2c3d-0000-4000-8000-000000000003", currentLat: null, currentLng: null, updatedAt: null },
    riderCard: { firstName: "Tendai", lastName: "Moyo", photoUrl: null, ratingAvg: 4.8, ratingCount: 40, tripsCount: 132, plate: "ABH 4721", verified: true },
    events: [{ status: "assigned", createdAt: "2026-09-30T07:00:00.000Z" }, { status: "picked_up", createdAt: "2026-09-30T07:12:00.000Z" }, { status: "cancelled", createdAt: "2026-09-30T07:20:00.000Z" }],
  },
});
