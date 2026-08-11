// LJ.settings — the Settings screen. GET /auth/me fills the header (name + phone); the row list
// (Edit profile, Notifications, Language, Payment=Cash, Privacy notice, Sign out, Delete account) is
// otherwise static. The OS notification permission read resolves to null in parity (the shim is inert),
// so that row shows "—". settings.tsx calls useAuth() (signOut), so an AuthProvider must be present.
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
