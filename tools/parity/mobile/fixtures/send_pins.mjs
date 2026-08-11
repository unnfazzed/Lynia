// LJ.home_pins — the Send composer with BOTH pins set. The composer holds its pins in local state
// seeded only from a stored draft or from re-broadcast (`rb…`) route params; SecureStore is inert in
// parity, so we prefill via the rb params (the same path "Send again" / rebroadcast uses). That sets
// both pins, both landmarks, a line-item and a proposed fare, so the map carries pickup + drop pins and
// the sheet shows the price quote — the "both set" state. (draftFromParams also flips the small "Draft
// restored" chip on, an honest artifact of the only fixture-reachable way to seed pins.)
import { installRouter, setParams, withQuery } from "./_harness.mjs";

const me = {
  profileId: "0a1b2c3d-0000-4000-8000-000000000004",
  role: "customer",
  firstName: "Chipo",
  lastName: "Marufu",
  phone: "+263 77 123 4567",
  email: null,
  photoUrl: null,
  ordersCount: 12,
  onHold: false,
  rider: null,
};

// 404 = "no active order" (the harness can't emit the API's null body); activeOrder resolves to null.
installRouter([
  { match: "/auth/me", json: me },
  { match: "/orders/mine/active-order", json: {}, status: 404 },
  { match: "/orders/mine/active", json: {}, status: 404 },
]);

// Harare corridor: Eastgate Mall (pickup) → Avondale Shops (drop-off), one parcel, $4.50 offered.
setParams({
  rbPickupLat: "-17.8292",
  rbPickupLng: "31.0522",
  rbPickupLandmark: "Eastgate Mall, city centre",
  rbDropLat: "-17.8016",
  rbDropLng: "31.0431",
  rbDropLandmark: "Avondale Shops",
  rbItems: JSON.stringify([{ description: "Documents envelope", quantity: 1 }]),
  rbFare: "4.50",
  rbNote: "",
});

export default { wrap: withQuery() };
