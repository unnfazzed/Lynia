// LJ.settings_perms_ok — the same Settings permissions section with everything granted
// (screens-shipped.jsx `SettingsPerms granted`): Location "While using", Notifications "On", no
// warning and no consequence line. Granted is the shims' default, so the seed is explicit only so the
// fixture reads as the state it stages (and so a sibling fixture's seed can't leak into it).
import { installRouter } from "./_harness.mjs";
import { withAuthQuery } from "./_auth.mjs";

if (typeof window !== "undefined") window.__PARITY_PERMISSIONS = { location: "granted", notifications: "granted" };

const me = {
  profileId: "0a1b2c3d-0000-4000-8000-000000000004",
  role: "customer",
  firstName: "Chipo",
  lastName: "Marufu",
  phone: "+263 77 245 1180",
  email: null,
  photoUrl: null,
  ordersCount: 12,
  onHold: false,
  rider: null,
};

installRouter([{ match: "/auth/me", json: me }]);

export default { wrap: withAuthQuery() };
