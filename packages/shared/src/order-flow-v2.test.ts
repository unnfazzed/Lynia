import { describe, expect, it } from "vitest";
import {
  AttachMerchantDoorProofRequest,
  AttachMerchantPickupProofRequest,
  ConfirmSubstitutionRequest,
  MerchantOrderResponse,
  OrderStatusEvent,
  PlaceMerchantOrderRequest,
  ProposeSubstitutionRequest,
  RateRequest,
  RateVenueRequest,
} from "./contracts";
import {
  deriveMerchantOrderTrack,
  MERCHANT_REJECTION_REASONS,
  merchantGoodsForSubtotal,
  orderShortId,
  rejectionCopy,
  RESTAURANTS_TIMING,
  substitutionTotals,
} from "./restaurants-order";

/** Order flow v2 (packages/design/handoff/order-flow-v2, ledger D-59) — the shared derivations the API
 *  and the phones both use, and the additive wire contracts. */

describe("deriveMerchantOrderTrack (BRIEF §4)", () => {
  const t = (status: string, merchantPhase: string | null, extra: Record<string, unknown> = {}) =>
    deriveMerchantOrderTrack({ status, merchantPhase, ...extra })?.step ?? null;

  it("is 'confirmed' while the venue hasn't said yes", () => {
    expect(t("requested", "awaiting_accept")).toBe("confirmed");
    expect(t("requested", "awaiting_item_approval")).toBe("confirmed");
    expect(t("requested", "awaiting_payment")).toBe("confirmed");
    // Auto-accepted, kitchen not confirmed yet (T2 "is confirming").
    expect(t("requested", "preparing", { autoAccepted: true, kitchenConfirmedAt: null })).toBe("confirmed");
  });

  it("is 'making' from cooking until the rider collects (rider found / at the venue live inside it)", () => {
    expect(t("requested", "preparing")).toBe("making");
    expect(t("requested", "preparing", { autoAccepted: true, kitchenConfirmedAt: "2026-10-02T10:00:00Z" })).toBe("making");
    expect(t("requested", "ready_for_pickup")).toBe("making");
    for (const s of ["open_for_offers", "assigned", "confirmed", "en_route_pickup"]) expect(t(s, null)).toBe("making");
  });

  it("is 'on_the_way' once collected and 'delivered' at the end", () => {
    expect(t("picked_up", null)).toBe("on_the_way");
    expect(t("en_route_dropoff", null)).toBe("on_the_way");
    expect(t("delivered", null)).toBe("delivered");
    expect(t("completed", null)).toBe("delivered");
  });

  it("draws no track for an order that ended undelivered", () => {
    for (const s of ["cancelled", "expired", "undelivered"]) expect(deriveMerchantOrderTrack({ status: s, merchantPhase: null })).toBeNull();
  });

  it("carries the index and the rxChecked placeholder", () => {
    expect(deriveMerchantOrderTrack({ status: "picked_up", merchantPhase: null })).toEqual({ step: "on_the_way", index: 2, rxChecked: false });
  });
});

describe("substitutionTotals (BRIEF §8, the handoff's sample data)", () => {
  it("Avondale Fresh: the bread swap (+$0.10) takes $16.10 to $16.20", () => {
    // items $14.60 = bread 1.10 + the rest 13.50; delivery $1.50.
    const swaps = [{ lineId: "bread", swapPriceUsd: 1.2, quantity: 1 }];
    expect(substitutionTotals({ keptSubtotal: 13.5, deliveryFee: 1.5, swaps, acceptedLineIds: [] }).total).toBe(15);
    expect(substitutionTotals({ keptSubtotal: 13.5, deliveryFee: 1.5, swaps, acceptedLineIds: ["bread"] })).toEqual({
      itemsSubtotal: 14.7,
      smallOrderFee: 0,
      goodsTotal: 14.7,
      total: 16.2,
    });
  });

  it("re-applies the small-order fee under $4.00 and never touches the delivery fee", () => {
    expect(substitutionTotals({ keptSubtotal: 2.3, deliveryFee: 1.5, swaps: [{ lineId: "a", swapPriceUsd: 1, quantity: 1 }], acceptedLineIds: ["a"] })).toEqual({
      itemsSubtotal: 3.3,
      smallOrderFee: 1,
      goodsTotal: 4.3,
      total: 5.8,
    });
  });

  it("multiplies a swap by its quantity, in exact cents", () => {
    expect(substitutionTotals({ keptSubtotal: 0.1, deliveryFee: 0, swaps: [{ lineId: "x", swapPriceUsd: 0.2, quantity: 3 }], acceptedLineIds: new Set(["x"]) }).itemsSubtotal).toBe(0.7);
  });

  it("merchantGoodsForSubtotal is N-15 on its own", () => {
    expect(merchantGoodsForSubtotal(3.3)).toEqual({ itemsSubtotal: 3.3, smallOrderFee: 1, goodsTotal: 4.3 });
    expect(merchantGoodsForSubtotal(4)).toEqual({ itemsSubtotal: 4, smallOrderFee: 0, goodsTotal: 4 });
  });

  it("the window is 3 minutes", () => {
    expect(RESTAURANTS_TIMING.substitutionWindowMs).toBe(180_000);
  });
});

