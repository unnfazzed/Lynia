import type { MerchantBookingOffer, MerchantBookingResponse, MerchantProfileResponse } from "@lynia/shared";

/** A complete `GET /merchant/me` body for tests — a dormant restaurant owned by the caller, unless a test
 *  overrides fields (merchant web upgrade L1 added `businessType`, `shopKind` and `myRole`). */
export function merchantProfile(overrides: Partial<MerchantProfileResponse> = {}): MerchantProfileResponse {
  return {
    id: "m1",
    name: "Test Kitchen",
    ownerPhoneMasked: "+263•••••4567",
    description: null,
    coverPhotoUrl: null,
    logoUrl: null,
    cuisineTags: [],
    priceLevel: null,
    hours: null,
    cashRule: "collect_and_return",
    busy: false,
    pilotEnabled: false,
    businessType: "restaurant",
    shopKind: null,
    myRole: "owner",
    ...overrides,
  };
}

/** A `GET /merchant/bookings/:id` body (merchant web upgrade L2): a booking still finding a rider, with no
 *  offers yet, unless a test overrides fields. */
export function merchantBooking(overrides: Partial<MerchantBookingResponse> = {}): MerchantBookingResponse {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    state: "finding",
    status: "broadcasting",
    createdAt: "2026-09-29T10:00:00.000Z",
    expiresAt: "2026-09-29T10:01:30.000Z",
    dropoff: { point: { lat: -17.8, lng: 31.05 }, landmark: "Blue gate opposite the church", contactPhone: "+263771234567" },
    itemsSummary: "2 brake pads",
    declaredValue: "45.00",
    proposedFare: "3.50",
    agreedFare: null,
    bookedBy: "Tendai",
    rider: null,
    offerCount: 0,
    undeliveredReason: null,
    cancelledBy: null,
    cancelReason: null,
    rebroadcastedToId: null,
    rebroadcastOfId: null,
    codeIssuedAt: null,
    offers: [],
    ...overrides,
  };
}

/** A rider's pending offer on a booking. */
export function bookingOffer(overrides: Partial<MerchantBookingOffer> = {}): MerchantBookingOffer {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    type: "accept",
    offeredFare: "3.50",
    etaMinutes: 6,
    rider: { name: "Blessing", photoUrl: null, ratingAvg: 4.8, ratingCount: 31, tripsCount: 120 },
    preferred: false,
    ownMember: false,
    ...overrides,
  };
}
