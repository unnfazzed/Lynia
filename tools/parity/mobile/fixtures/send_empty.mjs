// LJ.home_empty — the Send composer with no address yet. send.tsx runs two queries at mount: GET
// /auth/me (the account-on-hold pre-check — must NOT be held, or the blocking on-hold screen replaces
// the whole composer) and GET /orders/mine/active-order (the live-order restore banner — null ⇒ no
// banner). With no draft (SecureStore is inert in parity) both pins stay unset, so the map hero renders
// with empty address rows and the docked sheet's footer shows its CTA alone — since D-31 the mock's
// "Add pickup & drop-off pins … to broadcast" hint is never rendered, and the CTA reads "Proceed".
// The map itself is the react-native-maps shim (a gray fill — expected/honest).
//
// Location is seeded as hard-denied, and that is now what MAKES this the empty state. Since the pickup
// auto-locate landed (owner instruction 2026-08-17: the pickup pin prefills from the device's own
// position on open — `src/logic/use-pickup-autolocate.ts`), a granted phone opens this composer with
// the pickup pin already dropped, which is `LJ.home_pins`, not this mock. The mock's empty composer is
// still exactly what the customer sees — it is simply reached when the app has no position to offer
// (permission refused, location services off, no fix), so the fixture seeds that device instead of
// pretending the auto-locate is not there. `"never"` (not `"denied"`) because the hook only skips the
// OS prompt when `canAskAgain` is false; `"denied"` would still prompt-and-grant through the shim.
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
