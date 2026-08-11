// LJ.track_code — the just-matched "code issued" tracking state. Same screen as track_active but at the
// `assigned` status (a rider chosen, before movement), which is the moment the hand-off code is minted.
// NOTE: the plaintext delivery code lives in customer-local SecureStore, written on the select response
// and reloaded via loadDeliveryCode — inert in parity, so this fixture-driven cold read can't seed it.
// The screen therefore shows the "your hand-off code isn't showing — re-issue" card (a real shipped
// state) rather than the code digits; seeding the actual digits would need SecureStore support in the
// shared shims, which is out of a fixture's scope.
import { installRouter, setParams } from "./_harness.mjs";
import { withAuthQuery } from "./_auth.mjs";

const ORDER_ID = "0a1b2c3d-0000-4000-8000-000000000001";
const RIDER_ID = "0a1b2c3d-0000-4000-8000-000000000003";
const now = new Date().toISOString();

const order = {
  id: ORDER_ID,
  status: "assigned",
  orderType: "parcel",
  viewerRole: "customer",
  agreedFare: "4.50",
  proposedFare: "4.50",
  pickup: { point: { lat: -17.8292, lng: 31.0522 }, landmark: "Eastgate Mall, city centre", contactPhone: null },
  dropoff: { point: { lat: -17.8016, lng: 31.0431 }, landmark: "Avondale Shops", contactPhone: null },
  items: [{ description: "Documents envelope", quantity: 1 }],
  note: "Ask for Rita at reception.",
  rider: { profileId: RIDER_ID, currentLat: -17.826, currentLng: 31.053, updatedAt: now },
  events: [{ status: "assigned", createdAt: now }],
  counterpartyPhone: null,
  expiresAt: null,
  ridersNearby: null,
};

installRouter([{ match: /^\/orders\/[^/]+$/, json: order }]);
setParams({ id: ORDER_ID });

// order/[id].tsx reads useAuth() via useOrderSocket, so it needs an AuthProvider present.
export default { wrap: withAuthQuery() };
