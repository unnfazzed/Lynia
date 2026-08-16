// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MerchantOrderResponse } from "@lynia/shared";
import { ReturnsSection } from "./ReturnsSection";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function order(over: Partial<MerchantOrderResponse> = {}): MerchantOrderResponse {
  return {
    id: "o1",
    merchantId: "m1",
    status: "undelivered",
    merchantPhase: "awaiting_payment",
    items: [{ dishId: "d1", name: "Sadza", priceUsd: 3, quantity: 1, note: null, available: null }],
    note: null,
    paymentMethod: "cash",
    merchantPaymentPhone: null,
    merchantGoodsTotal: 3,
    deliveryFee: 1,
    total: 4,
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
    cashHandshakeAmount: null,
    customerCashConfirmedAt: null,
    riderCashConfirmedAt: null,
    cashHandshakeDeadlineAt: null,
    cashHandshakeFrozenAt: null,
    noShowCallTimestamps: [],
    merchantCashRule: null,
    debtStatus: "open",
    debtAmount: 4,
    debtOpenedAt: new Date().toISOString(),
    debtSettledAt: null,
    refundReference: null,
    refundAmount: null,
    refundedAt: null,
    ...over,
  };
}

describe("ReturnsSection — CF-01 double-submit guard (sensitive lane: cash/debt)", () => {
  it("a same-tick double-tap on 'Confirm the food is back' calls onConfirmGoodsReturned only once for that order, without blocking a different order", async () => {
    let resolveA!: () => void;
    const onConfirmGoodsReturned = vi
      .fn()
      .mockImplementationOnce(() => new Promise<void>((res) => { resolveA = res; }))
      .mockResolvedValue(undefined);
    const onConfirmReturnedCash = vi.fn().mockResolvedValue(undefined);
    const onReportNonReturn = vi.fn().mockResolvedValue(undefined);

    render(
      <ReturnsSection
        orders={[order({ id: "o1" }), order({ id: "o2" })]}
        disabled={false}
        onConfirmReturnedCash={onConfirmReturnedCash}
        onConfirmGoodsReturned={onConfirmGoodsReturned}
        onReportNonReturn={onReportNonReturn}
      />,
    );

    const buttons = screen.getAllByRole("button", { name: "Confirm the food is back" });
    expect(buttons).toHaveLength(2);

    // Two native clicks on order o1's button inside ONE act() call reproduce a genuine fast
    // double-tap: both onClick handlers run against the same pre-update render, since React only
    // commits after the act() callback returns (mirrors ConfirmModal's CF-02 test).
    act(() => {
      buttons[0]!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      buttons[0]!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    expect(onConfirmGoodsReturned).toHaveBeenCalledTimes(1);
    expect(onConfirmGoodsReturned).toHaveBeenCalledWith("o1");

    // A DIFFERENT order's button must stay independently tappable while o1 is still in flight —
    // the guard is per-order, not a single global lock.
    act(() => {
      buttons[1]!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    expect(onConfirmGoodsReturned).toHaveBeenCalledTimes(2);
    expect(onConfirmGoodsReturned).toHaveBeenCalledWith("o2");

    resolveA();
  });
});
