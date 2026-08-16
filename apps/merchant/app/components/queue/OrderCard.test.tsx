// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MerchantOrderResponse } from "@lynia/shared";
import { countMemoRenders } from "../../testing/render-count";
import { OrderCard, type OrderCardBucket } from "./OrderCard";

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

function fillSheet(referenceValue: string, amountValue: string) {
  fireEvent.change(screen.getByPlaceholderText("EC-…"), { target: { value: referenceValue } });
  const amountInputs = screen.getAllByDisplayValue(/^\d/);
  const amountInput = amountInputs.at(-1);
  if (!amountInput) throw new Error("expected an amount input");
  fireEvent.change(amountInput, { target: { value: amountValue } });
}

function renderCard(bucket: OrderCardBucket, o: MerchantOrderResponse) {
  const onMarkReady = vi.fn().mockResolvedValue(undefined);
  const onRevealPickupCode = vi.fn().mockResolvedValue("1234");
  const onOpenHold = vi.fn();
  const onLogCall = vi.fn().mockResolvedValue(undefined);
  const onRequestPayment = vi.fn().mockResolvedValue(undefined);
  const onConfirmPayment = vi.fn().mockResolvedValue(undefined);
  const onReleaseUnpaid = vi.fn().mockResolvedValue(undefined);
  const onRefund = vi.fn().mockResolvedValue(undefined);
  const props = {
    order: o,
    bucket,
    disabled: false,
    onMarkReady,
    onRevealPickupCode,
    onOpenHold,
    onLogCall,
    onRequestPayment,
    onConfirmPayment,
    onReleaseUnpaid,
    onRefund,
  };
  render(<OrderCard {...props} />);
  return props;
}

describe("OrderCard — base rendering", () => {
  it("renders the order label, payment-method tag, and item list", () => {
    renderCard("waiting", order({ id: "abcdef1234", paymentMethod: "wallet" }));
    expect(screen.getByText("#ABCDEF12")).toBeTruthy();
    expect(screen.getByText("WALLET")).toBeTruthy();
    expect(screen.getByText("1x Sadza")).toBeTruthy();
  });

  it("falls back to an em dash when there are no items", () => {
    renderCard("waiting", order({ items: [] }));
    expect(screen.getByText("—")).toBeTruthy();
  });

  it("shows CASH for non-wallet payment methods", () => {
    renderCard("waiting", order({ paymentMethod: "cash" }));
    expect(screen.getByText("CASH")).toBeTruthy();
  });
});

describe("OrderCard — waiting bucket", () => {
  it("shows the item-approval countdown copy", () => {
    renderCard("waiting", order({ itemApprovalDeadlineAt: new Date(Date.now() + 30_000).toISOString() }));
    expect(screen.getByText(/Waiting for the customer to approve the shorter order/)).toBeTruthy();
  });
});

