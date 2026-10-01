// LJ.home_pins — the Send flow with both pins set. The flow holds its stops in local state, seeded only
// from "Send again" (`rb…`) route params in parity (SecureStore is inert), so this fixture prefills via
// those params. Since docs/DESIGN-DEVIATIONS.md D-52 a Send again opens on the first step still missing
// something — step 2 "What", because a re-sent order never carries the recipient's phone — with the
// "Copied from your order" banner. The gallery `Home` mock this key names is a SUPERSEDED target (see
// tools/parity/rendered-conformance.pending.json).
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
