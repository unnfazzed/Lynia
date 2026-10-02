import { describe, expect, it } from "vitest";
import {
  FoodOfferEvent,
  FoodOfferResponse,
  MerchantOrderResponse,
  OrderFlagsResponse,
  PlaceMerchantOrderRequest,
  ServiceFlagsResponse,
} from "./contracts";
import { deliveryMinutesForKm, deriveMerchantOrderTrack, ORDER_SCHEDULE, rejectionCopy } from "./restaurants-order";

/**
 * Order flow v2, backend B (ledger D-59): every wire change is additive. These pin the back-compat
 * reasoning — which bodies installed apps parse strictly, and that nothing new lands in them.
 */

const BASE_ORDER = {
  id: "11111111-1111-4111-8111-111111111111",
  merchantId: "22222222-2222-4222-8222-222222222222",
  status: "requested",
  merchantPhase: "awaiting_accept",
  items: [],
  note: null,
  paymentMethod: "cash",
  merchantPaymentPhone: null,
  merchantGoodsTotal: 14.6,
  deliveryFee: 1.5,
  total: 16.1,
  acceptDeadlineAt: null,
  itemApprovalDeadlineAt: null,
  prepMinutes: null,
  prepStartedAt: null,
  readyAt: null,
  rejectionReason: null,
  paymentCallLoggedAt: null,
  paymentRequestedAt: null,
  merchantPaymentReference: null,
  merchantPaymentConfirmedAt: null,
  riderId: null,
  dispatchAttempt: 0,
  dispatchOfferExpiresAt: null,
  noRiderHoldAt: null,
  pickupCodeAttempts: 0,
  noShowCallTimestamps: [],
};

describe("Order flow v2 wire contracts — additive only", () => {
  it("an order read without any v2 field (an older API) still parses", () => {
    expect(MerchantOrderResponse.safeParse(BASE_ORDER).success).toBe(true);
  });

  it("a scheduled pharmacy order with a prescription and a carried balance parses, and no new MerchantPhase is needed", () => {
    const v2 = {
      ...BASE_ORDER,
      venue: { name: "Avondale Pharmacy", businessType: "shop", shopKind: "pharmacy" },
      scheduledFor: "2026-10-02T10:30:00.000Z",
      ringsAt: "2026-10-02T09:58:00.000Z",
      scheduleStartedAt: null,
      prescription: { status: "pending", patientName: "Rudo M", pageCount: 2 },
      previousBalanceUsd: 16.5,
      items: [{ itemId: "33333333-3333-4333-8333-333333333333", dishId: null, name: "Amoxicillin", priceUsd: 6.2, quantity: 1, note: null, available: null, rxRequired: true }],
    };
    expect(MerchantOrderResponse.safeParse(v2).success).toBe(true);
  });

  it("the strict socket offer payload is unchanged — the RD1 tags ride beside it on the REST read only", () => {
    expect(Object.keys(FoodOfferEvent.shape)).not.toContain("job");
    const offer = {
      orderId: BASE_ORDER.id,
      merchantId: BASE_ORDER.merchantId,
      pickup: { point: { lat: -17.8, lng: 31 }, landmark: "Venue" },
      dropoff: { point: { lat: -17.8, lng: 31 }, landmark: "Home" },
      itemDesc: "1x Bread",
      merchantGoodsTotal: 7.3,
      deliveryFee: 1.5,
      distanceKm: 2,
      expiresAt: "2026-10-02T10:00:00.000Z",
      merchantPaymentMethod: "cash",
      merchantCashRule: "collect_and_return",
    };
    expect(FoodOfferResponse.safeParse({ offer }).success).toBe(true);
    expect(FoodOfferResponse.safeParse({ offer, job: { businessType: "shop", shopKind: "pharmacy", scheduledFor: null, rx: true } }).success).toBe(true);
  });

  it("rxEnabled is its own body: the strict service-flags body an installed app parses gains no key", () => {
    expect(Object.keys(ServiceFlagsResponse.shape)).toEqual(["shopsEnabled", "pharmacyEnabled"]);
    // Not strict: a later switch is an additive key.
    expect(OrderFlagsResponse.safeParse({ rxEnabled: false, later: true }).success).toBe(true);
  });

  it("an old app's order body (no scheduledFor / prescription) is still valid; a prescription needs the consent tick and 1–3 pages", () => {
    const base = { items: [{ dishId: BASE_ORDER.id, quantity: 1 }], dropoff: { point: { lat: -17.8, lng: 31 }, landmark: "Home", contactPhone: "+263772222222" }, paymentMethod: "cash" };
    expect(PlaceMerchantOrderRequest.safeParse(base).success).toBe(true);
    const rx = { photoKeys: ["rx/u/1.jpg"], patientName: "Rudo", consent: true };
    expect(PlaceMerchantOrderRequest.safeParse({ ...base, scheduledFor: "2026-10-02T12:30:00+02:00", prescription: rx }).success).toBe(true);
    expect(PlaceMerchantOrderRequest.safeParse({ ...base, prescription: { ...rx, consent: false } }).success).toBe(false);
    expect(PlaceMerchantOrderRequest.safeParse({ ...base, prescription: { ...rx, photoKeys: [] } }).success).toBe(false);
    expect(PlaceMerchantOrderRequest.safeParse({ ...base, prescription: { ...rx, photoKeys: ["a", "b", "c", "d"] } }).success).toBe(false);
  });
});

describe("ORDER_SCHEDULE (BRIEF §12)", () => {
  it("plans 30-minute slots with a road-inflated delivery leg plus the rider's lead", () => {
    expect(ORDER_SCHEDULE.slotMinutes).toBe(30);
    expect(deliveryMinutesForKm(null)).toBe(ORDER_SCHEDULE.defaultDeliveryMinutes);
    // 3.2 km × 1.3 / 22 km/h = 11.35 min → 12, + 5 lead.
    expect(deliveryMinutesForKm(3.2)).toBe(17);
    expect(deliveryMinutesForKm(0)).toBe(6);
  });

  it("the track holds at Confirmed while the pharmacist checks, then reads 'Prescription checked'", () => {
    expect(deriveMerchantOrderTrack({ status: "requested", merchantPhase: "preparing", rxStatus: "pending" })).toMatchObject({ step: "confirmed", rxChecked: false });
    expect(deriveMerchantOrderTrack({ status: "requested", merchantPhase: "preparing", rxStatus: "approved" })).toMatchObject({ step: "making", rxChecked: true });
    expect(deriveMerchantOrderTrack({ status: "requested", merchantPhase: "preparing" })).toMatchObject({ step: "making", rxChecked: false });
  });

  it("an Rx decline that empties the order has its own customer copy", () => {
    expect(rejectionCopy("rx_declined")).toMatch(/prescription wasn't approved/);
  });
});
