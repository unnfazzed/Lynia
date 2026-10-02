// Order flow v2 G1 / G2 staging (ledger D-59; tools/parity/shoot-order-flow-customer.mjs): running merchant
// orders as the active-orders list carries them (the generic snapshot) + each one's food read (service,
// schedule, Rx, swap round) — the G2 frame's seven cards, in its order, with the handoff's sample venues.
const now = Date.now();
const at = (ms) => new Date(now + ms).toISOString();
const localAt = (days, h, m) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};
const VENUE = { lat: -17.8292, lng: 31.0522 };
const DROP = { lat: -17.8105, lng: 31.0705 };
const NEAR_DROP = { lat: -17.8215, lng: 31.0605 };
const RIDER = { profileId: "0a1b2c3d-0000-4000-8000-000000000003", firstName: "Tendai", lastName: "Moyo", photoUrl: null, ratingAvg: 4.8, ratingCount: 40, tripsCount: 132, vehicleInfo: "Bike", plate: "ABH 4721", kycVerified: true };
const GAVA = { name: "Gava’s Kitchen", businessType: "restaurant", shopKind: null };
const AVF = { name: "Avondale Fresh", businessType: "shop", shopKind: "grocery" };
const AVP = { name: "Avondale Pharmacy", businessType: "shop", shopKind: "pharmacy" };

function live(n, venue, { status = "requested", phase = "preparing", riderAt = null, food = {} } = {}) {
  const id = `0a1b2c3d-0000-4000-8000-0000000006${String(n).padStart(2, "0")}`;
  const rider = status !== "requested";
  const snap = {
    id,
    status,
    orderType: "merchant",
    merchantName: venue.name,
    merchantPhase: rider ? null : phase,
    viewerRole: "customer",
    agreedFare: "16.50",
    proposedFare: "16.50",
    pickup: { point: VENUE, landmark: venue.name },
    dropoff: { point: DROP, landmark: "12 Lanark Rd" },
    items: null,
    note: null,
    rider: rider ? { profileId: RIDER.profileId, currentLat: riderAt?.lat ?? null, currentLng: riderAt?.lng ?? null, updatedAt: at(-4000) } : null,
    events: [],
    counterpartyPhone: null,
    expiresAt: null,
  };
  const order = {
    id,
    merchantId: "0a1b2c3d-0000-4000-8000-0000000001a0",
    status,
    merchantPhase: rider ? null : phase,
    items: [],
    note: null,
    paymentMethod: "cash",
    merchantGoodsTotal: 15,
    deliveryFee: 1.5,
    total: 16.5,
    acceptDeadlineAt: null,
    itemApprovalDeadlineAt: null,
    prepMinutes: 20,
    prepStartedAt: at(-8 * 60_000),
    readyAt: null,
    riderId: rider ? RIDER.profileId : null,
    rider: rider ? RIDER : null,
    venue,
    createdAt: at(-20 * 60_000),
    ...food,
  };
  return { snap, order };
}

export const G_ORDERS = [
  live(1, GAVA),
  live(2, GAVA, { status: "picked_up", riderAt: NEAR_DROP }),
  live(3, AVF, {
    phase: "awaiting_accept",
    food: {
      substitution: {
        id: "0a1b2c3d-0000-4000-8000-000000000701",
        kind: "at_accept",
        status: "open",
        createdAt: at(-19_000),
        deadlineAt: at(161_000),
        resolvedAt: null,
        lines: [{ id: "l1", itemId: "i1", action: "swap", name: "Bread (Lobels 700g)", priceUsd: 1.1, quantity: 1, newQuantity: null, swapDishId: "d", swapName: "Bakers Inn 700g", swapPriceUsd: 1.2, swapQuantity: 1, swapPhotoUrl: null, answer: null }],
        wasTotal: 16.1,
        keptSubtotal: 13.5,
      },
    },
  }),
  live(4, AVF, { food: { prepMinutes: 13, prepStartedAt: at(-7 * 60_000) } }),
  live(5, AVP, { food: { prescription: { status: "pending", patientName: "Rudo", pageCount: 1 } } }),
  live(6, AVP, { status: "en_route_dropoff", riderAt: DROP, food: { total: 6.8, cashHandshakeAmount: 6.8 } }),
  live(7, GAVA, { phase: "awaiting_accept", food: { prepStartedAt: null, scheduledFor: localAt(1, 12, 30), ringsAt: localAt(1, 12, 5), scheduleStartedAt: null } }),
];

/** The router rows: the active-orders list + each food read by id. */
export function gRoutes(list = G_ORDERS) {
  const byId = new Map(list.map((o) => [o.order.id, o.order]));
  return [
    { match: /^\/orders\/mine\/active-orders$/, json: list.map((o) => o.snap) },
    { match: /^\/orders\/mine\/active-order$/, json: list[0]?.snap ?? null },
    { match: /^\/restaurants\/orders\/[^/]+$/, json: (path) => byId.get(path.split("/").pop()) ?? {} },
    { match: "/orders/history", json: [] },
  ];
}