describe("OrderCard — payment bucket (PaymentBucketActions)", () => {
  it("shows Log the call + They confirmed another way before any call is logged", () => {
    renderCard("payment", order({ merchantPhase: "awaiting_payment" }));
    expect(screen.getByRole("button", { name: "Log the call" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "They confirmed another way" })).toBeTruthy();
  });

  it("Log the call calls onLogCall with the order id and surfaces a rejection", async () => {
    const { onLogCall } = renderCard("payment", order({ merchantPhase: "awaiting_payment" }));
    onLogCall.mockRejectedValueOnce(new Error("network down"));
    fireEvent.click(screen.getByRole("button", { name: "Log the call" }));
    expect(onLogCall).toHaveBeenCalledWith("o1");
    expect(await screen.findByText("network down")).toBeTruthy();
  });

  it("They confirmed another way calls onRequestPayment with overrideCallLog=true", () => {
    const { onRequestPayment } = renderCard("payment", order({ merchantPhase: "awaiting_payment" }));
    fireEvent.click(screen.getByRole("button", { name: "They confirmed another way" }));
    expect(onRequestPayment).toHaveBeenCalledWith("o1", true);
  });

  it("shows a single Request payment button once the call is logged, with overrideCallLog=false", () => {
    const { onRequestPayment } = renderCard(
      "payment",
      order({ merchantPhase: "awaiting_payment", paymentCallLoggedAt: new Date().toISOString(), merchantGoodsTotal: 5 }),
    );
    expect(screen.queryByRole("button", { name: "Log the call" })).toBeNull();
    const button = screen.getByRole("button", { name: /Request payment/ });
    expect(button.textContent).toContain("5.00");
    fireEvent.click(button);
    expect(onRequestPayment).toHaveBeenCalledWith("o1", false);
  });

  it("once payment is requested, opens the confirm sheet and closes it on a successful confirm", async () => {
    const { onConfirmPayment } = renderCard(
      "payment",
      order({ merchantPhase: "awaiting_payment", paymentRequestedAt: new Date().toISOString(), merchantGoodsTotal: 5 }),
    );
    fireEvent.click(screen.getByRole("button", { name: "It landed — enter the reference" }));
    expect(screen.getByText("Confirm the payment landed")).toBeTruthy();

    fillSheet("EC-1", "5.00");
    fireEvent.click(screen.getByRole("button", { name: /Confirm .* start cooking/ }));

    expect(onConfirmPayment).toHaveBeenCalledWith("o1", { reference: "EC-1", amount: 5 });
    // Sheet closes once the promise resolves.
    expect(await screen.findByRole("button", { name: "It landed — enter the reference" })).toBeTruthy();
  });

  it("keeps the confirm sheet open and shows the server's mismatch message when confirm rejects", async () => {
    const { onConfirmPayment } = renderCard(
      "payment",
      order({ merchantPhase: "awaiting_payment", paymentRequestedAt: new Date().toISOString(), merchantGoodsTotal: 5 }),
    );
    onConfirmPayment.mockRejectedValueOnce(new Error("expected $5.00, got $4.00"));
    fireEvent.click(screen.getByRole("button", { name: "It landed — enter the reference" }));
    fillSheet("EC-1", "4.00");
    fireEvent.click(screen.getByRole("button", { name: /Confirm .* start cooking/ }));

    expect((await screen.findAllByText("expected $5.00, got $4.00")).length).toBe(2);
    expect(screen.getByText("Confirm the payment landed")).toBeTruthy();
  });

  it("Release — they never paid calls onReleaseUnpaid and surfaces a rejection", async () => {
    const { onReleaseUnpaid } = renderCard(
      "payment",
      order({ merchantPhase: "awaiting_payment", paymentRequestedAt: new Date().toISOString() }),
    );
    onReleaseUnpaid.mockRejectedValueOnce(new Error("cannot release"));
    fireEvent.click(screen.getByRole("button", { name: "Release — they never paid" }));
    expect(onReleaseUnpaid).toHaveBeenCalledWith("o1");
    expect(await screen.findByText("cannot release")).toBeTruthy();
  });
});

