// Shared staging for the After Send shoot (tools/parity/shoot-after-send.mjs, ledger D-53). Each as_*
// fixture calls `stage()` with the one thing that differs. The handoff's own sample data (as-kit.jsx:
// Tendai M., ABH 4721, $3.36, Eastgate Mall → 14 Glenara Ave) is used so the app column reads like the
// mock column. The map is the react-native-maps web shim (a grey field; markers draw nothing).
import * as SecureStore from "expo-secure-store";
import { installRouter, setParams } from "./_harness.mjs";
import { withAuthQuery } from "./_auth.mjs";
import { __setProbeFetch, reportUnreachable } from "../../../../apps/mobile/src/net/reachability";

export const ORDER_ID = "8f3a91c2-0000-4000-8000-000000000001";
const RIDER_ID = "0a1b2c3d-0000-4000-8000-000000000003";
const now = Date.now();
const ago = (ms) => new Date(now - ms).toISOString();

const PICKUP = { point: { lat: -17.8292, lng: 31.0522 }, landmark: "Eastgate Mall, CBD", contactPhone: null };
const DROP = { point: { lat: -17.8105, lng: 31.0705 }, landmark: "14 Glenara Ave, Avenues", contactPhone: null };

const offer = (id, first, last, fare, rating, count, trips, eta) => ({
  id,
  type: Number(fare) > 3.36 ? "counter" : "accept",
  offeredFare: fare,
  etaMinutes: eta,
  rider: { profileId: `${id}-rider`, ratingAvg: rating, ratingCount: count, tripsCount: trips, profile: { firstName: first, lastName: last, photoUrl: null } },
});
export const OFFERS = [
  offer("o-t", "Tendai", "Moyo", "3.00", "4.8", 40, 132, 6),
  offer("o-k", "Kudzai", "Ncube", "4.00", "4.9", 30, 88, 9),
  offer("o-f", "Farai", "Rusike", "3.36", "0", 0, 3, 5),
];

const RIDER_CARD = { firstName: "Tendai", lastName: "Moyo", photoUrl: null, ratingAvg: 4.8, ratingCount: 40, tripsCount: 132, plate: "ABH 4721", verified: true };

const POS = {
  offRoute: { lat: -17.8345, lng: 31.0455 },
  onRoute: { lat: -17.8195, lng: 31.0615 },
  atDrop: { lat: -17.8108, lng: 31.0702 },
};

const EVENTS = {
  open_for_offers: [],
  en_route_pickup: [{ status: "assigned", createdAt: ago(240_000) }, { status: "en_route_pickup", createdAt: ago(200_000) }],
  en_route_dropoff: [
    { status: "assigned", createdAt: ago(1_500_000) },
    { status: "picked_up", createdAt: ago(900_000) },
    { status: "en_route_dropoff", createdAt: ago(840_000) },
  ],
};

/**
 * @param {object} o
 * @param {string} o.status
 * @param {number} [o.offers]       how many of OFFERS are live (open_for_offers)
 * @param {number|null} [o.nearby] ridersNearby
 * @param {keyof POS} [o.pos]
 * @param {number} [o.fixAgoMs]     how old the rider's last fix is
 * @param {object} [o.extra]        snapshot overrides
 * @param {boolean} [o.offline]
 * @param {boolean} [o.race]        Choose answers 409 and the tapped rider drops off the list (state 4)
 */
export function stage({ status, offers = 0, nearby = 3, pos, fixAgoMs = 4_000, extra = {}, offline = false, race = false }) {
  const moving = ["assigned", "en_route_pickup", "picked_up", "en_route_dropoff"].includes(status);
  const withRider = moving || ["delivered", "completed", "undelivered"].includes(status);
  const events =
    EVENTS[status] ??
    (status === "delivered" || status === "completed" || status === "undelivered"
      ? [...EVENTS.en_route_dropoff, { status: status === "undelivered" ? "undelivered" : "delivered", createdAt: ago(60_000) }]
      : []);
  const order = {
    id: ORDER_ID,
    status,
    orderType: "parcel",
    viewerRole: "customer",
    agreedFare: withRider ? "3.36" : null,
    proposedFare: "3.36",
    pickup: PICKUP,
    dropoff: DROP,
    items: [{ description: "Documents envelope", quantity: 1 }],
    note: "Blue gate opposite the pharmacy. Ask for Rita.",
    pickupPhotoUrl: status === "en_route_dropoff" || status === "picked_up" ? "data:image/gif;base64,R0lGODlhAQABAIAAAMLCwgAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==" : null,
    rider: withRider ? { profileId: RIDER_ID, currentLat: pos ? POS[pos].lat : null, currentLng: pos ? POS[pos].lng : null, updatedAt: pos ? ago(fixAgoMs) : null } : null,
    riderCard: withRider ? RIDER_CARD : null,
    events,
    counterpartyPhone: withRider && status !== "delivered" && status !== "completed" ? "+263771234580" : null,
    expiresAt: status === "open_for_offers" ? new Date(now + 84_000).toISOString() : null,
    ridersNearby: status === "open_for_offers" ? nearby : null,
    deliveryOtpAttempts: 0,
    codeRotatedAt: null,
    ...extra,
  };
  let live = OFFERS.slice(0, offers);
  installRouter([
    // "+ $0.50" (state 5): the server takes the raise, and the next read carries it.
    {
      match: /^\/orders\/[^/]+\/price$/,
      method: "POST",
      json: () => {
        order.proposedFare = "3.86";
        return { orderId: ORDER_ID, proposedFare: "3.86" };
      },
    },
    {
      match: /^\/orders\/[^/]+\/offers\/[^/]+\/select$/,
      method: "POST",
      status: race ? 409 : 200,
      json: (path) => {
        if (race) {
          const taken = path.split("/")[4];
          live = live.filter((o) => o.id !== taken);
          return { message: "That offer is no longer available" };
        }
        return {};
      },
    },
    { match: /^\/orders\/[^/]+\/offers$/, json: () => live },
    { match: /^\/orders\/[^/]+$/, json: () => order },
  ]);
  setParams({ id: ORDER_ID });
  if (moving || status === "delivered") void SecureStore.setItemAsync(`lynia.deliveryCode.${ORDER_ID}`, "418290");
  if (offline) {
    __setProbeFetch(async () => false);
    setTimeout(() => reportUnreachable(), 50);
  }
  return { wrap: withAuthQuery() };
}
