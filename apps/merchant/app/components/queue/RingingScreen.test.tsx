// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MerchantOrderResponse } from "@lynia/shared";
import { RingingScreen } from "./RingingScreen";
import { ToastProvider } from "../m/Toast";
import { ApiError } from "../../lib/api-client";
import { hm } from "../../lib/orders-view";

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
    expect(screen.getByRole("link", { name: "Check the prescription" }).getAttribute("href")).toBe("/queue/rx?id=o1");
    expect(screen.queryByRole("button", { name: /^Accept/ })).toBeNull();
    cleanup();
    render(<RingingScreen active={order({ prescription: { status: "approved", patientName: "Rudo Moyo", pageCount: 1 } })} {...props} />);
    expect(screen.getByRole("button", { name: /^Accept/ })).toBeTruthy();
    business.current = null;
  });
});

describe("RingingScreen — owner decision D1: the drawn countdown runs to 0:00 and the order keeps ringing", () => {
  const props = { disabled: false, onAccept: vi.fn(), onPropose: vi.fn(), onReject: vi.fn(), onConfirm: vi.fn(), onCancel: vi.fn(), onEditItems: vi.fn(), refetch: vi.fn() };
  const countdown = () => screen.getByLabelText("Time left to answer").textContent;

  afterEach(() => vi.useRealTimers());

  it("past the 3:00 window the countdown holds at 0:00 and Accept / Can't take it stay", () => {
    render(<RingingScreen active={order({ acceptDeadlineAt: new Date(Date.now() - 10 * 60_000).toISOString() })} {...props} />);
    expect(countdown()).toBe("0:00");
    expect(screen.getByRole("button", { name: /^Accept/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Can’t take it" })).toBeTruthy();
  });

  it("an auto-accepted ring counts the same 3:00 answer window — not the old 60-min (or the new 24 h) cancel", () => {
    const startedAt = new Date(Date.now() - 60_000).toISOString();
    render(
      <RingingScreen
        active={order({ merchantPhase: "preparing", acceptDeadlineAt: null, autoAccepted: true, kitchenConfirmedAt: null, prepStartedAt: startedAt, prepMinutes: 20, createdAt: startedAt })}
        {...props}
      />,
    );
    expect(countdown()).toBe("2:00");
  });

  it("the reasons sheet stays open when the countdown reaches 0:00 — the order isn't missed", () => {
    vi.useFakeTimers();
    render(<RingingScreen active={order({ acceptDeadlineAt: new Date(Date.now() + 1_500).toISOString() })} {...props} />);
    act(() => screen.getByRole("button", { name: "Can’t take it" }).click());
    expect(screen.getByText("Why can't you take it?")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(countdown()).toBe("0:00");
    expect(screen.getByText("Why can't you take it?")).toBeTruthy();
  });
});

describe("RingingScreen — Lane D fixes (merchant journey audit 2026-10-07)", () => {
  const twoLines = () =>
    order({
      items: [
        { itemId: "i1", dishId: "d1", name: "Sadza", priceUsd: 3, quantity: 1, note: null, available: null },
        { itemId: "i2", dishId: "d2", name: "Stew", priceUsd: 4, quantity: 1, note: null, available: null },
      ],
    });
  const autoOrder = (over: Partial<MerchantOrderResponse> = {}) =>
    order({
      merchantPhase: "preparing",
      acceptDeadlineAt: null,
      autoAccepted: true,
      kitchenConfirmedAt: null,
      prepStartedAt: new Date().toISOString(),
      prepMinutes: 20,
      ...over,
    });
  function props() {
    return {
      disabled: false,
      onAccept: vi.fn().mockResolvedValue(undefined),
      onPropose: vi.fn().mockResolvedValue(undefined),
      onReject: vi.fn().mockResolvedValue(undefined),
      onConfirm: vi.fn().mockResolvedValue(undefined),
      onCancel: vi.fn().mockResolvedValue(undefined),
      onEditItems: vi.fn().mockResolvedValue(undefined),
      refetch: vi.fn().mockResolvedValue(undefined),
    };
  }
  const withToasts = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

  afterEach(() => {
    vi.useRealTimers();
    business.current = null;
  });

  it("MJ-M1: an auto-accepted ring's CTA is 'Got it, we’re making it' (O.m.confirm) — never 'Accept · ready'", async () => {
    const p = props();
    withToasts(<RingingScreen active={autoOrder()} {...p} />);
    expect(screen.queryByRole("button", { name: /^Accept/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Got it, we’re making it" }));
    await vi.waitFor(() => expect(p.onConfirm).toHaveBeenCalledWith("o1"));
  });

  it("MJ-M2: an auto-accepted ring's 'Can't take it' sends the reason and the note", async () => {
    const p = props();
    withToasts(<RingingScreen active={autoOrder()} {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "Can’t take it" }));
    fireEvent.click(screen.getByRole("radio", { name: "Something else" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Gas ran out" } });
    fireEvent.click(screen.getByRole("button", { name: /^Turn down/ }));
    await vi.waitFor(() => expect(p.onCancel).toHaveBeenCalledWith("o1", "other", "Gas ran out"));
  });

  it("MJ-M4: a removal only applies at once — no '3 min to OK' promise, and the toast is the plain accept", async () => {
    const p = props();
    withToasts(<RingingScreen active={twoLines()} {...p} />);
    fireEvent.click(screen.getByRole("button", { name: /Sadza/ }));
    expect(screen.queryByText(/has 3 min to OK the changes/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Accept with 1 change" }));
    await vi.waitFor(() => expect(p.onPropose).toHaveBeenCalledWith("o1", 15, [{ action: "remove", itemId: "i1" }]));
    expect((await screen.findByRole("status")).textContent).toMatch(/^Accepted · ready \d\d:\d\d$/);
  });

  it("MJ-M4: removing every line says it cancels the order — it never says 'Accepted'", async () => {
    const p = props();
    withToasts(<RingingScreen active={twoLines()} {...p} />);
    fireEvent.click(screen.getByRole("button", { name: /Sadza/ }));
    fireEvent.click(screen.getByRole("button", { name: /Stew/ }));
    expect(screen.getByText("Nothing is left, so the order is cancelled.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel the order" }));
    await vi.waitFor(() => expect(p.onPropose).toHaveBeenCalled());
    expect((await screen.findByRole("status")).textContent).toBe("Cancelled · the customer was told");
  });

  it("MJ-M4: on an auto-accepted ring, removing every line edits the order and confirms nothing", async () => {
    const p = props();
    withToasts(<RingingScreen active={autoOrder({ items: twoLines().items })} {...p} />);
    fireEvent.click(screen.getByRole("button", { name: /Sadza/ }));
    fireEvent.click(screen.getByRole("button", { name: /Stew/ }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel the order" }));
    await vi.waitFor(() => expect(p.onEditItems).toHaveBeenCalled());
    expect((await screen.findByRole("status")).textContent).toBe("Cancelled · the customer was told");
    expect(p.onConfirm).not.toHaveBeenCalled();
  });

  it("MJ-L4: 'Couldn't reach the server' goes once the connection is back; a refusal stays", async () => {
    const p = props();
    const active = order();
    p.onAccept.mockRejectedValueOnce(new ApiError(0, "Couldn't reach the server — check the connection and try again."));
    const ui = (disabled: boolean) => (
      <ToastProvider>
        <RingingScreen active={active} {...p} disabled={disabled} />
      </ToastProvider>
    );
    const { rerender } = render(ui(false));
    fireEvent.click(screen.getByRole("button", { name: /^Accept/ }));
    expect((await screen.findByRole("alert")).textContent).toBe("Couldn't reach the server — check the connection and try again.");
    rerender(ui(true));
    expect(screen.getByRole("alert")).toBeTruthy();
    rerender(ui(false));
    expect(screen.queryByRole("alert")).toBeNull();

    p.onAccept.mockRejectedValueOnce(new ApiError(409, "This order can no longer be accepted"));
    fireEvent.click(screen.getByRole("button", { name: /^Accept/ }));
    expect((await screen.findByRole("alert")).textContent).toBe("This order can no longer be accepted");
    rerender(ui(true));
    rerender(ui(false));
    expect(screen.getByRole("alert").textContent).toBe("This order can no longer be accepted");
  });

  it("MJ-L7: in busy mode 'Accept · ready' adds the 10 minutes the server adds", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-07T10:00:00.000Z"));
    const ready = (min: number) => hm(new Date(Date.now() + min * 60_000).toISOString());
    business.current = { busy: true };
    withToasts(<RingingScreen active={order()} {...props()} />);
    expect(screen.getByRole("button", { name: `Accept · ready ${ready(25)}` })).toBeTruthy();
    cleanup();
    business.current = { busy: false };
    withToasts(<RingingScreen active={order()} {...props()} />);
    expect(screen.getByRole("button", { name: `Accept · ready ${ready(15)}` })).toBeTruthy();
  });
});