describe("orderShortId + U5 copy", () => {
  it("is the first four hex characters, upper-cased", () => {
    expect(orderShortId("a1b2c3d4-0000-4000-8000-000000000000")).toBe("A1B2");
  });
  it("the all-out-of-stock cancel reason reads as the handoff's U5 sub-line", () => {
    expect(rejectionCopy("all_out_of_stock")).toBe(MERCHANT_REJECTION_REASONS.all_out_of_stock);
    expect(rejectionCopy("all_out_of_stock")).toMatch(/nothing was charged/);
  });
});

describe("Order flow v2 wire contracts", () => {
  const uuid = "11111111-1111-4111-8111-111111111111";
  const uuid2 = "22222222-2222-4222-8222-222222222222";

  it("PlaceMerchantOrderRequest takes an optional out-of-stock preference (old bodies still valid)", () => {
    const base = { items: [{ dishId: uuid, quantity: 1 }], dropoff: { point: { lat: -17.8, lng: 31 }, landmark: "Belgravia", contactPhone: "+263772222222" }, paymentMethod: "cash" };
    expect(PlaceMerchantOrderRequest.safeParse(base).success).toBe(true);
    expect(PlaceMerchantOrderRequest.safeParse({ ...base, outOfStockPref: "remove" }).success).toBe(true);
    expect(PlaceMerchantOrderRequest.safeParse({ ...base, outOfStockPref: "maybe" }).success).toBe(false);
  });

  it("ProposeSubstitutionRequest: remove / swap / reduce lines, strict per action", () => {
    expect(
      ProposeSubstitutionRequest.safeParse({
        prepMinutes: 15,
        lines: [
          { action: "remove", itemId: uuid },
          { action: "swap", itemId: uuid2, dishId: uuid },
          { action: "reduce", itemId: uuid, quantity: 1 },
        ],
      }).success,
    ).toBe(true);
    expect(ProposeSubstitutionRequest.safeParse({ lines: [{ action: "swap", itemId: uuid }] }).success).toBe(false);
    expect(ProposeSubstitutionRequest.safeParse({ lines: [{ action: "remove", itemId: uuid, dishId: uuid }] }).success).toBe(false);
    expect(ProposeSubstitutionRequest.safeParse({ lines: [] }).success).toBe(false);
    expect(ProposeSubstitutionRequest.safeParse({ lines: [{ action: "remove", itemId: uuid }], prepMinutes: 12 }).success).toBe(false);
  });

  it("ConfirmSubstitutionRequest needs the round and at least one answer", () => {
    expect(ConfirmSubstitutionRequest.safeParse({ roundId: uuid, answers: [{ lineId: uuid2, accept: true }] }).success).toBe(true);
    expect(ConfirmSubstitutionRequest.safeParse({ roundId: uuid, answers: [] }).success).toBe(false);
  });

  it("proof requests: a pickup needs a key or the sealed tick; a door photo needs a key and a reason", () => {
    expect(AttachMerchantPickupProofRequest.safeParse({ bagSealed: true }).success).toBe(true);
    expect(AttachMerchantPickupProofRequest.safeParse({ key: "pickup/r/a.jpg" }).success).toBe(true);
    expect(AttachMerchantPickupProofRequest.safeParse({}).success).toBe(false);
    expect(AttachMerchantDoorProofRequest.safeParse({ key: "delivery-proof/r/a.jpg", reason: "left_at_gate" }).success).toBe(true);
    expect(AttachMerchantDoorProofRequest.safeParse({ key: "delivery-proof/r/a.jpg", reason: "lost" }).success).toBe(false);
  });

  it("ratings: the venue chips, and the widened rider chips", () => {
    expect(RateVenueRequest.safeParse({ score: 4, tags: ["tasty", "well_packed"] }).success).toBe(true);
    expect(RateVenueRequest.safeParse({ score: 6 }).success).toBe(false);
    expect(RateVenueRequest.safeParse({ score: 4, tags: ["hot_food"] }).success).toBe(false);
    expect(RateRequest.safeParse({ score: 5, tags: ["careful_with_food", "easy_to_reach", "friendly", "on_time"] }).success).toBe(true);
  });

  /** A merchant-order read as the API sent it before Order flow v2 — every field an installed app
   *  reads. The v2 fields are all optional, so this still parses; and a v2 payload parses too. */
  const legacy = {
    id: uuid,
    merchantId: uuid2,
    status: "requested",
    merchantPhase: "preparing",
    items: [{ itemId: uuid, dishId: uuid2, name: "Sadza", priceUsd: 5, quantity: 1, note: null, available: true }],
    note: null,
    paymentMethod: "cash",
    merchantPaymentPhone: null,
    merchantGoodsTotal: 5,
    deliveryFee: 1.5,
    total: 6.5,
    acceptDeadlineAt: null,
    itemApprovalDeadlineAt: null,
    prepMinutes: 15,
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

  it("MerchantOrderResponse: a pre-v2 payload still parses", () => {
    expect(MerchantOrderResponse.safeParse(legacy).success).toBe(true);
  });

  it("MerchantOrderResponse: the v2 fields parse", () => {
    const v2 = {
      ...legacy,
      items: [...legacy.items, { itemId: uuid2, dishId: uuid, name: "Bakers Inn 700g", priceUsd: 1.2, quantity: 1, note: null, available: true, replacesItemId: uuid }],
      shortId: "1111",
      venue: { name: "Avondale Fresh", businessType: "shop", shopKind: "grocery" },
      itemsSubtotal: 5,
      smallOrderFee: 0,
      track: { step: "making", index: 1, rxChecked: false },
      outOfStockPref: "ask",
      substitution: {
        id: uuid,
        kind: "at_accept",
        status: "open",
        createdAt: "2026-10-02T10:00:00.000Z",
        deadlineAt: "2026-10-02T10:03:00.000Z",
        resolvedAt: null,
        lines: [
          {
            id: uuid2,
            itemId: uuid,
            action: "swap",
            name: "Lobels bread",
            priceUsd: 1.1,
            quantity: 1,
            newQuantity: null,
            swapDishId: uuid2,
            swapName: "Bakers Inn 700g",
            swapPriceUsd: 1.2,
            swapQuantity: 1,
            swapPhotoUrl: null,
            answer: null,
          },
        ],
        wasTotal: 16.1,
        keptSubtotal: 13.5,
      },
      pickupProofRequired: true,
      pickupProof: { photoUrl: "https://x/y.jpg", takenAt: "2026-10-02T10:20:00.000Z", bagSealed: true },
      doorProof: { photoUrl: null, takenAt: null, reason: "left_at_gate", handedTo: null },
      venueRating: { score: 5, tags: ["tasty"], at: "2026-10-02T11:00:00.000Z" },
    };
    const r = MerchantOrderResponse.safeParse(v2);
    expect(r.success, JSON.stringify(r.error?.issues)).toBe(true);
  });

  it("OrderStatusEvent: the old payload, and the merchant-order one with the track", () => {
    expect(OrderStatusEvent.safeParse({ orderId: uuid, status: "picked_up", at: "x" }).success).toBe(true);
    expect(
      OrderStatusEvent.safeParse({ orderId: uuid, status: "requested", at: "x", merchantPhase: "preparing", track: { step: "making", index: 1, rxChecked: false } })
        .success,
    ).toBe(true);
  });
});
