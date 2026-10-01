// LJ.home_empty — the Send flow on open. Since docs/DESIGN-DEVIATIONS.md D-52 the screen is the
// send-compose-v2 handoff's step 1 "Where" (header + step bar, the inline two-row address card over the
// full-bleed map, the pinned Next bar), and the gallery `Home` mock this key names is a SUPERSEDED target
// (see tools/parity/rendered-conformance.pending.json). send.tsx runs one query at mount: GET /auth/me
// (the account-on-hold check — must NOT be held, or the hold wall replaces the flow).
// The map is the react-native-maps shim (a gray fill — expected/honest).
//
// Location is seeded as hard-denied, so the pickup auto-locate (src/logic/use-pickup-autolocate.ts)
// leaves both rows empty — the "nothing set yet" state. `"never"` (not `"denied"`) because the hook only
// skips the OS prompt when `canAskAgain` is false.
import { installRouter, withQuery } from "./_harness.mjs";

// What the expo-location shim answers from — see tools/parity/mobile/shims/expo-location.js.
if (typeof window !== "undefined") window.__PARITY_PERMISSIONS = { location: "never" };
else globalThis.__PARITY_PERMISSIONS = { location: "never" };

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

// The harness JSON-stringifies `body ?? {}`, so it can't emit a null body; "no active order" is the
// API's null response. A 404 yields the same observed state — getActiveCustomerOrder rejects, the query
// has no data, activeOrder resolves to null, and the check-failed banner stays hidden (its gate needs a
// stored in-flight hint, which parity's inert SecureStore never has).
installRouter([
  { match: "/auth/me", json: me },
  { match: "/orders/mine/active-order", json: {}, status: 404 },
  { match: "/orders/mine/active", json: {}, status: 404 },
]);

export default { wrap: withQuery() };
