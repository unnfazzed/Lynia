// LJ.profile — the CUSTOMER Account tab. GET /auth/me populates the IDENTITY CARD (avatar · name ·
// "phone · role"); four navigation rows render below it in one card: Notifications / Help & support /
// Settings / one bridge row to the rider side.
//
// The tab draws the RIDER account grammar, not this key's older `Profile` mock — see
// docs/DESIGN-DEVIATIONS.md D-15 (owner-approved 2026-08-16) — and carries only CUSTOMER entries, per
// D-22 the same day. The key stays wired here so the screen is still rendered and inventoried; its
// rendered-conformance IOU explains the superseded target.
//
// `rider: null` matters: it is what makes the bridge row read "Become a rider". A rider fixture would
// draw "Switch to rider" instead — and, by D-22, nothing else would change, which is the whole point.
// The account record (national ID + verification tag) is NOT drawn here; it is on /profile.
//
// account.tsx calls useAuth(), so an AuthProvider must wrap it alongside the QueryClient.
import { installRouter } from "./_harness.mjs";
import { withAuthQuery } from "./_auth.mjs";

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

installRouter([{ match: "/auth/me", json: me }]);

export default { wrap: withAuthQuery() };
