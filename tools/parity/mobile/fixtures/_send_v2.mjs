// Shared staging for the Send flow v2 shoot (tools/parity/shoot-send-v2.mjs, ledger D-52). Each
// send_v2_* fixture calls `stage()` with the one thing that differs; the handoff's own sample data
// (sc2-kit.jsx ADDR/PH) is used so the app column reads like the mock column.
import { installRouter, setParams, withQuery } from "./_harness.mjs";

const me = (onHold) => ({
  profileId: "0a1b2c3d-0000-4000-8000-000000000004",
  role: "customer",
  firstName: "Chipo",
  lastName: "Marufu",
  phone: "+263 77 245 1180",
  email: null,
  photoUrl: null,
  ordersCount: 12,
  onHold,
  rider: null,
});

const w = typeof window !== "undefined" ? window : globalThis;

/** The handoff's sample route (Eastgate Mall, CBD → 14 Glenara Ave, Avenues) as a "Send again". */
export const AGAIN = {
  rbPickupLat: "-17.8292",
  rbPickupLng: "31.0522",
  rbPickupLandmark: "Eastgate Mall, CBD",
  rbDropLat: "-17.8105",
  rbDropLng: "31.0705",
  rbDropLandmark: "14 Glenara Ave, Avenues",
  rbItems: JSON.stringify([{ description: "Documents envelope", quantity: 1 }]),
  rbFare: "3.36",
  rbNote: "Blue gate opposite the pharmacy. Ask for Rita.",
  rbDate: "2026-09-28T09:00:00Z",
};

export function stage({ onHold = false, again = false, failSend = false, offline = false } = {}) {
  w.__PARITY_REVERSE_GEOCODE = { name: "Eastgate Mall", street: null, district: "CBD" };
  installRouter([
    { match: "/auth/me", json: me(onHold) },
    { match: "/orders", method: "POST", json: { message: "Internal error" }, status: failSend ? 500 : 201 },
  ]);
  if (offline) {
    globalThis.fetch = async () => {
      throw new TypeError("Network request failed");
    };
  }
  if (again) setParams(AGAIN);
  return { wrap: withQuery() };
}
