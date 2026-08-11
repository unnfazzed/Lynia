// RJ.job_assigned — the rider's active PARCEL job, populated. GET /orders/mine/active answers a
// parcel OrderSnapshot at `assigned` (the win state, freshly picked by a customer), so job.tsx renders
// its working job screen: the JobDetailsCard, the trip, and the first "advance" step. The waypoint
// contact phones ARE revealed to the assigned rider inside the reveal window (PHONE_REVEAL_STATUSES),
// so the sender (pickup) + recipient (drop-off) call affordances render — matching the mock's two
// CallRows. GET /auth/me backs the bail-sheet strike count. Snapshot fares are serialised STRINGS.
import { installRouter } from "./_harness.mjs";
import { withAuthQuery } from "./_auth.mjs";

if (typeof window !== "undefined") window.__PARITY_SETTLE_MS = 1200;

const me = {
  profileId: "0a1b2c3d-0000-4000-8000-00000000me01",
  role: "rider",
  firstName: "Tanaka",
  lastName: "Moyo",
  phone: "+263771234567",
  email: null,
  photoUrl: null,
  ordersCount: 42,
  rider: {
    bikeReg: "ABZ 4417",
    kycStatus: "verified",
    kycDeclineReason: null,
    kycAttempts: 1,
    cancelStrikes: 0,
    ratingAvg: 4.9,
    ratingCount: 128,
    tripsCount: 132,
    isOnline: true,
    kycMode: "auto",
  },
};

const order = {
  id: "0a1b2c3d-0000-4000-8000-00000000pj01",
  status: "assigned",
  orderType: "parcel",
  viewerRole: "rider",
  agreedFare: "5.75",
  proposedFare: "5.75",
  pickup: { point: { lat: -17.8292, lng: 31.0522 }, landmark: "Copacabana Rank, CBD", contactPhone: "+263 77 245 1180" },
  dropoff: { point: { lat: -17.8009, lng: 31.0389 }, landmark: "Avondale Shops", contactPhone: "+263 71 555 0090" },
  items: [{ description: "Sealed A4 documents envelope", quantity: 1 }],
  rider: { profileId: "0a1b2c3d-0000-4000-8000-00000000me01", currentLat: -17.828, currentLng: 31.051, updatedAt: new Date().toISOString() },
  events: [{ status: "assigned", createdAt: new Date(Date.now() - 90_000).toISOString() }],
  counterpartyPhone: "+263 77 245 1180",
  expiresAt: null,
};

installRouter([
  { match: "/orders/mine/active", json: order },
  { match: "/auth/me", json: me },
]);

export default { wrap: withAuthQuery() };
