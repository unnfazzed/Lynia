// LJ.profile — the Account tab. GET /auth/me populates the details card (name, phone, "Customer"); the
// entry-point cards (Notifications / Send a parcel / Become a rider / Settings / Help) render below.
// account.tsx calls useAuth() (for signOut), so an AuthProvider must wrap it alongside the QueryClient.
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
