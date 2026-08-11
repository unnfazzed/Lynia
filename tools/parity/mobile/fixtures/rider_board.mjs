// RJM.board — the rider's one job board, populated. The rider is verified + already online
// (server `isOnline: true`, which the board's own reconcile effect seeds into local `online`), so the
// online dashboard renders with a few live parcels on the board. Location is absent in the parity
// harness (expo-location is the inert shim), so the board fetches city-wide and labels each card by
// its trip distance — exactly the loc-null fallback the screen already supports.
import { installRouter } from "./_harness.mjs";
import { withAuthQuery } from "./_auth.mjs";

// Give the multi-fetch board (me → seed online → open orders) time to settle before the screenshot.
if (typeof window !== "undefined") window.__PARITY_SETTLE_MS = 1600;

const me = {
  profileId: "0a1b2c3d-0000-4000-8000-00000000me01",
  role: "rider",
  firstName: "Tanaka",
  lastName: "Moyo",
  phone: "+263771234567",
  email: null,
  photoUrl: null,
  ordersCount: 42,
  rider: {
    bikeReg: "ABZ 4417",
    kycStatus: "verified",
    kycDeclineReason: null,
    kycAttempts: 1,
    cancelStrikes: 0,
    ratingAvg: 4.9,
    ratingCount: 128,
    tripsCount: 132,
    isOnline: true,
    kycMode: "auto",
  },
};

function openOrder(n, from, fromPt, to, toPt, item, fare, km) {
  return {
    id: `0a1b2c3d-0000-4000-8000-0000000op${String(n).padStart(3, "0")}`,
    pickup: { point: fromPt, landmark: from },
    dropoff: { point: toPt, landmark: to },
    itemDesc: item,
    suggestedFare: fare,
    proposedFare: fare,
    distanceKm: km,
    createdAt: new Date(Date.now() - n * 40_000).toISOString(),
  };
}

const CBD = { lat: -17.8292, lng: 31.0522 };
const AVON = { lat: -17.8009, lng: 31.0389 };
const BORR = { lat: -17.7333, lng: 31.0889 };
const MSASA = { lat: -17.8667, lng: 31.1333 };
const HIGH = { lat: -17.8833, lng: 30.9833 };

installRouter([
  { match: "/auth/me", json: me },
  { match: "/orders/mine/active", json: null },
  {
    match: "/orders/open",
    json: [
      openOrder(1, "Copacabana Rank, CBD", CBD, "Avondale Shops", AVON, "Documents envelope", "4.50", 4.1),
      openOrder(2, "Sam Levy's Village", BORR, "Msasa Park", MSASA, "Phone + charger, small box", "6.00", 9.8),
      openOrder(3, "Kwame Nkrumah Ave", CBD, "Highfield, Machipisa", HIGH, "Groceries bag", "5.25", 7.2),
      openOrder(4, "Avondale Flea Market", AVON, "Borrowdale Village", BORR, "Sealed parcel", "5.75", 8.4),
    ],
  },
]);

export default { wrap: withAuthQuery() };
