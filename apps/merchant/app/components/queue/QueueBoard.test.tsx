// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MerchantOrderResponse } from "@lynia/shared";
import { useState } from "react";
import { QueueBoard } from "./QueueBoard";
import { acceptOrder, confirmGoodsReturned, markReady, revealPickupCode } from "../../lib/orders-api";

vi.mock("../../lib/orders-api", () => ({
  acceptOrder: vi.fn().mockResolvedValue({}),
  rejectOrder: vi.fn().mockResolvedValue({}),
  markReady: vi.fn().mockResolvedValue({}),
  revealPickupCode: vi.fn().mockResolvedValue({ pickupCode: "1234" }),
  dispatchResume: vi.fn().mockResolvedValue({}),
  dispatchCancel: vi.fn().mockResolvedValue({}),
  logCall: vi.fn().mockResolvedValue({}),
  requestPayment: vi.fn().mockResolvedValue({}),
  confirmPayment: vi.fn().mockResolvedValue({}),
  releaseUnpaid: vi.fn().mockResolvedValue({}),
  refundOrder: vi.fn().mockResolvedValue({}),
  confirmReturnedCash: vi.fn().mockResolvedValue({}),
  confirmGoodsReturned: vi.fn().mockResolvedValue({}),
  reportNonReturn: vi.fn().mockResolvedValue({}),
}));

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
    items: [{ dishId: null, name: "Sadza", priceUsd: 3, quantity: 1, note: null, available: null }],
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

// Mirrors how the real page wires QueueBoard: `orders` is owned by the parent and only changes
// when `refetch` re-derives it — QueueBoard itself never drops an order from the list.
function Harness({ initial }: { initial: MerchantOrderResponse[] }) {
  const [orders, setOrders] = useState(initial);
  return (
    <QueueBoard
      orders={orders}
      disabled={false}
      refetch={async () => setOrders((prev) => prev.filter((o) => o.merchantPhase !== "awaiting_accept" || o.id !== prev[0]?.id))}
    />
  );
}

describe("QueueBoard NEW ORDER takeover — D-D0a (LC-D02)", () => {
  it("does not leave the second queued order's Accept button stuck disabled after the first is accepted", async () => {
    const orders = [
      order({ id: "first", acceptDeadlineAt: new Date(Date.now() + 60_000).toISOString() }),
      order({ id: "second", acceptDeadlineAt: new Date(Date.now() + 90_000).toISOString() }),
    ];
    render(<Harness initial={orders} />);

    expect(screen.getByText("#FIRST")).toBeTruthy();
    const acceptButton = screen.getByRole("button", { name: /^Accept/ });
    fireEvent.click(acceptButton);

    // Wait for the accept promise + refetch-driven re-render to land on the second order.
    const secondLabel = await screen.findByText("#SECOND");
    expect(secondLabel).toBeTruthy();

    const acceptButtonForSecond = screen.getByRole("button", { name: /^Accept/ }) as HTMLButtonElement;
    expect(acceptButtonForSecond.disabled).toBe(false);
  });
});

describe("QueueBoard NEW ORDER takeover — Accept doesn't re-enable before the refetch lands (LC-D##)", () => {
  // Before this fix, withRefetch's `refetch()` call was fire-and-forget — submitAccept's
  // `await onAccept(...)` resolved as soon as the mutation's own HTTP round trip finished, well
  // before the follow-up queue GET (the thing that actually removes the accepted order from
  // awaitingAccept) landed. The button re-enabled on a visually-unchanged screen, inviting a
  // same-order double-tap the server's atomic CAS turns into a false-alarm 409.
  it("keeps the Accept button disabled until the post-accept refetch resolves", async () => {
    let resolveRefetch!: () => void;
    const refetchPromise = new Promise<void>((resolve) => {
      resolveRefetch = resolve;
    });
    const refetch = vi.fn(() => refetchPromise);

    const orders = [order({ id: "first" })];
    render(<QueueBoard orders={orders} disabled={false} refetch={refetch} />);

    const acceptButton = screen.getByRole("button", { name: /^Accept/ }) as HTMLButtonElement;
    fireEvent.click(acceptButton);

    await waitFor(() => {
      expect(acceptOrder).toHaveBeenCalled();
    });
    // The mutation itself has resolved, but the refetch it's chained to hasn't — the button must
    // stay disabled rather than re-enabling on a screen that still shows the same order.
    expect(acceptButton.disabled).toBe(true);

    resolveRefetch();
    await waitFor(() => {
      expect(acceptButton.disabled).toBe(false);
    });
  });
});

