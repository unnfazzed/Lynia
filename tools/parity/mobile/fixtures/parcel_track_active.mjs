// LJ.track_active — the live parcel tracking screen. order/[id].tsx reads `id` from route params and
// GETs /orders/:id; an active status (en_route_dropoff) with an attached rider drives the memoized
// LiveTrackingCard (ETA headline, live map, status stepper, call-rider row). The rider's `updatedAt` is
// stamped "now" so the fix reads fresh, not stale/dark. The map is the react-native-maps shim (gray
// fill — expected/honest). NOTE: the hand-off delivery code is stored in customer-local SecureStore
// (inert in parity), so the code card shows its "re-issue" prompt rather than the plaintext digits.
import { installRouter, setParams } from "./_harness.mjs";
import { withAuthQuery } from "./_auth.mjs";

const ORDER_ID = "0a1b2c3d-0000-4000-8000-000000000001";
const RIDER_ID = "0a1b2c3d-0000-4000-8000-000000000003";
const now = new Date().toISOString();

const order = {
  id: ORDER_ID,
  status: "en_route_dropoff",
  orderType: "parcel",
  viewerRole: "customer",
  agreedFare: "4.50",
  proposedFare: "4.50",
  pickup: { point: { lat: -17.8292, lng: 31.0522 }, landmark: "Eastgate Mall, city centre", contactPhone: null },
  dropoff: { point: { lat: -17.8016, lng: 31.0431 }, landmark: "Avondale Shops", contactPhone: "+263 77 555 0142" },
  items: [{ description: "Documents envelope", quantity: 1 }],
  note: "Ask for Rita at reception.",
  rider: { profileId: RIDER_ID, currentLat: -17.812, currentLng: 31.049, updatedAt: now },
  events: [
    { status: "assigned", createdAt: "2026-08-11T09:40:00.000Z" },
    { status: "en_route_pickup", createdAt: "2026-08-11T09:44:00.000Z" },
    { status: "picked_up", createdAt: "2026-08-11T09:52:00.000Z" },
    { status: "en_route_dropoff", createdAt: "2026-08-11T09:55:00.000Z" },
  ],
  counterpartyPhone: "+263 77 555 0142",
  expiresAt: null,
  ridersNearby: null,
};

installRouter([{ match: /^\/orders\/[^/]+$/, json: order }]);
setParams({ id: ORDER_ID });

// order/[id].tsx reads useAuth() via useOrderSocket, so it needs an AuthProvider present.
export default { wrap: withAuthQuery() };