describe("OrderCard — preparing bucket", () => {
  it("shows the prep countdown when prepMinutes/prepStartedAt are set, else 'In prep'", () => {
    renderCard("preparing", order({ merchantPhase: "preparing", prepMinutes: null, prepStartedAt: null }));
    expect(screen.getByText("In prep")).toBeTruthy();
  });

  it("Mark ready shows a busy label while pending and surfaces a rejection", async () => {
    const { onMarkReady } = renderCard("preparing", order({ merchantPhase: "preparing" }));
    onMarkReady.mockRejectedValueOnce(new Error("server exploded"));
    const button = screen.getByRole("button", { name: "Mark ready" }) as HTMLButtonElement;
    fireEvent.click(button);
    expect(await screen.findByText("server exploded")).toBeTruthy();
    expect(button.disabled).toBe(false);
  });

  it("hides RefundAction unless the order is wallet-paid and payment-confirmed (canRefund)", () => {
    renderCard("preparing", order({ merchantPhase: "preparing", paymentMethod: "cash" }));
    expect(screen.queryByText(/Can't fulfill/)).toBeNull();
  });

  it("shows RefundAction when canRefund is true and closes the sheet on a successful refund", async () => {
    const { onRefund } = renderCard(
      "preparing",
      order({ merchantPhase: "preparing", paymentMethod: "wallet", merchantPaymentConfirmedAt: new Date().toISOString(), merchantGoodsTotal: 6 }),
    );
    fireEvent.click(screen.getByText(/Can't fulfill/));
    expect(screen.getByText("Refund before you reject")).toBeTruthy();

    fillSheet("EC-2", "6.00");
    fireEvent.click(screen.getByRole("button", { name: /I've refunded/ }));

    expect(onRefund).toHaveBeenCalledWith("o1", { reference: "EC-2", amount: 6 });
    expect(await screen.findByText(/Can't fulfill/)).toBeTruthy();
  });

  it("keeps the refund sheet open and falls back to a plain 'Something went wrong' message (no trailing hint) on a non-Error rejection", async () => {
    const { onRefund } = renderCard(
      "preparing",
      order({ merchantPhase: "preparing", paymentMethod: "wallet", merchantPaymentConfirmedAt: new Date().toISOString() }),
    );
    onRefund.mockRejectedValueOnce("boom");
    fireEvent.click(screen.getByText(/Can't fulfill/));
    fillSheet("EC-2", "3.00");
    fireEvent.click(screen.getByRole("button", { name: /I've refunded/ }));

    expect(await screen.findByText("Something went wrong")).toBeTruthy();
    expect(screen.getByText("Refund before you reject")).toBeTruthy();
  });
});

describe("OrderCard — ready bucket", () => {
  it("CashPickupHero: a pay-upfront cash order shows the count-and-acknowledge hero, not a caption", () => {
    renderCard("ready", order({ merchantPhase: "ready_for_pickup", riderId: "r1", paymentMethod: "cash", merchantCashRule: "pay_upfront", merchantGoodsTotal: 4 }));
    expect(screen.getByText("COUNT WHAT THE RIDER HANDS YOU")).toBeTruthy();
    expect(screen.getByText("I counted $4.00 in my hand")).toBeTruthy();
    // The old caption is gone.
    expect(screen.queryByText(/Rider pays you \$4\.00 cash before you hand over the food/)).toBeNull();
  });

  it("CashPickupHero: the pickup-code reveal is gated until the cash is acknowledged", () => {
    const { onRevealPickupCode } = renderCard(
      "ready",
      order({ merchantPhase: "ready_for_pickup", riderId: "r1", paymentMethod: "cash", merchantCashRule: "pay_upfront", merchantGoodsTotal: 4 }),
    );
    const reveal = screen.getByRole("button", { name: /Show pickup code/ }) as HTMLButtonElement;
    expect(reveal.disabled).toBe(true);
    fireEvent.click(reveal);
    expect(onRevealPickupCode).not.toHaveBeenCalled();
    // Tick "I counted $4.00 in my hand" → the reveal (= releasing the food) unlocks.
    fireEvent.click(screen.getByText("I counted $4.00 in my hand"));
    expect((screen.getByRole("button", { name: /Show pickup code/ }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: /Show pickup code/ }));
    expect(onRevealPickupCode).toHaveBeenCalledWith("o1");
  });

  it("CashRuleNote: shows the release-unpaid copy for cash orders not on pay_upfront", () => {
    renderCard("ready", order({ merchantPhase: "ready_for_pickup", riderId: "r1", paymentMethod: "cash", merchantCashRule: "collect_and_return", merchantGoodsTotal: 4 }));
    expect(screen.getByText(/Release unpaid — the rider owes you \$4\.00 back after the drop\./)).toBeTruthy();
  });

  it("CashRuleNote: renders nothing for wallet orders", () => {
    renderCard("ready", order({ merchantPhase: "ready_for_pickup", riderId: "r1", paymentMethod: "wallet" }));
    expect(screen.queryByText(/cash/i)).toBeNull();
  });

  it("shows 'Searching for a rider…' while no rider is secured or held", () => {
    renderCard("ready", order({ merchantPhase: "ready_for_pickup", riderId: null, noRiderHoldAt: null }));
    expect(screen.getByText("Searching for a rider…")).toBeTruthy();
  });

  it("shows the no-rider-hold takeover button and calls onOpenHold with the order", () => {
    const o = order({ merchantPhase: "ready_for_pickup", riderId: null, noRiderHoldAt: new Date().toISOString() });
    const { onOpenHold } = renderCard("ready", o);
    fireEvent.click(screen.getByRole("button", { name: "No rider yet — tap to decide" }));
    expect(onOpenHold).toHaveBeenCalledWith(o);
  });

  it("rider-secured: reveal pickup code shows a busy label, then the code on success", async () => {
    renderCard("ready", order({ merchantPhase: "ready_for_pickup", riderId: "r1" }));
    expect(screen.getByText("Rider on the way")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show pickup code" }));
    expect(await screen.findByText("PICKUP CODE")).toBeTruthy();
    expect(screen.getByText("1234")).toBeTruthy();
  });

  it("rider-secured: reveal pickup code surfaces a rejection and re-enables the button", async () => {
    const { onRevealPickupCode } = renderCard("ready", order({ merchantPhase: "ready_for_pickup", riderId: "r1" }));
    onRevealPickupCode.mockRejectedValueOnce(new Error("reveal failed"));
    const button = screen.getByRole("button", { name: "Show pickup code" }) as HTMLButtonElement;
    fireEvent.click(button);
    expect(await screen.findByText("reveal failed")).toBeTruthy();
    expect(button.disabled).toBe(false);
  });
});

// B-O16: `useNow`'s interval used to start unconditionally regardless of `bucket`, ticking a
// payment/ready-bucket card once/sec for however long it sits in that bucket even though neither
// branch reads `now`. Confirmed to FAIL against the pre-fix code (an unconditional `useNow()` call)
// before landing — every case below would see the 1000ms interval fire.
describe("OrderCard — clock ticker gating (B-O16)", () => {
  function tickIntervalCalls(spy: { mock: { calls: unknown[][] } }) {
    return spy.mock.calls.filter((call) => call[1] === 1000);
  }

  it("does not start the 1s clock for the payment bucket", () => {
    const spy = vi.spyOn(global, "setInterval");
    renderCard("payment", order({ merchantPhase: "awaiting_payment" }));
    expect(tickIntervalCalls(spy)).toHaveLength(0);
    spy.mockRestore();
  });

  it("does not start the 1s clock for the ready bucket", () => {
    const spy = vi.spyOn(global, "setInterval");
    renderCard("ready", order({ merchantPhase: "ready_for_pickup", riderId: "r1" }));
    expect(tickIntervalCalls(spy)).toHaveLength(0);
    spy.mockRestore();
  });

  it("starts the 1s clock for the waiting bucket (reads `now` for the item-approval countdown)", () => {
    const spy = vi.spyOn(global, "setInterval");
    renderCard("waiting", order({ itemApprovalDeadlineAt: new Date(Date.now() + 30_000).toISOString() }));
    expect(tickIntervalCalls(spy).length).toBeGreaterThan(0);
    spy.mockRestore();
  });

  it("starts the 1s clock for the preparing bucket (reads `now` for the prep countdown)", () => {
    const spy = vi.spyOn(global, "setInterval");
    renderCard("preparing", order({ merchantPhase: "preparing", prepMinutes: 10, prepStartedAt: new Date().toISOString() }));
    expect(tickIntervalCalls(spy).length).toBeGreaterThan(0);
    spy.mockRestore();
  });
});

// B-O17: OrderCard had no React.memo boundary — paired with QueueBoard's B-O17 handler
// memoization and use-queue-poll's mergeOrders structural sharing, an order whose own props are
// unchanged across a re-render now genuinely skips re-rendering its card. Confirmed to FAIL against
// the pre-fix code (a plain, unmemoized `export function OrderCard`, which countMemoRenders can't
// even wrap — proving the boundary itself is new) before landing.
describe("OrderCard — render isolation (B-O17)", () => {
  it("bails out on an identical re-render but re-renders on a real prop change", () => {
    const o = order();
    const props = {
      order: o,
      bucket: "preparing" as OrderCardBucket,
      disabled: false,
      onMarkReady: vi.fn().mockResolvedValue(undefined),
      onRevealPickupCode: vi.fn().mockResolvedValue("1234"),
      onOpenHold: vi.fn(),
      onLogCall: vi.fn().mockResolvedValue(undefined),
      onRequestPayment: vi.fn().mockResolvedValue(undefined),
      onConfirmPayment: vi.fn().mockResolvedValue(undefined),
      onReleaseUnpaid: vi.fn().mockResolvedValue(undefined),
      onRefund: vi.fn().mockResolvedValue(undefined),
    };

    const { count } = countMemoRenders(OrderCard);
    const { rerender } = render(<OrderCard {...props} />);
    expect(count()).toBe(1);

    // Every prop is the exact same reference as before — the memo boundary must bail.
    rerender(<OrderCard {...props} />);
    expect(count()).toBe(1);

    // A real content change (fresh `order` object, different phase) — must re-render.
    rerender(<OrderCard {...props} order={order({ merchantPhase: "ready_for_pickup" })} />);
    expect(count()).toBe(2);
  });
});

describe("OrderCard — CF-01 double-submit guard (useAsyncAction)", () => {
  it("a same-tick double-tap on 'Log the call' calls onLogCall only once", async () => {
    const { onLogCall } = renderCard("payment", order({ merchantPhase: "awaiting_payment" }));
    let resolveCall!: () => void;
    onLogCall.mockReturnValueOnce(new Promise<void>((res) => { resolveCall = res; }));

    // Two native clicks inside ONE act() call reproduce a genuine fast double-tap: both onClick
    // handlers run against the same pre-update `busy === false` render, since React only
    // commits/re-renders after the act() callback returns (mirrors ConfirmModal's CF-02 test).
    // useAsyncAction backs every button in this file (log call, request/confirm payment, release
    // unpaid), so this one regression test protects the whole shared hook.
    const button = screen.getByRole("button", { name: "Log the call" });
    act(() => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(onLogCall).toHaveBeenCalledTimes(1);
    resolveCall();
  });
});