describe("QueueBoard RiderSecuredTakeover across two simultaneously-secured orders (LC-D##)", () => {
  // Before this fix, RiderSecuredTakeover had no `key` — when a second order was already
  // rider-secured at the moment the first was dismissed (no intervening render where
  // securedToShow was null), React reused the SAME component instance instead of remounting it,
  // so the second order's card kept showing the first order's real, stale pickup code until (or
  // unless) the second order's own revealPickupCode() call resolved.
  it("remounts (resets pickupCode) instead of showing the previous order's stale code", async () => {
    let resolveB!: (v: { pickupCode: string }) => void;
    const bPending = new Promise<{ pickupCode: string }>((resolve) => {
      resolveB = resolve;
    });
    vi.mocked(revealPickupCode).mockImplementation(async (orderId: string) => {
      if (orderId === "a") return { pickupCode: "1111" };
      return bPending;
    });

    const orders = [
      order({ id: "a", merchantPhase: "ready_for_pickup", riderId: "r1" }),
      order({ id: "b", merchantPhase: "ready_for_pickup", riderId: "r2" }),
    ];
    render(<Harness initial={orders} />);

    await screen.findByText("1111");
    await screen.findByText(/Order #A/);

    fireEvent.click(screen.getByText("Got it"));

    // B is picked up immediately (both were already secured) — B's own reveal is still pending;
    // the fix must show B's loading placeholder, never A's stale real code.
    await screen.findByText(/Order #B/);
    expect(screen.queryByText("1111")).toBeNull();

    resolveB({ pickupCode: "2222" });
    await screen.findByText("2222");
  });
});

describe("QueueBoard order actions surface failures instead of failing silently — D-D0b (LC-D03)", () => {
  it("shows an error and re-enables the button after markReady rejects", async () => {
    vi.mocked(markReady).mockRejectedValueOnce(new Error("Network error"));
    const orders = [order({ id: "o1", merchantPhase: "preparing", prepMinutes: 10, prepStartedAt: new Date().toISOString() })];
    render(<Harness initial={orders} />);

    fireEvent.click(screen.getByRole("button", { name: "Mark ready" }));

    await screen.findByText("Network error");
    const button = screen.getByRole("button", { name: "Mark ready" }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });

  it("shows an error and re-enables the button after revealPickupCode rejects", async () => {
    // The RiderSecuredTakeover fires its own reveal on mount — consume that call first so the
    // rejection under test lands on the OrderCard's own "Show pickup code" click.
    vi.mocked(revealPickupCode)
      .mockRejectedValueOnce(new Error("takeover mount reveal"))
      .mockRejectedValueOnce(new Error("Reveal failed"));
    const orders = [order({ id: "o1", merchantPhase: "ready_for_pickup", riderId: "r1" })];
    render(<Harness initial={orders} />);

    fireEvent.click(await screen.findByRole("button", { name: "Got it" }));

    fireEvent.click(await screen.findByRole("button", { name: "Show pickup code" }));

    await screen.findByText("Reveal failed");
    const button = screen.getByRole("button", { name: "Show pickup code" }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });

  it("shows an error and keeps the return card usable after confirmGoodsReturned rejects", async () => {
    vi.mocked(confirmGoodsReturned).mockRejectedValueOnce(new Error("Confirm failed"));
    const orders = [order({ id: "o1", debtStatus: "open", debtAmount: 5, status: "undelivered" })];
    render(<Harness initial={orders} />);

    fireEvent.click(await screen.findByRole("button", { name: "Confirm the food is back" }));

    await screen.findByText("Confirm failed");
    await waitFor(() => {
      const button = screen.getByRole("button", { name: "Confirm the food is back" }) as HTMLButtonElement;
      expect(button.disabled).toBe(false);
    });
  });
});
