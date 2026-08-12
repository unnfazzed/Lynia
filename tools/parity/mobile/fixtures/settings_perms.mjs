// LJ.settings_perms — Settings with the REAL OS-permission rows in their denied/ask state
// (screens-shipped.jsx `SettingsPerms`, SH11): Location "Ask every time", Notifications "Off" with
// the warning triangle and the consequence line ("You won't hear when a rider offers…").
//
// Both values are read from the phone, so the fixture seeds the device rather than the screen:
// `window.__PARITY_PERMISSIONS` is what the expo-location / expo-notifications shims answer from.
import { installRouter } from "./_harness.mjs";
import { withAuthQuery } from "./_auth.mjs";

if (typeof window !== "undefined") window.__PARITY_PERMISSIONS = { location: "denied", notifications: "denied" };

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
