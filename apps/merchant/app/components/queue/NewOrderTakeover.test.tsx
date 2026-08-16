// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MerchantOrderResponse } from "@lynia/shared";
import { NewOrderTakeover } from "./NewOrderTakeover";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function order(over: Partial<MerchantOrderResponse> = {}): MerchantOrderResponse {
  return {
    id: "o1",
    merchantId: "m1",
    status: "requested",
    merchantPhase: "awaiting_accept",
    items: [{ dishId: "d1", name: "Sadza", priceUsd: 3, quantity: 1, note: null, available: null }],
    note: null,
    paymentMethod: "cash",
    merchantPaymentPhone: null,
    merchantGoodsTotal: 3,
    deliveryFee: 1,
    total: 4,
    acceptDeadlineAt: new Date(Date.now() + 60_000).toISOString(),
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

describe("NewOrderTakeover — CF-01 double-submit guard (sensitive lane: order assignment)", () => {
  it("a same-tick double-tap on Accept calls onAccept only once", () => {
    let resolveAccept!: () => void;
    const onAccept = vi.fn().mockReturnValueOnce(new Promise<void>((res) => { resolveAccept = res; }));
    const onReject = vi.fn().mockResolvedValue(undefined);
    const refetch = vi.fn().mockResolvedValue(undefined);

    render(
      <NewOrderTakeover
        active={order()}
        queued={[]}
        disabled={false}
        onAccept={onAccept}
        onReject={onReject}
        refetch={refetch}
      />,
    );

    // Two native clicks inside ONE act() call reproduce a genuine fast double-tap on a kitchen
    // tablet: both onClick handlers run against the same pre-update `submitting === false` render,
    // since React only commits after the act() callback returns (mirrors ConfirmModal's CF-02 test
    // and OrderCard's CF-01 sibling test). Accepting is order assignment — a CLAUDE.md sensitive
    // lane — so a double-fire here means the order gets accepted twice, not a cosmetic re-render.
    const acceptButton = screen.getByRole("button", { name: /^Accept/ });
    act(() => {
      acceptButton.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      acceptButton.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(onAccept).toHaveBeenCalledTimes(1);
    resolveAccept();
  });
});
