// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MerchantOrderResponse } from "@lynia/shared";
import { RingingScreen } from "./RingingScreen";

const business = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("../../lib/business", () => ({ useBusiness: () => business.current }));

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

describe("RingingScreen — CF-01 double-submit guard (sensitive lane: order assignment)", () => {
  it("a same-tick double-tap on Accept calls onAccept only once", () => {
    let resolveAccept!: () => void;
    const onAccept = vi.fn().mockReturnValueOnce(
      new Promise<void>((res) => {
        resolveAccept = res;
      }),
    );
    const onReject = vi.fn().mockResolvedValue(undefined);
    const refetch = vi.fn().mockResolvedValue(undefined);

    render(
      <RingingScreen
        active={order()}
        disabled={false}
        onAccept={onAccept}
        onPropose={vi.fn()}
        onReject={onReject}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        onEditItems={vi.fn()}
        refetch={refetch}
      />,
    );

    // Two native clicks inside ONE act() call reproduce a genuine fast double-tap on a kitchen
    // tablet: both onClick handlers run against the same pre-update `submitting === false` render,
    // since React only commits after the act() callback returns (mirrors ConfirmModal's CF-02 test
    // test). Accepting is order assignment — a CLAUDE.md sensitive
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

describe("RingingScreen — an Rx order is checked before it's accepted (Merchant v2 P1 → S2, D-77)", () => {
  it("a pharmacist gets 'Check the prescription' instead of Accept until it's approved", () => {
    business.current = { myIsPharmacist: true };
    const props = { disabled: false, onAccept: vi.fn(), onPropose: vi.fn(), onReject: vi.fn(), onConfirm: vi.fn(), onCancel: vi.fn(), onEditItems: vi.fn(), refetch: vi.fn() };
    render(<RingingScreen active={order({ prescription: { status: "pending", patientName: "Rudo Moyo", pageCount: 1 } })} {...props} />);
    expect(screen.getByRole("link", { name: "Check the prescription" }).getAttribute("href")).toBe("/queue/o1/rx");
    expect(screen.queryByRole("button", { name: /^Accept/ })).toBeNull();
    cleanup();
    render(<RingingScreen active={order({ prescription: { status: "approved", patientName: "Rudo Moyo", pageCount: 1 } })} {...props} />);
    expect(screen.getByRole("button", { name: /^Accept/ })).toBeTruthy();
    business.current = null;
  });
});
