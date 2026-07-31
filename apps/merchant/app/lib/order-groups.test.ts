import { describe, expect, it } from "vitest";
import type { MerchantOrderResponse } from "@lynia/shared";
import { groupQueue, isNoRiderHold, isReadyBucket, isRiderSecured, isSearchingForRider, shouldUseBoard } from "./order-groups";

function order(over: Partial<MerchantOrderResponse> = {}): MerchantOrderResponse {
  return {
    id: "o1",
    merchantId: "m1",
    status: "requested",
    merchantPhase: "awaiting_accept",
    items: [],
    note: null,
    paymentMethod: "cash",
    merchantPaymentPhone: null,
    merchantGoodsTotal: 10,
    deliveryFee: 2,
    total: 12,
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
    cashHandshakeAmount: null,
    customerCashConfirmedAt: null,
    riderCashConfirmedAt: null,
    cashHandshakeDeadlineAt: null,
    cashHandshakeFrozenAt: null,
    merchantCashRule: null,
    debtStatus: null,
    debtAmount: null,
    debtOpenedAt: null,
    debtSettledAt: null,
    refundReference: null,
    refundAmount: null,
    refundedAt: null,
    ...over,
  };
}

describe("groupQueue", () => {
  it("buckets by merchantPhase for the straightforward pre-dispatch phases", () => {
    const orders = [
      order({ id: "a", merchantPhase: "awaiting_accept" }),
      order({ id: "b", merchantPhase: "awaiting_item_approval" }),
      order({ id: "c", merchantPhase: "awaiting_payment" }),
      order({ id: "d", merchantPhase: "preparing" }),
    ];
    const groups = groupQueue(orders);
    expect(groups.awaitingAccept.map((o) => o.id)).toEqual(["a"]);
    expect(groups.awaitingItemApproval.map((o) => o.id)).toEqual(["b"]);
    expect(groups.awaitingPayment.map((o) => o.id)).toEqual(["c"]);
    expect(groups.preparing.map((o) => o.id)).toEqual(["d"]);
    expect(groups.ready).toEqual([]);
  });

  it("keeps an order in the Ready bucket through the whole dispatch lifecycle, not just ready_for_pickup", () => {
    const searching = order({ id: "e", merchantPhase: "ready_for_pickup", status: "requested" });
    const candidateDeciding = order({ id: "f", merchantPhase: "ready_for_pickup", status: "open_for_offers" });
    const riderSecured = order({ id: "g", merchantPhase: null, status: "assigned", riderId: "r1" });
    const enRoute = order({ id: "h", merchantPhase: null, status: "en_route_pickup", riderId: "r1" });
    const groups = groupQueue([searching, candidateDeciding, riderSecured, enRoute]);
    expect(groups.ready.map((o) => o.id)).toEqual(["e", "f", "g", "h"]);
  });

  it("drops an order once it's genuinely handed off (picked_up wouldn't even reach here, but a stray unknown status is not miscategorized)", () => {
    const pickedUp = order({ id: "z", merchantPhase: null, status: "picked_up", riderId: "r1" });
    const groups = groupQueue([pickedUp]);
    expect(Object.values(groups).flat()).toEqual([]);
  });

  it("E3/R-01: an open debt lands in awaitingReturn regardless of status, and outranks every other bucket", () => {
    const pickedUpDebt = order({ id: "p", merchantPhase: null, status: "picked_up", riderId: "r1", debtStatus: "open", debtAmount: 13 });
    const deliveredDebt = order({ id: "q", merchantPhase: null, status: "delivered", riderId: "r1", debtStatus: "open", debtAmount: 13 });
    const undeliveredDebt = order({ id: "r", merchantPhase: null, status: "undelivered", riderId: "r1", debtStatus: "open", debtAmount: 13 });
    const settled = order({ id: "s", merchantPhase: null, status: "delivered", riderId: "r1", debtStatus: "settled_cash", debtAmount: 13 });
    const groups = groupQueue([pickedUpDebt, deliveredDebt, undeliveredDebt, settled]);
    expect(groups.awaitingReturn.map((o) => o.id)).toEqual(["p", "q", "r"]);
    expect(groups.ready).toEqual([]);
    expect(Object.values(groups).flat()).toEqual(groups.awaitingReturn);
  });
});

describe("isReadyBucket", () => {
  it("is true for ready_for_pickup regardless of dispatch sub-state", () => {
    expect(isReadyBucket(order({ merchantPhase: "ready_for_pickup", status: "requested" }))).toBe(true);
    expect(isReadyBucket(order({ merchantPhase: "ready_for_pickup", status: "open_for_offers" }))).toBe(true);
  });
  it("is true post-secured (phase cleared, status carries it)", () => {
    expect(isReadyBucket(order({ merchantPhase: null, status: "assigned" }))).toBe(true);
    expect(isReadyBucket(order({ merchantPhase: null, status: "confirmed" }))).toBe(true);
    expect(isReadyBucket(order({ merchantPhase: null, status: "en_route_pickup" }))).toBe(true);
  });
  it("is false once picked up or for a pre-dispatch phase", () => {
    expect(isReadyBucket(order({ merchantPhase: null, status: "picked_up" }))).toBe(false);
    expect(isReadyBucket(order({ merchantPhase: "preparing", status: "requested" }))).toBe(false);
  });
});

describe("shouldUseBoard (D-26)", () => {
  it("stays a flat list under three orders", () => {
    expect(shouldUseBoard([])).toBe(false);
    expect(shouldUseBoard([order(), order()])).toBe(false);
  });
  it("becomes a board at exactly three", () => {
    expect(shouldUseBoard([order(), order(), order()])).toBe(true);
    expect(shouldUseBoard([order(), order(), order(), order()])).toBe(true);
  });
});

describe("isRiderSecured (D-04)", () => {
  it("true once a rider is assigned and the order is still in the ready bucket", () => {
    expect(isRiderSecured(order({ merchantPhase: null, status: "assigned", riderId: "r1" }))).toBe(true);
  });
  it("false while still searching (no rider yet)", () => {
    expect(isRiderSecured(order({ merchantPhase: "ready_for_pickup", status: "requested", riderId: null }))).toBe(false);
  });
});

describe("isNoRiderHold / isSearchingForRider (D-34)", () => {
  it("hold is true only once noRiderHoldAt is stamped", () => {
    const held = order({ merchantPhase: "ready_for_pickup", noRiderHoldAt: "2026-07-30T12:00:00.000Z" });
    const searching = order({ merchantPhase: "ready_for_pickup", noRiderHoldAt: null });
    expect(isNoRiderHold(held)).toBe(true);
    expect(isNoRiderHold(searching)).toBe(false);
    expect(isSearchingForRider(held)).toBe(false);
    expect(isSearchingForRider(searching)).toBe(true);
  });
  it("searching is false once a rider is secured", () => {
    const secured = order({ merchantPhase: "ready_for_pickup", riderId: "r1" });
    expect(isSearchingForRider(secured)).toBe(false);
  });
});
